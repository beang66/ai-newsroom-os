// 사진 검색하기 — v30(assets/article-workspace.js mediaTab("search")·searchPhotos)의 흐름:
// 본문을 참고한 검색어 추천 → 검색어를 고르면 Unsplash 사진 3장 → 사진마다 '본문에 넣기 / 편집해서 넣기 / 다운로드',
// 이전·다음으로 같은 검색어의 다른 사진, 사진가와 Unsplash 출처 표시. 화면 가운데 팝업, Esc·바깥 클릭으로 닫힌다.
// 10-12: 검색창 아래에서 사진 출처를 고른다 — Unsplash | 동아일보 DB(동아디지털아카이브 포토파노라마, 전체/최신순/오래된순·검색어).
// 출처를 바꾸면 검색칸·결과를 비운다(Unsplash 에서 쓴 검색어가 동아일보 DB 로 넘어가지 않게). 3장씩, 나머지는 이전·다음.
// 동아일보 DB 사진도 Unsplash 와 똑같이 '본문에 넣기 / 편집해서 넣기 / 다운로드'로 가져온다.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { photoKeywords, photoSearchQuery, searchDongaPhotos, searchPhotos } from "../../api/editorial";

const DONGA_SOURCE = "https://www.donga.com/archive/newslibrary/list?m=photo";
const SORTS = [["all", "전체"], ["latest", "최신순"], ["oldest", "오래된순"]];

const UTM = "?utm_source=article_workspace&utm_medium=referral";
const btn = "px-2.5 py-1 rounded-full text-[11px] font-bold border border-[#DDD6CB] bg-white hover:bg-[#F5F2ED] text-[#23211F] cursor-pointer disabled:opacity-50";

export default function PhotoSearch({ body, onClose, onChoose }) {
  const [query, setQuery] = useState("");
  const [keywords, setKeywords] = useState({ busy: false, list: [], error: "" });
  const [result, setResult] = useState({ busy: false, data: null, error: "", query: "", page: 1, searched: "" });
  const [working, setWorking] = useState("");
  const [source, setSource] = useState("unsplash"); // unsplash | donga
  const [sort, setSort] = useState("all"); // 동아일보 DB 정렬
  const token = useRef(0);
  const cache = useRef(new Map());

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if ((body || "").trim().length < 80) return; // v30 과 같은 기준
    setKeywords({ busy: true, list: [], error: "" });
    photoKeywords(body)
      .then((list) => setKeywords({ busy: false, list, error: "" }))
      .catch((e) => setKeywords({ busy: false, list: [], error: e.message }));
    // 창을 열 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (q, page = 1, from = source, order = sort) => {
    q = (q || "").trim();
    if (from === "donga") return searchDonga(q, page, order);
    if (!q) return;
    setQuery(q);
    const id = ++token.current, key = JSON.stringify([q, page]);
    setResult({ busy: true, data: null, error: "", query: q, page, searched: "" });
    try {
      // 한글 검색어는 영어로 바꿔 찾는다(Unsplash 는 영어 검색어에서 결과가 잘 나온다). 바꾼 검색어는 같은 검색어 동안 다시 쓴다
      const searched = cache.current.get("q:" + q) || (await photoSearchQuery(q));
      cache.current.set("q:" + q, searched);
      const data = cache.current.get(key) || (await searchPhotos(searched, page));
      cache.current.set(key, data);
      if (token.current === id) setResult({ busy: false, data, error: "", query: q, page, searched });
    } catch (e) {
      if (token.current === id) setResult({ busy: false, data: null, error: e.message, query: q, page, searched: "" });
    }
  };

  // 동아일보 DB: 검색어 없이도 목록을 보여 준다. 한글 그대로 찾는다(번역하지 않음)
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
    setQuery(""); // 다른 출처로 넘어가면 검색칸을 비운다
    ++token.current; // 진행 중이던 이전 출처 검색 결과는 버린다
    setResult({ busy: false, data: null, error: "", query: "", page: 1, searched: "" });
    if (next === "donga") searchDonga("", 1, sort);
  };
  const chooseSort = (order) => {
    setSort(order);
    searchDonga(query, 1, order);
  };

  const choose = async (photo, action) => {
    setWorking(photo.id + action);
    try {
      await onChoose(source === "donga" ? { ...photo, provider: "donga" } : photo, action);
    } finally {
      setWorking("");
    }
  };

  const photos = result.data?.photos || [];
  const totalPages = result.data?.totalPages ?? result.page;
  // 팀 레이아웃의 transform 이 있는 조상 아래에서는 position: fixed 가 화면이 아니라 그 조상 기준이 되므로 body 에 띄운다
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="사진 검색하기" data-testid="photo-search"
        className="w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-3xl border border-[#DDD6CB] shadow-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-900">사진 검색하기</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="p-1 rounded-full hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(query); }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="어떤 사진을 찾을까요?" aria-label="사진 검색어"
            className="flex-1 rounded-full border border-[#DDD6CB] px-4 py-2 text-sm outline-none focus:border-slate-800" />
          <button type="submit" className="px-4 py-2 rounded-full text-sm font-black bg-[#23211F] text-white cursor-pointer">검색</button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="사진 출처" data-testid="photo-source">
          <span className="text-[11px] font-bold text-slate-500 mr-1">사진 출처</span>
          {[["unsplash", "Unsplash"], ["donga", "동아일보 DB"]].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={source === key} onClick={() => chooseSource(key)} data-testid={`photo-source-${key}`}
              className={`px-3 py-1 rounded-full text-xs font-black border cursor-pointer ${source === key ? "bg-[#23211F] text-white border-[#23211F]" : "bg-white text-[#23211F] border-[#DDD6CB] hover:bg-[#F5F2ED]"}`}>
              {label}
            </button>
          ))}
        </div>
        {source === "donga" && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="정렬" data-testid="donga-sorts">
            {SORTS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={sort === key} onClick={() => chooseSort(key)} className={`${btn} ${sort === key ? "!bg-[#23211F] !text-white" : ""}`}>{label}</button>
            ))}
          </div>
        )}
        {/* 추천 검색어는 영어(Unsplash 용)라 동아일보 DB(한글 제목·설명)에서는 숨긴다 */}
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
              <div key={p.id} className="space-y-1.5" data-testid="photo-card">
                <button type="button" onClick={() => choose(p, "edit")} aria-label="사진 편집해서 넣기" className="block w-full cursor-pointer">
                  <img src={p.thumb || p.image} alt={p.title} className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200" />
                </button>
                <div className="text-[11px] leading-snug">
                  <b className="block text-slate-800 truncate" title={p.title}>{p.title}</b>
                  <span className="text-slate-500">{p.date} · 동아일보 DB</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" disabled={!!working} onClick={() => choose(p, "insert")} className={btn}>{working === p.id + "insert" ? "넣는 중…" : "본문에 넣기"}</button>
                  <button type="button" disabled={!!working} onClick={() => choose(p, "edit")} className={btn}>편집해서 넣기</button>
                  <button type="button" disabled={!!working} onClick={() => choose(p, "download")} className={btn}>다운로드</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {source === "unsplash" && !!photos.length && (
          <div className="grid grid-cols-3 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="space-y-1.5" data-testid="photo-card">
                <button type="button" onClick={() => choose(p, "edit")} aria-label="사진 편집해서 넣기" className="block w-full cursor-pointer">
                  <img src={p.urls?.small} alt={p.alt_description || "검색 사진"} className="w-full aspect-[4/3] object-cover rounded-xl border border-slate-200" />
                </button>
                <a href={(p.user?.links?.html || "https://unsplash.com") + UTM} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-slate-500 truncate hover:underline">
                  {p.user?.name} / Unsplash
                </a>
                <div className="flex flex-wrap gap-1">
                  <button type="button" disabled={!!working} onClick={() => choose(p, "insert")} className={btn}>{working === p.id + "insert" ? "넣는 중…" : "본문에 넣기"}</button>
                  <button type="button" disabled={!!working} onClick={() => choose(p, "edit")} className={btn}>편집해서 넣기</button>
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
      </div>
    </div>,
    document.body,
  );
}
