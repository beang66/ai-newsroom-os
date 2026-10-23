// Threads 편집 화면 — 실제 Threads 의 "새로운 스레드" 작성창과 같은 구성으로 보이고, 그 자리에서 바로 고친다.
//  - 맨 위 취소 · 새로운 스레드 · 초안/더보기, 아바타 · 계정명 · 입력칸(제목과 핵심 문장들이 한 게시물 안에 이어짐), 첨부 이미지 줄(카드뉴스),
//    첨부 도구 아이콘, "스레드에 추가", 하단 게시물 옵션과 게시 버튼. 오른쪽에는 단락별 흐름이 있어 누르면 그 입력칸으로 이동한다.
//  - 데이터와 수정 규칙은 main 의 PlatformDraftEditor 와 같다: opening(첫 문장) · paragraphs[](이어지는 문장)을 고치면
//    validation_status 가 needs_recheck 로 바뀌어 원문 근거 재검수를 요구한다. 여기서는 겉모습과 입력 방식만 바꾼다.
//  - 문장마다 원문 근거(Evidence)와 어조 경고(threads-tone-warning)는 그대로 유지한다.
//  - 카드뉴스 카드는 첨부 이미지 자리에 카드 미리보기(PlatformCardEditor 와 같은 템플릿)로 들어간다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, MapPin, MoreHorizontal, Music, SlidersHorizontal, Smile, X } from "lucide-react";
import { photoDataUrl } from "../api/platform.js";
import { selectedCardPhoto } from "../lib/platformState.js";
import {CardModel,CardTemplate} from "../lib/cardRuntime.js";
import {parseThreadsText,threadsText} from "../lib/platformTextEditor.js";
import '../lib/editorialDirection.js';
import * as toneModule from '../../platform-generator/lib/threads-tone.js';

const ThreadsTone=toneModule.issues?toneModule:toneModule.default?.issues?toneModule.default:globalThis.ThreadsTone;

const LIMIT = 500; // Threads 게시물 글자 수 제한
const ACCOUNT = "AI NEWSROOM";
const CARD_W = 1080, CARD_H = 1350, THUMB_W = 280;

function Avatar({ size = 36 }) {
  return (
    <div style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-black text-white shadow-xs" title="Threads">
      <svg style={{ width: size * 0.58, height: size * 0.58 }} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.186 24C5.456 24 0 18.544 0 11.814 0 5.084 5.456 0 12.186 0c6.643 0 11.968 5.247 12.012 11.814v.373c0 3.003-1.666 4.887-4.148 4.887-1.42 0-2.616-.764-3.136-1.921-.762 1.258-2.022 1.921-3.649 1.921-2.923 0-5.071-2.31-5.071-5.26 0-3.045 2.193-5.355 5.26-5.355 1.764 0 3.19.789 3.864 2.115v-1.89h2.383v6.07c0 1.637.893 2.502 2.298 2.502 1.353 0 2.21-.968 2.21-2.482v-.373C21.768 6.398 17.433 2.2 12.186 2.2 6.678 2.2 2.2 6.678 2.2 12.186c0 5.508 4.478 9.986 9.986 9.986 3.152 0 5.923-1.455 7.747-3.866l1.764 1.341C19.467 22.39 16.035 24 12.186 24zm-.724-10.46c-1.637 0-2.872 1.235-2.872 2.872 0 1.637 1.235 2.872 2.872 2.872 1.637 0 2.872-1.235 2.872-2.872 0-1.637-1.235-2.872-2.872-2.872z" />
      </svg>
    </div>
  );
}

/** 카드뉴스 한 장의 미리보기(첨부 이미지 자리). 카드 편집기와 같은 템플릿으로 그린다. */
export function CardThumb({ card, index, total, article, width = THUMB_W }) {
  const photo = selectedCardPhoto(card, article);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    if (photo) photoDataUrl(photo).then((url) => { if (!cancelled) setPreview({ photo, url }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [photo]);
  const normalized = CardModel.normalize({
    ...card,
    image: photo && preview?.photo === photo ? { ...photo, url: preview.url, photographer: photo.photographer || photo.source, profile: photo.profile || photo.sourceUrl } : undefined,
    page: index + 1,
    total_pages: total,
  });
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0}${CardTemplate.css}</style>${CardTemplate.markup(normalized)}<script>(${CardTemplate.fitCard.toString()})();</script></html>`;
  const cardW = width || THUMB_W;
  const scale = cardW / CARD_W;
  return (
    <div className="group relative shrink-0 overflow-hidden rounded-none border-0 bg-black shadow-sm" style={{ width: cardW, height: Math.round(CARD_H * scale) }} data-testid="threads-card">
      <iframe title={`카드 ${index + 1} 미리보기`} sandbox="allow-scripts" srcDoc={html} tabIndex={-1}
        style={{ width: CARD_W, height: CARD_H, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />
      <div className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm" aria-hidden="true">
        <X className="h-3.5 w-3.5" />
      </div>
      <div className="absolute bottom-2.5 left-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm" aria-hidden="true">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </div>
      <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">{index + 1}/{total}</span>
    </div>
  );
}

function ThreadTextPart({ id, label, value, onChange, onFocus, placeholder }) {
  const ref = useRef(null);
  // 글 길이에 맞춰 입력칸 높이를 늘린다(스크롤 없이 게시물처럼 보이게)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      id={id}
      ref={ref}
      value={value || ""}
      rows={1}
      placeholder={placeholder}
      aria-label={`${label} 편집`}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
      className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[15px] leading-[1.5] text-[#101010] outline-none placeholder:text-[#999]"
    />
  );
}

/** draft: 생성 결과, changed(mutate): 수정 규칙(재검수 표시 포함), cards: 카드뉴스 카드들, article: 카드 사진 조회용 */
// 글 한 덩어리 ↔ 첫 문장·이어지는 문장: 빈 줄로 나누고 첫 단락이 첫 문장(opening), 나머지가 paragraphs
export default function ThreadsEditor({ draft, changed, cards = [], article }) {
  const [showMedia, setShowMedia] = useState(true);
  const paragraphs = draft.paragraphs || [];
  const toneIssues=ThreadsTone.issues(paragraphs,draft.generation_input?.requirements??draft.requirements??'');
  const posts = [
    { key: "opening", label: "제목", value: draft.opening, evidence: draft.block_evidence?.opening, valid: draft.block_evidence_valid?.opening,
      set: (value) => changed((next) => { next.opening = value; }) },
    ...paragraphs.map((paragraph, index) => ({
      key: `p${index}`, label: `핵심 문장 ${index + 1}`, value: paragraph,
      evidence: draft.block_evidence?.paragraphs?.[index], valid: draft.block_evidence_valid?.paragraphs?.[index],
      set: (value) => changed((next) => { next.paragraphs[index] = value; }),
    })),
  ];
  const scrollRef = useRef(null);
  const scrollCard = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 292, behavior: "smooth" });
    }
  };
  const [activePost, setActivePost] = useState(null);
  const [text, setText] = useState(() => threadsText(draft));
  // 밖에서 원고가 바뀌었을 때(재생성 등)만 입력 내용을 다시 맞춘다 — 입력 중의 빈 줄·공백은 그대로 둔다
  useEffect(() => { if (threadsText(parseThreadsText(text)) !== threadsText(draft)) setText(threadsText(draft)); }, [draft]);
  const edit = (value) => {
    setText(value);
    const parsed = parseThreadsText(value);
    changed((next) => { next.opening = parsed.opening; next.paragraphs = parsed.paragraphs; });
  };
  const postId = (key) => `threads-post-${key}`;
  const goTo = () => {
    const el = document.getElementById(postId("all"));
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  // 문장마다 따로 올라가므로 500자 제한은 가장 긴 문장 기준이다
  const longest = Math.max(0, ...posts.map((post) => (post.value || "").length));
  return (
    <div data-testid="threads-editor">
      {toneIssues.length>0&&<p role="alert" data-testid="threads-tone-warning" className="mb-3 rounded-xl border border-amber-300 bg-white p-3 text-xs text-amber-800">본문 {toneIssues.map(issue=>issue.index+1).join(', ')}에 기본 반말과 다른 종결이 있습니다. {draft.tone_repair_status==='needs_edit'?'자동 교정으로 해결되지 않아 편집 가능한 초안을 남겼습니다. 해당 문단을 직접 고쳐 주세요.':'저장된 원고는 자동 변경하지 않습니다. 직접 편집하거나 ‘Threads 다시 생성’을 눌러 주세요. 새 생성에서는 말투를 확인하고 필요한 문단만 교정합니다.'}</p>}
      <div className="flex w-full min-w-0 flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
        <div className="w-full min-w-0 max-w-[620px]">
          <div className="mx-auto w-full overflow-hidden rounded-[38px] border border-[#E7E2D9] bg-white shadow-[0_10px_35px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between border-b border-[#F0EFEA] px-5 py-3.5 text-[15px]">
              <span className="text-[15px] font-medium text-[#101010]">취소</span>
              <span className="font-bold text-[#101010]">새로운 스레드</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="threads-toggle-media"
                  onClick={() => setShowMedia((prev) => !prev)}
                  title={showMedia ? "텍스트 전용 보기로 전환" : "카드뉴스 첨부 보기로 전환"}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border transition cursor-pointer ${
                    !showMedia
                      ? "border-[#101010] bg-[#101010] text-white shadow-xs"
                      : "border-[#DDD6CB] bg-white text-[#756F67] hover:bg-[#F2EFE9] hover:text-[#101010]"
                  }`}
                >
                  {showMedia ? <FileText className="h-4 w-4 stroke-[1.8]" /> : <ImageIcon className="h-4 w-4 stroke-[1.8]" />}
                </button>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#DDD6CB] text-[#101010]"><MoreHorizontal className="h-4 w-4" /></span>
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="flex gap-3" data-testid="threads-post">
                <div className="flex w-9 shrink-0 flex-col items-center">
                  <Avatar />
                  <div className="my-1.5 w-[2px] flex-1 rounded-full bg-[#E5E5E5]" />
                </div>
                <div className="min-w-0 flex-1 pb-2">
                  <div className="flex items-center gap-1.5 text-[14px]">
                    <span className="font-bold text-[#101010]">{ACCOUNT}</span>
                    <span className="text-[#999]">›</span>
                    <span className="text-[13px] text-[#999]">커뮤니티 또는 주제</span>
                  </div>
                  <div className="mt-1">
                    <ThreadTextPart
                      id={postId("all")}
                      label="게시물"
                      value={text}
                      onChange={edit}
                      onFocus={() => setActivePost(null)}
                      placeholder="새로운 소식을 공유해보세요."
                    />
                  </div>
                  {showMedia && (
                    <div className="mt-3" data-testid="threads-media">
                      {cards.length > 0 ? (
                        <div className="relative group">
                          <div ref={scrollRef} className="-mr-2 flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-none">
                            {cards.map((card, cardIndex) => (
                              <CardThumb key={card.card_id || cardIndex} card={card} index={cardIndex} total={cards.length} article={article} />
                            ))}
                          </div>
                          {cards.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={() => scrollCard(-1)}
                                aria-label="이전 카드"
                                className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition hover:bg-black/80 hover:scale-105 cursor-pointer shadow-md"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => scrollCard(1)}
                                aria-label="다음 카드"
                                className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition hover:bg-black/80 hover:scale-105 cursor-pointer shadow-md"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex aspect-[16/10] w-full max-w-[420px] flex-col items-center justify-center rounded-none border border-dashed border-[#DDD6CB] bg-[#FAF8F5] p-6 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#756F67] shadow-sm">
                            <ImageIcon className="h-6 w-6" aria-hidden="true" />
                          </div>
                          <p className="mt-3 text-xs font-bold text-[#292929]">카드뉴스 불러오기</p>
                          <p className="mt-1 text-[11px] text-[#8E8982]">카드뉴스를 생성하면 이미지가 이 자리에 첨부됩니다. (왼쪽에서 &quot;카드뉴스 생성&quot;을 선택하세요)</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-[#999]">
                    <button
                      type="button"
                      data-testid="threads-bottom-toggle-media"
                      onClick={() => setShowMedia((prev) => !prev)}
                      title={showMedia ? "카드뉴스 첨부 숨기기" : "카드뉴스 첨부 표시"}
                      className={`flex items-center gap-1.5 text-[13px] font-bold transition cursor-pointer px-2 py-1 rounded-lg ${
                        showMedia
                          ? "bg-slate-100 text-[#101010] hover:bg-slate-200"
                          : "border border-slate-300 bg-white text-[#756F67] hover:bg-slate-50"
                      }`}
                    >
                      <ImageIcon className="h-[18px] w-[18px]" />
                      <span>{showMedia ? "카드 숨기기" : "카드 첨부"}</span>
                    </button>
                    <Smile className="h-[18px] w-[18px] text-[#8E8982]" />
                    <FileText className="h-[18px] w-[18px] text-[#8E8982]" />
                    <MapPin className="h-[18px] w-[18px] text-[#8E8982]" />
                    <Music className="h-[18px] w-[18px] text-[#8E8982]" />
                    <span className={`ml-auto font-mono text-[11px] ${longest > LIMIT ? "font-bold text-red-600" : "text-[#999]"}`}>{longest}/{LIMIT}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
