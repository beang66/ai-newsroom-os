import React, { useMemo, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Hash,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { generatePlatform, suggestPlatformKeywords } from "../api/platform";

const PLATFORM_LIST = [
  { id: "instagram", label: "Instagram", badge: "피드 원고" },
  { id: "threads", label: "Threads", badge: "짧은 요약" },
  { id: "blog", label: "Blog", badge: "장문 원고" },
];

const VIEW_LABELS = {
  instagram: "Instagram",
  threads: "Threads",
  blog: "Blog",
  card_news: "카드뉴스",
};

const roleLabel = (role) =>
  role === "cover" ? "표지" : role === "closing" ? "마무리" : "본문";

function Evidence({ quotes, valid }) {
  const list = Array.isArray(quotes) ? quotes.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <details className="mt-2 rounded-xl border border-[#DDD6CB] bg-[#FAF8F5] px-3 py-2 text-[11px] text-[#6F685F]">
      <summary className="cursor-pointer font-bold text-[#57514A]">
        원문 근거 {valid === false ? "· 확인 필요" : ""}
      </summary>
      <ul className="mt-2 space-y-1.5 list-disc pl-4">
        {list.map((quote, index) => (
          <li key={index} className="leading-relaxed">{quote}</li>
        ))}
      </ul>
    </details>
  );
}

function TextArea({ label, value, onChange, rows = 4, evidence, valid }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-extrabold text-[#57514A]">{label}</label>
      <textarea
        value={value || ""}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-2xl border border-[#DDD6CB] bg-white px-4 py-3 text-sm leading-7 text-[#292929] outline-none transition focus:border-[#292929]"
      />
      <Evidence quotes={evidence} valid={valid} />
    </div>
  );
}

function draftToText(platform, draft) {
  if (!draft) return "";
  if (platform === "instagram") {
    return [
      draft.opening,
      ...(draft.paragraphs || []),
      draft.closing,
      (draft.hashtags || []).join(" "),
    ].filter(Boolean).join("\n\n");
  }
  if (platform === "threads") {
    return [draft.opening, ...(draft.paragraphs || []), draft.closing]
      .filter(Boolean)
      .join("\n\n");
  }
  if (platform === "blog") {
    return [
      draft.title,
      draft.intro,
      ...(draft.sections || []).flatMap((section) => [section.heading, section.body]),
      draft.conclusion,
    ].filter(Boolean).join("\n\n");
  }
  return "";
}

function PlatformDraftEditor({ platform, draft, onChange, onCopy, copied }) {
  if (!draft) {
    return (
      <div className="rounded-3xl border border-dashed border-[#D7D0C6] bg-white/70 p-10 text-center">
        <Sparkles className="mx-auto mb-3 h-7 w-7 text-[#8E8982]" />
        <p className="text-sm font-bold text-[#57514A]">
          아직 {VIEW_LABELS[platform]} 원고가 없습니다.
        </p>
        <p className="mt-1 text-xs text-[#8E8982]">
          왼쪽에서 키워드를 선택한 뒤 실제 생성 엔진을 실행하세요.
        </p>
      </div>
    );
  }

  const changed = (mutate) => {
    const next = structuredClone(draft);
    mutate(next);
    next.validation_status = "needs_recheck";
    next.evidence_status = "needs_recheck";
    onChange(next);
  };

  if (platform === "instagram") {
    return (
      <div className="space-y-4">
        <TextArea
          label="도입"
          value={draft.opening}
          onChange={(value) => changed((next) => { next.opening = value; })}
          rows={3}
          evidence={draft.block_evidence?.opening}
        />
        {(draft.paragraphs || []).map((paragraph, index) => (
          <TextArea
            key={index}
            label={`본문 ${index + 1}`}
            value={paragraph}
            onChange={(value) => changed((next) => { next.paragraphs[index] = value; })}
            evidence={draft.block_evidence?.paragraphs?.[index]}
          />
        ))}
        <TextArea
          label="마무리"
          value={draft.closing}
          onChange={(value) => changed((next) => { next.closing = value; })}
          rows={3}
          evidence={draft.block_evidence?.closing}
        />
        <TextArea
          label="해시태그 · 3~5개"
          value={(draft.hashtags || []).join(" ")}
          onChange={(value) => changed((next) => {
            next.hashtags = value.trim() ? value.trim().split(/\s+/u) : [];
          })}
          rows={2}
        />
      </div>
    );
  }

  if (platform === "threads") {
    return (
      <div className="space-y-4">
        <TextArea
          label="제목"
          value={draft.opening}
          onChange={(value) => changed((next) => { next.opening = value; })}
          rows={3}
          evidence={draft.block_evidence?.opening}
          valid={draft.block_evidence_valid?.opening}
        />
        {(draft.paragraphs || []).map((paragraph, index) => (
          <TextArea
            key={index}
            label={`핵심 문장 ${index + 1}`}
            value={paragraph}
            onChange={(value) => changed((next) => { next.paragraphs[index] = value; })}
            rows={3}
            evidence={draft.block_evidence?.paragraphs?.[index]}
            valid={draft.block_evidence_valid?.paragraphs?.[index]}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TextArea
        label="제목"
        value={draft.title}
        onChange={(value) => changed((next) => { next.title = value; })}
        rows={3}
      />
      <TextArea
        label="도입"
        value={draft.intro}
        onChange={(value) => changed((next) => { next.intro = value; })}
      />
      {(draft.sections || []).map((section, index) => (
        <div key={section.section_id || index} className="rounded-2xl border border-[#DDD6CB] bg-[#FAF8F5]/70 p-3 space-y-3">
          <TextArea
            label={`소제목 ${index + 1}`}
            value={section.heading}
            onChange={(value) => changed((next) => { next.sections[index].heading = value; })}
            rows={2}
          />
          <TextArea
            label={`본문 ${index + 1}`}
            value={section.body}
            onChange={(value) => changed((next) => { next.sections[index].body = value; })}
            evidence={section.source_evidence}
            valid={section.evidence_valid}
          />
        </div>
      ))}
      <TextArea
        label="결론"
        value={draft.conclusion}
        onChange={(value) => changed((next) => { next.conclusion = value; })}
      />
      <Evidence quotes={draft.source_evidence} valid={draft.evidence_valid} />
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-2 rounded-full border border-[#292929] bg-[#292929] px-4 py-2 text-xs font-extrabold text-white"
      >
        <Copy className="h-3.5 w-3.5" />
        {copied ? "복사됨" : "원고 전체 복사"}
      </button>
    </div>
  );
}

function CardNewsEditor({ draft, article, onChange }) {
  const cards = draft?.cards || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = cards[activeIndex] || null;
  const photos = article.photos || [];

  if (!active) {
    return (
      <div className="rounded-3xl border border-dashed border-[#D7D0C6] bg-white/70 p-10 text-center">
        <ImageIcon className="mx-auto mb-3 h-7 w-7 text-[#8E8982]" />
        <p className="text-sm font-bold text-[#57514A]">아직 생성된 카드뉴스가 없습니다.</p>
      </div>
    );
  }

  const patchCard = (patch) => {
    const next = structuredClone(draft);
    next.cards[activeIndex] = {
      ...next.cards[activeIndex],
      ...patch,
      validation_status: "needs_recheck",
    };
    next.validation_status = "needs_recheck";
    onChange(next);
  };

  const patchContent = (key, value) => {
    patchCard({ content: { ...active.content, [key]: value } });
  };

  const selectedPhoto = photos.find((photo) => photo.id === active.photoId);
  const layout = active.design?.layout || "standard";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px] gap-5">
      <div className="space-y-4">
        <div className="mx-auto w-full max-w-[560px]">
          <div
            className="relative aspect-[4/5] overflow-hidden rounded-[30px] bg-[#18181B] shadow-xl border border-black/10"
            style={selectedPhoto?.url ? {
              backgroundImage: `linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.7)),url("${selectedPhoto.url}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            } : undefined}
          >
            <div className="absolute inset-0 flex flex-col justify-between p-8 md:p-10 text-white">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">
                  {active.content?.keyword || roleLabel(active.role)}
                </span>
              </div>
              <div className="space-y-4">
                <textarea
                  value={active.content?.headline || ""}
                  onChange={(event) => patchContent("headline", event.target.value)}
                  rows={3}
                  className="w-full resize-none bg-transparent text-2xl md:text-3xl font-black leading-tight outline-none placeholder:text-white/40"
                  placeholder="카드 제목"
                />
                <textarea
                  value={active.content?.body || ""}
                  onChange={(event) => patchContent("body", event.target.value)}
                  rows={layout === "standard" ? 5 : 6}
                  className="w-full resize-none bg-transparent text-sm md:text-base leading-7 text-white/85 outline-none placeholder:text-white/40"
                  placeholder="카드 본문"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[#DDD6CB] bg-white p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold text-[#57514A]">카드 키워드</label>
              <input
                value={active.content?.keyword || ""}
                onChange={(event) => patchContent("keyword", event.target.value)}
                className="w-full rounded-xl border border-[#DDD6CB] px-3 py-2 text-sm outline-none focus:border-[#292929]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-extrabold text-[#57514A]">정보 배치</label>
              <select
                value={layout}
                onChange={(event) => patchCard({
                  design: { ...(active.design || {}), layout: event.target.value },
                })}
                className="w-full rounded-xl border border-[#DDD6CB] bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="standard">설명형</option>
                <option value="comparison">비교형</option>
                <option value="list">목록형</option>
                <option value="steps">단계형</option>
                <option value="stat">수치 강조형</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-extrabold text-[#57514A]">기사 사진 사용</label>
            <select
              value={active.photoId || ""}
              onChange={(event) => patchCard({ photoId: event.target.value || "" })}
              className="w-full rounded-xl border border-[#DDD6CB] bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="">검정 배경</option>
              {photos.map((photo, index) => (
                <option key={photo.id || index} value={photo.id || ""}>
                  {photo.caption || `기사 사진 ${index + 1}`}
                </option>
              ))}
            </select>
          </div>

          <Evidence quotes={active.source_evidence} valid={active.evidence_valid} />
        </div>
      </div>

      <aside className="space-y-2">
        <div className="flex items-center justify-between pb-2">
          <span className="text-xs font-black text-[#292929]">전체 카드</span>
          <span className="rounded-full bg-[#EFECE6] px-2 py-1 text-[10px] font-bold text-[#57514A]">
            {cards.length}장
          </span>
        </div>
        {cards.map((card, index) => (
          <button
            key={card.card_id || index}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`w-full rounded-2xl border p-3 text-left transition ${
              index === activeIndex
                ? "border-[#292929] bg-[#292929] text-white"
                : "border-[#DDD6CB] bg-white text-[#292929] hover:bg-[#FAF8F5]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold opacity-70">
                {index + 1} · {roleLabel(card.role)}
              </span>
              {card.evidence_valid === false && (
                <span className="text-[9px] font-bold text-amber-500">근거 확인</span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs font-extrabold leading-5">
              {card.content?.headline || "제목 없음"}
            </p>
          </button>
        ))}
      </aside>
    </div>
  );
}

export default function FormatConverter({ article, setArticle }) {
  const savedConfig = article.platformGeneration || {};
  const [selectedPlatforms, setSelectedPlatforms] = useState(
    Array.isArray(savedConfig.selectedPlatforms) && savedConfig.selectedPlatforms.length
      ? savedConfig.selectedPlatforms
      : ["instagram", "threads"],
  );
  const [includeCardNews, setIncludeCardNews] = useState(savedConfig.includeCardNews === true);
  const [requirements, setRequirements] = useState(savedConfig.requirements || "");
  const [keywordCandidates, setKeywordCandidates] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState(savedConfig.selectedKeywords || []);
  const [drafts, setDrafts] = useState(article.platformDrafts || {});
  const initialCardNews = article.cardNews && !Array.isArray(article.cardNews) ? article.cardNews : null;
  const [cardNews, setCardNews] = useState(initialCardNews);
  const [activeView, setActiveView] = useState(
    Object.keys(article.platformDrafts || {})[0] || (initialCardNews ? "card_news" : "instagram"),
  );
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({});
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");

  const targets = useMemo(
    () => [...selectedPlatforms, ...(includeCardNews ? ["card_news"] : [])],
    [selectedPlatforms, includeCardNews],
  );

  const persist = (nextDrafts = drafts, nextCardNews = cardNews, configPatch = {}) => {
    if (!setArticle) return;
    setArticle((previous) => ({
      ...previous,
      platformDrafts: nextDrafts,
      cardNews: nextCardNews,
      platformGeneration: {
        ...(previous.platformGeneration || {}),
        selectedPlatforms,
        includeCardNews,
        selectedKeywords,
        requirements,
        ...configPatch,
      },
    }));
  };

  const togglePlatform = (id) => {
    setSelectedPlatforms((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      if (!next.includes(activeView) && activeView !== "card_news") {
        setActiveView(next[0] || (includeCardNews ? "card_news" : "instagram"));
      }
      if (setArticle) {
        setArticle((previous) => ({
          ...previous,
          platformGeneration: {
            ...(previous.platformGeneration || {}),
            selectedPlatforms: next,
            includeCardNews,
            selectedKeywords,
            requirements,
          },
        }));
      }
      return next;
    });
  };

  const toggleKeyword = (keyword) => {
    setSelectedKeywords((current) => {
      const next = current.includes(keyword)
        ? current.filter((item) => item !== keyword)
        : [...current, keyword];
      if (setArticle) {
        setArticle((previous) => ({
          ...previous,
          platformGeneration: {
            ...(previous.platformGeneration || {}),
            selectedPlatforms,
            includeCardNews,
            selectedKeywords: next,
            requirements,
          },
        }));
      }
      return next;
    });
  };

  const suggestKeywords = async () => {
    if (!article.title?.trim() || !article.content?.trim()) {
      setMessage("기사 제목과 본문을 먼저 작성해 주세요.");
      return;
    }
    setKeywordLoading(true);
    setMessage("");
    try {
      const candidates = await suggestPlatformKeywords(article);
      setKeywordCandidates(candidates);
      if (!candidates.length) setMessage("추천할 키워드를 찾지 못했습니다.");
    } catch (error) {
      setMessage(error.message || "키워드 추천에 실패했습니다.");
    } finally {
      setKeywordLoading(false);
    }
  };

  // only: 한 항목만 만들 때(["instagram"] / ["card_news"]). 없으면 왼쪽에서 체크한 항목 전부
  const runGeneration = async (only) => {
    const list = Array.isArray(only) ? only : targets;
    if (!article.title?.trim() || !article.content?.trim()) {
      setMessage("기사 제목과 본문을 먼저 작성해 주세요.");
      return;
    }
    if (!selectedKeywords.length) {
      setMessage("콘텐츠 방향을 잡을 키워드를 하나 이상 선택해 주세요.");
      return;
    }
    if (!list.length) {
      setMessage("생성할 플랫폼 또는 카드뉴스를 선택해 주세요.");
      return;
    }

    setGenerating(true);
    setMessage("");
    const nextProgress = Object.fromEntries(list.map((id) => [id, "대기 중"]));
    setProgress(nextProgress);
    let nextDrafts = structuredClone(drafts);
    let nextCardNews = cardNews;
    const success = [];

    for (const target of list) {
      nextProgress[target] = "생성 중";
      setProgress({ ...nextProgress });
      try {
        const generated = await generatePlatform(
          target,
          article,
          selectedKeywords,
          requirements,
        );
        if (!generated) throw new Error("생성 결과가 비어 있습니다.");
        if (target === "card_news") nextCardNews = generated;
        else nextDrafts[target] = generated;
        nextProgress[target] = "완료";
        success.push(target);
      } catch (error) {
        nextProgress[target] = `실패 · ${error.message || "생성 오류"}`;
      }
      setProgress({ ...nextProgress });
    }

    setDrafts(nextDrafts);
    setCardNews(nextCardNews);
    if (success.length) {
      setActiveView(success[0]);
      persist(nextDrafts, nextCardNews, {
        selectedPlatforms,
        includeCardNews,
        selectedKeywords,
        requirements,
      });
    }
    setMessage(
      success.length
        ? `${success.length}/${list.length}개 결과를 실제 생성 엔진에서 받아왔습니다.`
        : "생성된 결과가 없습니다. 오류 내용을 확인해 주세요.",
    );
    setGenerating(false);
  };

  const updateDraft = (platform, next) => {
    const nextDrafts = { ...drafts, [platform]: next };
    setDrafts(nextDrafts);
    persist(nextDrafts, cardNews);
  };

  const updateCardNews = (next) => {
    setCardNews(next);
    persist(drafts, next);
  };

  const copyDraft = async (platform) => {
    await navigator.clipboard.writeText(draftToText(platform, drafts[platform]));
    setCopied(platform);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const currentDraft = activeView === "card_news" ? cardNews : drafts[activeView];

  return (
    <div className="w-full space-y-5 animate-float-in text-[#292929]" data-testid="format-converter">
      <div className="flex flex-col gap-3 border-b border-[#E7E2D9] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="block text-[11px] font-mono font-bold uppercase tracking-[0.18em] text-[#756F67]">
            NEWSROOM / CONTENT STUDIO
          </span>
          <h2 className="text-xl font-black tracking-tight md:text-2xl">플랫폼 콘텐츠 편집실</h2>
          <p className="mt-1 text-xs text-[#8E8982]">
            화면은 FormatConverter, 생성은 병합된 platform-generator가 담당합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => runGeneration()}
          disabled={generating}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#292929] px-5 py-2.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "선택 항목 생성 중" : "선택 항목 생성"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-3xl border border-[#DDD6CB] bg-white/90 p-5 shadow-sm">
            <div className="flex items-start gap-3 border-b border-[#EFECE6] pb-4">
              <FileText className="mt-0.5 h-4 w-4 text-[#8E8982]" />
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-[#8E8982]">작성 중인 기사</span>
                <p className="mt-0.5 line-clamp-2 text-sm font-black leading-5">
                  {article.title || "제목 없는 기사"}
                </p>
                <span className="mt-1 block text-[10px] text-[#8E8982]">
                  본문 {(article.content || "").length.toLocaleString()}자
                </span>
              </div>
            </div>

            <div className="pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-black">배포 플랫폼</h3>
                <span className="text-[10px] text-[#8E8982]">다중 선택</span>
              </div>
              <div className="space-y-2">
                {PLATFORM_LIST.map((platform) => {
                  const selected = selectedPlatforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition ${
                        selected
                          ? "border-[#292929] bg-[#292929] text-white"
                          : "border-[#DDD6CB] bg-[#FAF8F5] text-[#292929]"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-extrabold">{platform.label}</div>
                        <div className={`text-[10px] ${selected ? "text-white/60" : "text-[#8E8982]"}`}>
                          {platform.badge}
                        </div>
                      </div>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        selected ? "border-white bg-white text-[#292929]" : "border-[#CFC7BC] bg-white"
                      }`}>
                        {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-2xl border border-[#DDD6CB] bg-[#FAF8F5] p-3">
                <input
                  type="checkbox"
                  checked={includeCardNews}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setIncludeCardNews(checked);
                    if (checked && !selectedPlatforms.length) setActiveView("card_news");
                    if (setArticle) {
                      setArticle((previous) => ({
                        ...previous,
                        platformGeneration: {
                          ...(previous.platformGeneration || {}),
                          selectedPlatforms,
                          includeCardNews: checked,
                          selectedKeywords,
                          requirements,
                        },
                      }));
                    }
                  }}
                  className="mt-0.5"
                />
                <span>
                  <strong className="block text-xs">카드뉴스도 생성</strong>
                  <span className="text-[10px] leading-4 text-[#8E8982]">
                    배포 플랫폼이 아닌 별도 제작 결과물
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-[#DDD6CB] bg-white/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-black">
                <Hash className="h-3.5 w-3.5" /> 핵심 키워드
              </h3>
              <button
                type="button"
                onClick={suggestKeywords}
                disabled={keywordLoading}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#57514A] disabled:opacity-50"
              >
                {keywordLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                추천
              </button>
            </div>

            {keywordCandidates.length ? (
              <div className="space-y-2">
                {keywordCandidates.map((candidate, index) => {
                  const keyword = candidate.keyword || String(candidate);
                  const selected = selectedKeywords.includes(keyword);
                  return (
                    <button
                      key={keyword + index}
                      type="button"
                      onClick={() => toggleKeyword(keyword)}
                      className={`w-full rounded-xl border px-3 py-2 text-left ${
                        selected
                          ? "border-[#292929] bg-[#EFECE6]"
                          : "border-[#E7E2D9] bg-white"
                      }`}
                      title={candidate.reason || ""}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${selected ? "bg-[#292929]" : "bg-[#D7D0C6]"}`} />
                        <span className="text-xs font-bold">{keyword}</span>
                      </div>
                      {candidate.reason && (
                        <p className="mt-1 line-clamp-2 pl-4 text-[10px] leading-4 text-[#8E8982]">
                          {candidate.reason}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-[#FAF8F5] p-3 text-[10px] leading-4 text-[#8E8982]">
                ‘추천’을 누르면 platform-generator가 기사 원문에서 후보를 만듭니다.
              </p>
            )}

            {selectedKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedKeywords.map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => toggleKeyword(keyword)}
                    className="rounded-full bg-[#292929] px-2.5 py-1 text-[10px] font-bold text-white"
                  >
                    {keyword} ×
                  </button>
                ))}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[10px] font-bold text-[#8E8982]">추가 요구사항</label>
              <textarea
                value={requirements}
                onChange={(event) => setRequirements(event.target.value.slice(0, 3000))}
                onBlur={() => persist(drafts, cardNews, { requirements })}
                rows={4}
                placeholder="톤, 분량, 반드시 포함할 조건 등을 입력"
                className="w-full resize-y rounded-xl border border-[#DDD6CB] bg-[#FAF8F5] px-3 py-2 text-xs leading-5 outline-none focus:border-[#292929]"
              />
            </div>
          </section>

          {(Object.keys(progress).length > 0 || message) && (
            <section className="rounded-3xl border border-[#DDD6CB] bg-[#FAF8F5] p-4 text-[11px]">
              {Object.entries(progress).map(([id, status]) => (
                <div key={id} className="flex justify-between gap-3 py-1">
                  <span className="font-bold">{VIEW_LABELS[id]}</span>
                  <span className={status.startsWith("실패") ? "text-red-600" : "text-[#756F67]"}>
                    {status}
                  </span>
                </div>
              ))}
              {message && <p className="mt-2 border-t border-[#DDD6CB] pt-2 leading-5 text-[#57514A]">{message}</p>}
            </section>
          )}
        </aside>

        <main className="min-w-0 rounded-3xl border border-[#DDD6CB] bg-white/90 p-4 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap gap-2 border-b border-[#EFECE6] pb-4">
            {PLATFORM_LIST.filter((platform) =>
              selectedPlatforms.includes(platform.id) || drafts[platform.id]
            ).map((platform) => (
              <button
                key={platform.id}
                type="button"
                onClick={() => setActiveView(platform.id)}
                className={`rounded-full px-4 py-2 text-xs font-extrabold transition ${
                  activeView === platform.id
                    ? "bg-[#292929] text-white"
                    : "bg-[#EFECE6] text-[#57514A]"
                }`}
              >
                {platform.label}
                {drafts[platform.id] && <span className="ml-1.5 opacity-60">●</span>}
              </button>
            ))}
            {(includeCardNews || cardNews) && (
              <button
                type="button"
                onClick={() => setActiveView("card_news")}
                className={`rounded-full px-4 py-2 text-xs font-extrabold transition ${
                  activeView === "card_news"
                    ? "bg-[#292929] text-white"
                    : "bg-[#EFECE6] text-[#57514A]"
                }`}
              >
                카드뉴스
                {cardNews && <span className="ml-1.5 opacity-60">●</span>}
              </button>
            )}
          </div>

          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8982]">
                GENERATED DRAFT
              </span>
              <h3 className="mt-0.5 text-lg font-black">
                {VIEW_LABELS[activeView] || "플랫폼 원고"} 편집
              </h3>
              <p className="mt-1 text-[11px] leading-5 text-[#8E8982]">
                {currentDraft?.validation_status === "needs_recheck"
                  ? "생성 뒤 수정된 내용입니다. 원문 근거 재검수가 필요합니다."
                  : currentDraft
                  ? "실제 생성 엔진 결과입니다. 발행 전 사람이 최종 검토해야 합니다."
                  : "아직 생성 결과가 없습니다."}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              data-testid="generate-active"
              onClick={() => runGeneration([activeView])}
              disabled={generating}
              title="이 항목만 생성합니다. 이미 있는 결과와 수정 내용은 새 결과로 바뀝니다."
              className="inline-flex items-center gap-1.5 rounded-full bg-[#292929] px-3 py-2 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {activeView === "card_news"
                ? (cardNews ? "카드뉴스 다시 생성" : "카드뉴스만 생성")
                : `${VIEW_LABELS[activeView] || "플랫폼"} ${drafts[activeView] ? "다시 생성" : "원고 생성"}`}
            </button>
            {activeView !== "card_news" && drafts[activeView] && (
              <button
                type="button"
                onClick={() => copyDraft(activeView)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DDD6CB] bg-white px-3 py-2 text-[11px] font-bold"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied === activeView ? "복사됨" : "전체 복사"}
              </button>
            )}
            </div>
          </div>

          {activeView === "card_news" ? (
            <CardNewsEditor draft={cardNews} article={article} onChange={updateCardNews} />
          ) : (
            <PlatformDraftEditor
              platform={activeView}
              draft={drafts[activeView]}
              onChange={(next) => updateDraft(activeView, next)}
              onCopy={() => copyDraft(activeView)}
              copied={copied === activeView}
            />
          )}
        </main>
      </div>
    </div>
  );
}
