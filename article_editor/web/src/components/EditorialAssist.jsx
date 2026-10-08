// 편집 보조 UI 조각 — 코어 기능(제목·부제 추천, 사진 찾기, 흐름 요약, 자동 저장)을 ArticleWriter 에 붙인다.
// ArticleWriter(프론트 담당 파일)에는 이 조각을 배치하는 몇 줄만 둔다 → main 동기화 때 충돌을 줄인다.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Search, ListOrdered, Loader2 } from "lucide-react";
import {
  suggestHeadlines,
  suggestSubtitles,
  photoKeywords,
  searchPhotos,
  importPhoto,
  flowSummary,
  saveDraft,
  factcheckArticle,
  splitSentences,
  needsRecheck,
  recheckEvidence,
  externalRecheck,
  cachedExternalRecheck,
} from "../api/editorial";
import { core } from "../api/core.js";

/** 외부 재판정 요청 항목 — 클릭 재검토와 저장된 판정 복원이 **똑같은 형식**이어야 코어가 저장된 기록을 찾는다 */
const recheckItems = (todo) => todo.map(([text, r], i) => {
  const ev = recheckEvidence(r);
  return { id: String(i), claim: text, evidence: ev.map((e) => e.text || ""), titles: ev.map((e) => e.material_title || "") };
});

/** 원고를 다시 열었을 때: 이미 받아 둔 AI 재판정(코어에 저장됨)을 조회 전용으로 가져와 문장별 기억에 붙인다(OpenAI 호출 없음).
 *  한 번 물어본 문장은 다시 묻지 않는다(state.tried). 하나라도 붙으면 true — 복원은 덤이라 실패해도 로컬 판정은 그대로 보인다 */
async function restoreExternal(state, content) {
  const present = new Set(splitSentences(content).map((s) => s.text));
  const todo = [...state.cache.entries()].filter(([text, r]) => present.has(text) && !state.tried.has(text) && needsRecheck(r));
  if (!todo.length) return false;
  todo.forEach(([text]) => state.tried.add(text));
  try {
    let restored = false;
    for (const x of await cachedExternalRecheck(recheckItems(todo))) {
      const hit = todo[Number(x.id)];
      if (hit) {
        state.cache.set(hit[0], { ...hit[1], external: x });
        restored = true;
      }
    }
    return restored;
  } catch {
    return false;
  }
}

/** 팩트체크 — 본문·취재자료가 바뀌고 1.5초 멈추면 자동으로 돈다(옛 UI 의 '작성 멈춤 감지').
 *  실행 중에 또 바뀌면 끝난 뒤 한 번 더 — 요청이 겹치지 않는다.
 *  이미 검증한 문장은 결과를 기억해 두고 **새로 쓰거나 고친 문장만** 코어에 보낸다. 취재자료가 바뀌면 기억을 비운다.
 *  → { results, busy, error, run } (run(true) = 기억을 비우고 전체 다시 검증 — 서랍의 새로고침 버튼) */
export function useFactCheck(article) {
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState(false); // false | { percent: 0~1 }
  const latest = useRef(article);
  latest.current = article;
  const state = useRef({ running: false, again: false, cacheKey: "", cache: new Map(), tried: new Set() });

  const run = useCallback(async (fresh = false) => {
    if (state.current.running) {
      state.current.again = true;
      return;
    }
    const { content, sources = [] } = latest.current;
    const materials = sources.filter((s) => s.text != null);
    const key = materials.map((s) => s.id).join();
    if (fresh === true || key !== state.current.cacheKey) state.current = { ...state.current, cacheKey: key, cache: new Map(), tried: new Set() };
    if (!materials.length) return setError("검증에 쓸 자료(PDF·HWP·HWPX·DOCX·TXT)를 올려 주세요.");
    if (!splitSentences(content).length) {
      setResults([]);
      return setError("검증할 본문 문장이 없어요. 본문을 먼저 작성해 주세요.");
    }
    // 색인(청킹·임베딩)이 끝나기 전에는 팩트체크를 보내지 않는다 — 끝나면 자동으로 이어서 돈다
    try {
      const { sources: stored = [] } = await core.listSources();
      const ids = new Set(materials.map((s) => s.id));
      const active = stored.filter((s) => ids.has(s.id) && s.index?.state === "indexing");
      if (active.length) {
        setIndexing({ percent: Math.min(...active.map((s) => s.index.progress ?? 0)) }); // 가장 덜 끝난 자료 기준
        clearTimeout(state.current.wait);
        state.current.wait = setTimeout(() => run(), 3000);
        return;
      }
    } catch { /* 목록을 못 읽으면 기존처럼 진행 — 코어도 색인 중이면 409 로 막는다 */ }
    setIndexing(false);
    state.current.running = true;
    setBusy(true);
    setError("");
    try {
      const items = await factcheckArticle(content, materials, state.current.cache);
      // 다시 열었을 때 이미 받은 AI 재판정을 붙인다 — 붙으면 기억에서 화면만 다시 그린다(코어 판정 없음)
      setResults((await restoreExternal(state.current, content)) ? await factcheckArticle(content, materials, state.current.cache) : items);
    } catch (e) {
      if (e?.code === "SOURCE_INDEXING") {
        setIndexing({ percent: 0 });
        state.current.wait = setTimeout(() => run(), 3000);
      } else setError(e?.message || String(e));
    } finally {
      state.current.running = false;
      setBusy(false);
      if (state.current.again) {
        state.current.again = false;
        run();
      }
    }
  }, []);

  const sourceKey = (article.sources || []).map((s) => s.id).join();
  useEffect(() => {
    if (!(article.sources || []).some((s) => s.text != null) || !splitSentences(article.content).length) return;
    const timer = setTimeout(run, 1000);
    return () => clearTimeout(timer);
  }, [article.content, sourceKey, run]);

  // 외부 재판정(임시·OpenAI): 로컬 판정기가 확정 못 한 문장만 보낸다. 결과는 문장별 기억에 붙어 문장을 고치기 전까지 유지된다
  // key(공백 정리된 문장)를 주면 그 문장만 — 본문 하이라이트를 눌러 '상위모델로 재검토'
  const [recheckBusy, setRecheckBusy] = useState(false);
  const recheck = useCallback(async (key) => {
    const present = new Set(splitSentences(latest.current.content).map((s) => s.text));
    const todo = [...state.current.cache.entries()].filter(([text, r]) =>
      present.has(text) && (key ? text === key && !r.external : needsRecheck(r)));
    if (!todo.length) return;
    setRecheckBusy(true);
    setError("");
    try {
      for (const x of await externalRecheck(recheckItems(todo))) {
        const hit = todo[Number(x.id)];
        if (hit) state.current.cache.set(hit[0], { ...hit[1], external: x });
      }
      await run(); // 모두 기억에 있으니 코어 판정 없이 화면만 다시 그린다
    } catch (e) {
      setError("AI 재판정 실패: " + (e?.message || String(e)));
    } finally {
      setRecheckBusy(false);
    }
  }, [run]);

  // 서랍의 '팩트 일치' 카드에 마우스를 올리는 동안 본문의 그 문장을 초록으로(focus = 결과 id)
  const [focus, setFocus] = useState(null);

  return { results, busy, indexing, error, run, recheck, recheckBusy, recheckCount: results.filter((r) => r.needsRecheck).length, focus, setFocus };
}

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
    // TODO(debt: DEBT-006): 실행 중인 저장 요청은 clearTimeout으로 중단되지 않아 다음 저장과 겹칠 수 있다.
    // 첫 ID 응답 전에는 새 기사 중복 생성, 응답 순서가 뒤집히면 오래된 본문/상태 덮어쓰기 가능성.
    // 동일 기사 저장 요청을 직렬화하고 낡은 응답의 상태 갱신을 막을 것(실사용 재현은 후속).
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
  }, [article.title, article.subtitle, article.content, article.photos, article.sources, article.linkedSources, article.status, article.platformDrafts, article.cardNews, article.platformGeneration]);
  return status;
}
