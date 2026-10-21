// 사진 검색하기 — v30(assets/article-workspace.js mediaTab("search")·searchPhotos)의 흐름:
// 본문을 참고한 검색어 추천 → 검색어를 고르면 Unsplash 사진 3장 → 사진마다 '본문에 넣기 / 편집해서 넣기 / 다운로드',
// 이전·다음으로 같은 검색어의 다른 사진, 사진가와 Unsplash 출처 표시. 화면 가운데 팝업, Esc·바깥 클릭으로 닫힌다.
// 10-12: 검색창 아래에서 사진 출처를 고른다 — Unsplash | 동아일보 DB(동아디지털아카이브 포토파노라마, 전체/최신순/오래된순·검색어).
// 출처를 바꾸면 검색칸·결과를 비운다(Unsplash 에서 쓴 검색어가 동아일보 DB 로 넘어가지 않게). 3장씩, 나머지는 이전·다음.
// 동아일보 DB 사진도 Unsplash 와 똑같이 '본문에 넣기 / 편집해서 넣기 / 다운로드'로 가져온다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, X } from "lucide-react";
import { photoKeywords, photoSearchQuery, searchDongaPhotos, searchPhotos } from "../../api/editorial";

const DONGA_SOURCE = "https://www.donga.com/archive/newslibrary/list?m=photo";
const SORTS = [["all", "전체"], ["latest", "최신순"], ["oldest", "오래된순"]];

const UTM = "?utm_source=article_workspace&utm_medium=referral";
const btn = "px-2.5 py-1 rounded-full text-[11px] font-bold border border-[#DDD6CB] bg-white hover:bg-[#F5F2ED] text-[#23211F] cursor-pointer disabled:opacity-50";

// 팝업 위치: 누른 버튼(anchor) 옆에 붙이고, 버튼 중심에서 번져 나오듯 열린다(index.css 의 photo-popover-in).
function popoverPlace(anchor) {
  const vw = window.innerWidth, vh = window.innerHeight, width = Math.min(620, vw - 32);
  if (!anchor) return { left: (vw - width) / 2, top: 24, width, maxHeight: vh - 48, ox: width / 2, oy: 24 };
  // 정보 배치 팝업과 같이 버튼 오른쪽 12px 옆에 왼쪽을 고정하고 오른쪽으로 퍼진다(왼쪽으로 뒤집지 않는다). 자리가 모자라면 너비만 줄인다(최소 260px).
  const left = anchor.right + 12, w = Math.min(width, Math.max(260, vw - 16 - left));
  const top = Math.max(16, Math.min(anchor.top - 8, vh - 340)); // 정보 배치 팝업과 같은 위치 규칙
  return { left, top, width: w, maxHeight: vh - top - 16, ox: anchor.left + anchor.width / 2 - left, oy: anchor.top + anchor.height / 2 - top };
}

export default function PhotoSearch({ body, card, onClose, onChoose, onUpload, anchor }) {
  const place = popoverPlace(anchor);
  const [query, setQuery] = useState("");
  const [keywords, setKeywords] = useState({ busy: false, list: [], error: "" });
  const [result, setResult] = useState({ busy: false, data: null, error: "", query: "", page: 1, searched: "" });
  const [working, setWorking] = useState("");
  const [source, setSource] = useState("unsplash"); // unsplash | donga | pc
  const [sort, setSort] = useState("all"); // 동아일보 DB 정렬
  const [dragging, setDragging] = useState(false);
  const token = useRef(0);
  const cache = useRef(new Map());

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!card && (body || "").trim().length < 80) return;
    let cancelled = false;
    setKeywords({ busy: true, list: [], error: "" });
    photoKeywords(body, card)
      .then((list) => { if (!cancelled) setKeywords({ busy: false, list, error: "" }); })
      .catch((e) => { if (!cancelled) setKeywords({ busy: false, list: [], error: e.message }); });
    return () => { cancelled = true; };
  }, []);

  const search = async (q, page = 1, from = source, order = sort) => {
    q = (q || "").trim();
    if (from === "donga") return searchDonga(q, page, order);
    if (!q) return;
    setQuery(q);
    const id = ++token.current, key = JSON.stringify([q, page]);
    setResult({ busy: true, data: null, error: "", query: q, page, searched: "" });
    try {
      const searched = cache.current.get("q:" + q) || (await photoSearchQuery(q));
      cache.current.set("q:" + q, searched);
      const data = cache.current.get(key) || (await searchPhotos(searched, page));
      cache.current.set(key, data);
      if (token.current === id) setResult({ busy: false, data, error: "", query: q, page, searched });
    } catch (e) {
      if (token.current === id) setResult({ busy: false, data: null, error: e.message, query: q, page, searched: "" });
    }
  };

  const searchDonga = async (q, page = 1, order = sort) => {
    setQuery(q);
    const id = ++token.current, key = JSON.stringify(["donga", q, order, page]);
    setResult({ busy: true, data: null, error: "", query: q, page, searched: "" });
    try {
      const data = cache.current.get(key) || (await searchDongaPhotos(q, order, page));
      cache.current.set(key, data);
      if (token.current === id) setResult({ busy: false, data, error: "", query: q, page: data.page, searched: "" });
    } catch (e) {
      if (token.current === id) setResult({ busy: false, data: null, error: e.message, query: q, page, searched: "" });
    }
  };

  const chooseSource = (next) => {
    if (next === source) return;
    setSource(next);
    setQuery("");
    ++token.current;
    setResult({ busy: false, data: null, error: "", query: "", page: 1, searched: "" });
    if (next === "donga") searchDonga("", 1, sort);
  };

  const chooseSort = (order) => {
    setSort(order);
    searchDonga(query, 1, order);
  };

  const choose = async (photo, action = "insert") => {
    setWorking(photo.id + action);
    try {
      await onChoose(source === "donga" ? { ...photo, provider: "donga" } : photo, action);
    } finally {
      setWorking("");
    }
  };

  const handleFileUpload = (file) => {
    if (!file) return;
    if (onUpload) {
      onUpload(file);
    }
  };

  const photos = result.data?.photos || [];
  const totalPages = result.data?.totalPages ?? result.page;

  return createPortal(
    <div className="fixed inset-0 z-50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="사진 검색하기" data-testid="photo-search"
        style={{ left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight, transformOrigin: "left center" }}
        className="photo-popover minimal-scroll fixed overflow-auto bg-white rounded-2xl border border-[#DDD6CB] shadow-[0_24px_60px_-12px_rgba(15,23,42,0.35)] p-3 space-y-3">
        <div className="flex items-center justify-between border-b border-[#F0EFEA] pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-slate-700" strokeWidth={1.6} aria-hidden="true" />
            <h2 className="text-base font-black text-slate-900">이미지 교체 및 사진 선택</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded-full hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        {/* 탭: Unsplash / 동아일보 DB / PC에서 불러오기 */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="사진 출처" data-testid="photo-source">
          {[["unsplash", "Unsplash"], ["donga", "동아일보 DB"], ["pc", "PC에서 불러오기"]].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={source === key} onClick={() => chooseSource(key)} data-testid={`photo-source-${key}`}
              className={`px-4 py-1.5 rounded-full text-xs font-black border transition cursor-pointer ${source === key ? "bg-[#23211F] text-white border-[#23211F] shadow-sm" : "bg-white text-[#23211F] border-[#DDD6CB] hover:bg-[#F5F2ED]"}`}>
              {label}
            </button>
          ))}
        </div>

        {source === "pc" ? (
          <div
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer?.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className={`my-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${dragging ? "border-slate-900 bg-slate-100 ring-2 ring-slate-300" : "border-[#DDD6CB] bg-[#FAF8F5]"}`}
          >
            <div className="text-4xl mb-3">📁</div>
            <p className="text-sm font-bold text-slate-800">컴퓨터에서 사진을 선택하거나 이 영역으로 끌어놓으세요</p>
            <p className="mt-1 text-xs text-slate-500">JPEG · PNG · WebP 파일 (15MB 이하 지원)</p>
            <label className="mt-5 inline-flex items-center justify-center px-5 py-2.5 rounded-full text-xs font-black bg-[#23211F] text-white hover:bg-black cursor-pointer shadow-sm active:scale-95 transition">
              PC에서 사진 선택
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleFileUpload(file);
                }}
              />
            </label>
          </div>
        ) : (
          <>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(query); }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="어떤 사진을 찾을까요?" aria-label="사진 검색어"
                className="flex-1 rounded-full border border-[#DDD6CB] px-4 py-2 text-sm outline-none focus:border-slate-800" />
              <button type="submit" className="px-5 py-2 rounded-full text-sm font-black bg-[#23211F] text-white cursor-pointer hover:bg-black transition">검색</button>
            </form>

            {source === "donga" && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="정렬" data-testid="donga-sorts">
                {SORTS.map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={sort === key} onClick={() => chooseSort(key)} className={`${btn} ${sort === key ? "!bg-[#23211F] !text-white" : ""}`}>{label}</button>
                ))}
              </div>
            )}

            <div className={`flex flex-wrap gap-1.5 min-h-[1.5rem] text-xs text-slate-500 ${source === "donga" ? "hidden" : ""}`} data-testid="photo-keywords">
              {keywords.busy && <span>검색어를 추천 중입니다.</span>}
              {keywords.error && <span className="text-rose-600">{keywords.error}</span>}
              {keywords.list.map((k) => (
                <button key={k} type="button" onClick={() => search(k)} className={btn}>{k}</button>
              ))}
            </div>

            {result.searched && result.searched !== result.query && (
              <div className="text-xs text-slate-500" data-testid="photo-searched">‘{result.query}’ → ‘{result.searched}’(으)로 찾았습니다.</div>
            )}
            {result.busy && <div className="py-10 text-center text-sm text-slate-500">사진을 찾고 있습니다.</div>}
            {result.error && <div className="py-10 text-center text-sm text-rose-600">{result.error}</div>}
            {result.data && !photos.length && <div className="py-10 text-center text-sm text-slate-500">다른 검색어로 찾아보세요.</div>}

            {source === "donga" && !!photos.length && (
              <div className="grid grid-cols-3 gap-3">
                {photos.map((p) => (
                  <div key={p.id} className="group relative space-y-1.5 rounded-xl border border-slate-200 p-2 hover:border-slate-400 transition" data-testid="photo-card">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg">
                      <img src={p.thumb || p.image} alt={p.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                      <button
                        type="button"
                        onClick={() => choose(p, "insert")}
                        disabled={!!working}
                        title="카드뉴스에 바로 넣기"
                        aria-label="카드뉴스에 바로 넣기"
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-base font-black text-white shadow-md backdrop-blur-sm transition hover:scale-110 hover:bg-black active:scale-95 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-[11px] leading-snug">
                      <b className="block text-slate-800 truncate" title={p.title}>{p.title}</b>
                      <span className="text-slate-500">{p.date} · 동아일보 DB</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <button type="button" disabled={!!working} onClick={() => choose(p, "insert")} className={`${btn} !bg-[#23211F] !text-white hover:!bg-black font-black flex items-center gap-1`}>
                        {working === p.id + "insert" ? "넣는 중…" : "+ 카드에 넣기"}
                      </button>
                      <button type="button" disabled={!!working} onClick={() => choose(p, "download")} className={btn}>다운로드</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {source === "unsplash" && !!photos.length && (
              <div className="grid grid-cols-3 gap-3">
                {photos.map((p) => (
                  <div key={p.id} className="group relative space-y-1.5 rounded-xl border border-slate-200 p-2 hover:border-slate-400 transition" data-testid="photo-card">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg">
                      <img src={p.urls?.small} alt={p.alt_description || "검색 사진"} className="h-full w-full object-cover transition group-hover:scale-105" />
                      <button
                        type="button"
                        onClick={() => choose(p, "insert")}
                        disabled={!!working}
                        title="카드뉴스에 바로 넣기"
                        aria-label="카드뉴스에 바로 넣기"
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-base font-black text-white shadow-md backdrop-blur-sm transition hover:scale-110 hover:bg-black active:scale-95 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                    <a href={(p.user?.links?.html || "https://unsplash.com") + UTM} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-slate-500 truncate hover:underline">
                      © {p.user?.name || "Unsplash"} / Unsplash
                    </a>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <button type="button" disabled={!!working} onClick={() => choose(p, "insert")} className={`${btn} !bg-[#23211F] !text-white hover:!bg-black font-black flex items-center gap-1`}>
                        {working === p.id + "insert" ? "넣는 중…" : "+ 카드에 넣기"}
                      </button>
                      <button type="button" disabled={!!working} onClick={() => choose(p, "download")} className={btn}>다운로드</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!!photos.length && (
              <nav className="flex items-center justify-center gap-3 text-xs font-bold text-slate-600" aria-label="사진 검색 결과 탐색">
                <button type="button" className={btn} disabled={result.page <= 1} onClick={() => search(result.query, result.page - 1)} aria-label="이전 사진">‹ 이전</button>
                <span aria-live="polite">{result.page.toLocaleString("ko-KR")} / {Number(totalPages).toLocaleString("ko-KR")}</span>
                <button type="button" className={btn} disabled={result.page >= totalPages} onClick={() => search(result.query, result.page + 1)} aria-label="다음 사진">다음 ›</button>
              </nav>
            )}
            {source === "donga" && result.data && (
              <p className="text-[11px] text-slate-500">{result.data.total.toLocaleString("ko-KR")}장 · 사진 제공 <a href={DONGA_SOURCE} target="_blank" rel="noopener noreferrer" className="underline">동아일보 DB(동아디지털아카이브 포토파노라마)</a></p>
            )}
            {source === "unsplash" && (
              <p className="text-[11px] text-slate-500">사진 제공 <a href={"https://unsplash.com/" + UTM} target="_blank" rel="noopener noreferrer" className="underline">Unsplash</a></p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
