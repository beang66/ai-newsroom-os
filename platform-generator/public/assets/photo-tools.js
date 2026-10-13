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
      img.src=this.selectedPhoto.data;
      const credit=document.createElement('p');credit.textContent=this.selectedPhoto.source||'';
      this.q('[data-selected]').append(img,credit);
    }
  }
  async openEditor(photo){try{await this.editImage(structuredClone(photo));}catch(e){this.mode='edit';this.render();this.notice(e.message);}}
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
      area.innerHTML = `<div class="photo-grid">${this.state.photos.map((p) => `<div class="photo-card" draggable="true" data-library-id="${p.id}"><img src="${p.data}" alt="${esc(p.caption || "보관 사진")}"><div class="row"><button data-insert="${p.id}">넣기</button><button data-delete="${p.id}">사진 삭제</button></div></div>`).join("")}</div>${this.state.photos.length ? "" : '<div class="empty">보관한 사진이 없어요.</div>'}`;
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
        const d = await window.NewsApi.suggestPhotoKeywords(body,this.controller.signal);
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
  async importPhoto(p, action = "insert") {
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
      await window.NewsApi.trackTeamPhoto(photo.unsplashId, this.controller.signal);
      if (session !== this.sessionToken) return;
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
        (await window.NewsApi.searchTeamPhotos(query,page,this.controller.signal));
      this.photoPages.set(cacheKey, d);
      if (!a.isConnected || this.searchToken !== token) return;
      a.innerHTML = `<div class="photo-grid">${d.photos.map((p) => `<div class="photo-card"><button class="photo-select" data-photo="${esc(p.id)}" data-action="insert" aria-label="사진 선택"><img src="${esc(p.urls.small)}" alt="${esc(p.alt_description || "검색 사진")}"></button><a href="${esc(p.user.links.html)}?utm_source=article_workspace&utm_medium=referral" target="_blank" rel="noopener">${esc(p.user.name)} / Unsplash</a><div class="row"><button data-photo="${esc(p.id)}" data-action="insert">바로 선택</button><button data-photo="${esc(p.id)}" data-action="download">다운로드</button></div></div>`).join("")}</div>${d.photos.length ? "" : '<div class="empty">다른 검색어로 찾아보세요.</div>'}`;
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
      this.insert(
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
  // 선택 사진을 별도 편집창 없이 카드에 전달합니다.
  // 확대·위치·그라데이션은 카드 편집기의 presentation 설정으로 저장합니다.
  async editImage(photo) { this.insert(photo); }
}
customElements.define("photo-tools",PhotoTools);
