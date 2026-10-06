// 편집 보조 UI 조각 — 코어 기능(제목·부제 추천, 사진 찾기, 흐름 요약, 자동 저장)을 ArticleWriter 에 붙인다.
// ArticleWriter(프론트 담당 파일)에는 이 조각을 배치하는 몇 줄만 둔다 → main 동기화 때 충돌을 줄인다.
import React, { useEffect, useRef, useState } from "react";
import { Sparkles, Search, ListOrdered, Loader2 } from "lucide-react";
import {
  suggestHeadlines,
  suggestSubtitles,
  photoKeywords,
  searchPhotos,
  importPhoto,
  flowSummary,
  saveDraft,
} from "../api/editorial";

const MIN_BODY = 20; // 코어 assist 하한(본문 20자)

/** 비동기 호출 상태 묶음 */
function useTask() {
  const idle = { busy: false, error: "", data: null };
  const [state, setState] = useState(idle);
  const run = async (fn) => {
    setState({ busy: true, error: "", data: null });
    try {
      const data = await fn();
      setState({ busy: false, error: "", data });
      return data;
    } catch (e) {
      setState({ busy: false, error: e?.message || String(e), data: null });
      return null;
    }
  };
  return [state, run, () => setState(idle)];
}

/** 제목·부제 후보 목록 — kind: headline | subtitle */
export function useSuggestions(kind, article) {
  const [state, run, clear] = useTask();
  const request = () =>
    run(() =>
      article.content.trim().length < MIN_BODY
        ? Promise.reject(Error("본문을 20자 이상 작성하면 추천할 수 있어요."))
        : (kind === "headline" ? suggestHeadlines : suggestSubtitles)(article.content, article.title),
    );
  return { ...state, request, clear };
}

export function SuggestionList({ state, onPick, label }) {
  if (!state.busy && !state.error && !state.data?.length) return null;
  return (
    <div className="mt-2 p-2 bg-[#F7F5F1] border border-[#DDD6CB] rounded-2xl text-xs space-y-1" data-testid={`suggest-${label}`}>
      {state.busy && (
        <div className="flex items-center gap-1.5 text-slate-500 px-2 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {label} 추천을 만들고 있어요…
        </div>
      )}
      {state.error && <div className="text-rose-600 px-2 py-1">{state.error}</div>}
      {state.data?.map((value) => (
        <button
          key={value}
          onClick={() => onPick(value)}
          className="block w-full text-left px-3 py-1.5 rounded-xl hover:bg-white font-bold text-slate-800 cursor-pointer"
        >
          {value}
        </button>
      ))}
    </div>
  );
}

/** 부제 옆 'AI 추천' 버튼 */
export function SuggestButton({ onClick, busy, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      className="text-[11px] px-2.5 py-0.5 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] font-bold rounded-full border border-[#DDD6CB] cursor-pointer flex items-center gap-1 disabled:opacity-60"
    >
      <Sparkles className="w-3 h-3" /> AI 추천
    </button>
  );
}

/** 사진 창 안: 기사 기반 검색어 추천 + Unsplash 검색(3장씩) */
export function PhotoFinder({ body, onPick }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [keywords, runKeywords] = useTask();
  const [result, runSearch] = useTask();
  const [picking, setPicking] = useState("");
  const [pickError, setPickError] = useState("");

  useEffect(() => {
    if (body.trim().length >= 80) runKeywords(() => photoKeywords(body)); // 옛 UI 와 같은 기준
    // 창을 열 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = (q, p = 1) => {
    if (!q.trim()) return;
    setQuery(q);
    setPage(p);
    runSearch(() => searchPhotos(q.trim(), p));
  };
  const pick = async (photo) => {
    setPicking(photo.id);
    setPickError("");
    try {
      onPick(await importPhoto(photo));
    } catch (e) {
      setPickError(e?.message || String(e));
    } finally {
      setPicking("");
    }
  };

  return (
    <div className="space-y-2.5 p-3 bg-slate-50 border border-slate-200 rounded-2xl" data-testid="photo-finder">
      <label className="font-bold text-slate-800 block">사진 찾기 (Unsplash)</label>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(query)}
          placeholder="어떤 사진을 찾을까요?"
          className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-slate-800"
        />
        <button onClick={() => search(query)} className="px-3 py-2 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer">
          <Search className="w-3.5 h-3.5" /> 검색
        </button>
      </div>
      {keywords.busy && <div className="text-slate-500">검색어를 추천 중입니다…</div>}
      {keywords.error && <div className="text-slate-400">{keywords.error}</div>}
      {!!keywords.data?.length && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.data.map((k) => (
            <button key={k} onClick={() => search(k)} className="px-2.5 py-1 bg-white border border-slate-200 rounded-full font-bold hover:border-slate-800 cursor-pointer">
              {k}
            </button>
          ))}
        </div>
      )}
      {result.busy && <div className="text-slate-500">사진을 찾고 있습니다…</div>}
      {result.error && <div className="text-rose-600">{result.error}</div>}
      {result.data && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {result.data.photos.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p)}
                disabled={!!picking}
                title={`${p.alt_description || ""} — ${p.user?.name || ""}`}
                className="relative aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 hover:border-slate-900 cursor-pointer disabled:opacity-60"
              >
                <img src={p.urls?.small || p.urls?.thumb} alt={p.alt_description || "사진"} className="w-full h-full object-cover" />
                {picking === p.id && <Loader2 className="absolute inset-0 m-auto w-5 h-5 animate-spin text-white" />}
              </button>
            ))}
          </div>
          {!result.data.photos.length && <div className="text-slate-500">검색 결과가 없어요.</div>}
          {result.data.photos.length > 0 && (
            <div className="flex items-center justify-between text-slate-500">
              <button disabled={page <= 1} onClick={() => search(query, page - 1)} className="font-bold disabled:opacity-40 cursor-pointer">
                ← 이전
              </button>
              <span>
                {page} / {result.data.totalPages || page}
              </span>
              <button disabled={page >= (result.data.totalPages || page)} onClick={() => search(query, page + 1)} className="font-bold disabled:opacity-40 cursor-pointer">
                다음 →
              </button>
            </div>
          )}
          {pickError && <div className="text-rose-600">{pickError}</div>}
        </>
      )}
    </div>
  );
}

/** 본문 라벨 옆 '흐름 요약' 버튼 + 결과 창 */
export function FlowSummaryButton({ body }) {
  const [open, setOpen] = useState(false);
  const [state, run] = useTask();
  const refresh = () =>
    run(() => (body.trim().length < MIN_BODY ? Promise.reject(Error("본문을 20자 이상 작성하면 요약할 수 있어요.")) : flowSummary(body)));
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          refresh();
        }}
        className="text-[11px] px-2.5 py-0.5 bg-[#EFECE6] hover:bg-[#E4DFD7] text-[#23211F] font-bold rounded-full border border-[#DDD6CB] cursor-pointer flex items-center gap-1"
      >
        <ListOrdered className="w-3 h-3" /> 흐름 요약
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="flow-summary">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">기사 흐름 요약</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer">
                ×
              </button>
            </div>
            {state.busy && <div className="text-xs text-slate-500">요약을 준비 중입니다…</div>}
            {state.error && <div className="text-xs text-rose-600">{state.error}</div>}
            {state.data && (
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-800">
                {state.data.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ol>
            )}
            <div className="flex justify-end">
              <button onClick={refresh} disabled={state.busy} className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60">
                새로고침
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 기사가 바뀌면 1.5초 뒤 코어에 저장(옛 UI 와 같은 간격). 상태 문구를 돌려준다.
 *  App 에서 한 번만 쓴다 — 어느 화면에 있든 저장되고, 저장 ID 는 article.articleId 에 남아 같은 파일을 덮어쓴다 */
export function useAutosave(article, setArticle) {
  const [status, setStatus] = useState("");
  const idRef = useRef(article.articleId || null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // 처음 연(또는 불러온) 기사는 바꾸기 전까지 저장하지 않는다
      return;
    }
    setStatus("저장 대기…");
    const timer = setTimeout(async () => {
      setStatus("자동 저장 중…");
      try {
        const id = await saveDraft(article, idRef.current || article.articleId);
        idRef.current = id;
        if (id !== article.articleId) setArticle((prev) => ({ ...prev, articleId: id }));
        setStatus("자동 저장됨");
      } catch (e) {
        setStatus("저장 실패: " + (e?.message || e));
      }
    }, 1500);
    return () => clearTimeout(timer);
    // 저장 대상 필드가 바뀔 때만(article 객체 전체가 아니라 — articleId 변경으로는 다시 저장하지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.title, article.subtitle, article.content, article.photos, article.sources, article.linkedSources, article.status]);
  return status;
}
