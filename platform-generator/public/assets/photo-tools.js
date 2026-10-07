import {
  cropForRatio,
  clampCrop,
  renderDerivative,
  renderMosaics,
  maskPath,
  maskContains,
  moveMask,
  resizeCrop,
} from "./image-editor.js";
const ASSETS = new URL(".", import.meta.url),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const plain = (html) => {
  const d = document.createElement("div");
  d.innerHTML = html;
  d.querySelectorAll("figure,del,s,strike").forEach((n) => n.remove());
  d.querySelectorAll("p,div,br").forEach((n) =>
    n.append(document.createTextNode("\n")),
  );
  return (d.textContent || "").trim();
};

// 팀원 ArticleWorkspace에서 사진 관련 메서드만 분리한 컴포넌트입니다.
// 서버 요청은 NewsApi로 위임하고 적용 결과는 photo-selected로 전달합니다.
export class PhotoTools extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:'open'});
    this.state={photos:[],bodyHtml:''}; this.mode='edit';
    this.controller=new AbortController(); this.selectedPhoto=null;
  }
  connectedCallback(){ this.render(); }
  disconnectedCallback(){ this.closeModal(); this.controller.abort(); }
  set articleText(value){this.state.bodyHtml=esc(value||'').replace(/\n/g,'<br>');}
  q(selector){return this.shadowRoot.querySelector(selector);}
  capture(){}
  changed(){}
  closeSuggestions(){}
  notice(message){const n=this.q('[data-notice]');if(n){n.hidden=!message;n.textContent=message;}}
  render(){
    this.closeModal();
    this.shadowRoot.innerHTML=`<link rel="stylesheet" href="${new URL('theme.css',ASSETS)}">
      <style>:host{display:block}.photo-home{padding:16px}.selected-preview{max-width:100%;max-height:260px}.image-view{padding-bottom:16px}</style>
      <p data-notice hidden role="status"></p><main data-main><div class="photo-home">
      <button data-search-open>사진 검색하기</button><button data-upload-open>사진 첨부하기</button>
      <div data-selected></div></div></main><button data-preview hidden></button><section data-overlay></section><section data-flow></section>`;
    this.q('[data-search-open]').onclick=()=>this.media();
    this.q('[data-upload-open]').onclick=()=>this.choosePhotoFile();
    if(this.selectedPhoto){
      const img=document.createElement('img');img.className='selected-preview';
      img.src=this.selectedPhoto.crop||this.selectedPhoto.masks?.length
        ? this.selectedPhoto.data : this.selectedPhoto.remoteOriginal||this.selectedPhoto.data;
      const edit=document.createElement('button');edit.textContent='다시 편집';
      edit.onclick=()=>this.openEditor(this.selectedPhoto);
      const credit=document.createElement('p');credit.textContent=this.selectedPhoto.source||'';
      this.q('[data-selected]').append(img,credit,edit);
    }
  }
  async openEditor(photo){try{await this.editImage(structuredClone(photo));}catch(e){this.mode='edit';this.render();this.notice(e.message);}}
  async api(path,payload){
    if(path==='/api/assist') return window.NewsApi.suggestPhotoKeywords(payload.body,this.controller.signal);
    if(path.startsWith('/api/unsplash/search?')){
      const params=new URLSearchParams(path.split('?')[1]);
      return window.NewsApi.searchTeamPhotos(params.get('q'),Number(params.get('page')),this.controller.signal);
    }
    const track=path.match(/^\/api\/unsplash\/photo\/([^/]+)\/track$/);
    if(track) return window.NewsApi.trackTeamPhoto(decodeURIComponent(track[1]),this.controller.signal);
    throw new Error('지원하지 않는 사진 요청입니다.');
  }
  insert(photo){
    this.selectedPhoto=structuredClone(photo);this.mode='edit';this.render();
    this.dispatchEvent(new CustomEvent('photo-selected',{detail:structuredClone(photo),bubbles:true,composed:true}));
  }
  closeModal() {
    this.modalCleanup?.();
    this.modalCleanup = null;
    this.q("[data-overlay]")?.replaceChildren();
    this.q("[data-flow]")?.replaceChildren();
  }
  modal(root, title, html, classes = "") {
    this.closeModal();
    this.closeSuggestions();
    const previousFocus = this.shadowRoot.activeElement;
    const overflow = document.body.style.overflow;
    this.q(root).innerHTML =
      `<div class="modal-stage"><div class="backdrop" data-close></div><section class="modal-card ${classes}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><div class="drawer-head"><h2>${esc(title)}</h2><button data-close aria-label="닫기">닫기</button></div><div class="drawer-body">${html}</div></section></div>`;
    const dialog = this.q(root).querySelector("[role=dialog]");
    document.body.style.overflow = "hidden";
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.closeModal();
      }
      if (e.key === "Tab") {
        const items = [
          ...dialog.querySelectorAll(
            'button:not(:disabled), input, textarea, a[href], [tabindex="0"]',
          ),
        ].filter((n) => n.getClientRects().length);
        const first = items[0],
          last = items.at(-1),
          active = this.shadowRoot.activeElement;
        if (!items.length) {
          e.preventDefault();
          dialog.focus();
        } else if (e.shiftKey && (active === first || active === dialog)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || active === dialog)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    this.modalCleanup = () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    this.q(root)
      .querySelectorAll("[data-close]")
      .forEach((n) => (n.onclick = () => this.closeModal()));
    dialog.focus();
  }
  drawer(title, html) {
    this.modal(
      "[data-overlay]",
      title,
      html,
      title === "사진 검색하기" ? "photo-modal" : "caption-modal",
    );
  }
  media() {
    this.closeSuggestions();
    this.drawer("사진 검색하기", "<section data-media-content></section>");
    this.mediaTab("search");
  }
  async mediaTab(tab) {
    const area = this.q("[data-media-content]");
    if (tab === "upload") {
      area.innerHTML =
        '<label class="upload-zone">사진을 선택하거나 본문으로 끌어오세요.<input type="file" accept="image/jpeg,image/png,image/webp" multiple></label>';
      area.querySelector("input").onchange = (e) => this.upload(e.target.files);
      return;
    }
    if (tab === "library") {
      area.innerHTML = `<div class="photo-grid">${this.state.photos.map((p) => `<div class="photo-card" draggable="true" data-library-id="${p.id}"><img src="${p.data}" alt="${esc(p.caption || "보관 사진")}"><div class="row"><button data-insert="${p.id}">넣기</button><button data-edit="${p.id}">편집</button><button data-delete="${p.id}">사진 삭제</button></div></div>`).join("")}</div>${this.state.photos.length ? "" : '<div class="empty">보관한 사진이 없어요.</div>'}`;
      area.ondragstart = (e) => {
        const c = e.target.closest("[data-library-id]");
        if (c) {
          e.dataTransfer.setData(
            "application/x-article-photo",
            c.dataset.libraryId,
          );
          this.q("[data-overlay]").replaceChildren();
        }
      };
      area.onclick = (e) => {
        const n = e.target.closest("button");
        if (!n) return;
        const id = n.dataset.insert || n.dataset.edit || n.dataset.delete,
          p = this.state.photos.find((v) => v.id === id);
        if (n.dataset.insert) {
          this.insert(p);
          this.q("[data-overlay]").replaceChildren();
        } else if (n.dataset.edit) this.editImage(p);
        else {
          this.state.photos = this.state.photos.filter((v) => v.id !== id);
          this.changed();
          this.mediaTab("library");
        }
      };
      return;
    }
    area.innerHTML =
      '<div class="search-row"><input data-search placeholder="어떤 사진을 찾을까요?" aria-label="사진 검색어"><button data-search-go>검색</button></div><div class="keywords" data-keywords></div><div data-results></div><p class="credit">사진 제공 <a href="https://unsplash.com/?utm_source=article_workspace&utm_medium=referral" target="_blank" rel="noopener">Unsplash</a></p>';
    area.querySelector("[data-search-go]").onclick = () =>
      this.searchPhotos(area.querySelector("[data-search]").value);
    area.querySelector("[data-search]").onkeydown = (e) => {
      if (e.key === "Enter") this.searchPhotos(e.target.value);
    };
    const body = plain(this.state.bodyHtml);
    if (body.length >= 80) {
      const k = area.querySelector("[data-keywords]");
      k.textContent = "검색어를 추천 중입니다.";
      try {
        const d = await this.api("/api/assist", {
          kind: "photo_keywords",
          body,
        });
        if (!k.isConnected) return;
        k.innerHTML = d.keywords
          .map((v) => `<button>${esc(v)}</button>`)
          .join("");
        k.onclick = (e) => {
          if (e.target.matches("button")) {
            area.querySelector("[data-search]").value = e.target.textContent;
            this.searchPhotos(e.target.textContent);
          }
        };
      } catch (e) {
        k.textContent = e.message;
      }
    }
  }
  async importPhoto(p, action = "edit") {
    const session = this.sessionToken;
    const data = await this.blobData(
      await window.NewsApi.getTeamPhotoBlob(p.id, this.controller.signal),
    );
    if (session !== this.sessionToken) return;
    if (action === "download") {
      const a = document.createElement("a");
      a.href = data;
      a.download =
        "unsplash-" +
        p.id +
        (data.startsWith("data:image/png")
          ? ".png"
          : data.startsWith("data:image/webp")
            ? ".webp"
            : ".jpg");
      a.click();
      return;
    }
    const photo = {
      id: crypto.randomUUID(),
      original: data,
      data,
      remoteOriginal: p.urls.full,
      unsplashId: p.id,
      caption: this.photoReplacement?.caption || "",
      source: p.user.name + " / Unsplash",
      photographer: p.user.name,
      profile: p.user.links.html,
      sourceUrl:
        p.links.html + "?utm_source=article_workspace&utm_medium=referral",
      alt: p.alt_description || "",
    };
    if (action === "insert") {
      this.state.photos.push(photo);
      this.insert(photo, this.photoReplacement?.replaceId);
    } else await this.editImage(photo, this.photoReplacement?.replaceId);
  }
  closePhotoMenu() {
    this.q("[data-photo-menu]")?.setAttribute("hidden", "");
    this.q("[data-images]")?.setAttribute("aria-expanded", "false");
  }
  async searchPhotos(query, page = 1) {
    const token = (this.searchToken = (this.searchToken || 0) + 1),
      a = this.q("[data-results]");
    query = query.trim();
    if (!query || !a) return;
    this.photoPages ||= new Map();
    const cacheKey = JSON.stringify([query, page]);
    a.innerHTML = '<div class="empty">사진을 찾고 있습니다.</div>';
    try {
      const d =
        this.photoPages.get(cacheKey) ||
        (await this.api(
          "/api/unsplash/search?q=" +
            encodeURIComponent(query) +
            "&page=" +
            page,
        ));
      this.photoPages.set(cacheKey, d);
      if (!a.isConnected || this.searchToken !== token) return;
      a.innerHTML = `<div class="photo-grid">${d.photos.map((p) => `<div class="photo-card"><button class="photo-select" data-photo="${esc(p.id)}" data-action="edit" aria-label="사진 편집 후 선택"><img src="${esc(p.urls.small)}" alt="${esc(p.alt_description || "검색 사진")}"></button><a href="${esc(p.user.links.html)}?utm_source=article_workspace&utm_medium=referral" target="_blank" rel="noopener">${esc(p.user.name)} / Unsplash</a><div class="row"><button data-photo="${esc(p.id)}" data-action="insert">바로 선택</button><button data-photo="${esc(p.id)}" data-action="edit">편집 후 선택</button><button data-photo="${esc(p.id)}" data-action="download">다운로드</button></div></div>`).join("")}</div>${d.photos.length ? "" : '<div class="empty">다른 검색어로 찾아보세요.</div>'}`;
      const totalPages = d.totalPages ?? page;
      if (d.photos.length)
        a.insertAdjacentHTML(
          "beforeend",
          `<nav class="photo-pagination" aria-label="사진 검색 결과 탐색"><button data-photo-prev ${page <= 1 ? "disabled" : ""} aria-label="이전 사진 3장">‹ 이전</button><span aria-live="polite">${page.toLocaleString("ko-KR")} / ${totalPages.toLocaleString("ko-KR")}</span><button data-photo-next ${page >= totalPages ? "disabled" : ""} aria-label="다음 사진 3장">다음 ›</button></nav>`,
        );
      a.querySelector("[data-photo-prev]")?.addEventListener("click", () =>
        this.searchPhotos(query, page - 1),
      );
      a.querySelector("[data-photo-next]")?.addEventListener("click", () =>
        this.searchPhotos(query, page + 1),
      );
      a.onclick = async (e) => {
        const n = e.target.closest("[data-photo]");
        if (!n) return;
        n.disabled = true;
        try {
          await this.importPhoto(
            d.photos.find((p) => p.id === n.dataset.photo),
            n.dataset.action,
          );
        } catch (error) {
          this.notice(error.message);
        } finally {
          n.disabled = false;
        }
      };
    } catch (e) {
      if (a.isConnected && this.searchToken === token)
        a.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }
  blobData(blob) {
    return new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => no(r.error);
      r.readAsDataURL(blob);
    });
  }
  choosePhotoFile(replacement = {}) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.hidden = true;
    this.shadowRoot.append(input);
    input.onchange = async () => {
      try {
        await this.upload(input.files, replacement);
      } catch (e) {
        this.notice(e.message);
      } finally {
        input.remove();
      }
    };
    input.addEventListener("cancel", () => input.remove(), { once: true });
    input.click();
  }
  async upload(files, replacement = {}) {
    const session = this.sessionToken;
    for (const f of files) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
        f.size > 15 * 1024 * 1024
      ) {
        this.notice("JPG, PNG, WebP 사진을 15MB 이하로 선택해 주세요.");
        continue;
      }
      const data = await this.blobData(f);
      if (session !== this.sessionToken) return;
      await this.editImage(
        {
          id: crypto.randomUUID(),
          original: data,
          data,
          caption: replacement.caption || "",
          source: replacement.source || "",
          alt: f.name,
        },
        replacement.replaceId,
      );
      break;
    }
  }
  async editImage(photo, replaceId) {
    const session = this.sessionToken;
    this.capture();
    this.closeSuggestions();
    this.q("[data-overlay]").replaceChildren();
    this.mode = "image";
    this.render();
    this.q("[data-preview]").hidden = true;
    this.q("[data-main]").innerHTML =
      `<div class="image-view"><div class="row"><button data-cancel>편집 취소</button><h2>사진 편집</h2></div><div class="image-layout"><div class="canvas-stage"><canvas class="crop-canvas" data-canvas tabindex="0" aria-label="사진 표시 범위. 모서리를 끌어 크기를 바꿀 수 있습니다."></canvas></div><div class="image-controls"><label>표시 비율</label><div class="ratios">${[
        ["원본", 0],
        ["16:9", 16 / 9],
        ["4:3", 4 / 3],
        ["1:1", 1],
        ["3:2", 1.5],
      ]
        .map(
          ([label, r]) =>
            `<button data-ratio="${r}" aria-pressed="${r === 0}">${label}</button>`,
        )
        .join(
          "",
        )}</div><label>모자이크</label><div class="mosaic-tools"><button data-mosaic-add aria-pressed="false">모자이크</button><button data-mosaic-erase aria-pressed="false">지우개</button><button data-mask-delete disabled>되돌리기</button></div><p class="muted" data-mosaic-hint>모자이크를 켜고 가릴 부분을 칠해주세요.</p><label class="brush-size">브러시 크기 <input data-brush-size type="range" min="12" max="120" value="48" aria-label="브러시 크기"><output data-brush-value>48</output></label><label class="brush-size">투명도 <input data-mosaic-opacity type="range" min="0" max="100" value="${Math.round((1 - (photo.mosaicOpacity ?? 1)) * 100)}" aria-label="모자이크 투명도"><output data-opacity-value>${Math.round((1 - (photo.mosaicOpacity ?? 1)) * 100)}%</output></label><label class="brush-size">경계 선명도 <input data-mosaic-hardness type="range" min="0" max="100" value="${photo.mosaicHardness ?? 20}" aria-label="모자이크 경계 선명도"><output data-hardness-value>${photo.mosaicHardness ?? 20}%</output></label><label>사진 설명</label><textarea data-cap rows="3">${esc(photo.caption)}</textarea><label>사진 출처</label><input data-source value="${esc(photo.source)}"><div class="image-save-actions"><button data-original-download>원본 다운로드</button><button data-image-download>편집본 다운로드</button><button data-image-apply class="primary">카드에 적용</button></div></div></div></div>`;
    const img = new Image();
    if (photo.remoteOriginal) img.crossOrigin = "anonymous";
    img.src = photo.remoteOriginal || photo.original || photo.data;
    try {
      await img.decode();
    } catch {
      img.removeAttribute("crossorigin");
      img.src = photo.original || photo.data;
      await img.decode();
    }
    if (this.mode !== "image" || session !== this.sessionToken) return;
    const c = this.q("[data-canvas]"),
      g = c.getContext("2d"),
      scale = Math.min(680 / img.width, 500 / img.height, 1);
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    let ratio = photo.ratio ?? (photo.crop ? photo.crop.w / photo.crop.h : 0),
      crop = photo.crop
        ? clampCrop({ ...photo.crop }, img.width, img.height)
        : cropForRatio(img.width, img.height, 0),
      masks = structuredClone(photo.masks || []),
      active = -1,
      opacity = photo.mosaicOpacity ?? 1,
      hardness = photo.mosaicHardness ?? 20,
      tool = null,
      history = [],
      drag = null,
      hover = -1,
      brushHover = null;
    const corners = (r) => ({
      nw: { x: r.x, y: r.y },
      ne: { x: r.x + r.w, y: r.y },
      sw: { x: r.x, y: r.y + r.h },
      se: { x: r.x + r.w, y: r.y + r.h },
    });
    const hitHandle = (r, p) =>
      Object.entries(corners(r)).find(
        ([, a]) =>
          Math.abs(a.x - p.x) < 12 / scale && Math.abs(a.y - p.y) < 12 / scale,
      )?.[0];
    const inside = (r, p) =>
      p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
    const hitMask = (p) => {
      for (let i = masks.length - 1; i >= 0; i--)
        if (maskContains(masks[i], p)) return i;
      return -1;
    };
    const outline = (r, color, handles) => {
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.strokeRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
      if (handles)
        for (const p of Object.values(corners(r))) {
          g.fillStyle = "#fff";
          g.fillRect(p.x * scale - 5, p.y * scale - 5, 10, 10);
          g.strokeStyle = "#222";
          g.strokeRect(p.x * scale - 5, p.y * scale - 5, 10, 10);
        }
    };
    const paint = () => {
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      renderMosaics(g, img, masks, scale, 0, 0, opacity, hardness);
      g.fillStyle = "#0008";
      g.beginPath();
      g.rect(0, 0, c.width, c.height);
      g.rect(crop.x * scale, crop.y * scale, crop.w * scale, crop.h * scale);
      g.fill("evenodd");
      outline(crop, "#fff", true);
      const selected = active >= 0 ? active : hover;
      if (!tool && selected >= 0 && masks[selected]) {
        // Outline the combined silhouette rather than every brush stamp.
        const alpha = document.createElement("canvas");
        alpha.width = c.width;
        alpha.height = c.height;
        const ag = alpha.getContext("2d");
        ag.fillStyle = "#fff";
        ag.fill(maskPath(masks[selected], scale));
        ag.globalCompositeOperation = "destination-out";
        for (const e of masks[selected].erasures || [])
          ag.fill(maskPath(e, scale));
        const halo = document.createElement("canvas");
        halo.width = c.width;
        halo.height = c.height;
        const hg = halo.getContext("2d");
        hg.shadowColor = "#fff";
        hg.shadowBlur = 5;
        hg.drawImage(alpha, 0, 0);
        hg.shadowBlur = 0;
        hg.globalCompositeOperation = "destination-out";
        hg.drawImage(alpha, 0, 0);
        g.drawImage(halo, 0, 0);
      }
      if ((tool === "paint" || tool === "erase") && brushHover) {
        g.beginPath();
        g.arc(
          brushHover.x * scale,
          brushHover.y * scale,
          Number(this.q("[data-brush-size]").value) / 2,
          0,
          Math.PI * 2,
        );
        g.strokeStyle = "#fff";
        g.lineWidth = 2;
        g.stroke();
        g.strokeStyle = "#222";
        g.lineWidth = 1;
        g.stroke();
      }
      this.q("[data-mask-delete]").disabled = history.length === 0;
    };
    const point = (e) => {
      const r = c.getBoundingClientRect();
      return {
        x: Math.max(
          0,
          Math.min(img.width, ((e.clientX - r.left) * img.width) / r.width),
        ),
        y: Math.max(
          0,
          Math.min(img.height, ((e.clientY - r.top) * img.height) / r.height),
        ),
      };
    };
    const cursor = (p) => {
      if (tool === "paint" || tool === "erase") {
        c.style.cursor = "crosshair";
        return;
      }
      if (!tool && hitMask(p) >= 0) {
        c.style.cursor = "grab";
        return;
      }
      const ch = hitHandle(crop, p);
      c.style.cursor = ch
        ? ch === "nw" || ch === "se"
          ? "nwse-resize"
          : "nesw-resize"
        : inside(crop, p)
          ? "grab"
          : "default";
    };
    c.onpointerdown = (e) => {
      c.focus();
      c.setPointerCapture(e.pointerId);
      const p = point(e);
      if (tool === "paint" || tool === "erase") {
        history.push(structuredClone(masks));
        const stroke = {
          type: "brush",
          diameter: Number(this.q("[data-brush-size]").value) / scale,
          points: [p],
        };
        if (tool === "paint") {
          masks.push(stroke);
          drag = { kind: "brush", stroke };
        } else {
          if (!masks.length) {
            history.pop();
            return;
          }
          masks.forEach((m) => (m.erasures ||= []).push(stroke));
          drag = { kind: "erase", stroke };
        }
        active = -1;
      } else if (hitMask(p) >= 0) {
        active = hitMask(p);
        if (active >= 0) {
          history.push(structuredClone(masks));
          drag = {
            kind: "shape-move",
            index: active,
            start: p,
            mask: structuredClone(masks[active]),
          };
        }
      } else {
        active = -1;
        const ch = hitHandle(crop, p);
        drag = ch
          ? { kind: "crop-resize", handle: ch, start: p, rect: { ...crop } }
          : inside(crop, p)
            ? { kind: "crop-move", start: p, rect: { ...crop } }
            : null;
      }
      paint();
    };
    c.onpointermove = (e) => {
      const p = point(e);
      brushHover = p;
      if (!drag) {
        const next = hitMask(p);
        if (tool === "paint" || tool === "erase" || next !== hover) {
          hover = next;
          paint();
        }
        cursor(p);
        return;
      }
      if (drag.kind === "brush" || drag.kind === "erase") {
        drag.stroke.points.push(p);
        c.style.cursor = "crosshair";
      } else if (drag.kind === "shape-move") {
        masks[drag.index] = moveMask(
          drag.mask,
          p.x - drag.start.x,
          p.y - drag.start.y,
          img.width,
          img.height,
        );
        c.style.cursor = "grabbing";
      } else if (drag.kind === "crop-resize")
        crop = resizeCrop(
          drag.rect,
          drag.handle,
          p,
          img.width,
          img.height,
          ratio,
        );
      else if (drag.kind === "crop-move")
        crop = clampCrop(
          {
            ...drag.rect,
            x: drag.rect.x + p.x - drag.start.x,
            y: drag.rect.y + p.y - drag.start.y,
          },
          img.width,
          img.height,
        );
      paint();
    };
    c.onpointerup = (e) => {
      if (!drag) return;
      const p = point(e);
      if (drag.kind === "brush" || drag.kind === "erase")
        drag.stroke.points.push(p);
      const finished = drag.kind === "brush" || drag.kind === "erase";
      drag = null;
      if (finished) chooseTool(null);
      paint();
      cursor(p);
    };
    c.onpointercancel = () => {
      drag = null;
      paint();
    };
    c.onpointerleave = () => {
      brushHover = null;
      if (!drag) {
        hover = -1;
        paint();
      }
    };
    const chooseTool = (next) => {
      tool = tool === next ? null : next;
      active = -1;
      for (const [selector, name] of [
        ["[data-mosaic-add]", "paint"],
        ["[data-mosaic-erase]", "erase"],
      ])
        this.q(selector).setAttribute("aria-pressed", tool === name);
      this.q("[data-mosaic-hint]").textContent =
        tool === "erase"
          ? "지울 부분을 브러시로 문질러주세요."
          : tool === "move"
            ? "옮길 모자이크를 잡고 끌어주세요."
            : "모자이크를 켜고 가릴 부분을 칠해주세요.";
      c.style.cursor =
        tool === "move" ? "default" : tool ? "crosshair" : "default";
      paint();
    };
    this.q("[data-mosaic-add]").onclick = () => chooseTool("paint");
    this.q("[data-mosaic-erase]").onclick = () => chooseTool("erase");
    this.q("[data-brush-size]").oninput = (e) =>
      (this.q("[data-brush-value]").textContent = e.target.value);
    this.q("[data-mosaic-opacity]").oninput = (e) => {
      opacity = 1 - Number(e.target.value) / 100;
      this.q("[data-opacity-value]").textContent = e.target.value + "%";
      paint();
    };
    this.q("[data-mosaic-hardness]").oninput = (e) => {
      hardness = Number(e.target.value);
      this.q("[data-hardness-value]").textContent = hardness + "%";
      paint();
    };
    const removeMask = () => {
      if (history.length) {
        masks = history.pop();
        active = -1;
        paint();
      }
    };
    this.q("[data-mask-delete]").onclick = removeMask;
    c.onkeydown = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (active >= 0 && active < masks.length) {
          history.push(structuredClone(masks));
          masks.splice(active, 1);
          active = -1;
          hover = -1;
          paint();
        }
      }
    };
    this.q("[data-cancel]").onclick = () => {
      this.mode = "edit";
      this.render();
    };
    this.q("[data-main]")
      .querySelectorAll("[data-ratio]")
      .forEach(
        (n) =>
          (n.onclick = () => {
            ratio = +n.dataset.ratio;
            crop = cropForRatio(img.width, img.height, ratio);
            this.q("[data-main]")
              .querySelectorAll("[data-ratio]")
              .forEach((v) => v.setAttribute("aria-pressed", v === n));
            paint();
          }),
      );
    const track = async () => {
      if (photo.unsplashId)
        await this.api(
          "/api/unsplash/photo/" +
            encodeURIComponent(photo.unsplashId) +
            "/track",
        );
    };
    this.q("[data-original-download]").onclick = async () => {
      try {
        await track();
        const a = document.createElement("a");
        a.href = photo.original || photo.data;
        a.download =
          "original-photo." +
          (a.href.startsWith("data:image/png")
            ? "png"
            : a.href.startsWith("data:image/webp")
              ? "webp"
              : "jpg");
        a.click();
      } catch (e) {
        this.notice(e.message);
      }
    };
    this.q("[data-image-download]").onclick = async () => {
      try {
        await track();
        const a = document.createElement("a");
        a.href = renderDerivative(img, crop, masks, 1600, opacity, hardness);
        a.download = "article-photo.jpg";
        a.click();
      } catch (e) {
        this.notice(e.message);
      }
    };
    this.q("[data-image-apply]").onclick = () => {
      const p = {
        ...photo,
        original: photo.original || photo.data,
        data: renderDerivative(img, crop, masks, 1600, opacity, hardness),
        crop,
        masks,
        mosaicOpacity: opacity,
        mosaicHardness: hardness,
        ratio,
        caption: this.q("[data-cap]").value,
        source: this.q("[data-source]").value,
      };
      this.state.photos = this.state.photos.filter((v) => v.id !== p.id);
      this.state.photos.push(p);
      this.insert(p, replaceId);
    };
    paint();
  }
}
customElements.define("photo-tools",PhotoTools);
