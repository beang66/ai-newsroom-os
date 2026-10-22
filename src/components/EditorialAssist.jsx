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
  saveDraftResult,
  publishDraft,
  publishCms,
  factcheckArticle,
  splitSentences,
  needsRecheck,
  recheckEvidence,
  externalRecheck,
  cachedExternalRecheck,
} from "../api/editorial";
import { freezeArticle } from "../api/platform";
import { core } from "../api/core.js";
import { isRestoring } from "../restoreState";
import { clearBackup, writeBackup } from "../lib/draftBackup.js";

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
 *  → { results, busy, progress, indexing, basis, error, run } (run(true) = 기억을 비우고 전체 다시 검증 — 서랍의 새로고침 버튼)
 *  progress: 새로 검증할 문장이 많을 때 { done, total } — 10문장씩 끝나는 대로 results 가 늘어난다 */
export function useFactCheck(article, flush) {
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } | null
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState(false); // false | { percent: 0~1 }
  const [basis, setBasis] = useState(null); // 마지막 "전체 다시 검증"이 기준으로 삼은 저장 버전 { revisionNo, content }
  const latest = useRef(article);
  const flushRef = useRef(flush); // 앱의 저장 큐 — 고정본용 저장이 앱의 이력 번호와 어긋나지 않게 같은 큐로 저장한다
  flushRef.current = flush;
  latest.current = article;
  const state = useRef({ running: false, again: false, cacheKey: "", cache: new Map(), tried: new Set() });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(state.current.wait);
    };
  }, []);

  const run = useCallback(async (fresh = false) => {
    if (!mounted.current) return;
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
      if (!mounted.current) return;
      const ids = new Set(materials.map((s) => s.id));
      const active = stored.filter((s) => ids.has(s.id) && s.index?.state === "indexing");
      if (active.length) {
        setIndexing({ percent: Math.min(...active.map((s) => s.index.progress ?? 0)) }); // 가장 덜 끝난 자료 기준
        clearTimeout(state.current.wait);
        if (mounted.current) state.current.wait = setTimeout(() => run(), 3000);
        return;
      }
    } catch { /* 목록을 못 읽으면 기존처럼 진행 — 코어도 색인 중이면 409 로 막는다 */ }
    if (!mounted.current) return;
    setIndexing(false);
    state.current.running = true;
    setBusy(true);
    setError("");
    try {
      // 전체 다시 검증은 지금 글을 고정본으로 만들어 그 기준으로 한다(나중에 "어느 글을 검증했는지" 알 수 있게).
      // 자동 검증(글이 멈출 때마다)은 고정본을 만들지 않는다 — 고정본이 너무 많아지고, 판정 기록(memo)은 문장·자료 기준이라 영향이 없다.
      // 저장 ID 가 아직 없는 새 글은 건너뛴다(여기서 저장하면 자동 저장이 같은 글을 또 만든다).
      let frozen = null;
      if (fresh === true && latest.current.articleId) {
        frozen = await freezeArticle(latest.current, flushRef.current ? { flush: flushRef.current } : undefined);
        if (!mounted.current) return;
        setBasis(frozen ? { revisionNo: frozen.revisionNo, content: latest.current.content } : null);
      }
      const items = await factcheckArticle(content, materials, state.current.cache, frozen?.snapshotId, ({ items: partial, done, total }) => {
        if (!mounted.current) return;
        setResults(partial); // 먼저 끝난 문장부터 본문 표시·서랍 카드를 채운다
        setProgress({ done, total });
      });
      if (!mounted.current) return;
      // 다시 열었을 때 이미 받은 AI 재판정을 붙인다 — 붙으면 기억에서 화면만 다시 그린다(코어 판정 없음)
      const restored = await restoreExternal(state.current, content);
      if (!mounted.current) return;
      const nextResults = restored ? await factcheckArticle(content, materials, state.current.cache) : items;
      if (mounted.current) setResults(nextResults);
    } catch (e) {
      if (!mounted.current) return;
      if (e?.code === "SOURCE_INDEXING") {
        setIndexing({ percent: 0 });
        if (mounted.current) state.current.wait = setTimeout(() => run(), 3000);
      } else setError(e?.message || String(e));
    } finally {
      state.current.running = false;
      if (mounted.current) {
        setBusy(false);
        setProgress(null);
      }
      if (mounted.current && state.current.again) {
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
      const files = (latest.current.sources || []).filter((s) => s.text != null);
      for (const x of await externalRecheck(recheckItems(todo), files)) {
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

  return { results, busy, progress, indexing, basis: basis ? { revisionNo: basis.revisionNo, changed: basis.content !== article.content } : null, error, run, recheck, recheckBusy, recheckCount: results.filter((r) => r.needsRecheck).length, focus, setFocus };
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
          className="block w-full text-left px-3 py-1.5 rounded-xl hover:bg-white font-bold text-slate-800 cursor-pointer whitespace-pre-line"
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

const clock = () => new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

/** 저장 — App 에서 한 번만 쓴다(어느 화면에 있든 동작). 저장 길은 두 갈래이고, 코어로 가는 요청은 한 줄로 세워 겹치지 않게 한다.
 *  - 자동 임시 저장 트랙: 기사가 바뀌면 1.5초 뒤 '최근 작업본' 한 칸을 덮어쓴다(이력·보관함에는 안 보임).
 *    기다리는 동안 또 바뀌면 앞의 것은 버리고 가장 최근 원고 하나만 보낸다.
 *  - 수동 저장 트랙(saveNow·publishNow): 저장 버튼·Ctrl+S·송고. 버리지 않고 순서대로 보내며 새 버전이 된다.
 *    수동 저장이 최신 원고를 담으므로, 줄을 서 있던 자동 저장은 버린다.
 *  - 실시간 백업: 바뀔 때마다 0.3초 뒤 이 PC 에 원고를 남긴다(강제 종료 대비). 코어 저장이 최신까지 끝나면 지운다.
 *  돌려주는 값: { status(상태 문구), saveNow, publishNow, flush(자동 저장을 지금 끝내기 → articleId), saved, dirty(수동 저장 안 한 변경),
 *    unsynced(코어에 아직 안 간 변경), markSaved, published, phase(작성 중·송고 완료·수정 중), times({firstSavedAt, lastSavedAt}) } */
export function useAutosave(article, setArticle) {
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState(() => article.lastManual ? { ...article.lastManual, savedAt: clockOf(article.lastManual.savedAt) } : null);
  const [dirty, setDirty] = useState(() => !!article.unsavedOnOpen || !!article.restoredFromBackup);
  const [unsynced, setUnsynced] = useState(() => !!article.restoredFromBackup);
  const [saving, setSaving] = useState(false);
  // 송고본(기사당 하나)과, 송고한 뒤 고쳤는지 — 상단 상태 "작성 중 / 송고 완료 / 수정 중"
  const [published, setPublished] = useState(() => article.published || null);
  const [changedSincePublish, setChangedSincePublish] = useState(() => !!article.editedAfterPublish);
  // 미리보기 입력·업데이트(송고 전): 처음 수동 저장 시각 / 마지막 수동 저장 시각(코어 ISO)
  const [times, setTimes] = useState(() => ({ firstSavedAt: article.firstSavedAt || null, lastSavedAt: article.lastManual?.savedAt || null }));
  const noteSaved = (savedAt, firstSavedAt) => setTimes((prev) => ({
    firstSavedAt: prev.firstSavedAt || firstSavedAt || savedAt, lastSavedAt: savedAt,
  }));
  const idRef = useRef(article.articleId || null);
  const latest = useRef(article);
  latest.current = article;
  const mounted = useRef(true);
  const autoJob = useRef(null); // 자동 저장 트랙: 가장 최근 원고 하나
  const manualJobs = useRef([]); // 수동 저장 트랙: 순서대로 전부
  const running = useRef(null);
  const timerRef = useRef(null);
  const backupTimer = useRef(null);
  const lastError = useRef(null);
  const sequence = useRef(0);
  const previousFields = useRef(null);
  const savingRef = useRef(false);
  const skipChange = useRef(false); // 송고가 바꾼 상태 글자는 '송고 후 수정'으로 세지 않는다

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const idle = () => !autoJob.current && !manualJobs.current.length;
  const drain = useCallback(() => {
    if (running.current) return running.current;
    running.current = (async () => {
      try {
        while (!idle()) {
          if (isRestoring()) break; // 작업을 비우기 전에 멈춰야 복구가 실패해도 다음 저장에 남는다
          const job = manualJobs.current.shift() || autoJob.current;
          if (job === autoJob.current) autoJob.current = null;
          try {
            const result = await job.run(idRef.current || job.article.articleId);
            idRef.current = result.articleId;
            lastError.current = null;
            if (mounted.current && result.articleId !== job.article.articleId) {
              setArticle((prev) => prev.articleId === result.articleId ? prev : ({ ...prev, articleId: result.articleId }));
            }
            const isLatest = job.sequence === sequence.current && idle();
            if (isLatest) {
              void clearBackup(); // 코어에 최신 원고까지 들어갔다 → 백업은 필요 없다
              if (mounted.current) setUnsynced(false);
            }
            if (mounted.current) job.done?.(isLatest);
            job.resolve?.(result);
          } catch (e) {
            lastError.current = e;
            if (mounted.current) job.failed?.(e);
            job.reject?.(e);
          }
        }
      } finally {
        running.current = null;
      }
    })();
    return running.current;
  }, [setArticle]);

  const autoJobOf = (a, seq) => ({
    article: a, sequence: seq,
    run: (id) => saveDraftResult(a, id, { kind: "auto" }),
    done: (isLatest) => { if (isLatest) setStatus("임시 저장됨"); },
    failed: (e) => setStatus("임시 저장 실패: " + (e?.message || e)),
  });

  // 백업에서 복구한 원고는 열자마자 코어에 임시 저장한다
  useEffect(() => {
    if (!article.restoredFromBackup) return;
    autoJob.current = autoJobOf(article, sequence.current);
    void drain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fields = [article.title, article.subtitle, article.category, article.subcategory, article.content, article.photos, article.sources,
      article.linkedSources, article.linkedInterviews, article.status, article.platformDrafts, article.cardNews, article.platformGeneration];
    if (!previousFields.current) {
      previousFields.current = fields; // 처음 연(또는 불러온) 기사는 바꾸기 전까지 저장하지 않는다
      return;
    }
    if (fields.every((value, index) => Object.is(value, previousFields.current[index]))) return;
    previousFields.current = fields;
    if (skipChange.current) {
      skipChange.current = false; // 송고 직후 상태 글자 변경 — 코어에는 송고로 이미 저장됐다
      return;
    }
    const revision = ++sequence.current;
    setDirty(true);
    setUnsynced(true);
    setChangedSincePublish(true);
    setStatus("임시 저장 대기…");
    clearTimeout(backupTimer.current);
    backupTimer.current = setTimeout(() => void writeBackup(article), 300);
    const timer = timerRef.current = setTimeout(() => {
      autoJob.current = autoJobOf(article, revision);
      setStatus("임시 저장 중…");
      void drain();
    }, 1500);
    return () => clearTimeout(timer);
    // 저장 대상 필드가 바뀔 때만(article 객체 전체가 아니라 — articleId 변경으로는 다시 저장하지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.title, article.subtitle, article.category, article.subcategory, article.content, article.photos, article.sources, article.linkedSources, article.linkedInterviews, article.status, article.platformDrafts, article.cardNews, article.platformGeneration, drain]);

  /** 자동 저장을 지금 끝낸다(기사 전환·창 닫기·복원 전) → articleId. 실패하면 던진다 */
  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    autoJob.current = autoJobOf(latest.current, sequence.current);
    await drain();
    if (lastError.current) throw lastError.current;
    return idRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drain]);

  const enqueueManual = (a, run) => new Promise((resolve, reject) => {
    clearTimeout(timerRef.current);
    autoJob.current = null; // 수동 저장이 최신 원고를 담는다 → 기다리던 자동 저장은 필요 없다
    manualJobs.current.push({ article: a, sequence: sequence.current, run, resolve, reject });
    void drain();
  });

  const markSaved = (a, at = clock(), iso = null) => {
    setSaved({ title: a.title || "", subtitle: a.subtitle || "", content: a.content || "", savedAt: at });
    if (iso !== false) setTimes((prev) => ({ firstSavedAt: prev.firstSavedAt || iso || new Date().toISOString(), lastSavedAt: iso || new Date().toISOString() })); // 복원도 수동 저장
    if (a === latest.current) setDirty(false); // 저장하는 사이에 또 고쳤으면 '저장하지 않은 변경'은 남는다
  };
  const saveNow = async () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setStatus("저장 중…");
    const a = latest.current;
    try {
      const result = await enqueueManual(a, (id) => saveDraftResult(a, id, { kind: "manual" }));
      noteSaved(result.savedAt, result.firstSavedAt);
      markSaved(a, clockOf(result.savedAt), false);
      setStatus("");
      return true;
    } catch (e) {
      setStatus("저장 실패: " + (e?.message || e));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  // 송고: ① 새 기사면 먼저 저장해 ID 를 받고 ② CMS(백엔드)로 보낸 뒤 ③ 성공하면 송고본을 남긴다(수동 저장 포함, 기사당 하나).
  // CMS 전송이 실패하면 송고본은 바뀌지 않는다. 성공하면 결과 { published, republished, receipt, ... } 를, 실패하면 오류를 던진다
  const publishNow = async () => {
    if (savingRef.current) throw new Error("저장 중입니다. 잠시 뒤 다시 눌러 주세요.");
    savingRef.current = true;
    setSaving(true);
    setStatus("송고 중…");
    const a = latest.current;
    try {
      const result = await enqueueManual(a, async (id) => {
        const articleId = id || (await saveDraftResult(a, null, { kind: "auto" })).articleId;
        const receipt = await publishCms({ ...a, articleId });
        return { ...(await publishDraft({ ...a, cmsReceipt: receipt }, articleId)), receipt };
      });
      if (latest.current.status !== "송고됨") skipChange.current = true;
      // 코어가 송고본의 상태를 '송고됨'으로 저장한다 — 화면도 같게
      setArticle((prev) => ({ ...prev, articleId: result.articleId, status: "송고됨", cmsReceipt: result.receipt }));
      markSaved(a, clockOf(result.savedAt), false);
      noteSaved(result.savedAt, result.firstSavedAt);
      setPublished(result.published);
      setChangedSincePublish(false);
      setStatus("");
      return result;
    } catch (e) {
      setStatus("송고 실패: " + (e?.message || e));
      throw e;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const phase = !published ? "작성 중" : changedSincePublish ? "수정 중" : "송고 완료";
  // 화면에 보일 상태 문구: 수동 저장 기준
  const label = saving ? status || "저장 중…"
    : /^(저장 실패|임시 저장 실패|송고)/.test(status) ? status
    : dirty ? [status, `저장하지 않은 변경 있음${saved ? ` · 마지막 저장 ${saved.savedAt}` : ""}`].filter(Boolean).join(" · ") // 예: "임시 저장됨 · 저장하지 않은 변경 있음"
    : saved ? `저장됨 ${saved.savedAt}` : status;
  return { status: label, saveNow, publishNow, flush, saved, dirty, unsynced, markSaved, published, phase, times };
}

// 코어의 저장 시각(ISO) → "14:32"
function clockOf(iso) {
  const d = new Date(iso || "");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
