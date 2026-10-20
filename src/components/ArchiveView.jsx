import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore, FileAudio, FileImage, FileText, Folder,
  FolderPlus, Grid2X2, Image, Inbox, LayoutGrid, List, Newspaper, Search,
  Share2, Star, Tag, Trash2, X
} from "lucide-react";
import { core } from "../api/core";
import { formatArticleTime } from "../data/article";
import { textWithoutPhotos } from "../lib/photoMarks.js";
import ShareDialog from "./ShareDialog";
import SharedInboxDialog from "./SharedInboxDialog";

const META_KEY = "ai-newsroom.archive-explorer.meta.v1";
const PREF_KEY = "ai-newsroom.archive-explorer.preferences.v1";
const DEFAULT_META = { favorites: [], folders: [], folderItems: {}, tagDefinitions: [], tags: {}, aliases: {}, trashed: [] };
const isMissingLibraryRoute = (error) => error?.status === 404;
const TYPE_LABEL = { article: "기사", source: "취재 자료", note: "Markdown", audio: "음성·녹취", photo: "사진", card: "카드뉴스", export: "내보낸 파일" };
const STATUS_LABEL = { draft: "작업 중", editing: "송고 후 수정", published: "송고 완료", review: "검토 필요" };
const TYPE_ICON = { article: Newspaper, source: FileText, note: FileText, audio: FileAudio, photo: FileImage, card: Image, export: FileText };

const readLocal = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") }; } catch { return fallback; }
};
const writeLocal = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};
const normalizedId = (value) => String(value || "").replaceAll("-", "");
const articleStatus = (item) => STATUS_LABEL[item?.state] || "작업 중";
const articleOwner = (draft) => draft?.reporterName || draft?.owner || "김동아 기자";
const dateValue = (value) => {
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};
const isWithinDays = (value, days) => dateValue(value) >= Date.now() - days * 86400000;
const isToday = (value) => new Date(value).toDateString() === new Date().toDateString();
const safeText = (value) => String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const hasMetaContent = (value) => value && (value.favorites?.length || value.folders?.length || value.tagDefinitions?.length || value.trashed?.length
  || Object.keys(value.folderItems || {}).length || Object.keys(value.tags || {}).length || Object.keys(value.aliases || {}).length);

function createLibraryItems(articles, drafts, currentArticle, storedSources, storedTranscripts, storedKnowledge) {
  const items = [];
  const related = new Map();
  const addRelated = (item, articleId, articleTitle) => {
    const key = item.key;
    const existing = related.get(key);
    if (existing) {
      existing.articleIds.push(articleId);
      existing.articleTitles.push(articleTitle);
      return;
    }
    item.articleIds = [articleId];
    item.articleTitles = [articleTitle];
    related.set(key, item);
  };

  articles.forEach((summary) => {
    const articleId = normalizedId(summary.id || summary.articleId || summary.article_id);
    const draft = drafts[articleId] || (normalizedId(currentArticle?.articleId || currentArticle?.id) === articleId ? currentArticle : null);
    const title = draft?.title || summary.title || "제목 없는 기사";
    const updatedAt = summary.updated_at || summary.updatedAt || draft?.updatedAt || draft?.createdAt;
    const owner = articleOwner(draft);
    const sources = draft?.sources || [];
    const audio = draft?.linkedInterviews || [];
    const photos = draft?.photos || [];
    const platformDrafts = draft?.platformDrafts || {};
    items.push({
      key: `article:${articleId}`, id: articleId, articleId, type: "article", title, subtitle: draft?.subtitle || summary.subtitle || "",
      owner, updatedAt, createdAt: summary.created_at || summary.createdAt || draft?.createdAt, status: articleStatus(summary),
      state: summary.state || "draft", size: safeText(draft?.content).length, preview: safeText(textWithoutPhotos(draft?.content || summary.excerpt || "")),
      relationCount: sources.length + audio.length + photos.length + Object.keys(platformDrafts).length + (draft?.cardNews ? 1 : 0),
      sourceCount: sources.length, audioCount: audio.length, photoCount: photos.length, draft, deletable: Boolean(summary.revision_no)
    });
    sources.forEach((source, index) => addRelated({
      key: `source:${source.id || source.path || `${articleId}-${index}`}`, id: source.id || source.path || `${articleId}-${index}`,
      type: "source", title: source.name || source.filename || "이름 없는 취재 자료", owner, updatedAt: source.addedAt || updatedAt,
      status: "연결됨", size: source.size || source.chars || safeText(source.text).length, preview: safeText(source.text), source
    }, articleId, title));
    audio.forEach((entry, index) => addRelated({
      key: `audio:${entry.id || entry.filename || `${articleId}-${index}`}`, id: entry.id || entry.filename || `${articleId}-${index}`,
      type: "audio", title: entry.filename || entry.name || "이름 없는 녹취", owner, updatedAt: entry.updatedAt || updatedAt,
      status: entry.status || "전사됨", size: entry.size || 0, preview: safeText(entry.transcript || entry.text), audio: entry
    }, articleId, title));
    photos.forEach((photo, index) => addRelated({
      key: `photo:${photo.id || `${articleId}-${index}`}`, id: photo.id || `${articleId}-${index}`, type: "photo",
      title: photo.caption || photo.filename || `사진 ${index + 1}`, owner, updatedAt: photo.addedAt || updatedAt, status: "보관됨",
      size: photo.size || 0, preview: safeText(`${photo.caption || ""} ${photo.source || ""}`), thumbnail: photo.data || photo.url || "", photo
    }, articleId, title));
    if (draft?.cardNews) addRelated({
      key: `card:${articleId}`, id: articleId, type: "card", title: `${title} 카드뉴스`, owner, updatedAt,
      status: "생성됨", size: draft.cardNews.cards?.length || 0, preview: safeText(JSON.stringify(draft.cardNews)), card: draft.cardNews
    }, articleId, title);
    Object.entries(platformDrafts).forEach(([channel, platformDraft]) => addRelated({
      key: `export:${articleId}:${channel}`, id: `${articleId}:${channel}`, type: "export", title: `${title} · ${channel}`,
      owner, updatedAt, status: "변환됨", size: safeText(JSON.stringify(platformDraft)).length,
      preview: safeText(typeof platformDraft === "string" ? platformDraft : JSON.stringify(platformDraft)), channel
    }, articleId, title));
  });
  storedSources.forEach((source) => {
    const key = `source:${source.id}`;
    const usedBy = source.usedBy || [];
    const existing = related.get(key);
    if (existing) {
      existing.size = source.size || source.chars || existing.size;
      existing.updatedAt = source.createdAt || existing.updatedAt;
      existing.articleIds = [...new Set([...existing.articleIds, ...usedBy.map((entry) => normalizedId(entry.articleId))])];
      existing.articleTitles = [...new Set([...existing.articleTitles, ...usedBy.map((entry) => entry.title || "제목 없는 기사")])];
    } else {
      related.set(key, { key, id: source.id, type: "source", title: source.name || "이름 없는 취재 자료", owner: "김동아 기자",
        updatedAt: source.createdAt, status: source.index?.state === "ready" ? "색인 완료" : "보관됨", size: source.size || source.chars || 0,
        preview: safeText(`${source.format || ""} ${source.chars || 0}자`), source,
        articleIds: usedBy.map((entry) => normalizedId(entry.articleId)), articleTitles: usedBy.map((entry) => entry.title || "제목 없는 기사") });
    }
  });
  storedTranscripts.forEach((transcript) => {
    const key = `audio:${transcript.id}`;
    const existing = related.get(key);
    const transcriptText = (transcript.dialogues || []).map((dialogue) => `${dialogue.speakerName || dialogue.speaker || ""} ${dialogue.text || ""}`).join(" ");
    if (existing) {
      existing.size = transcript.bytes || existing.size;
      existing.updatedAt = transcript.createdAt || existing.updatedAt;
      existing.preview = safeText(transcriptText) || existing.preview;
      existing.audio = { ...existing.audio, ...transcript };
    } else {
      related.set(key, { key, id: transcript.id, type: "audio", title: transcript.filename || "이름 없는 녹취", owner: "김동아 기자",
        updatedAt: transcript.createdAt, status: "전사됨", size: transcript.bytes || 0, preview: safeText(transcriptText), audio: transcript,
        articleIds: [], articleTitles: [] });
    }
  });
  storedKnowledge.forEach((file) => {
    const key = `note:${file.id}`;
    related.set(key, { key, id: file.id, type: "note", title: file.title || file.path || "이름 없는 Markdown",
      owner: "김동아 기자", updatedAt: file.updated_at, status: "보관됨", size: 0,
      preview: safeText(file.path), path: file.path, role: file.role, articleIds: [], articleTitles: [] });
  });
  return [...items, ...related.values()].map((item) => ({
    ...item,
    searchText: safeText([item.title, item.subtitle, item.owner, item.status, item.preview, ...(item.articleTitles || [])].join(" ")).toLowerCase()
  }));
}

function formatSize(item) {
  if (!item.size) return "—";
  if (item.type === "article" || item.type === "source" || item.type === "export") return `${Number(item.size).toLocaleString("ko-KR")}자`;
  if (item.type === "card") return `${item.size}장`;
  return item.size >= 1048576 ? `${(item.size / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(item.size / 1024))}KB`;
}

export default function ArchiveView({ article, articles, onOpen, onMap, onDelete, onRestored, busy }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState({});
  const [storedSources, setStoredSources] = useState([]);
  const [storedTranscripts, setStoredTranscripts] = useState([]);
  const [storedKnowledge, setStoredKnowledge] = useState([]);
  const [meta, setMeta] = useState(DEFAULT_META);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [remoteLibraryAvailable, setRemoteLibraryAvailable] = useState(null);
  const [libraryError, setLibraryError] = useState("");
  const [preferences, setPreferences] = useState(() => readLocal(PREF_KEY, { view: "details", sort: "updatedAt", direction: "desc", preview: true, previewWidth: 320 }));
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [anchorKey, setAnchorKey] = useState(null);
  const [trash, setTrash] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [selectionBox, setSelectionBox] = useState(null);
  const [shareItem, setShareItem] = useState(null); // 공유 창을 연 기사
  const [inboxOpen, setInboxOpen] = useState(false);
  const explorerRef = useRef(null);
  const dragSelectionRef = useRef(null);
  const ignoreSelectionClickRef = useRef(false);
  const metaSaveRef = useRef(Promise.resolve());
  const currentId = normalizedId(article.articleId || article.id);

  useEffect(() => writeLocal(PREF_KEY, preferences), [preferences]);
  useEffect(() => {
    let active = true;
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(META_KEY) || "null"); } catch { legacy = null; }
    core.getLibraryState().then(async ({ state }) => {
      const next = hasMetaContent(state) || !hasMetaContent(legacy) ? { ...DEFAULT_META, ...state } : { ...DEFAULT_META, ...legacy };
      if (!hasMetaContent(state) && hasMetaContent(legacy)) await core.saveLibraryState(next);
      try { localStorage.removeItem(META_KEY); } catch {}
      if (active) {
        setMeta(next);
        setRemoteLibraryAvailable(true);
        setMetaLoaded(true);
        setLibraryError("");
      }
    }).catch((error) => {
      if (!active) return;
      setMeta({ ...DEFAULT_META, ...(legacy || {}) });
      setRemoteLibraryAvailable(false);
      setMetaLoaded(true);
      if (!isMissingLibraryRoute(error)) setLibraryError(error.message);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!metaLoaded || remoteLibraryAvailable === null) return;
    writeLocal(META_KEY, meta);
    if (!remoteLibraryAvailable) {
      return;
    }
    metaSaveRef.current = metaSaveRef.current
      .then(() => core.saveLibraryState(meta))
      .then(() => setLibraryError(""))
      .catch((error) => {
        if (isMissingLibraryRoute(error)) {
          writeLocal(META_KEY, meta);
          setRemoteLibraryAvailable(false);
          return;
        }
        setLibraryError(error.message);
      });
  }, [meta, metaLoaded, remoteLibraryAvailable]);
  useEffect(() => { setDrafts((previous) => ({ ...previous, [currentId]: article })); }, [article, currentId]);
  // 다른 기사 본문은 기사 목록(id)이 바뀔 때만 미리보기용으로 읽는다 — 편집 중 article 이 바뀔 때마다 모두 다시 읽지 않게
  const otherArticleIds = articles.map((item) => normalizedId(item.id)).filter((id) => id !== currentId).join(",");
  useEffect(() => {
    let active = true;
    Promise.all(otherArticleIds.split(",").filter(Boolean).map(async (id) => {
      try { return [id, (await core.previewArticle(id)).draft]; } catch { return [id, null]; }
    })).then((entries) => {
      if (!active) return;
      setDrafts((previous) => ({ ...previous, ...Object.fromEntries(entries.filter(([, value]) => value)) }));
    });
    core.listSources().then(({ sources = [] }) => active && setStoredSources(sources)).catch(() => active && setStoredSources([]));
    core.listKnowledgeFiles()
      .catch((error) => {
        if (!isMissingLibraryRoute(error)) throw error;
        return core.getKnowledgeMap();
      })
      .then(({ files = [] }) => active && setStoredKnowledge(files))
      .catch(() => active && setStoredKnowledge([]));
    core.listTranscripts().then(async ({ transcripts = [] }) => {
      const detailed = await Promise.all(transcripts.map(async (transcript) => {
        try { return { ...transcript, ...(await core.getTranscript(transcript.id)) }; } catch { return transcript; }
      }));
      if (active) setStoredTranscripts(detailed);
    }).catch(() => active && setStoredTranscripts([]));
    return () => { active = false; };
  }, [otherArticleIds]);

  const allItems = useMemo(() => createLibraryItems(articles, drafts, article, storedSources, storedTranscripts, storedKnowledge).map((item) => ({
    ...item,
    title: meta.aliases[item.key] || item.title,
    favorite: meta.favorites.includes(item.key),
    tags: meta.tags[item.key] || [],
    folderIds: meta.folderItems[item.key] || [],
    deleted: meta.trashed.includes(item.key)
  })), [articles, drafts, article, storedSources, storedTranscripts, storedKnowledge, meta]);

  const deletedArticles = useMemo(() => (trash?.items || []).map((item) => {
    const articleId = normalizedId(item.articleId);
    const title = item.title || "제목 없는 기사";
    return {
      key: `article:${articleId}`, id: articleId, articleId, type: "article", title,
      owner: "김동아 기자", updatedAt: item.deletedAt, status: "휴지통", size: 0,
      preview: `${formatArticleTime(item.purgeAt)} 영구 삭제 예정`, relationCount: 0,
      tags: [], folderIds: [], favorite: false, deleted: true, serverDeleted: true,
      searchText: title.toLowerCase(),
    };
  }), [trash]);

  const counts = useMemo(() => allItems.reduce((result, item) => {
    if (!item.deleted) {
      result.all += 1;
      result[item.type] = (result[item.type] || 0) + 1;
      if (isWithinDays(item.updatedAt, 7)) result.recent += 1;
      if (item.favorite) result.favorites += 1;
    }
    return result;
  }, { all: 0, recent: 0, favorites: 0 }), [allItems]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const candidates = scope === "trash"
      ? [...allItems.filter((item) => item.deleted), ...deletedArticles.filter((deleted) => !allItems.some((item) => item.key === deleted.key))]
      : allItems;
    const filtered = candidates.filter((item) => {
      if (scope === "trash") return !needle || `${item.searchText} ${item.tags.join(" ")}`.includes(needle);
      if (item.deleted) return false;
      if (scope === "recent" && !isWithinDays(item.updatedAt, 7)) return false;
      if (scope === "favorites" && !item.favorite) return false;
      if (scope.startsWith("type:") && item.type !== scope.slice(5)) return false;
      if (scope === "today" && !isToday(item.updatedAt)) return false;
      if (scope === "month" && !isWithinDays(item.updatedAt, 31)) return false;
      if (scope.startsWith("folder:") && !item.folderIds.includes(scope.slice(7))) return false;
      if (scope.startsWith("tag:") && !item.tags.includes(scope.slice(4))) return false;
      if (status !== "all" && item.status !== status) return false;
      return !needle || `${item.searchText} ${item.tags.join(" ")}`.includes(needle);
    });
    const direction = preferences.direction === "asc" ? 1 : -1;
    return filtered.sort((left, right) => {
      const field = preferences.sort;
      if (field === "updatedAt") return (dateValue(left.updatedAt) - dateValue(right.updatedAt)) * direction;
      if (field === "size") return ((left.size || 0) - (right.size || 0)) * direction;
      return String(left[field] || "").localeCompare(String(right[field] || ""), "ko") * direction;
    });
  }, [allItems, deletedArticles, query, scope, status, preferences]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / 20));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(() => filteredItems.slice((currentPage - 1) * 20, currentPage * 20), [filteredItems, currentPage]);

  const selected = visible.find((item) => selectedKeys.includes(item.key)) || null;
  useEffect(() => {
    const validKeys = selectedKeys.filter((key) => visible.some((item) => item.key === key));
    if (validKeys.length !== selectedKeys.length) setSelectedKeys(validKeys);
  }, [visible, selectedKeys]);

  const updateMeta = (updater) => setMeta((previous) => typeof updater === "function" ? updater(previous) : updater);
  const patchPreference = (patch) => setPreferences((previous) => ({ ...previous, ...patch }));
  const selectedItems = visible.filter((item) => selectedKeys.includes(item.key));
  const allSelectedFavorite = selectedItems.length > 0 && selectedItems.every((item) => item.favorite);
  const setFavorite = (keys, value) => updateMeta((previous) => ({ ...previous,
    favorites: value ? [...new Set([...previous.favorites, ...keys])] : previous.favorites.filter((key) => !keys.includes(key))
  }));
  const assignFolder = (keys, folderId) => updateMeta((previous) => ({ ...previous, folderItems: { ...previous.folderItems,
    ...Object.fromEntries(keys.map((key) => [key, [...new Set([...(previous.folderItems[key] || []), folderId])]]))
  } }));
  const createTag = () => {
    const value = window.prompt("새 태그 종류의 이름을 입력하세요.")?.trim();
    if (!value) return;
    if (tags.includes(value)) {
      window.alert("이미 있는 태그입니다.");
      return;
    }
    updateMeta((previous) => ({ ...previous, tagDefinitions: [...new Set([...(previous.tagDefinitions || []), value])] }));
  };
  const assignTag = (keys, value) => updateMeta((previous) => ({ ...previous, tags: { ...previous.tags,
    ...Object.fromEntries(keys.map((key) => [key, [...new Set([...(previous.tags[key] || []), value])]]))
  } }));
  const addTag = (keys) => {
    if (!tags.length) {
      window.alert("먼저 새 태그를 만들어주세요.");
      return;
    }
    const value = window.prompt(`지정할 태그 이름을 입력하세요.\n사용 가능: ${tags.join(", ")}`, tags[0])?.trim();
    if (!value) return;
    if (!tags.includes(value)) {
      window.alert("생성된 태그만 지정할 수 있습니다.");
      return;
    }
    assignTag(keys, value);
  };
  const removeTag = (keys, tagName) => updateMeta((previous) => ({ ...previous, tags: { ...previous.tags,
    ...Object.fromEntries(keys.map((key) => [key, (previous.tags[key] || []).filter((value) => value !== tagName)]))
  } }));
  const deleteTag = (tagName) => {
    if (!window.confirm(`#${tagName} 태그를 삭제할까요? 파일은 삭제되지 않습니다.`)) return;
    updateMeta((previous) => ({ ...previous,
      tagDefinitions: (previous.tagDefinitions || []).filter((value) => value !== tagName),
      tags: Object.fromEntries(Object.entries(previous.tags).map(([key, values]) => [key, values.filter((value) => value !== tagName)]))
    }));
    if (scope === `tag:${tagName}`) setScope("all");
  };
  const createFolder = () => {
    const name = window.prompt("새 폴더 이름을 입력하세요.")?.trim();
    if (!name) return;
    updateMeta((previous) => ({ ...previous, folders: [...previous.folders, { id: `folder-${Date.now()}`, name }] }));
  };
  const renameItem = (item) => {
    const name = window.prompt("표시할 이름을 입력하세요.", item.title)?.trim();
    if (!name || name === item.title) return;
    updateMeta((previous) => ({ ...previous, aliases: { ...previous.aliases, [item.key]: name } }));
  };
  const openItem = (item) => {
    const articleId = item.type === "article" ? item.articleId : item.articleIds?.[0];
    if (articleId) onOpen(articleId);
    else if (item.type === "source") void core.openSource(item.id);
  };
  const openMap = (item) => onMap?.(item.type === "article" ? item.articleId : item.articleIds?.[0]);
  const loadTrash = () => {
    setPage(1);
    setScope("trash");
    core.listTrash().then(({ articles: items }) => setTrash({ items })).catch((error) => setTrash({ error: error.message }));
  };
  const changeScope = (value) => {
    setPage(1);
    if (value === "trash") loadTrash();
    else setScope(value);
  };
  const removeItems = async (targets) => {
    if (!targets.length) return;
    const index = Math.max(0, visible.findIndex((item) => item.key === targets[0].key));
    const articleIds = [...new Set(targets.filter((item) => item.type === "article" && item.deletable).map((item) => item.articleId))];
    const virtualKeys = targets.filter((item) => item.type !== "article").map((item) => item.key);
    let deletedArticleIds = [];
    if (articleIds.length) deletedArticleIds = await onDelete(articleIds);
    if (virtualKeys.length && window.confirm(`선택한 자료 ${virtualKeys.length}건을 휴지통으로 옮길까요?`)) {
      updateMeta((previous) => ({ ...previous, trashed: [...new Set([...previous.trashed, ...virtualKeys])] }));
    }
    const removedKeys = new Set([...virtualKeys, ...targets.filter((item) => deletedArticleIds.includes(item.articleId)).map((item) => item.key)]);
    const next = visible.filter((item) => !removedKeys.has(item.key));
    setSelectedKeys(next.length ? [next[Math.min(index, next.length - 1)].key] : []);
  };
  const restoreVirtual = (key) => updateMeta((previous) => ({ ...previous, trashed: previous.trashed.filter((itemKey) => itemKey !== key) }));
  const restoreArticle = async (id) => {
    try { await core.restoreDeleted(id); } catch (error) { setTrash({ error: error.message }); return; }
    await core.listTrash().then(({ articles: items }) => setTrash({ items }));
    setSelectedKeys([]);
    onRestored?.();
  };
  const restoreItem = (item) => item.serverDeleted ? restoreArticle(item.articleId) : restoreVirtual(item.key);
  const restoreSelected = async () => {
    if (!selectedItems.length) return;
    setRestoring(true);
    const serverItems = selectedItems.filter((item) => item.serverDeleted);
    const virtualKeys = selectedItems.filter((item) => !item.serverDeleted).map((item) => item.key);
    const results = await Promise.allSettled(serverItems.map((item) => core.restoreDeleted(item.articleId)));
    const failed = results.flatMap((result, index) => result.status === "rejected" ? [serverItems[index]] : []);
    if (virtualKeys.length) {
      updateMeta((previous) => ({ ...previous, trashed: previous.trashed.filter((key) => !virtualKeys.includes(key)) }));
    }
    if (serverItems.length) {
      try {
        const { articles: items } = await core.listTrash();
        setTrash({ items, ...(failed.length ? { error: `${failed.length}개 파일을 복원하지 못했습니다.` } : {}) });
      } catch (error) {
        setTrash({ items: failed, error: error.message });
      }
    }
    setSelectedKeys(failed.map((item) => item.key));
    if (results.some((result) => result.status === "fulfilled")) onRestored?.();
    setRestoring(false);
  };

  const selectItem = (event, item) => {
    const currentIndex = visible.findIndex((entry) => entry.key === item.key);
    if (event.detail > 1) return;
    if (event.shiftKey && anchorKey) {
      const anchorIndex = visible.findIndex((entry) => entry.key === anchorKey);
      const [start, end] = [anchorIndex, currentIndex].sort((a, b) => a - b);
      setSelectedKeys(visible.slice(start, end + 1).map((entry) => entry.key));
    } else {
      setSelectedKeys((previous) => previous.includes(item.key) ? previous.filter((key) => key !== item.key) : [...previous, item.key]);
      setAnchorKey(item.key);
    }
  };
  const toggleItem = (key) => {
    setSelectedKeys((previous) => previous.includes(key) ? previous.filter((itemKey) => itemKey !== key) : [...previous, key]);
    setAnchorKey(key);
  };
  const startDragSelection = (event) => {
    if (event.button !== 0 || event.target.closest("button,input,select,textarea,[data-item-key]")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const baseKeys = event.ctrlKey || event.metaKey ? selectedKeys : [];
    dragSelectionRef.current = { startX: event.clientX, startY: event.clientY, bounds, baseKeys, scrollLeft: event.currentTarget.scrollLeft, scrollTop: event.currentTarget.scrollTop, moved: false };
    if (!baseKeys.length) setSelectedKeys([]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDragSelection = (event) => {
    const drag = dragSelectionRef.current;
    if (!drag) return;
    const left = Math.min(drag.startX, event.clientX);
    const top = Math.min(drag.startY, event.clientY);
    const right = Math.max(drag.startX, event.clientX);
    const bottom = Math.max(drag.startY, event.clientY);
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    drag.moved = true;
    setSelectionBox({ left: left - drag.bounds.left + drag.scrollLeft, top: top - drag.bounds.top + drag.scrollTop, width: right - left, height: bottom - top });
    const hitKeys = Array.from(explorerRef.current?.querySelectorAll("[data-item-key]") || []).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left <= right && rect.right >= left && rect.top <= bottom && rect.bottom >= top;
    }).map((element) => element.dataset.itemKey);
    setSelectedKeys([...new Set([...drag.baseKeys, ...hitKeys])]);
  };
  const endDragSelection = (event) => {
    const drag = dragSelectionRef.current;
    if (!drag) return;
    ignoreSelectionClickRef.current = drag.moved;
    dragSelectionRef.current = null;
    setSelectionBox(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleKeyDown = (event) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault(); setSelectedKeys(visible.map((item) => item.key));
    } else if (event.key === "Delete") {
      event.preventDefault(); void removeItems(selectedItems);
    } else if (event.key === "Enter" && selected) {
      event.preventDefault(); openItem(selected);
    } else if (event.key === "F2" && selected) {
      event.preventDefault(); renameItem(selected);
    }
  };
  const tags = [...new Set([...(meta.tagDefinitions || []), ...Object.values(meta.tags).flat()])].sort((a, b) => a.localeCompare(b, "ko"));
  const trashCount = new Set([
    ...meta.trashed,
    ...(trash?.items || []).map((item) => `article:${normalizedId(item.articleId)}`),
  ]).size;
  const scopeTitle = scope === "all" ? "모든 파일" : scope === "recent" ? "최근 사용" : scope === "favorites" ? "즐겨찾기"
    : scope === "trash" ? "휴지통" : scope.startsWith("type:") ? TYPE_LABEL[scope.slice(5)]
      : scope.startsWith("folder:") ? meta.folders.find((folder) => folder.id === scope.slice(7))?.name || "폴더"
        : scope.startsWith("tag:") ? `#${scope.slice(4)}` : scope === "today" ? "오늘" : "이번 달";

  const itemNode = (item) => {
    const Icon = TYPE_ICON[item.type] || FileText;
    const active = selectedKeys.includes(item.key);
    const common = {
      "data-item-key": item.key,
      draggable: true, onDragStart: (event) => event.dataTransfer.setData("application/x-newsroom-items", JSON.stringify(active ? selectedKeys : [item.key])),
      onClick: (event) => selectItem(event, item), onDoubleClick: () => item.deleted ? void restoreItem(item) : openItem(item), onContextMenu: (event) => {
        event.preventDefault(); if (!active) setSelectedKeys([item.key]); setContextMenu({ x: event.clientX, y: event.clientY, item });
      }
    };
    if (preferences.view === "details") return <tr key={item.key} {...common} className={active ? "selected" : ""}>
      <td className="archive-item"><input type="checkbox" data-testid="archive-check" checked={active} onClick={(event) => event.stopPropagation()} onChange={() => toggleItem(item.key)} aria-label={`${item.title} 선택`} />
        <button type="button" className="archive-item-name"><Icon size={17} /><span><strong>{item.title}</strong><small>{item.subtitle || item.articleTitles?.join(", ")}</small></span></button></td>
      <td>{TYPE_LABEL[item.type]}</td><td>{item.owner}</td><td>{formatArticleTime(item.updatedAt)}</td><td><span className="archive-state">{item.status}</span></td><td>{item.type === "article" ? item.relationCount : item.articleIds?.length || 0}</td><td>{item.tags.join(", ") || "—"}</td>
    </tr>;
    return <button type="button" key={item.key} {...common} className={`archive-file archive-item ${active ? "selected" : ""}`}>
      {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <Icon className="archive-file-icon" />}
      <strong>{item.title}</strong><small>{TYPE_LABEL[item.type]} · {formatArticleTime(item.updatedAt)}</small>
    </button>;
  };

  return <div className="archive-explorer" data-testid="archive-view" ref={explorerRef} tabIndex={-1} onKeyDown={handleKeyDown} onClick={() => { if (contextMenu) setContextMenu(null); if (tagMenuOpen) setTagMenuOpen(false); }}>
    {libraryError && <div className="workspace-global-error" role="alert">보관함 저장소와 동기화하지 못했습니다. {libraryError}</div>}
    <div className="archive-toolbar">
      <label className="archive-search"><Search size={17} /><input type="search" aria-label="보관함 전체 검색" placeholder="파일, 본문, 담당자, 태그 통합 검색" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />{query && <button type="button" aria-label="검색어 지우기" onClick={() => { setQuery(""); setPage(1); }}><X size={15} /></button>}</label>
      <div className="archive-toolbar-actions">
        <button type="button" onClick={createFolder}><FolderPlus size={16} />새 폴더</button>
        <button type="button" disabled={!selectedItems.length} onClick={() => setFavorite(selectedItems.map((item) => item.key), !allSelectedFavorite)}><Star size={16} fill={allSelectedFavorite ? "currentColor" : "none"} />{allSelectedFavorite ? "즐겨찾기 해제" : "즐겨찾기"}</button>
        <div className="archive-tag-menu" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-haspopup="menu" aria-expanded={tagMenuOpen} onClick={() => setTagMenuOpen((open) => !open)}><Tag size={16} />태그</button>
          {tagMenuOpen && <div role="menu" className="archive-tag-dropdown">
            <button type="button" data-testid="archive-create-tag" onClick={() => { createTag(); setTagMenuOpen(false); }}><Tag size={15} />새 태그</button>
            <div className="archive-tag-divider" />
            {tags.length ? tags.map((tagName) => <button type="button" role="menuitem" key={tagName} disabled={!selectedItems.length} onClick={() => { assignTag(selectedItems.map((item) => item.key), tagName); setTagMenuOpen(false); }}>#{tagName}</button>) : <p>생성된 태그가 없습니다.</p>}
          </div>}
        </div>
        {scope.startsWith("tag:") && <button type="button" onClick={() => deleteTag(scope.slice(4))}><X size={16} />현재 태그 삭제</button>}
        <button type="button" data-testid="archive-shared-inbox" onClick={() => setInboxOpen(true)}><Inbox size={16} />공유받은 항목</button>
        <button type="button" data-testid="archive-trash" aria-pressed={scope === "trash"} onClick={loadTrash}><Trash2 size={16} />휴지통 <span>{trashCount}</span></button>
        {scope === "trash" && <button type="button" data-testid="trash-restore-selected" disabled={!selectedItems.length || restoring || busy} onClick={() => void restoreSelected()}><ArchiveRestore size={16} />{restoring ? "복원 중" : "복원"}</button>}
        <button type="button" data-testid="archive-delete-selected" disabled={busy || !selectedItems.length} onClick={() => void removeItems(selectedItems)}><Trash2 size={16} />삭제</button>
      </div>
      <div className="archive-view-tools">
        <select data-testid="archive-scope" aria-label="보관함 분류" value={scope} onChange={(event) => changeScope(event.target.value)}>
          <optgroup label="빠른 접근"><option value="all">모든 파일 ({counts.all})</option><option value="recent">최근 사용 ({counts.recent})</option><option value="favorites">즐겨찾기 ({counts.favorites})</option></optgroup>
          <optgroup label="종류별">{Object.entries(TYPE_LABEL).map(([type, label]) => <option value={`type:${type}`} key={type}>{label} ({counts[type] || 0})</option>)}</optgroup>
          <optgroup label="날짜별"><option value="today">오늘 ({allItems.filter((item) => !item.deleted && isToday(item.updatedAt)).length})</option><option value="month">이번 달 ({allItems.filter((item) => !item.deleted && isWithinDays(item.updatedAt, 31)).length})</option></optgroup>
          {meta.folders.length > 0 && <optgroup label="사용자 폴더">{meta.folders.map((folder) => <option value={`folder:${folder.id}`} key={folder.id}>{folder.name} ({allItems.filter((item) => item.folderIds.includes(folder.id) && !item.deleted).length})</option>)}</optgroup>}
          {tags.length > 0 && <optgroup label="태그">{tags.map((tagName) => <option value={`tag:${tagName}`} key={tagName}>#{tagName} ({allItems.filter((item) => item.tags.includes(tagName) && !item.deleted).length})</option>)}</optgroup>}
          <optgroup label="관리"><option value="trash">휴지통 ({trashCount})</option></optgroup>
        </select>
        <select aria-label="상태 필터" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">모든 상태</option><option value="작업 중">작업 중</option><option value="검토 필요">검토 필요</option><option value="송고 완료">송고 완료</option><option value="송고 후 수정">송고 후 수정</option></select>
        <select aria-label="정렬 기준" value={preferences.sort} onChange={(event) => patchPreference({ sort: event.target.value })}><option value="updatedAt">수정일</option><option value="title">이름</option><option value="type">종류</option><option value="status">상태</option><option value="size">크기</option></select>
        <button type="button" aria-label="정렬 방향" onClick={() => patchPreference({ direction: preferences.direction === "asc" ? "desc" : "asc" })}>{preferences.direction === "asc" ? "오름차순" : "내림차순"}</button>
        {[['details', List, '자세히 보기'], ['small', Grid2X2, '작은 아이콘'], ['large', LayoutGrid, '큰 아이콘']].map(([id, Icon, label]) => <button type="button" key={id} aria-label={label} aria-pressed={preferences.view === id} onClick={() => patchPreference({ view: id })}><Icon size={16} /></button>)}
        {(query || status !== "all" || scope !== "all") && <button type="button" onClick={() => { setQuery(""); setStatus("all"); setScope("all"); setPage(1); }}>초기화</button>}
      </div>
    </div>

    <div
      className={`archive-layout ${preferences.preview ? "" : "preview-closed"}`}
      style={{ "--archive-preview-width": `${preferences.previewWidth || 320}px` }}
    >
      <main className="archive-files" data-testid={scope === "trash" ? "trash-list" : undefined}
        onPointerDown={startDragSelection} onPointerMove={moveDragSelection} onPointerUp={endDragSelection} onPointerCancel={endDragSelection}
        onClick={(event) => { if (ignoreSelectionClickRef.current) { ignoreSelectionClickRef.current = false; return; } if (event.target === event.currentTarget) setSelectedKeys([]); }}>
        {selectionBox && <div className="archive-selection-box" style={selectionBox} aria-hidden="true" />}
        <header><div><h1>{scopeTitle}</h1><span>{filteredItems.length}개 항목</span></div></header>
        {scope === "trash" && trash?.error && <p role="alert" className="workspace-global-error">{trash.error}</p>}
        {visible.length > 0 && <div className={`archive-list-window ${visible.length > 10 ? "scrollable" : ""}`}>
          {preferences.view === "details" ? <div className="archive-table-wrap"><table><thead><tr><th><input type="checkbox" data-testid="archive-select-all" aria-label="현재 페이지 전체 선택" checked={selectedKeys.length === visible.length} onChange={() => setSelectedKeys(selectedKeys.length === visible.length ? [] : visible.map((item) => item.key))} /> 이름</th><th>종류</th><th>담당자</th><th>수정일</th><th>상태</th><th>연결 자료</th><th>태그</th></tr></thead><tbody>{visible.map(itemNode)}</tbody></table></div>
            : <div className={`archive-icon-grid ${preferences.view}`}>{visible.map(itemNode)}</div>}
        </div>}
        <nav className="archive-pagination" aria-label="보관함 페이지 이동">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button>
          <span>{currentPage} / {pageCount}</span>
          <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>다음</button>
        </nav>
        {!visible.length && <div className="archive-empty"><Folder size={42} /><h2>{scopeTitle}이 비어 있습니다.</h2><p>{query ? "검색어나 필터를 바꿔보세요." : "조건에 맞는 파일이 없습니다."}</p></div>}
      </main>

      {preferences.preview && <button
        type="button"
        className="archive-preview-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="미리보기 너비 조절"
        aria-valuemin={260}
        aria-valuemax={560}
        aria-valuenow={preferences.previewWidth || 320}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.dataset.dragging = "true";
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.dataset.dragging !== "true") return;
          const bounds = event.currentTarget.parentElement.getBoundingClientRect();
          patchPreference({ previewWidth: Math.min(560, Math.max(260, bounds.right - event.clientX)) });
        }}
        onPointerUp={(event) => { event.currentTarget.dataset.dragging = "false"; }}
        onPointerCancel={(event) => { event.currentTarget.dataset.dragging = "false"; }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") patchPreference({ previewWidth: Math.min(560, (preferences.previewWidth || 320) + 20) });
          if (event.key === "ArrowRight") patchPreference({ previewWidth: Math.max(260, (preferences.previewWidth || 320) - 20) });
        }}
      />}
      {preferences.preview && <aside className="archive-preview" aria-label="선택한 자료 미리보기">
        <div className="archive-preview-top"><span>미리보기</span><button type="button" aria-label="미리보기 닫기" onClick={() => patchPreference({ preview: false })}><X size={16} /></button></div>
        {selected ? <>
          {selected.thumbnail ? <img className="archive-preview-image" src={selected.thumbnail} alt="" /> : (() => { const Icon = TYPE_ICON[selected.type]; return <div className="archive-preview-icon"><Icon size={42} /></div>; })()}
          <span className="archive-type">{TYPE_LABEL[selected.type]}</span><h2>{selected.title}</h2>{selected.subtitle && <p>{selected.subtitle}</p>}
          <dl><div><dt>담당자</dt><dd>{selected.owner}</dd></div><div><dt>수정일</dt><dd>{formatArticleTime(selected.updatedAt)}</dd></div><div><dt>상태</dt><dd>{selected.status}</dd></div><div><dt>크기</dt><dd>{formatSize(selected)}</dd></div><div><dt>연결 기사</dt><dd>{selected.type === "article" ? `${selected.relationCount}개 자료` : selected.articleTitles?.join(", ") || "—"}</dd></div></dl>
          {selected.tags.length > 0 && <div className="archive-tags">{selected.tags.map((tagName) => <span key={tagName}>#{tagName}<button type="button" aria-label={`${tagName} 태그 해제`} onClick={() => removeTag([selected.key], tagName)}><X size={11} /></button></span>)}</div>}
          <p className="archive-preview-text">{selected.preview || "미리보기 내용이 없습니다."}</p>
          {selected.deleted ? <div className="archive-preview-actions"><button type="button" data-testid="trash-restore" className="primary" disabled={busy} onClick={() => void restoreItem(selected)}><ArchiveRestore size={15} />복원</button></div>
            : <div className="archive-preview-actions"><button type="button" className="primary" onClick={() => openItem(selected)}>열기</button>{selected.type === "article" && <button type="button" data-testid="archive-share" onClick={() => setShareItem(selected)}><Share2 size={13} />공유</button>}<button type="button" onClick={() => openMap(selected)}>데이터맵</button><button type="button" className="danger" data-testid="archive-delete" disabled={busy} onClick={() => void removeItems([selected])}>삭제</button></div>}
        </> : <div className="archive-empty"><FileText size={36} /><p>자료를 선택하면 미리보기가 표시됩니다.</p></div>}
      </aside>}
      {!preferences.preview && <button type="button" className="archive-open-preview" onClick={() => patchPreference({ preview: true })}>미리보기 열기</button>}
    </div>

    {contextMenu && <div className="archive-context" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => openItem(contextMenu.item)}>열기</button><button type="button" onClick={() => setFavorite(selectedKeys, !contextMenu.item.favorite)}>{contextMenu.item.favorite ? "즐겨찾기 해제" : "즐겨찾기"}</button>
      <button type="button" onClick={() => addTag(selectedKeys)}>태그 추가</button>{contextMenu.item.tags.map((tagName) => <button type="button" key={tagName} onClick={() => removeTag(selectedKeys, tagName)}>#{tagName} 태그 해제</button>)}{meta.folders.map((folder) => <button type="button" key={folder.id} onClick={() => assignFolder(selectedKeys, folder.id)}>{folder.name} 폴더로 분류</button>)}
      {contextMenu.item.type === "article" && !contextMenu.item.deleted && <button type="button" onClick={() => { setShareItem(contextMenu.item); setContextMenu(null); }}>공유</button>}
      <button type="button" onClick={() => openMap(contextMenu.item)}>데이터맵</button><button type="button" onClick={() => renameItem(contextMenu.item)}>이름 변경</button><button type="button" className="danger" onClick={() => void removeItems(selectedItems)}>휴지통으로 이동</button>
    </div>}
    {shareItem && <ShareDialog articleId={shareItem.articleId} title={shareItem.title} onClose={() => setShareItem(null)} />}
    {inboxOpen && <SharedInboxDialog onClose={() => setInboxOpen(false)} onImported={() => onRestored?.()} />}
  </div>;
}
