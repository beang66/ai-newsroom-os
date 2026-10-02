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
import { createApi } from "../src/api/client.js";
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
function sanitize(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  const allowed = new Set([
    "P",
    "DIV",
    "BR",
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "S",
    "STRIKE",
    "DEL",
  ]);
  for (const n of [...t.content.querySelectorAll("*")]) {
    if (!allowed.has(n.tagName)) {
      n.replaceWith(document.createTextNode(n.textContent));
      continue;
    }
    for (const a of [...n.attributes]) n.removeAttribute(a.name);
  }
  return t.innerHTML;
}
const db = () =>
  new Promise((ok, no) => {
    const r = indexedDB.open("article-workspace-v2", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("drafts");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
async function stored(value, key = "current") {
  const d = await db();
  return new Promise((ok, no) => {
    const tx = d.transaction("drafts", value ? "readwrite" : "readonly"),
      r = value
        ? tx.objectStore("drafts").put(value, key)
        : tx.objectStore("drafts").get(key);
    tx.oncomplete = () => {
      ok(r.result);
      d.close();
    };
    tx.onabort = () => {
      no(tx.error);
      d.close();
    };
    r.onerror = () => no(r.error);
  });
}
export class ArticleWorkspace extends HTMLElement {
  static get observedAttributes() {
    return ["theme-url"];
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "theme-url") {
      const link = this.shadowRoot?.querySelector("link[rel=stylesheet]");
      if (link) link.href = newValue || new URL("theme.css", ASSETS);
    }
  }
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.state = {
      schemaVersion: 12,
      title: "",
      subtitle: "",
      bodyHtml: "",
      category: "사회",
      photos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.cache = {};
    this.pending = {};
    this.mode = "edit";
    this.saveStatus = "자동 저장 대기";
    this.editRevision = 0;
    this.controller = new AbortController();
  }
  q(s) {
    return this.shadowRoot.querySelector(s);
  }
  async connectedCallback() {
    if (!document.querySelector("link[data-article-fonts]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = new URL("donga-fonts.css", ASSETS);
      l.dataset.articleFonts = "true";
      document.head.append(l);
    }
    this.render();
    try {
      const s = await stored(null, this.getAttribute("draft-key") || "current");
      if (s && !this.externalValue) {
        this.state = s;
        this.saveStatus = s.articleId ? "자동 저장됨" : "원고 복원됨";
        this.render();
      }
    } catch {}
    this.resize = new ResizeObserver(() => this.fitPreview());
    this.resize.observe(this);
    this.selectionHandler = () => this.selectionTools();
    document.addEventListener("selectionchange", this.selectionHandler);
    this.menuOutsideHandler = (e) => {
      const path = e.composedPath();
      if (!path.some((n) => n.matches?.(".photo-actions,figure img")))
        this.shadowRoot
          .querySelectorAll(".photo-actions,[data-replace-menu]")
          .forEach((n) => (n.hidden = true));
      if (!path.some((n) => n.matches?.("[data-photo-menu-wrap]")))
        this.closePhotoMenu();
    };
    this.menuEscapeHandler = (e) => {
      if (e.key === "Escape") {
        this.closePhotoMenu();
        this.shadowRoot
          .querySelectorAll(".photo-actions,[data-replace-menu]")
          .forEach((n) => (n.hidden = true));
      }
    };
    document.addEventListener("pointerdown", this.menuOutsideHandler);
    document.addEventListener("keydown", this.menuEscapeHandler);
  }
  disconnectedCallback() {
    this.closeModal();
    clearTimeout(this.closeSuggestionTimer);
    cancelAnimationFrame(this.scrollFrame);
    clearTimeout(this.timer);
    clearTimeout(this.saveTimer);
    clearTimeout(this.diskTimer);
    this.cancelPhotoDrag?.();
    this.dragGesture?.abort();
    this.shadowRoot.querySelector(".photo-drag-ghost")?.remove();
    this.controller.abort();
    this.resize?.disconnect();
    document.removeEventListener("selectionchange", this.selectionHandler);
    document.removeEventListener("pointerdown", this.menuOutsideHandler);
    document.removeEventListener("keydown", this.menuEscapeHandler);
  }
  get value() {
    this.capture();
    return structuredClone(this.state);
  }
  set value(v) {
    this.externalValue = true;
    this.state = { ...this.state, ...v };
    this.cache = {};
    if (this.isConnected) this.render();
  }
  async api(path, payload) {
    // All core access is centralised in frontend/src/api/client.js.
    return createApi(this.getAttribute("api-base") || "").json(
      path,
      payload,
      this.controller.signal,
    );
  }
  capture() {
    if (this.mode !== "edit") return;
    const t = this.q("[data-title]"),
      s = this.q("[data-subtitle]"),
      b = this.q("[data-body]");
    if (t) this.state.title = t.innerHTML;
    if (s) this.state.subtitle = s.innerHTML;
    if (b) {
      const copy = b.cloneNode(true);
      copy
        .querySelectorAll(".photo-actions,.drop-guide")
        .forEach((n) => n.remove());
      this.state.bodyHtml = copy.innerHTML;
    }
  }
  changed() {
    this.capture();
    this.state.updatedAt = new Date().toISOString();
    this.editRevision++;
    this.saveStatus = "자동 저장 중…";
    this.updateStatus();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        await stored(this.state, this.getAttribute("draft-key") || "current");
      } catch {
        this.saveStatus = "브라우저 저장 실패";
        this.updateStatus();
      }
    }, 600);
    clearTimeout(this.diskTimer);
    this.diskTimer = setTimeout(() => this.saveArticle(true), 1500);
    this.dispatchEvent(
      new CustomEvent("article-change", {
        detail: this.value,
        bubbles: true,
        composed: true,
      }),
    );
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (plain(this.state.bodyHtml).trim().length >= 80) {
        for (const type of ["headline", "subheadline"])
          if (
            !this.state.confirmed?.[type] &&
            !this.cache[type] &&
            !this.pending[type]
          )
            this.suggest(type, false);
      }
    }, 3500);
  }
  notice(s) {
    const n = this.q("[data-notice]");
    n.hidden = !s;
    n.textContent = s;
  }
  render() {
    this.closeModal();
    this.state.confirmed ||= { headline: false, subheadline: false };
    this.shadowRoot.innerHTML = `<link rel="stylesheet" href="${esc(this.getAttribute("theme-url") || new URL("theme.css", ASSETS))}"><header class="toolbar"><span class="brand">기사 작성</span><div class="actions"><button data-export>저장하기</button><button class="primary" data-preview>${this.mode === "preview" ? "작성으로 돌아가기" : "미리보기"}</button></div></header><div class="notice" data-notice hidden role="status"></div><main data-main></main><footer class="footer-status" aria-label="원고 상태"><span data-save role="status"></span><span data-count title="본문 기준 · 공백 포함 · 줄바꿈 제외"></span></footer><div class="format-tools" data-format hidden><button data-command="bold"><b>B</b></button><button data-command="italic"><i>I</i></button><button data-command="underline"><u>U</u></button><button data-command="strikeThrough"><s>S</s></button><button data-bullet>● 소제목</button></div><section data-overlay></section><section data-flow></section>`;
    this.q("[data-preview]").onclick = () => {
      this.capture();
      this.mode = this.mode === "preview" ? "edit" : "preview";
      this.render();
    };
    this.q("[data-export]").onclick = () => this.saveArticle();
    this.shadowRoot.onclick = (e) => {
      if (!e.target.closest(".photo-actions,figure img"))
        this.shadowRoot
          .querySelectorAll(".photo-actions,[data-replace-menu]")
          .forEach((n) => (n.hidden = true));
      if (!e.target.closest(".field")) this.closeSuggestions();
      if (!e.target.closest("[data-photo-menu-wrap]")) this.closePhotoMenu();
    };
    this.q("[data-format]").onmousedown = (e) => e.preventDefault();
    this.q("[data-format]").onclick = (e) => {
      const cmd = e.target.closest("[data-command]");
      if (cmd) {
        document.execCommand(cmd.dataset.command, false);
        this.changed();
      }
      if (e.target.closest("[data-bullet]")) {
        const sel = this.getSelection();
        if (sel?.rangeCount) {
          const r = sel.getRangeAt(0);
          r.insertNode(document.createTextNode("● "));
          this.changed();
        }
      }
    };
    this.mode === "preview" ? this.renderPreview() : this.renderEditor();
    this.updateStatus();
  }
  renderEditor() {
    this.q("[data-main]").innerHTML =
      `<div class="page"><div class="category-row"><select data-category aria-label="기사 분야">${["사회", "정치", "경제", "국제", "문화", "생활", "스포츠"].map((v) => `<option ${v === this.state.category ? "selected" : ""}>${v}</option>`).join("")}</select></div>${["title", "subtitle"].map((k, i) => `<div class="field"><div class="field-line"><div class="editable ${k}-input" contenteditable="true" role="textbox" aria-label="${i ? "부제목" : "제목"}" aria-autocomplete="list" data-${k} data-placeholder="${i ? "부제목" : "제목을 입력하세요"}">${this.state[k]}</div><div class="field-actions"><button class="icon-button" data-confirm="${i ? "subheadline" : "headline"}" aria-label="${i ? "부제목" : "제목"} ${this.state.confirmed[i ? "subheadline" : "headline"] ? "확정 해제" : "확정"}" aria-pressed="${!!this.state.confirmed[i ? "subheadline" : "headline"]}" title="${this.state.confirmed[i ? "subheadline" : "headline"] ? "확정 해제" : "확정"}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path data-lock-shackle d="${this.state.confirmed[i ? "subheadline" : "headline"] ? "M8 10V7a4 4 0 0 1 8 0v3" : "M8 10V7a4 4 0 0 1 8 0"}"/></svg></button><button class="icon-button ai-button" data-regenerate="${i ? "subheadline" : "headline"}" aria-label="${i ? "부제목" : "제목"} 다시 생성" title="AI 추천"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M3 11H1m22 0h-2M8 20v1m8-1v1"/><rect x="4" y="7" width="16" height="13" rx="2"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M9 16h6"/></svg><span aria-hidden="true">AI</span></button></div></div><div class="suggestions" data-suggestions="${i ? "subheadline" : "headline"}" hidden role="listbox"></div></div>`).join("")}<div class="body-tools row"><div class="row"><div class="photo-menu-wrap" data-photo-menu-wrap><button class="body-icon" data-images aria-expanded="false" aria-label="사진 넣기" title="사진 넣기" data-tip="사진 넣기"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m4 18 5-5 4 3 3-4 5 6"/></svg></button><div class="photo-menu" data-photo-menu hidden><button data-photo-choice="search">사진 검색하기</button><button data-photo-choice="upload">사진 첨부하기</button></div></div><button class="body-icon" data-flow-open aria-label="요약 보기" title="요약 보기" data-tip="요약 보기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg></button><button class="body-icon" data-copy-body aria-label="본문 복사" title="본문 복사" data-tip="본문 복사"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M15 8V4H4v11h4"/></svg></button><button class="body-icon" data-print aria-label="인쇄하기" title="인쇄하기" data-tip="인쇄하기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 16H4V8h16v8h-3M7 13h10v8H7zM17 11h1"/></svg></button></div></div><div class="body-editor" contenteditable="true" role="textbox" aria-label="기사 본문" aria-multiline="true" data-body data-placeholder="기사를 작성하세요.">${this.state.bodyHtml}</div></div>`;
    this.q("[data-category]").onchange = (e) => {
      this.state.category = e.target.value;
      this.changed();
    };
    for (const [k, type] of [
      ["title", "headline"],
      ["subtitle", "subheadline"],
    ]) {
      const n = this.q(`[data-${k}]`);
      n.onfocus = () => this.openSuggestions(type);
      n.onclick = () => this.openSuggestions(type);
      n.onkeydown = (e) => {
        if (e.key === "Escape")
          this.q(`[data-suggestions="${type}"]`).hidden = true;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.q(`[data-suggestions="${type}"] button`)?.focus();
        }
      };
      n.onblur = () =>
        setTimeout(() => {
          if (!n.closest(".field").contains(this.shadowRoot.activeElement)) {
            const box = this.q(`[data-suggestions="${type}"]`);
            if (box) box.hidden = true;
          }
        }, 180);
      n.oninput = () => this.changed();
      n.onpaste = (e) => {
        e.preventDefault();
        document.execCommand(
          "insertText",
          false,
          e.clipboardData.getData("text/plain"),
        );
        this.changed();
      };
    }
    const b = this.q("[data-body]");
    b.onfocus = () =>
      document.execCommand("defaultParagraphSeparator", false, "p");
    b.oninput = () => {
      this.changed();
    };
    b.onpaste = (e) => {
      e.preventDefault();
      document.execCommand(
        "insertHTML",
        false,
        sanitize(
          e.clipboardData.getData("text/html") ||
            esc(e.clipboardData.getData("text/plain")).replace(/\n/g, "<br>"),
        ),
      );
      this.changed();
    };
    b.onclick = (e) => {
      if (
        this.lastPhotoDrag &&
        performance.now() - this.lastPhotoDrag.at < 300 &&
        Math.hypot(
          e.clientX - this.lastPhotoDrag.x,
          e.clientY - this.lastPhotoDrag.y,
        ) < 3
      ) {
        this.lastPhotoDrag = null;
        return;
      }
      this.lastPhotoDrag = null;
      const btn = e.target.closest("[data-photo-action]");
      if (!btn) {
        const selected = e.target.closest("figure img")?.closest("figure");
        b.querySelectorAll(".photo-actions").forEach(
          (n) => (n.hidden = n.parentNode !== selected),
        );
        return;
      }
      const f = btn.closest("figure"),
        p = this.state.photos.find((v) => v.id === f.dataset.photoId);
      if (btn.dataset.photoAction === "delete") {
        f.remove();
        this.changed();
      } else if (btn.dataset.photoAction === "edit")
        this.editImage(p, f.dataset.instanceId);
      else if (btn.dataset.photoAction === "replace") {
        const menu = f.querySelector("[data-replace-menu]");
        menu.hidden = !menu.hidden;
        btn.setAttribute("aria-expanded", String(!menu.hidden));
      } else if (btn.dataset.photoAction === "replace-search") {
        f.querySelector("[data-replace-menu]").hidden = true;
        this.photoReplacement = {
          replaceId: f.dataset.instanceId,
          caption: p.caption,
          source: p.source,
        };
        this.media();
      } else if (btn.dataset.photoAction === "replace-upload") {
        f.querySelector("[data-replace-menu]").hidden = true;
        this.choosePhotoFile({
          replaceId: f.dataset.instanceId,
          caption: p.caption,
          source: p.source,
        });
      } else this.caption(p);
    };
    const normalizeDropBlocks = () => {
      let wrapper = null;
      for (const node of [...b.childNodes]) {
        const inline =
          node.nodeType === Node.TEXT_NODE ||
          (node.nodeType === Node.ELEMENT_NODE &&
            !/^(P|DIV|FIGURE|UL|OL|H[1-6]|BLOCKQUOTE)$/.test(node.tagName));
        if (inline) {
          if (!wrapper) {
            wrapper = document.createElement("div");
            b.insertBefore(wrapper, node);
          }
          wrapper.append(node);
        } else wrapper = null;
      }
    };
    const scrollDrag = (y, dt) => {
      let node = b,
        scroller = null;
      while (node) {
        const style = getComputedStyle(node);
        if (
          /(auto|scroll)/.test(style.overflowY) &&
          node.scrollHeight > node.clientHeight + 1
        ) {
          scroller = node;
          break;
        }
        node = node.parentElement || node.getRootNode()?.host;
      }
      const rect = scroller?.getBoundingClientRect();
      const top = Math.max(
          rect?.top || 0,
          this.q(".toolbar").getBoundingClientRect().bottom,
        ),
        bottom = Math.min(rect?.bottom || innerHeight, innerHeight - 48),
        edge = 80;
      const speed =
        y < top + edge
          ? -Math.min(1, (top + edge - y) / edge)
          : y > bottom - edge
            ? Math.min(1, (y - bottom + edge) / edge)
            : 0;
      if (speed) {
        if (scroller) scroller.scrollTop += speed * dt * 0.7;
        else window.scrollBy(0, speed * dt * 0.7);
      }
    };
    b.ondragstart = (e) => {
      const f = e.target.closest("figure");
      if (f) {
        normalizeDropBlocks();
        e.dataTransfer.setData(
          "application/x-article-photo",
          f.dataset.photoId,
        );
        e.dataTransfer.setData(
          "application/x-article-instance",
          f.dataset.instanceId,
        );
        e.dataTransfer.effectAllowed = "move";
        f.querySelectorAll(".photo-actions").forEach((n) => (n.hidden = true));
        f.classList.add("dragging");
        const image = f.querySelector("img");
        if (image)
          e.dataTransfer.setDragImage(
            image,
            Math.min(80, image.clientWidth / 2),
            Math.min(60, image.clientHeight / 2),
          );
      }
    };
    b.ondragend = () => {
      b.querySelectorAll(".dragging,.drop-guide").forEach((n) =>
        n.classList.contains("drop-guide")
          ? n.remove()
          : n.classList.remove("dragging"),
      );
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = null;
    };
    // Locate explicit line breaks as well as paragraph boundaries. Never
    // treat a pasted DIV containing many BRs as one indivisible paragraph.
    const updateDrop = () => {
      const candidates = [];
      for (const block of b.childNodes) {
        if (block.nodeType !== 1 || block.matches(".dragging,.drop-guide"))
          continue;
        const box = block.getBoundingClientRect();
        candidates.push({ y: box.top, target: block });
        if (!block.matches("figure")) {
          for (const node of block.querySelectorAll("br, p, div")) {
            if (node.closest("figure")) continue;
            const range = document.createRange();
            if (node.tagName === "BR") range.setStartAfter(node);
            else range.setStartBefore(node);
            range.collapse(true);
            const rect = node.getBoundingClientRect();
            const y = node.tagName === "BR" ? rect.bottom : rect.top;
            if (y >= box.top && y <= box.bottom)
              candidates.push({
                y,
                block,
                range,
                breakNode: node.tagName === "BR" ? node : null,
              });
          }
        }
        candidates.push({ y: box.bottom, target: block.nextSibling });
      }
      const choice = candidates.reduce(
        (best, item) =>
          !best || Math.abs(item.y - this.dropY) < Math.abs(best.y - this.dropY)
            ? item
            : best,
        null,
      );
      this.dropPosition = choice;
      this.dropTarget = choice?.target || null;
      let guide = b.querySelector(".drop-guide");
      if (!guide) {
        guide = document.createElement("div");
        guide.className = "drop-guide";
        guide.contentEditable = "false";
        b.append(guide);
      }
      guide.style.position = "absolute";
      guide.style.top = `${(choice?.y ?? b.getBoundingClientRect().bottom) - b.getBoundingClientRect().top + b.scrollTop}px`;
      guide.style.left = "0";
      guide.style.right = "0";
    };
    const placePhoto = (figure) => {
      const position = this.dropPosition;
      if (position?.range && b.contains(position.block)) {
        const block = position.block;
        const tail = position.range.cloneRange();
        tail.setEnd(block, block.childNodes.length);
        const after = block.cloneNode(false);
        after.removeAttribute("id");
        after.append(tail.extractContents());
        // The separating BR becomes a block boundary; do not retain it as
        // an extra blank line before the photo.
        position.breakNode?.remove();
        block.after(figure, after);
      } else {
        const target = position?.target;
        b.insertBefore(figure, target?.parentNode === b ? target : null);
      }
      b.querySelector(".drop-guide")?.remove();
      this.dropPosition = null;
    };
    // Pointer dragging tracks every frame; native drop remains for external files.
    b.onpointerdown = (e) => {
      const image = e.target.closest("figure img"),
        figure = image?.closest("figure");
      if (!figure || e.button !== 0) return;
      normalizeDropBlocks();
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY },
        previousSelect = document.body.style.userSelect;
      let point = start,
        ghost = null,
        moving = false,
        last = performance.now();
      const gesture = new AbortController();
      this.cancelPhotoDrag?.();
      this.dragGesture?.abort();
      this.dragGesture = gesture;
      const clean = () => {
        cancelAnimationFrame(this.scrollFrame);
        this.scrollFrame = null;
        ghost?.remove();
        b.querySelector(".drop-guide")?.remove();
        figure.classList.remove("dragging");
        document.body.style.userSelect = previousSelect;
        gesture.abort();
        this.cancelPhotoDrag = null;
      };
      this.cancelPhotoDrag = clean;
      const tick = (now) => {
        const dt = Math.min(32, now - last);
        last = now;
        ghost.style.transform = `translate3d(${point.x + 14}px,${point.y + 14}px,0)`;
        scrollDrag(point.y, dt);
        this.dropY = point.y;
        updateDrop();
        this.scrollFrame = requestAnimationFrame(tick);
      };
      document.addEventListener(
        "pointermove",
        (v) => {
          point = { x: v.clientX, y: v.clientY };
          if (!moving && Math.hypot(point.x - start.x, point.y - start.y) > 6) {
            moving = true;
            document.body.style.userSelect = "none";
            figure.classList.add("dragging");
            figure.querySelector(".photo-actions").hidden = true;
            ghost = document.createElement("img");
            ghost.src = image.src;
            ghost.alt = "";
            ghost.className = "photo-drag-ghost";
            this.shadowRoot.append(ghost);
            cancelAnimationFrame(this.scrollFrame);
            this.scrollFrame = requestAnimationFrame(tick);
          }
          if (moving) v.preventDefault();
        },
        { signal: gesture.signal },
      );
      document.addEventListener(
        "pointerup",
        () => {
          if (moving) {
            this.dropY = point.y;
            updateDrop();
            placePhoto(figure);
            this.lastPhotoDrag = { ...point, at: performance.now() };
            clean();
            figure.animate?.([{ opacity: 0.5 }, { opacity: 1 }], {
              duration: 140,
              easing: "ease-out",
            });
            this.changed();
          } else clean();
        },
        { once: true, signal: gesture.signal },
      );
      document.addEventListener("pointercancel", clean, {
        once: true,
        signal: gesture.signal,
      });
    };
    b.ondragover = (e) => {
      e.preventDefault();
      this.dropY = e.clientY;
      if (this.scrollFrame) return;
      let last = performance.now();
      const tick = (now) => {
        const dt = Math.min(32, now - last);
        last = now;
        scrollDrag(this.dropY, dt);
        updateDrop();
        this.scrollFrame = requestAnimationFrame(tick);
      };
      updateDrop();
      this.scrollFrame = requestAnimationFrame(tick);
    };
    b.ondrop = async (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = null;
      const id = e.dataTransfer.getData("application/x-article-photo");
      const p = this.state.photos.find((v) => v.id === id);
      const g = b.querySelector(".drop-guide");
      if (p) {
        const instance = e.dataTransfer.getData(
          "application/x-article-instance",
        );
        const old = instance
          ? b.querySelector(
              `figure[data-instance-id="${CSS.escape(instance)}"]`,
            )
          : null;
        const f = old || this.figure(p);
        placePhoto(f);
        f.classList.remove("dragging");
        g?.remove();
        f.animate?.(
          [
            { opacity: 0.5, transform: "translateY(6px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 160, easing: "ease-out" },
        );
        this.changed();
      } else {
        g?.remove();
        if (e.dataTransfer.files.length) this.upload(e.dataTransfer.files);
      }
    };
    this.q("[data-images]").onpointerdown = () => this.rememberPosition();
    this.q("[data-images]").onclick = () => {
      this.closeSuggestions();
      this.photoReplacement = null;
      const menu = this.q("[data-photo-menu]");
      menu.hidden = !menu.hidden;
      this.q("[data-images]").setAttribute("aria-expanded", !menu.hidden);
    };
    this.q("[data-photo-menu]").onclick = (e) => {
      const n = e.target.closest("[data-photo-choice]");
      if (!n) return;
      this.closePhotoMenu();
      if (n.dataset.photoChoice === "search") this.media();
      else this.choosePhotoFile();
    };
    this.shadowRoot.querySelectorAll("[data-confirm]").forEach(
      (n) =>
        (n.onclick = () => {
          const type = n.dataset.confirm;
          const field = this.q(
            type === "headline" ? "[data-title]" : "[data-subtitle]",
          );
          if (!plain(field.innerHTML)) {
            this.notice("문구를 입력하거나 추천을 선택한 뒤 확정해 주세요.");
            return;
          }
          this.state.confirmed[type] = !this.state.confirmed[type];
          n.setAttribute("aria-pressed", this.state.confirmed[type]);
          n.title = this.state.confirmed[type] ? "확정 해제" : "확정";
          n.setAttribute(
            "aria-label",
            (type === "headline" ? "제목" : "부제목") + " " + n.title,
          );
          n.querySelector("[data-lock-shackle]").setAttribute(
            "d",
            this.state.confirmed[type]
              ? "M8 10V7a4 4 0 0 1 8 0v3"
              : "M8 10V7a4 4 0 0 1 8 0",
          );
          this.applyFieldLock(type);
          this.closeSuggestions();
          this.changed();
        }),
    );
    this.shadowRoot.querySelectorAll("[data-regenerate]").forEach(
      (n) =>
        (n.onclick = () => {
          const type = n.dataset.regenerate;
          if (this.state.confirmed[type]) return;
          delete this.cache[type];
          this.changed();
          this.openSuggestions(type);
        }),
    );
    this.q("[data-print]").onclick = () => this.printArticle();
    this.q("[data-copy-body]").onclick = async () => {
      this.capture();
      const text = plain(this.state.bodyHtml);
      try {
        if (navigator.clipboard?.writeText)
          await navigator.clipboard.writeText(text);
        else {
          const input = document.createElement("textarea");
          input.value = text;
          input.style.cssText = "position:fixed;left:-9999px";
          this.shadowRoot.append(input);
          input.select();
          const ok = document.execCommand("copy");
          input.remove();
          if (!ok) throw Error("copy");
        }
        const n = this.q("[data-copy-body]");
        n.dataset.tip = "복사됨";
        n.title = "복사됨";
        setTimeout(() => {
          if (n.isConnected) {
            n.dataset.tip = "본문 복사";
            n.title = "본문 복사";
          }
        }, 1500);
      } catch {
        this.notice("복사하지 못했어요. 본문을 선택해 Ctrl+C로 복사해 주세요.");
      }
    };
    this.q("[data-flow-open]").onclick = () => this.flow();
    b.querySelectorAll("figure").forEach((f) => this.decorate(f));
    this.applyFieldLock("headline");
    this.applyFieldLock("subheadline");
  }
  applyFieldLock(type) {
    const locked = !!this.state.confirmed?.[type];
    const field = this.q(
      type === "headline" ? "[data-title]" : "[data-subtitle]",
    );
    if (!field) return;
    field.contentEditable = String(!locked);
    field.setAttribute("contenteditable", String(!locked));
    field.setAttribute("aria-readonly", String(locked));
    field.tabIndex = locked ? -1 : 0;
    if (locked && this.shadowRoot.activeElement === field) field.blur();
    const button = this.q(`[data-regenerate="${type}"]`);
    button.disabled = locked || !!this.pending?.[type];
    button.title = locked
      ? "확정을 해제하면 AI 추천을 받을 수 있어요"
      : "AI 추천";
  }
  closeSuggestions() {
    this.shadowRoot
      .querySelectorAll("[data-suggestions]")
      .forEach((n) => (n.hidden = true));
  }
  openSuggestions(type) {
    this.closeSuggestions();
    if (this.state.confirmed?.[type]) return;
    const box = this.q(`[data-suggestions="${type}"]`);
    if (!box) return;
    box.hidden = false;
    this.suggest(type, true);
  }
  async suggest(type, visible) {
    if (this.state.confirmed?.[type]) return;
    this.capture();
    const body = plain(this.state.bodyHtml).trim(),
      key =
        body + "|" + (type === "subheadline" ? plain(this.state.title) : "");
    const box = this.q(`[data-suggestions="${type}"]`);
    if (body.length < 80) {
      if (box)
        box.innerHTML = `<div class="muted">${type === "headline" ? "기사 본문을 작성하면 기사 제목을 추천해드립니다." : "기사 본문을 작성하면 부제목을 추천해드립니다."}</div>`;
      return;
    }
    if (this.cache[type]) {
      this.showCandidates(type);
      return;
    }
    const loading = () => {
      if (box)
        box.innerHTML = `<div class="muted" role="status"><span class="spinner"></span>${type === "headline" ? "적절한 헤드라인을 추천 중입니다." : "부제목을 추천 중입니다."}</div>`;
    };
    if (this.pending[type]) {
      loading();
      return;
    }
    this.pending[type] = key;
    loading();
    const regenerate = this.q(`[data-regenerate="${type}"]`);
    if (regenerate) regenerate.disabled = true;
    try {
      const d = await this.api("/api/assist", {
        kind: "metadata",
        requested: type,
        body,
        current_headline: plain(this.state.title),
      });
      if (this.state.confirmed?.[type]) return;
      if (plain(this.state.bodyHtml).trim() !== body) {
        if (box)
          box.innerHTML =
            '<div class="muted">본문이 바뀌었어요. 다시 생성 아이콘으로 새 추천을 받아보세요.</div>';
        return;
      }
      let values =
        type === "headline"
          ? (d.headline_candidates || [])
              .map((x) =>
                typeof x === "string" ? x : x.headline || x.title || x.text,
              )
              .filter(Boolean)
          : [d.subtitle, ...(d.subtitle_candidates || [])].filter(Boolean);
      if (type === "headline" && !values.length && d.headline)
        values = [d.headline];
      this.cache[type] = { key, values: [...new Set(values)] };
      this.showCandidates(type);
    } catch (e) {
      if (box && !this.state.confirmed?.[type])
        box.innerHTML = `<div class="muted">${esc(e.message)}</div><button data-retry>다시 시도</button>`;
      box
        ?.querySelector("[data-retry]")
        ?.addEventListener("click", () => this.suggest(type, true));
    } finally {
      delete this.pending[type];
      if (regenerate) regenerate.disabled = !!this.state.confirmed?.[type];
    }
  }
  updateStatus() {
    const text = plain(this.state.bodyHtml).replace(/\n/g, "");
    const count =
      typeof Intl.Segmenter === "function"
        ? [
            ...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(
              text,
            ),
          ].length
        : [...text].length;
    if (this.q("[data-count]"))
      this.q("[data-count]").textContent =
        `본문 ${count.toLocaleString("ko-KR")}자`;
    if (this.q("[data-save]"))
      this.q("[data-save]").textContent = this.saveStatus;
  }
  async persistArticle() {
    // One worker owns all writes; edits during a request trigger another pass.
    if (this.diskSavePromise) return this.diskSavePromise;
    this.diskSavePromise = (async () => {
      do {
        const revision = this.editRevision;
        const d = await this.api("/api/articles/save", { draft: this.value });
        this.state.articleId = d.articleId;
        this.savedRevision = revision;
        await stored(this.state, this.getAttribute("draft-key") || "current");
        this.dispatchEvent(
          new CustomEvent("article-saved", {
            detail: d,
            bubbles: true,
            composed: true,
          }),
        );
      } while (this.savedRevision !== this.editRevision);
    })();
    try {
      await this.diskSavePromise;
    } finally {
      this.diskSavePromise = null;
    }
  }
  async saveArticle(automatic = false) {
    this.capture();
    clearTimeout(this.diskTimer);
    const button = this.q("[data-export]");
    if (!automatic && button) {
      button.disabled = true;
      button.textContent = "저장 중…";
    }
    this.saveStatus = "자동 저장 중…";
    this.updateStatus();
    try {
      await this.persistArticle();
      this.saveStatus = "자동 저장됨";
      if (!automatic) this.notice("원고를 저장했어요.");
    } catch (e) {
      if (!this.isConnected) return;
      this.saveStatus = "파일 저장 실패 · 다시 시도 중";
      if (!automatic) this.notice(e.message);
      this.diskTimer = setTimeout(() => this.saveArticle(true), 5000);
    } finally {
      this.updateStatus();
      if (!automatic && button?.isConnected) {
        button.disabled = false;
        button.textContent = "저장하기";
      }
    }
  }
  showCandidates(type) {
    const box = this.q(`[data-suggestions="${type}"]`);
    if (!box) return;
    const values = this.cache[type]?.values || [];
    box.innerHTML =
      values
        .map(
          (v, i) =>
            `<button role="option" data-candidate="${i}">${esc(v)}</button>`,
        )
        .join("") ||
      '<div class="muted">추천을 만들지 못했어요. 다시 시도해 주세요.</div>';
    box.onclick = (e) => {
      const n = e.target.closest("[data-candidate]");
      if (n) {
        this.q(
          type === "headline" ? "[data-title]" : "[data-subtitle]",
        ).innerHTML = esc(values[+n.dataset.candidate]).replace(/\n/g, "<br>");
        box.hidden = true;
        this.changed();
      }
    };
  }
  printArticle() {
    this.capture();
    this.mode = "preview";
    this.render();
    const frame = this.q("iframe");
    frame.addEventListener(
      "load",
      async () => {
        await frame.contentDocument.fonts.ready;
        await Promise.allSettled(
          [...frame.contentDocument.images].map((img) => img.decode()),
        );
        frame.contentWindow.focus();
        frame.contentWindow.print();
      },
      { once: true },
    );
  }
  renderPreview() {
    const html = document.createElement("div");
    html.innerHTML = this.state.bodyHtml;
    html
      .querySelectorAll("s,strike,del,.photo-actions")
      .forEach((n) => n.remove());
    html.querySelectorAll("figure").forEach((n) => {
      n.removeAttribute("draggable");
      n.removeAttribute("contenteditable");
    });
    const field = (h) => {
      const d = document.createElement("div");
      d.innerHTML = h;
      d.querySelectorAll("s,strike,del").forEach((n) => n.remove());
      return d.innerHTML;
    };
    const time = (x) =>
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(x));
    this.q("[data-main]").innerHTML =
      '<div class="preview-view"><div class="preview-shell"><iframe class="preview-frame" title="기사 미리보기"></iframe></div></div>';
    const f = this.q("iframe");
    f.srcdoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${new URL("donga-fonts.css", ASSETS)}"><link rel="stylesheet" href="${new URL("donga-preview.css", ASSETS)}"><style>@media print{html,body{margin:0}.article{margin:0 auto}figure{break-inside:avoid}h1{break-after:avoid}}</style></head><body><article class="article"><header class="preview-head"><div class="category">${esc(this.state.category)}</div><h1 class="title">${field(this.state.title)}</h1><div class="meta"><span>입력 ${time(this.state.createdAt)}</span><span>업데이트 ${time(this.state.updatedAt)}</span></div></header><section class="preview-body">${this.state.subtitle ? `<div class="subtitle">${field(this.state.subtitle)}</div>` : ""}<div class="body">${html.innerHTML}</div></section></article></body></html>`;
    f.onload = async () => {
      await f.contentDocument.fonts.ready;
      this.fitPreview();
    };
  }
  fitPreview() {
    const f = this.q("iframe"),
      s = this.q(".preview-shell");
    if (!f?.contentDocument?.body || !s) return;
    // Use the available viewport, never scale the rendered article.
    const width = this.q(".preview-view").clientWidth;
    const gutter = Math.max(
      0,
      innerWidth - document.documentElement.clientWidth,
    );
    f.style.width = `${width + gutter}px`;
    f.style.transform = "none";
    s.style.width = `${width}px`;
    const height = f.contentDocument.body.scrollHeight;
    f.style.height = `${height}px`;
    s.style.height = `${height}px`;
  }

  getSelection() {
    return this.shadowRoot.getSelection?.() || window.getSelection();
  }
  selectionTools() {
    if (this.mode !== "edit") return;
    const s = this.getSelection(),
      bar = this.q("[data-format]");
    if (!bar) return;
    if (
      !s?.rangeCount ||
      s.isCollapsed ||
      !this.shadowRoot.contains(s.anchorNode)
    ) {
      bar.hidden = true;
      return;
    }
    const r = s.getRangeAt(0).getBoundingClientRect();
    bar.hidden = false;
    bar.style.left = Math.max(8, Math.min(innerWidth - 280, r.left)) + "px";
    bar.style.top = Math.max(4, r.top - 48) + "px";
  }
  download(data, name, mime) {
    const u = URL.createObjectURL(new Blob([data], { type: mime })),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
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
    const client = createApi(this.getAttribute("api-base") || "");
    const data = await this.blobData(
      await client.blob(client.photoPath(p.id), this.controller.signal),
    );
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
      a.innerHTML = `<div class="photo-grid">${d.photos.map((p) => `<div class="photo-card"><button class="photo-select" data-photo="${esc(p.id)}" data-action="edit" aria-label="사진 편집해서 넣기"><img src="${esc(p.urls.small)}" alt="${esc(p.alt_description || "검색 사진")}"></button><a href="${esc(p.user.links.html)}?utm_source=article_workspace&utm_medium=referral" target="_blank" rel="noopener">${esc(p.user.name)} / Unsplash</a><div class="row"><button data-photo="${esc(p.id)}" data-action="insert">본문에 넣기</button><button data-photo="${esc(p.id)}" data-action="edit">편집해서 넣기</button><button data-photo="${esc(p.id)}" data-action="download">다운로드</button></div></div>`).join("")}</div>${d.photos.length ? "" : '<div class="empty">다른 검색어로 찾아보세요.</div>'}`;
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
    for (const f of files) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
        f.size > 15 * 1024 * 1024
      ) {
        this.notice("JPG, PNG, WebP 사진을 15MB 이하로 선택해 주세요.");
        continue;
      }
      const data = await this.blobData(f);
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
  figure(p) {
    const f = document.createElement("figure");
    f.dataset.photoId = p.id;
    f.dataset.instanceId = crypto.randomUUID();
    f.draggable = true;
    f.contentEditable = "false";
    f.innerHTML = `<img src="${p.data}" alt="${esc(p.caption || p.alt)}"><figcaption>${esc(p.caption)}${p.source ? " ⓒ " + esc(p.source) : ""}</figcaption>`;
    this.decorate(f);
    return f;
  }
  decorate(f) {
    f.dataset.instanceId ||= crypto.randomUUID();
    f.draggable = true;
    f.contentEditable = "false";
    f.querySelector(".photo-actions")?.remove();
    const a = document.createElement("div");
    a.className = "photo-actions row";
    a.hidden = true;
    const icon = (action, label, path, extra = "") =>
      `<button class="body-icon" data-photo-action="${action}" aria-label="${label}" title="${label}" data-tip="${label}" ${extra}><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg></button>`;
    a.innerHTML =
      icon("edit", "편집", '<path d="m4 16 12-12 4 4-12 12-5 1zM14 6l4 4"/>') +
      '<div class="photo-replace-wrap">' +
      icon(
        "replace",
        "교체하기",
        '<path d="M4 8h15l-4-4M20 16H5l4 4M20 8v3M4 16v-3"/>',
        'aria-expanded="false"',
      ) +
      '<div class="photo-replace-menu" data-replace-menu hidden><button data-photo-action="replace-search">사진 검색하기</button><button data-photo-action="replace-upload">사진 첨부하기</button></div></div>' +
      icon(
        "caption",
        "설명 넣기",
        '<path d="M4 4h16v13H9l-5 4zM8 8h8M8 12h5"/>',
      ) +
      icon(
        "delete",
        "삭제하기",
        '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
      );
    f.append(a);
  }
  rememberPosition() {
    const sel = this.getSelection(),
      b = this.q("[data-body]");
    if (!sel?.rangeCount || !b?.contains(sel.anchorNode)) {
      this.insertIndex = null;
      return;
    }
    let n = sel.anchorNode;
    while (n.parentNode !== b && n.parentNode) n = n.parentNode;
    this.insertIndex = [...b.children].indexOf(n) + 1;
  }
  insert(p, replaceId) {
    this.mode = "edit";
    this.render();
    const b = this.q("[data-body]"),
      old =
        replaceId &&
        b.querySelector(`figure[data-instance-id="${CSS.escape(replaceId)}"]`);
    if (old) old.replaceWith(this.figure(p));
    else {
      b.insertBefore(this.figure(p), b.firstChild);
      this.insertIndex = null;
      const para = document.createElement("p");
      para.innerHTML = "<br>";
      b.append(para);
    }
    this.changed();
  }
  async editImage(photo, replaceId) {
    this.capture();
    this.closeSuggestions();
    this.q("[data-overlay]").replaceChildren();
    this.mode = "image";
    this.render();
    this.q("[data-preview]").hidden = true;
    this.q("[data-main]").innerHTML =
      `<div class="image-view"><div class="row"><button data-cancel>작성으로 돌아가기</button><h2>사진 편집</h2></div><div class="image-layout"><div class="canvas-stage"><canvas class="crop-canvas" data-canvas tabindex="0" aria-label="사진 표시 범위. 모서리를 끌어 크기를 바꿀 수 있습니다."></canvas></div><div class="image-controls"><label>표시 비율</label><div class="ratios">${[
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
        )}</div><label>모자이크</label><div class="mosaic-tools"><button data-mosaic-add aria-pressed="false">모자이크</button><button data-mosaic-erase aria-pressed="false">지우개</button><button data-mask-delete disabled>되돌리기</button></div><p class="muted" data-mosaic-hint>모자이크를 켜고 가릴 부분을 칠해주세요.</p><label class="brush-size">브러시 크기 <input data-brush-size type="range" min="12" max="120" value="48" aria-label="브러시 크기"><output data-brush-value>48</output></label><label class="brush-size">투명도 <input data-mosaic-opacity type="range" min="0" max="100" value="${Math.round((1 - (photo.mosaicOpacity ?? 1)) * 100)}" aria-label="모자이크 투명도"><output data-opacity-value>${Math.round((1 - (photo.mosaicOpacity ?? 1)) * 100)}%</output></label><label class="brush-size">경계 선명도 <input data-mosaic-hardness type="range" min="0" max="100" value="${photo.mosaicHardness ?? 20}" aria-label="모자이크 경계 선명도"><output data-hardness-value>${photo.mosaicHardness ?? 20}%</output></label><label>사진 설명</label><textarea data-cap rows="3">${esc(photo.caption)}</textarea><label>사진 출처</label><input data-source value="${esc(photo.source)}"><div class="image-save-actions"><button data-original-download>원본 다운로드</button><button data-image-download>편집본 다운로드</button><button data-image-apply class="primary">본문에 넣기</button></div></div></div></div>`;
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
    if (this.mode !== "image") return;
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
  caption(p) {
    this.drawer(
      "사진 설명",
      `<img class="caption-photo" src="${esc(p.data)}" alt="선택한 사진"><div class="caption-form"><label>사진 설명</label><textarea data-description rows="4">${esc(p.caption)}</textarea><label>사진 출처</label><input data-credit value="${esc(p.source)}"><button class="primary" data-caption-save>적용</button></div>`,
    );
    this.q("[data-caption-save]").onclick = () => {
      p.caption = this.q("[data-description]").value;
      p.source = this.q("[data-credit]").value;
      this.q("[data-body]")
        .querySelectorAll(`figure[data-photo-id="${CSS.escape(p.id)}"]`)
        .forEach((f) => f.replaceWith(this.figure(p)));
      this.closeModal();
      this.changed();
    };
  }
  async flow() {
    this.capture();
    this.modal(
      "[data-flow]",
      "요약 보기",
      '<div class="row"><button data-flow-refresh>새로고침</button></div><div data-flow-result role="status"></div>',
      "summary-modal flow-panel",
    );
    this.q("[data-flow-refresh]").onclick = () => this.refreshFlow();
    this.refreshFlow();
  }
  async refreshFlow() {
    this.capture();
    const a = this.q("[data-flow-result]");
    a.textContent = "요약을 준비 중입니다.";
    try {
      const d = await this.api("/api/assist", {
        kind: "flow",
        body: plain(this.state.bodyHtml),
      });
      if (a.isConnected)
        a.innerHTML =
          "<ol>" +
          d.paragraphs
            .map((v) => "<li>" + esc(v.replace(/^\s*\d+[.)]\s*/, "")) + "</li>")
            .join("") +
          "</ol>";
    } catch (e) {
      if (a.isConnected) a.textContent = e.message;
    }
  }
}
customElements.define("article-workspace", ArticleWorkspace);
