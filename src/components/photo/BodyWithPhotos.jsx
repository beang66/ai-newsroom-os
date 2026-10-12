// 본문 = 글 블록 + 사진 블록. 원고(content)는 그대로 한 줄 글자이고, 사진 자리 줄([사진:id])을 실제 사진으로 보여 준다.
// v30(assets/article-workspace.js renderEditor·decorate·onpointerdown) 의 본문 사진 동작을 옮겼다.
//  - 사진에 상시 테두리 없음. 사진을 누르면 도구 아이콘(편집·교체하기·설명 넣기·삭제하기), 마우스를 올리거나 포커스하면 이름 표시.
//    도구 밖 클릭·Esc 로 닫힘. '교체하기'는 바로 아래에 '사진 검색하기 / 사진 첨부하기' 메뉴.
//  - 사진을 잡아 끌면 얇은 청록색 선으로 넣을 자리를 보여 주고(본문 첫 줄 위, 문단·줄바꿈 사이), 위·아래 가장자리에서 자동 스크롤.
// 글 블록은 팀 앱의 팩트체크 하이라이트 입력칸(renderText)을 그대로 쓴다.
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText, Pencil, Repeat, Trash2 } from "lucide-react";
import { captionText, photoOfLine } from "../../lib/photoMarks.js";

/** content → 블록 [{type:"text", from, to, text} | {type:"photo", line, photo}] (from·to·line 은 줄 번호) */
function toBlocks(content, photos) {
  const lines = content.split("\n");
  const blocks = [];
  let from = 0;
  const flush = (to) => {
    if (to > from) blocks.push({ type: "text", from, to, text: lines.slice(from, to).join("\n") });
  };
  lines.forEach((line, i) => {
    const photo = photoOfLine(line, photos);
    if (photo) {
      flush(i);
      blocks.push({ type: "photo", line: i, photo });
      from = i + 1;
    }
  });
  flush(lines.length);
  // 마지막이 사진이면 그 아래에 글을 쓸 수 있도록 빈 글 블록을 둔다(입력하면 원고 끝에 줄이 붙는다)
  if (!blocks.length || blocks[blocks.length - 1].type === "photo") blocks.push({ type: "text", from: lines.length, to: lines.length, text: "", virtual: true });
  return { lines, blocks };
}

// 하이라이트 층(글자와 같은 줄바꿈) 안에서 index 번째 글자의 위치
function charRect(layer, index) {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (index < seen + n.length) {
      const range = document.createRange();
      range.setStart(n, index - seen);
      range.setEnd(n, index - seen + 1);
      return range.getClientRects()[0] || range.getBoundingClientRect();
    }
    seen += n.length;
  }
  return null;
}

function scrollParent(node) {
  for (let n = node?.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}

function Tool({ label, onClick, children, expanded }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} aria-expanded={expanded}
      className="group relative p-1.5 rounded-full text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 outline-none cursor-pointer">
      {children}
      <span role="tooltip" className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-bold whitespace-nowrap hidden group-hover:block group-focus-visible:block">
        {label}
      </span>
    </button>
  );
}

export default function BodyWithPhotos({ content, photos, onChange, renderText, onEdit, onReplace, onCaption, onDelete }) {
  const { lines, blocks } = useMemo(() => toBlocks(content || "", photos || []), [content, photos]);
  const box = useRef(null);
  const [selected, setSelected] = useState(null); // 도구를 연 사진의 줄 번호
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [dragLine, setDragLine] = useState(null);
  const [guideY, setGuideY] = useState(null);
  const moved = useRef(false);

  // 도구 밖 클릭·Esc 로 닫기
  useEffect(() => {
    if (selected === null) return undefined;
    const close = () => { setSelected(null); setReplaceOpen(false); };
    const onDown = (e) => { if (!e.target.closest?.("[data-photo-tools],[data-photo-img]")) close(); };
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [selected]);

  const offsetOf = (line) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);

  const setText = (block, text) => {
    const next = [...lines.slice(0, block.from), ...(block.virtual && !text ? [] : text.split("\n")), ...lines.slice(block.to)];
    onChange(next.join("\n"));
  };

  // 줄 경계 b(그 줄 앞) 의 화면 y 좌표 — 사진 줄이면 사진 위, 글 줄이면 그 줄 첫 글자 위, 끝이면 마지막 블록 아래
  const boundaryY = (b) => {
    const root = box.current;
    if (!root) return null;
    if (b >= lines.length) return root.getBoundingClientRect().bottom;
    const fig = root.querySelector(`[data-line="${b}"]`);
    if (fig) return fig.getBoundingClientRect().top;
    const block = blocks.find((x) => x.type === "text" && b >= x.from && b < x.to);
    const layer = block && root.querySelector(`[data-block-from="${block.from}"] [data-testid="fact-highlight"]`);
    if (!layer) return null;
    const index = lines.slice(block.from, b).reduce((n, l) => n + l.length + 1, 0);
    return charRect(layer, index)?.top ?? null;
  };

  const startDrag = (e, line) => {
    if (e.button !== 0) return;
    e.preventDefault();
    moved.current = false;
    const img = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    let point = start, ghost = null, frame = 0, last = performance.now(), target = null;
    const scroller = scrollParent(box.current);
    const choose = () => {
      let best = null;
      for (let b = 0; b <= lines.length; b++) {
        const y = boundaryY(b);
        if (y !== null && (!best || Math.abs(y - point.y) < Math.abs(best.y - point.y))) best = { b, y };
      }
      target = best;
      if (best) setGuideY(best.y - box.current.getBoundingClientRect().top);
    };
    const tick = (now) => {
      const dt = Math.min(32, now - last);
      last = now;
      ghost.style.transform = `translate3d(${point.x + 14}px,${point.y + 14}px,0)`;
      // 위·아래 가장자리 80px 안에서는 그 방향으로 자동 스크롤
      const rect = scroller?.getBoundingClientRect();
      const top = rect?.top ?? 0, bottom = rect?.bottom ?? innerHeight, edge = 80;
      const speed = point.y < top + edge ? -Math.min(1, (top + edge - point.y) / edge)
        : point.y > bottom - edge ? Math.min(1, (point.y - bottom + edge) / edge) : 0;
      if (speed && scroller) scroller.scrollTop += speed * dt * 0.7;
      else if (speed) window.scrollBy(0, speed * dt * 0.7);
      choose();
      frame = requestAnimationFrame(tick);
    };
    const userSelect = document.body.style.userSelect;
    const ac = new AbortController();
    const clean = () => {
      cancelAnimationFrame(frame);
      ghost?.remove();
      document.body.style.userSelect = userSelect;
      setDragLine(null);
      setGuideY(null);
      ac.abort();
    };
    document.addEventListener("pointermove", (v) => {
      point = { x: v.clientX, y: v.clientY };
      if (!moved.current && Math.hypot(point.x - start.x, point.y - start.y) > 6) {
        moved.current = true;
        document.body.style.userSelect = "none";
        setSelected(null);
        setReplaceOpen(false);
        setDragLine(line);
        ghost = document.createElement("img");
        ghost.src = img.src;
        ghost.alt = "";
        ghost.style.cssText = "position:fixed;left:0;top:0;width:160px;opacity:.75;pointer-events:none;z-index:9999;border-radius:6px;box-shadow:0 8px 24px #0004";
        document.body.append(ghost);
        frame = requestAnimationFrame(tick);
      }
      if (moved.current) v.preventDefault();
    }, { signal: ac.signal });
    document.addEventListener("pointerup", () => {
      if (moved.current) {
        choose();
        const to = target?.b;
        if (to !== undefined && to !== line && to !== line + 1) {
          const next = [...lines];
          const [mark] = next.splice(line, 1);
          next.splice(to > line ? to - 1 : to, 0, mark);
          onChange(next.join("\n")); // 원고가 바뀌면 자동 저장된다
        }
      }
      clean();
    }, { once: true, signal: ac.signal });
    document.addEventListener("pointercancel", clean, { once: true, signal: ac.signal });
  };

  const textBlocks = blocks.filter((b) => b.type === "text");
  return (
    // 본문 상자는 하나 — 글과 사진이 모두 이 안에 들어가고, 사진을 옮겨도 상자가 나뉘지 않는다
    <div ref={box} data-testid="body-with-photos"
      className="relative p-5 rounded-2xl border border-slate-200 bg-slate-50/70 shadow-2xs transition-all focus-within:bg-white focus-within:border-slate-800">
      {blocks.map((block) => block.type === "text" ? (
        <div key={`t${block.from}`} data-block-from={block.from}>
          {renderText({
            value: block.text,
            onChange: (text) => setText(block, text),
            offset: offsetOf(block.from),
            tall: textBlocks.length === 1,
            placeholder: block === textBlocks[0] ? undefined : "",
          })}
        </div>
      ) : (
        <figure key={`p${block.line}`} data-line={block.line} className={`relative my-4 ${dragLine === block.line ? "opacity-40" : ""}`}>
          <img src={block.photo.url} alt={block.photo.caption || block.photo.alt || "본문 사진"} data-photo-img draggable={false}
            onPointerDown={(e) => startDrag(e, block.line)}
            onClick={() => {
              if (moved.current) return void (moved.current = false);
              setReplaceOpen(false);
              setSelected((s) => (s === block.line ? null : block.line));
            }}
            className="block w-full h-auto cursor-pointer select-none" />
          <figcaption className="mt-2 text-[13px] leading-snug text-slate-500">{captionText(block.photo)}</figcaption>
          {selected === block.line && (
            <div data-photo-tools className="absolute top-2 right-2 flex items-center gap-0.5 bg-white/95 rounded-full shadow-md border border-[#DDD6CB] p-1">
              <Tool label="편집" onClick={() => { setSelected(null); onEdit(block.line, block.photo); }}><Pencil className="w-4 h-4" /></Tool>
              <div className="relative">
                <Tool label="교체하기" expanded={replaceOpen} onClick={() => setReplaceOpen((o) => !o)}><Repeat className="w-4 h-4" /></Tool>
                {replaceOpen && (
                  <div role="menu" className="absolute left-0 top-full mt-1 z-10 w-36 bg-white rounded-xl shadow-lg border border-[#DDD6CB] py-1 text-xs font-bold">
                    {[["search", "사진 검색하기"], ["upload", "사진 첨부하기"]].map(([how, label]) => (
                      <button key={how} type="button" role="menuitem" className="block w-full text-left px-3 py-1.5 hover:bg-slate-100 cursor-pointer"
                        onClick={() => { setSelected(null); setReplaceOpen(false); onReplace(block.line, block.photo, how); }}>{label}</button>
                    ))}
                  </div>
                )}
              </div>
              <Tool label="설명 넣기" onClick={() => { setSelected(null); onCaption(block.line, block.photo); }}><MessageSquareText className="w-4 h-4" /></Tool>
              <Tool label="삭제하기" onClick={() => { setSelected(null); onDelete(block.line); }}><Trash2 className="w-4 h-4" /></Tool>
            </div>
          )}
        </figure>
      ))}
      {guideY !== null && <div aria-hidden="true" className="absolute left-0 right-0 h-0.5 bg-teal-500 pointer-events-none z-20" style={{ top: guideY - 1 }} data-testid="drop-guide" />}
    </div>
  );
}
