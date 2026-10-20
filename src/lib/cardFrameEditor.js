// 카드 미리보기 iframe 안에서 도는 직접 편집 스크립트(함수를 문자열로 바꿔 srcDoc 에 넣는다 — 바깥 변수를 쓰지 않는다).
//  - 글 영역을 눌러 바로 고치고(Backspace/Delete·붙여넣기·한국어 입력 포함), 선택한 영역 위에 "↔ 이동" 손잡이를 띄워 끌어서 옮긴다.
//  - 고친 글·위치는 부모(React)로 postMessage 한다. iframe 은 다시 만들지 않으므로 입력 중 커서·IME 조합이 유지된다.
//  - 손잡이와 점선 테두리는 이 미리보기에만 있고, JPG 는 편집 표시가 없는 markup 으로 따로 만든다.
export function cardFrameEditor(frameId, fitCard) {
  const card = document.querySelector(".news-card");
  if (!card) return;
  const post = (message) => parent.postMessage({ ...message, frameId }, "*");
  const style = document.createElement("style");
  style.textContent = "[data-field]{cursor:text}[data-field]:empty{min-height:1.2em;outline:1px dashed rgba(255,255,255,.3);outline-offset:3px}"
    + "[data-field].position-selected{outline:2px dashed #d1f38a;outline-offset:3px}[data-field].layout-problem{outline:2px solid #e55858;outline-offset:3px}"
    + ".text-move-handle{position:absolute;z-index:20;background:#d1f38a;color:#101010;border:0;border-radius:8px;padding:8px 14px;font-size:24px;line-height:1.2;cursor:move;touch-action:none;user-select:none}";
  document.head.append(style);
  // 중첩 강조 태그가 있어도 편집 대상 전체의 글을 읽는다
  const read = (el) => {
    if (el.textContent === "") return ""; // 모두 지우면 브라우저가 남기는 빈 줄(<br>)은 빈 글로 본다
    if (typeof el.innerText === "string") return el.innerText.replace(/\r\n/g, "\n");
    const lines = [...el.querySelectorAll(".card-line")];
    return lines.length ? lines.map((line) => line.textContent).join("\n") : el.textContent;
  };
  const measure = () => post({ type: "card-fit", fit: fitCard(card) });
  let timer = 0;
  const measureLater = () => { clearTimeout(timer); timer = setTimeout(measure, 120); };
  let selected = null, handle = null, drag = null, edited = false;
  const clear = () => { if (selected) selected.classList.remove("position-selected"); if (handle) handle.remove(); selected = handle = null; };
  const placeHandle = () => {
    if (!selected || !selected.isConnected || !handle) { clear(); return; }
    const a = card.getBoundingClientRect(), b = selected.getBoundingClientRect(), ratio = a.width / 1080 || 1;
    handle.style.left = Math.max(0, Math.min(1080 - handle.offsetWidth, (b.left - a.left) / ratio)) + "px";
    handle.style.top = Math.max(0, Math.min(1350 - handle.offsetHeight, (b.top - a.top) / ratio - handle.offsetHeight - 8)) + "px";
  };
  const positionOf = (el) => {
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform || "");
    return { x: m ? Number(m[1]) : 0, y: m ? Number(m[2]) : 0 };
  };
  function start(event) {
    if (event.button !== 0 || !selected || !selected.isConnected) return;
    event.preventDefault(); event.stopPropagation();
    const a = card.getBoundingClientRect(), b = selected.getBoundingClientRect(), ratio = a.width / 1080 || 1, p = positionOf(selected);
    drag = { field: selected.dataset.field, p, clientX: event.clientX, clientY: event.clientY, ratio, x: p.x, y: p.y,
      baseX: (b.left - a.left) / ratio - p.x, baseY: (b.top - a.top) / ratio - p.y, width: b.width / ratio, height: b.height / ratio, pointer: event.pointerId };
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end); handle.addEventListener("lostpointercapture", end);
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const clamp = (n, min, max) => Math.max(min, Math.min(Math.max(min, max), n));
    // 카드 바깥으로 나가지 않게 1080×1350 좌표에서 제한한다. 화면 배율(ratio)을 반영한다.
    drag.x = clamp(drag.p.x + (event.clientX - drag.clientX) / drag.ratio, -drag.baseX, 1080 - drag.width - drag.baseX);
    drag.y = clamp(drag.p.y + (event.clientY - drag.clientY) / drag.ratio, -drag.baseY, 1350 - drag.height - drag.baseY);
    selected.style.transform = "translate(" + drag.x + "px," + drag.y + "px)";
    placeHandle(); measureLater();
  }
  function end() {
    if (!drag) return;
    const done = drag; drag = null;
    if (handle) { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); handle.removeEventListener("lostpointercapture", end); }
    if (done.x !== done.p.x || done.y !== done.p.y) post({ type: "card-move", field: done.field, x: Math.round(done.x * 10) / 10, y: Math.round(done.y * 10) / 10 });
    placeHandle();
  }
  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".text-move-handle")) return;
    const field = event.target.closest("[data-field][contenteditable=true]");
    if (!field) { clear(); return; }
    if (field === selected) return;
    clear(); selected = field; field.classList.add("position-selected");
    handle = document.createElement("button");
    handle.type = "button"; handle.tabIndex = -1; handle.className = "text-move-handle"; handle.textContent = "↔ 이동";
    handle.setAttribute("aria-label", field.getAttribute("aria-label") + " 이동");
    card.append(handle); placeHandle();
    handle.addEventListener("pointerdown", start);
  }, true);
  const changed = (el) => { edited = true; post({ type: "card-edit", field: el.dataset.field, text: read(el) }); placeHandle(); measureLater(); };
  document.addEventListener("input", (event) => {
    const el = event.target.closest && event.target.closest("[data-field]");
    if (el) changed(el);
  });
  // 붙여넣기는 서식 없는 글로 넣는다
  document.addEventListener("paste", (event) => {
    const el = event.target.closest && event.target.closest("[data-field]");
    if (!el) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain"), selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node); range.setStartAfter(node); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    changed(el);
  });
  // 편집이 끝나면 새 강조·배치를 다시 그리도록 부모에 알린다(입력 중에는 다시 그리지 않아 커서가 유지된다)
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (edited && !(active && active.closest && (active.closest("[data-field]") || active.closest(".text-move-handle")))) { edited = false; post({ type: "card-commit" }); }
    }, 0);
  });
  // 손잡이를 끌다가 미리보기 밖에서 마우스를 놓으면 iframe 이 pointerup 을 못 받을 수 있어 부모가 알려 준다
  window.addEventListener("message", (event) => { if (event.data && event.data.type === "card-pointer-up") end(); });
  window.addEventListener("resize", () => { if (selected) placeHandle(); });
  measure();
}
