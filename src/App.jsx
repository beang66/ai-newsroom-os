import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ArticleWriter from "./components/ArticleWriter";
import SourceSearch from "./components/SourceSearch";
import InterviewStudio from "./components/interview/InterviewStudio";
import ArchiveView from "./components/ArchiveView";
import DeskView from "./components/DeskView";
import PageHeader from "./components/PageHeader";
import DataMapView from "./features/data-map/DataMapView";
import "./workspace.css";
import "./deskGlass.css";
import "./pageTitle.css";
import LoginScreen from "./components/LoginScreen";
import SettingsView from "./components/SettingsView";

import { createEmptyArticle } from "./data/article";
import { destinations, routeFromHash } from "./data/navigation";
import { core } from "./api/core.js";
import { listStoredArticles, loadArticleById, loadLatestArticle, saveArticle } from "./services/editorialStore";
import PlatformStudio from "./components/PlatformStudio";
import { mergeStudioArticle, toStudioArticle } from "./lib/studioArticle.js";
import { setLoginHandler } from "./services/authGate";
import { getSession, signOut } from "./services/sessionService";
import { isRestoring } from "./restoreState";
import { getBackupKey, publishCms, publishDraft } from "./api/editorial";
import { clearBackup, readBackup, sameDraft, setBackupKey, setBackupOwner, writeBackup } from "./lib/draftBackup.js";

/**
 * 전체 배경 Soft Ambient Gradient Theme:
 * - 상단: 아주 은은한 Soft Blue glow (rgba(190, 220, 255, 0.25))
 * - 중앙: 거의 흰색에 가까운 매우 부드러운 transition
 * - 하단: 아주 은은한 Soft Lavender glow (rgba(215, 200, 255, 0.22))
 * - 두 색상이 경계 없이 화면 전체에 공기처럼 넓게 퍼지며 어우러짐
 */
const getAmbientGradient = (activeTab, factCheckActive) => {
  // 기사 작성 및 기본 메인 뷰: 상단 Soft Blue + 하단 Soft Lavender 완벽 블렌딩
  const editorialSoftGradient = [
    "radial-gradient(ellipse 95% 55% at 50% -5%, rgba(190, 220, 255, 0.25) 0%, rgba(255, 255, 255, 0) 75%)",
    "radial-gradient(ellipse 95% 55% at 50% 105%, rgba(215, 200, 255, 0.22) 0%, rgba(255, 255, 255, 0) 75%)",
    "#FAFAFA"
  ].join(", ");

  // 03 기사 검증 모드
  if (activeTab === "factcheck" || (activeTab === "writer" && factCheckActive)) {
    return [
      "radial-gradient(ellipse 95% 50% at 50% -5%, rgba(190, 220, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%)",
      "radial-gradient(ellipse 85% 65% at 15% 82%, rgba(190, 235, 215, 0.22) 0%, rgba(255, 255, 255, 0) 72%)",
      "radial-gradient(ellipse 95% 50% at 50% 105%, rgba(215, 200, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%)",
      "#FAFAFA"
    ].join(", ");
  }

  // 01 STT 모드
  if (activeTab === "interview") {
    return [
      "radial-gradient(ellipse 85% 55% at 20% 10%, rgba(190, 220, 255, 0.26) 0%, rgba(255, 255, 255, 0) 70%)",
      "radial-gradient(ellipse 85% 50% at 50% 105%, rgba(215, 200, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%)",
      "#FAFAFA"
    ].join(", ");
  }

  // 04 아카이브 모드
  if (activeTab === "archive") {
    return [
      "radial-gradient(ellipse 95% 50% at 50% -5%, rgba(190, 220, 255, 0.16) 0%, rgba(255, 255, 255, 0) 70%)",
      "radial-gradient(ellipse 85% 55% at 85% 85%, rgba(250, 225, 200, 0.20) 0%, rgba(255, 255, 255, 0) 72%)",
      "#FAFAFA"
    ].join(", ");
  }

  // 05 환경 설정 모드
  if (activeTab === "settings") {
    return [
      "radial-gradient(ellipse 95% 50% at 50% -5%, rgba(190, 220, 255, 0.20) 0%, rgba(255, 255, 255, 0) 70%)",
      "radial-gradient(ellipse 85% 50% at 50% 105%, rgba(220, 215, 235, 0.18) 0%, rgba(255, 255, 255, 0) 70%)",
      "#FAFAFA"
    ].join(", ");
  }

  return editorialSoftGradient;
};

// 마지막으로 보던 화면 — 이 PC 화면 설정이라 브라우저 저장소에 둔다(없거나 막혀도 동작). 처음 열면 오늘의 데스크(main 과 같음)
const TAB_KEY = "ai-newsroom:lastTab";
const readTab = () => { try { const tab = localStorage.getItem(TAB_KEY); return destinations.some((item) => item.id === tab) ? tab : "desk"; } catch { return "desk"; } };
const writeTab = (tab) => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* 저장 못 해도 그만 */ } };
const readRoute = () => routeFromHash(globalThis.location?.hash, readTab());

export default function App() {
  const [activeTab, setActiveTabState] = useState(() => readRoute().page);
  // STT 인터뷰 화면 방문 여부 (다른 메뉴를 다녀와도 작업 상태가 리셋되지 않도록 마운트 유지)
  const [hasVisitedInterview, setHasVisitedInterview] = useState(() => readRoute().page === "interview");
  useEffect(() => {
    if (activeTab === "interview") {
      setHasVisitedInterview(true);
    }
  }, [activeTab]);
  const setActiveTab = useCallback((target) => {
    if (routeFromHash(`#${target}`, "").page !== target) return;
    setActiveTabState(target);
    writeTab(target);
    if (globalThis.location?.hash !== `#${target}`) {
      globalThis.history?.pushState({ newsroomRoute: target }, "", `#${target}`);
    }
  }, []);
  const [article, setArticle] = useState(createEmptyArticle); // 저장된 원고가 없으면 빈 원고(예시 기사의 제목·부제가 저장되지 않게)
  const [storageStatus, setStorageStatus] = useState("최근 원고를 불러오는 중…");
  const revisionNo = useRef(null);
  const loaded = useRef(false);

  // 자동 저장: 마지막으로 Core 와 같아진 원고의 지문과, 진행 중인 자동 저장
  const articleRef = useRef(article);
  articleRef.current = article;
  const syncedSnapshot = useRef("");
  const autoRunning = useRef(null);
  const retryTimer = useRef(null);
  const signedInRef = useRef(false);
  const [unsynced, setUnsynced] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const backupChecked = useRef(false);
  const snapshotOf = (a) => JSON.stringify([a.title, a.subtitle, a.content, a.linkedSources, a.linkedInterviews, a.status,
    a.platformDrafts, a.cardNews, a.platformGeneration, a.category, a.subcategory, (a.sources || []).map((source) => source.id)]);
  const savedIdRef = useRef(null); // 가장 최근에 Core 에 저장된 기사 ID(렌더를 기다리지 않고 바로 읽는다)
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const saveNoticeTimer = useRef(null);
  // 최근 원고를 불러오지 못했을 때(로그인 문제 제외): 빈 원고를 보여 저장하지 않고, 오류와 '다시 불러오기'를 보인다(main 과 같음)
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const showSaveNotice = useCallback(() => {
    clearTimeout(saveNoticeTimer.current);
    setSaveNotice("데이터맵과 보관함에 저장되었습니다.");
    saveNoticeTimer.current = setTimeout(() => setSaveNotice(""), 2800);
  }, []);

  useEffect(() => () => clearTimeout(saveNoticeTimer.current), []);

  useEffect(() => {
    let active = true;
    loadLatestArticle(createEmptyArticle())
      .then((stored) => {
        if (!active) return;
        syncedSnapshot.current = snapshotOf(stored); // 불러온 원고는 고치기 전까지 다시 저장하지 않는다
        savedIdRef.current = stored.articleId || null;
        articleRef.current = stored;
        setArticle(stored);
        revisionNo.current = Number.isInteger(stored.revisionNo) ? stored.revisionNo : null;
        loaded.current = true;
        setIsLoaded(true);
        setStorageStatus(stored.articleId ? "암호화 저장소에서 복원됨" : "새 원고 — 저장하면 암호화 저장소에 보관됩니다");
      })
      .catch((error) => {
        if (!active) return;
        if (error.code !== "AUTH_REQUIRED") setLoadError(error?.message || "최근 원고를 불러오지 못했습니다.");
        setStorageStatus(error.code === "AUTH_REQUIRED"
          ? "로그인하면 저장된 원고를 불러옵니다."
          : `로컬 Core에 연결하지 못했습니다: ${error.message}`);
      });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (Number.isInteger(article.revisionNo)) revisionNo.current = article.revisionNo;
  }, [article.revisionNo]);

  // 자동 임시 저장을 지금 끝낸다(타이머·기사 전환·창 닫기·로그아웃 전). 겹치지 않게 한 번에 하나만 돈다.
  const flushRef = useRef(null);
  const flush = useCallback((force = false) => {
    if (autoRunning.current) return autoRunning.current;
    let followUp = false; // 저장하는 동안 바뀐 원고는 이 저장이 끝난 뒤 한 번 더 저장한다(그 사이 예약된 저장은 위에서 돌아가 버린다)
    const run = (async () => {
      const target = articleRef.current;
      const snapshot = snapshotOf(target);
      const unchanged = snapshot === syncedSnapshot.current && !(force === true && !savedIdRef.current);
      if (!loaded.current || isRestoring() || unchanged) return;
      clearTimeout(retryTimer.current);
      if (!signedInRef.current) {
        // 로그인 전에는 Core 저장소를 열 수 없다 — 타이핑 중 로그인 창이 뜨지 않게 건너뛰고, 로그인하면 이어서 저장한다.
        setStorageStatus("로그인하면 자동으로 저장됩니다.");
        return;
      }
      setStorageStatus("임시 저장 중…");
      try {
        const saved = await saveArticle(target, undefined, { kind: "auto" });
        revisionNo.current = saved.revisionNo;
        savedIdRef.current = saved.articleId;
        syncedSnapshot.current = snapshot;
        articleRef.current = { ...articleRef.current, id: saved.articleId, articleId: saved.articleId, revisionNo: saved.revisionNo };
        setArticle((current) => ({ ...current, id: saved.articleId, articleId: saved.articleId, revisionNo: saved.revisionNo }));
        const caughtUp = snapshotOf(articleRef.current) === snapshot;
        setUnsynced(!caughtUp);
        followUp = !caughtUp;
        if (caughtUp) void clearBackup(); // Core 에 최신 원고까지 들어갔다 → 이 PC 백업은 필요 없다
        setStorageStatus("임시 저장됨");
      } catch (error) {
        setStorageStatus(`임시 저장 실패: ${error.message}`);
        // 입력이 멈춘 뒤에도 Core 가 돌아오면 이어서 저장되도록 다시 시도한다.
        retryTimer.current = setTimeout(() => void flushRef.current?.(), 8000);
      }
    })().finally(() => {
      autoRunning.current = null;
      if (followUp) void flushRef.current?.();
    });
    autoRunning.current = run;
    return run;
  }, []);
  flushRef.current = flush;

  // 원고가 바뀌고 1.5초 멈추면 임시 저장한다(저장 버튼 없이도 작업본이 남는다).
  useEffect(() => {
    if (!loaded.current) return undefined;
    const dirty = snapshotOf(article) !== syncedSnapshot.current;
    setUnsynced(dirty);
    if (!dirty) return undefined;
    setStorageStatus("임시 저장 대기…");
    const timer = setTimeout(() => { void flush(); }, 1500);
    return () => clearTimeout(timer);
    // 저장 대상 필드가 바뀔 때만(articleId·revisionNo 같은 저장 결과로는 다시 저장하지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.title, article.subtitle, article.content, article.linkedSources, article.linkedInterviews, article.status,
    article.platformDrafts, article.cardNews, article.platformGeneration, article.category, article.subcategory, article.sources, flush]);

  // 강제 종료·Core 저장 실패에 대비해, 바뀐 원고를 0.3초 뒤 이 PC 에 암호화해 둔다(계정·키를 알 때만).
  useEffect(() => {
    if (!loaded.current || snapshotOf(article) === syncedSnapshot.current) return undefined;
    const timer = setTimeout(() => void writeBackup(articleRef.current), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.title, article.subtitle, article.content, article.linkedSources, article.linkedInterviews, article.status,
    article.platformDrafts, article.cardNews, article.platformGeneration, article.category, article.subcategory, article.sources]);

  // 창을 닫거나 화면이 숨겨질 때, 저장되지 않은 변경이 있으면 지금 저장한다.
  useEffect(() => {
    if (!unsynced) return undefined;
    const beforeUnload = (event) => {
      if (isRestoring()) return;
      void flush();
      event.preventDefault();
      event.returnValue = "";
    };
    const saveWhenHidden = () => { if (document.visibilityState === "hidden" && !isRestoring()) void flush(); };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [unsynced, flush]);

  // update: 저장 직전에 원고를 고친다(인터뷰 화면의 '저장하기'가 녹취를 이 기사에 연결하고 바로 저장)
  const persistArticle = useCallback(async (update, options = {}) => {
    if (isRestoring()) return false;
    if (!loaded.current) {
      setStorageStatus("Core 연결이 준비된 뒤 저장할 수 있습니다.");
      return false;
    }
    await autoRunning.current; // 진행 중인 임시 저장이 끝난 뒤에 저장해 충돌 검사 번호가 어긋나지 않게 한다
    setStorageStatus("암호화 저장소에 저장 중…");
    const target = typeof update === "function" ? update(article) : article;
    if (target !== article) { articleRef.current = target; setArticle(target); }
    try {
      const saved = await saveArticle(target, revisionNo.current, { kind: "manual" });
      revisionNo.current = saved.revisionNo;
      savedIdRef.current = saved.articleId;
      articleRef.current = { ...articleRef.current, id: saved.articleId, articleId: saved.articleId, revisionNo: saved.revisionNo };
      syncedSnapshot.current = snapshotOf(target);
      const caughtUp = snapshotOf(articleRef.current) === syncedSnapshot.current;
      setUnsynced(!caughtUp);
      if (caughtUp) void clearBackup();
      setArticle((current) => ({ ...current, id: saved.articleId, articleId: saved.articleId, revisionNo: saved.revisionNo }));
      const interviewName = options?.source?.filename || (typeof options === "string" ? options : null);
      if (interviewName) {
        setStorageStatus(`저장됨 · 녹취 [${interviewName}] (${saved.revisionNo}번째 이력)`);
      } else {
        setStorageStatus(`저장됨 · ${saved.revisionNo}번째 이력`);
      }
      showSaveNotice();
      return true;
    } catch (error) {
      setStorageStatus(`저장 실패: ${error.message}`);
      return false;
    }
  }, [article, showSaveNotice]);

  // Ctrl+S(Mac 은 Cmd+S): 브라우저 저장 창 대신 저장 버튼과 같은 수동 저장(새 버전)
  const persistRef = useRef(persistArticle);
  persistRef.current = persistArticle;
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persistRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 스튜디오가 쓰는 flush: 진행 중인 임시 저장을 끝내고, 아직 저장된 적 없는 기사는 한 번 저장해 articleId 를 돌려준다.
  const flushForStudio = useCallback(async () => {
    await autoRunning.current;
    await flush(true);
    await autoRunning.current;
    if (!savedIdRef.current) throw new Error("기사를 저장하지 못했습니다. 화면 위쪽의 저장 상태를 확인해 주세요.");
    return savedIdRef.current;
  }, [flush]);

  // 다른 저장 기사로 전환: 현재 원고를 저장한 뒤 그 기사를 불러온다.
  // 다른 기사로 넘어가기 전에 지금 원고를 저장한다. 저장이 실패하면 넘어가지 않는다(flush 는 실패를 상태 문구로만 알린다).
  const saveBeforeSwitch = useCallback(async () => {
    await autoRunning.current;
    await flush();
    await autoRunning.current;
    if (loaded.current && snapshotOf(articleRef.current) !== syncedSnapshot.current) {
      throw new Error("현재 원고를 저장하지 못했습니다. 현재 원고는 유지됩니다.");
    }
  }, [flush]);

  // 오늘의 데스크 "+ 새 기사": 지금 원고를 저장한 뒤 빈 원고로 시작한다.
  const startNewArticle = useCallback(async () => {
    setSwitchError("");
    try {
      await saveBeforeSwitch();
    } catch (error) {
      setSwitchError(`새 기사로 바꾸지 못했습니다. ${error.message}`);
      return;
    }
    const empty = createEmptyArticle();
    syncedSnapshot.current = snapshotOf(empty);
    savedIdRef.current = null;
    revisionNo.current = null;
    await clearBackup();
    setArticle(empty);
    setStorageStatus("새 원고 — 저장하면 암호화 저장소에 보관됩니다");
    setActiveTab("writer");
  }, [saveBeforeSwitch]);

  const changeArticle = useCallback(async (id, nextTab) => {
    setSwitching(true);
    setSwitchError("");
    try {
      await saveBeforeSwitch();
      const next = await loadArticleById(id, createEmptyArticle());
      syncedSnapshot.current = snapshotOf(next);
      savedIdRef.current = next.articleId || null;
      revisionNo.current = Number.isInteger(next.revisionNo) ? next.revisionNo : null;
      setArticle(next);
      setStorageStatus("저장된 기사를 불러왔습니다.");
      if (nextTab) setActiveTab(nextTab);
    } catch (error) {
      setSwitchError(`기사 조회 실패: ${error?.message || error}`);
      throw error; // 기사 적용(콘텐츠 변환)이 실패를 알아야 멈추지 않는다. 보관함 호출은 아래에서 잡는다
    } finally {
      setSwitching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveBeforeSwitch]);

  // 보관함(main): 저장된 기사 목록을 읽어 와 지금 편집 중인 기사는 화면의 값으로 보인다.
  const [storedArticles, setStoredArticles] = useState([]);
  const [listError, setListError] = useState("");
  const [mapArticleId, setMapArticleId] = useState(null);
  const [archiveVersion, setArchiveVersion] = useState(0); // 휴지통에서 되살리면 목록을 다시 읽는다
  const [archiveFilter, setArchiveFilter] = useState(null);
  useEffect(() => {
    if (activeTab !== "archive") return undefined;
    let active = true;
    core.listArticles().then(({ articles }) => {
      if (!active) return;
      setStoredArticles(articles.map((item) => ({ ...item, id: item.id.replaceAll("-", "") })));
      setListError("");
    }).catch((error) => { if (active) setListError(error.message); });
    return () => { active = false; };
  }, [activeTab, storageStatus, archiveVersion]);
  const currentId = article.articleId || article.id;
  const storedCurrent = storedArticles.find((item) => item.id === currentId);
  const currentSummary = { ...storedCurrent, id: currentId, title: article.title, subtitle: article.subtitle,
    state: storedCurrent?.state || "draft", published: storedCurrent?.published || null,
    updated_at: storedCurrent?.updated_at || article.updatedAt };
  // 아직 저장 안 한 빈 새 원고는 보관함에 넣지 않는다(삭제한 기사가 남은 것처럼 보였다)
  const blankDraft = !article.title?.trim() && !article.content?.trim();
  const archiveArticles = storedCurrent ? storedArticles.map((item) => item.id === currentId ? currentSummary : item)
    : blankDraft ? storedArticles : [currentSummary, ...storedArticles];
  // 보관함의 휴지통 버튼·선택 삭제 — 기사를 지운다. 지금 쓰던 기사면 새 기사로 바꾼다(남은 백업도 지운다)
  const deleteArticles = async (ids) => {
    const target = archiveArticles.find((item) => item.id === ids[0]);
    const name = ids.length === 1 ? `'${target?.title || "제목 없는 기사"}' 기사를` : `선택한 기사 ${ids.length}건을`;
    if (!window.confirm(`${name} 보관함에서 삭제할까요?
휴지통으로 옮기고 30일 뒤 이력·송고본·고정본까지 영구 삭제합니다. 그 전에는 보관함 > 휴지통에서 되살릴 수 있습니다.`)) return [];
    setSwitchError("");
    const deleted = [];
    for (const id of ids) {
      try {
        await core.deleteArticle(id);
        deleted.push(id);
      } catch (error) {
        setSwitchError(`기사를 삭제하지 못했습니다(${deleted.length}/${ids.length}건 삭제). ${error.message}`);
        break;
      }
    }
    if (deleted.includes(currentId)) {
      const empty = createEmptyArticle();
      syncedSnapshot.current = snapshotOf(empty);
      savedIdRef.current = null;
      revisionNo.current = null;
      await clearBackup();
      setArticle(empty);
    }
    setStoredArticles((list) => list.filter((item) => !deleted.includes(item.id)));
    return deleted;
  };

  const studioArticle = useMemo(() => toStudioArticle(article), [article]);
  const setStudioArticle = useCallback((update) => setArticle((previous) => {
    const next = typeof update === "function" ? update(toStudioArticle(previous)) : update;
    return mergeStudioArticle(previous, next);
  }), []);

  // 송고: ① 수동 저장으로 ID·최신 원고 확보 ② CMS 로 전송 ③ 성공하면 Core 에 송고본을 남긴다.
  // CMS 전송이 실패하면 송고본은 바뀌지 않고 오류를 던진다(화면은 "발행 완료"로 바꾸지 않는다).
  const handlePublish = useCallback(async () => {
    if (isRestoring()) throw new Error("백업을 복구하는 중입니다.");
    const saved = await persistArticle();
    if (!saved) throw new Error("먼저 저장에 성공해야 송고할 수 있어요. 화면 위쪽의 저장 상태를 확인해 주세요.");
    const target = articleRef.current;
    const receipt = await publishCms(target);
    const result = await publishDraft({ ...target, cmsReceipt: receipt }, target.articleId);
    revisionNo.current = result.revisionNo ?? revisionNo.current;
    const next = { ...target, articleId: result.articleId || target.articleId, status: "송고됨", cmsReceipt: receipt };
    syncedSnapshot.current = snapshotOf(next); // 송고로 이미 저장됐다 — 상태 글자 변경을 다시 자동 저장하지 않는다
    setArticle((current) => ({ ...current, ...next, revisionNo: revisionNo.current }));
    setStorageStatus("송고 완료");
    return receipt;
  }, [persistArticle]);

  // Sidebar collapse state (기본 상태: 세로로 긴 Slim Sidebar 접힘 상태)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // 팩트체크는 main 흐름: 취재자료를 기사에 등록하면 글이 멈출 때마다 자동으로 검증한다(ArticleWriter 의 useFactCheck).
  // 여기서는 "팩트체크 패널을 열어 달라"는 요청 횟수만 들고 있다(데스크의 '근거 확인' 등에서 누를 때마다 다시 열린다).
  const [factCheckRequest, setFactCheckRequest] = useState(0);

  // Quick Source Search Modal inside Article Writer
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Right side tools tab collapse state
  const [isToolsCollapsed, setIsToolsCollapsed] = useState(false);

  // Authentication screen view state: null | 'login' | 'signup'
  const [authView, setAuthView] = useState(() => readRoute().auth);
  const [reporterName, setReporterName] = useState("김동아 기자");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Core 세션: 토큰은 Core 안에만 있고 화면은 로그인 여부와 이메일만 안다.
  const [session, setSession] = useState(null);
  signedInRef.current = Boolean(session?.signedIn);
  const applySession = useCallback((nextSession) => {
    setSession(nextSession);
    setIsLoggedIn(Boolean(nextSession?.signedIn));
    if (nextSession?.signedIn && nextSession.email) setReporterName(nextSession.email);
  }, []);

  // 로그인하지 않았으면(세션을 확인한 뒤) 작업 화면 대신 로그인 화면이 첫 화면이다. 프로필 메뉴의 "로그인 화면 열기"와 같은 화면이며,
  // 로그인 전에는 닫을 수 없다(계정마다 자기 자료만 본다 — main #43 규칙). 세션을 아직 모르면(null) 열지 않는다.
  const loginPage = authView || (session && !session.signedIn ? "login" : null);

  useEffect(() => {
    const syncRoute = () => {
      const route = readRoute();
      setActiveTabState(route.page);
      setAuthView(route.auth);
      writeTab(route.page);
    };
    const initialRoute = readRoute();
    const route = initialRoute.auth || initialRoute.page;
    if (globalThis.location?.hash !== `#${route}`) {
      globalThis.history?.replaceState({ newsroomRoute: route }, "", `#${route}`);
    } else if (!globalThis.history?.state?.newsroomRoute) {
      globalThis.history?.replaceState({ newsroomRoute: route }, "", globalThis.location.href);
    }
    globalThis.addEventListener?.("popstate", syncRoute);
    globalThis.addEventListener?.("hashchange", syncRoute);
    return () => {
      globalThis.removeEventListener?.("popstate", syncRoute);
      globalThis.removeEventListener?.("hashchange", syncRoute);
    };
  }, []);

  const openAuth = useCallback((mode) => {
    if (mode !== "login" && mode !== "signup") return;
    setAuthView(mode);
    if (globalThis.location?.hash !== `#${mode}`) {
      globalThis.history?.pushState({ newsroomRoute: mode, newsroomPushed: true }, "", `#${mode}`);
    }
  }, []);
  const closeAuth = () => {
    const route = globalThis.location?.hash?.slice(1);
    if (route === authView && globalThis.history?.state?.newsroomPushed) globalThis.history.back();
    else {
      setAuthView(null);
      globalThis.history?.replaceState({ newsroomRoute: activeTab }, "", `#${activeTab}`);
    }
  };

  useEffect(() => {
    getSession().then(applySession).catch(() => {});
  }, [applySession]);

  // 변환·배포는 저장된 기사(ID)를 기준으로 고정본을 만든다. 아직 저장된 적 없는 기사는 이 탭에 들어올 때 한 번 저장한다.
  useEffect(() => {
    if (activeTab === "convert" && isLoaded && signedInRef.current && !savedIdRef.current) void flush(true);
  }, [activeTab, isLoaded, session?.signedIn, flush]);

  // 로그인하면(또는 세션이 복원되면) 로그인 전에 쌓인 변경을 바로 임시 저장한다.
  useEffect(() => {
    if (session?.signedIn) void flush();
  }, [session?.signedIn, flush]);

  // 작업 중 원고 백업은 계정마다 따로 두고, 키는 Core 가 계정에서 파생해 준다.
  const backupOwner = session?.userId || "";
  setBackupOwner(backupOwner); // 렌더 중에 먼저 정해 둔다
  useEffect(() => {
    if (backupOwner) getBackupKey().then(({ key }) => setBackupKey(key, backupOwner)).catch(() => {});
  }, [backupOwner]);

  // 앱을 열었을 때 Core 에 저장된 원고보다 새로운 백업이 남아 있으면 그것으로 이어서 작업한다(곧바로 Core 에 임시 저장된다).
  useEffect(() => {
    if (!isLoaded || !backupOwner || backupChecked.current) return;
    backupChecked.current = true;
    readBackup().then(async (backup) => {
      if (!backup) return;
      if (sameDraft(backup.article, articleRef.current)) {
        void clearBackup();
        return;
      }
      // 휴지통으로 옮긴 기사의 백업은 되살리지 않는다 — 되살리면 보관함에 지울 수 없는 '저장 전' 기사로 남고 저장도 ARTICLE_DELETED 로 막힌다
      const backupId = backup.article?.articleId;
      if (backupId && backupId !== articleRef.current.articleId
        && await core.getArticle(backupId).then(() => false, (error) => error.status === 404)) {
        void clearBackup();
        return;
      }
      setArticle({ ...articleRef.current, ...backup.article });
      setStorageStatus("저장되지 않았던 작업본을 이 PC의 백업에서 복구했습니다.");
    });
  }, [isLoaded, backupOwner]);

  // Core가 AUTH_REQUIRED 로 답하면 로그인 창을 겹쳐 열고, 로그인하면 멈췄던 요청을 이어 간다.
  const [gateOpen, setGateOpen] = useState(false);
  const gateWaiters = useRef([]);
  useEffect(() => {
    setLoginHandler(() => new Promise((resolve) => {
      gateWaiters.current.push(resolve);
      setGateOpen(true);
    }));
    return () => setLoginHandler(null);
  }, []);
  const closeGate = (ok) => {
    setGateOpen(false);
    gateWaiters.current.splice(0).forEach((resolve) => resolve(ok));
  };
  const handleLoginSuccess = (session) => {
    applySession(session);
    setAuthView(null);
    setActiveTab("desk");
    globalThis.history?.replaceState({ newsroomRoute: "desk" }, "", "#desk");
    closeGate(true);
  };
  const handleLogout = async () => {
    await flush(); // 로그아웃하기 전에 저장되지 않은 변경을 임시 저장한다
    try { await signOut(); } catch { /* 이미 만료됐어도 화면 상태는 로그아웃으로 */ }
    // 앞 사용자의 원고가 화면에 남지 않게 새로고침한다 → 로그인 전에는 닫을 수 없는 로그인 창이 뜬다(main #43 규칙)
    globalThis.location?.reload();
  };

  const handleRunFactCheck = () => {
    setFactCheckRequest((count) => count + 1);
    setActiveTab("writer");
  };

  const handleConnectSource = (source) => {
    const citation = `\n\n[출처 참고: ${source.title} (${source.category})]`;
    setArticle((prev) => ({
      ...prev,
      content: prev.content + citation,
      linkedSources: Array.from(new Set([...prev.linkedSources, source.id]))
    }));
    setShowSearchModal(false);
    alert(`"${source.title}" 자료가 작성 기사의 출처로 연결되었습니다.`);
  };

  // 오늘의 데스크: "최근 활동"에 쓸 저장 기사 목록(실제 저장본). 데스크를 열 때마다 새로 읽는다.
  const [deskArticles, setDeskArticles] = useState([]);
  useEffect(() => {
    if (activeTab !== "desk") return undefined;
    let active = true;
    listStoredArticles().then((list) => active && setDeskArticles(list)).catch(() => {});
    return () => { active = false; };
  }, [activeTab]);

  // 데스크 일정의 "다음 작업" 이동. evidence 는 기사 작성 화면을 팩트체크·근거자료 패널이 열린 채로 연다.
  const handleDeskNavigate = (to) => {
    if (to === "evidence") handleRunFactCheck();
    else setActiveTab(to);
  };
  const handleDeskArchive = (filter) => {
    setArchiveFilter({ ...filter, requestId: crypto.randomUUID() });
    setActiveTab("archive");
  };
  // 데스크에서 고른 기사를 연다(지금 쓰는 기사면 전환 없이). evidence 면 근거자료 서랍까지 연다
  const handleDeskOpen = async (id, to) => {
    if (id !== (article.articleId || article.id)) await changeArticle(id, "writer").catch(() => {});
    handleDeskNavigate(to);
  };

  // 녹취를 기사에 연결해 둔다(저장하면 기사와 함께 Core에 보관되고 보관함·데이터맵이 이 기사 ID로 찾는다).
  const linkInterview = (prev, source) => {
    const linked = prev.linkedInterviews || [];
    if (!source?.id || linked.some((item) => (item?.id || item) === source.id)) return prev;
    return { ...prev, linkedInterviews: [...linked, { id: source.id, filename: source.filename || "" }] };
  };
  const handleReturnFromInterview = (editedTranscript, source) => {
    if (editedTranscript) {
      const interviewQuote = `\n\n[인터뷰 발췌 녹취: ${editedTranscript.slice(0, 80)}...]`;
      setArticle((prev) => ({ ...linkInterview(prev, source), content: prev.content + interviewQuote }));
    }
    setActiveTab("writer");
  };

  const [isReaderPreview, setIsReaderPreview] = useState(false);
  const [isPhotoEditing, setIsPhotoEditing] = useState(false);

  return (
    <div className={`newsroom-app min-h-screen flex flex-col font-sans selection:bg-[#8ECAE6]/40 selection:text-slate-900 text-[#292929] relative overflow-x-hidden ${isReaderPreview ? "bg-white" : "bg-transparent"}`}>
      {/* ──────────────────────────────────────────────────────────
          Soft Ambient Gradient Background Layer (콘텐츠 뒤 고정 앰비언트 레이어)
          - 상단 Soft Blue (rgba(190, 220, 255, 0.25))
          - 중앙 거의 흰색에 가까운 부드러운 transition
          - 하단 Soft Lavender (rgba(215, 200, 255, 0.22))
          - transition-all duration-700으로 화면 전환 시 부드러운 빛의 블렌딩 효과
          - 독자 화면 미리보기 시에는 순수 흰색(#FFFFFF)으로 전환
         ────────────────────────────────────────────────────────── */}
      <div
        className="fixed inset-0 pointer-events-none -z-10 transition-all duration-700 ease-out"
        style={{
          background: isReaderPreview ? "#FFFFFF" : getAmbientGradient(activeTab, factCheckRequest > 0),
        }}
      />

      {/* 1. Top Header (사진 편집 모드 및 로그인 화면 시에만 숨김 처리) */}
      {!isPhotoEditing && !loginPage && (
        <Header
          currentArticleTitle={article.title}
          status={article.status}
          reporterName={reporterName}
          isLoggedIn={isLoggedIn}
          setIsLoggedIn={setIsLoggedIn}
          onOpenAuth={openAuth}
          onLogout={handleLogout}
          onSave={() => persistArticle()}
          onArchive={async () => {
            const saved = await persistArticle();
            if (saved) setActiveTab("archive");
            return saved;
          }}
          storageStatus={storageStatus}
          switching={switching}
          session={session}
          applySession={applySession}
        />
      )}

      {/* 2. Main Workspace Layout 또는 로그인/회원가입 화면 (앰비언트 그라데이션 배경 유지) */}
      {loginPage ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[calc(100vh-80px)] z-20">
          <LoginScreen
            initialMode={loginPage}
            required={!session?.signedIn}
            onClose={closeAuth}
            onLoginSuccess={handleLoginSuccess}
          />
        </div>
      ) : (
        <div className={`newsroom-workspace flex flex-1 w-full relative min-h-[calc(100vh-70px)] ${isPhotoEditing ? "p-0" : "pl-6 md:pl-8 pr-5 md:pr-7 py-2.5 gap-4 md:gap-6"} items-start ${isReaderPreview ? "pt-5" : ""}`}>
          {/* Left Sidebar attached to edge (사진 편집 화면 시 숨김) */}
          {!isPhotoEditing && (
            <Sidebar
              isCollapsed={isSidebarCollapsed}
              setIsCollapsed={setIsSidebarCollapsed}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          )}

          {/* Main Content Workspace (우측 여백 없이 전체 너비 자연스럽게 채움) */}
          <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 z-20 relative mr-0 ${activeTab === "map" ? "h-[calc(100vh-90px)] min-h-0" : ""}`}>

            {!isLoaded && loadError ? (
              <div role="alert" className="py-24 text-center text-sm text-red-700">
                <p>{loadError}</p>
                <button type="button" onClick={() => { setLoadError(""); setLoadAttempt((attempt) => attempt + 1); }} className="mt-4 rounded-full border px-4 py-2 cursor-pointer">다시 불러오기</button>
              </div>
            ) : (
              <>
                {/* STT 인터뷰 전사 & AI 요약: 다른 메뉴를 다녀와도 작업 상태(음성, 전사, 메모, 검색 등) 보존 */}
                {(hasVisitedInterview || activeTab === "interview") && (
                  <main className={`flex-1 pt-0 pb-7 px-5 md:px-10 min-w-0 transition-all z-20 ${activeTab === "interview" ? "" : "hidden"}`}>
                    <InterviewStudio
                      key={`interview-${session?.userId || "signed-out"}`}
                      accountId={session?.userId || ""}
                      onReturnToArticle={handleReturnFromInterview}
                      onSave={(source) => persistArticle((prev) => linkInterview(prev, source), { source })}
                    />
                  </main>
                )}

                {activeTab === "writer" || activeTab === "publish" || activeTab === "factcheck" ? (
                  <ArticleWriter
                    article={article}
                    setArticle={setArticle}
                    onOpenSearch={() => setShowSearchModal(true)}
                    onRunFactCheck={handleRunFactCheck}
                    factCheckRequest={factCheckRequest}
                    onPublish={handlePublish}
                    onModels={() => setActiveTab("settings")}
                    flush={flushForStudio}
                    isToolsCollapsed={isToolsCollapsed}
                    setIsToolsCollapsed={setIsToolsCollapsed}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onConnectSource={handleConnectSource}
                    onSave={() => persistArticle()}
                    onArchive={async () => {
                      const saved = await persistArticle();
                      if (saved) setActiveTab("archive");
                      return saved;
                    }}
                    isReaderPreview={isReaderPreview}
                    setIsReaderPreview={setIsReaderPreview}
                    isPhotoEditing={isPhotoEditing}
                    setIsPhotoEditing={setIsPhotoEditing}
                  />
                ) : activeTab === "interview" ? null : activeTab === "desk" ? (
                  <main className="flex-1 min-w-0 transition-all z-20 pt-0 pb-6 px-5 md:px-10">
                    {switchError && <div role="alert" className="workspace-global-error">{switchError}</div>}
                    <DeskView articles={deskArticles} onNavigate={handleDeskNavigate} onOpen={handleDeskOpen} onNewArticle={startNewArticle} onArchive={handleDeskArchive} busy={switching} />
                  </main>
            ) : activeTab === "map" ? (
              <main className="flex min-h-0 flex-1 min-w-0 flex-col transition-all z-20 pt-0 pb-0 px-5 md:px-10">
                <PageHeader page="map" />
                <DataMapView articleId={mapArticleId || article.articleId} />
              </main>
            ) : activeTab === "archive" ? (
              <main className="flex-1 min-w-0 transition-all z-20 pt-0 pb-6 px-5 md:px-10">
                <PageHeader page="archive" />
                {listError && <div role="alert" className="workspace-global-error">저장된 기사 목록을 불러오지 못했습니다. {listError}</div>}
                {switchError && <div role="alert" className="workspace-global-error">{switchError}</div>}
                <ArchiveView article={article} articles={archiveArticles} dashboardFilter={archiveFilter} onOpen={(id) => changeArticle(id, "writer").catch(() => {})} onDelete={deleteArticles} onRestored={() => setArchiveVersion((n) => n + 1)}
                  onMap={(id) => { setActiveTab("map"); setMapArticleId(id === currentId ? null : id); }} busy={switching} />
              </main>
            ) : activeTab === "settings" ? (
              <main className="flex-1 min-w-0 transition-all z-20 pt-0 pb-6 px-4 md:px-8">
                <SettingsView onReturnToArticle={() => setActiveTab("writer")} session={session} onSession={applySession} />
              </main>
            ) : activeTab === "convert" ? (
              <main className="flex-1 min-w-0 transition-all z-20 pt-0 pb-8 px-5 md:px-10">
                <PlatformStudio
                  key={article.articleId || "unsaved"}
                  article={studioArticle}
                  setArticle={setStudioArticle}
                  flush={flushForStudio}
                  onApplyArticle={(id) => changeArticle(id, "convert")}
                  onOpenArticles={() => setActiveTab("archive")}
                  onEditArticle={() => setActiveTab("writer")}
                  onSave={() => persistArticle()}
                  sourceLoading={switching}
                  sourceError={switchError}
                />
              </main>
            ) : (
              <main className="main-warm-container flex-1 pt-0 pb-7 px-5 md:px-10 min-w-0 transition-all z-20">
                {activeTab === "search" && (
                  <SourceSearch onConnectToArticle={handleConnectSource} />
                )}
              </main>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 인증이 필요한 요청이 멈췄을 때(예: 작업 중 세션 만료): 작업 화면을 유지한 채 로그인 창만 겹쳐 연다. 로그인 화면이 이미 떠 있으면 열지 않는다 */}
      {gateOpen && !loginPage && (
        <div className="login-overlay fixed inset-0 z-[100] flex items-center justify-center p-6 overflow-auto bg-slate-900/30 backdrop-blur-sm">
          <LoginScreen initialMode="login" required={!session?.signedIn} onClose={() => closeGate(false)} onLoginSuccess={handleLoginSuccess} />
        </div>
      )}

      {saveNotice && (
        <div
          role="status"
          data-testid="save-notice"
          className="fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-full border border-emerald-200 bg-white/95 px-5 py-2.5 text-xs font-bold text-emerald-800 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          {saveNotice}
        </div>
      )}

      {/* Quick Source Search Modal during Writing */}
      {showSearchModal && (
        <SourceSearch
          isModal={true}
          onClose={() => setShowSearchModal(false)}
          onConnectToArticle={handleConnectSource}
        />
      )}
    </div>
  );
}
