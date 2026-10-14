// Threads 편집 화면 — 실제 Threads 의 "새 스레드" 작성창과 같은 구성으로 보이고, 그 자리에서 바로 고친다.
//  - 맨 위 취소 · 새 스레드 · 더보기, 게시물마다 아바타·계정명·입력칸, 연결선, 첫 게시물 아래 첨부 이미지 줄(카드뉴스),
//    첨부 도구 아이콘, "스레드에 추가", 하단 답글 범위와 게시 버튼
//  - 데이터와 수정 규칙은 main 의 PlatformDraftEditor 와 같다: opening(첫 게시물) · paragraphs[](이어지는 게시물)을 고치면
//    validation_status 가 needs_recheck 로 바뀌어 원문 근거 재검수를 요구한다. 여기서는 겉모습과 입력 방식만 바꾼다.
//  - 카드뉴스 카드는 첫 게시물의 첨부 이미지 자리에 카드 미리보기(PlatformCardEditor 와 같은 템플릿)로 들어간다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlignLeft, BadgeCheck, Hash, Image as ImageIcon, MoreHorizontal, Mic, Smile } from "lucide-react";
import { photoDataUrl } from "../api/platform.js";
import { selectedCardPhoto } from "../lib/platformState.js";
import {CardModel,CardTemplate} from "../lib/cardRuntime.js";

const LIMIT = 500; // Threads 게시물 글자 수 제한
const ACCOUNT = "ai_newsroom";
const CARD_W = 1080, CARD_H = 1350, THUMB_W = 180;

function Avatar({ size = 36 }) {
  return (
    <div style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-[#292929] text-[12px] font-black text-white">AI</div>
  );
}

/** 카드뉴스 한 장의 미리보기(첨부 이미지 자리). 카드 편집기와 같은 템플릿으로 그린다. */
function CardThumb({ card, index, total, article }) {
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
  const scale = THUMB_W / CARD_W;
  return (
    <div className="relative shrink-0 overflow-hidden rounded-xl border border-[#E3DED5] bg-black" style={{ width: THUMB_W, height: CARD_H * scale }} data-testid="threads-card">
      <iframe title={`카드 ${index + 1} 미리보기`} sandbox="allow-scripts" srcDoc={html} tabIndex={-1}
        style={{ width: CARD_W, height: CARD_H, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />
      <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{index + 1}/{total}</span>
    </div>
  );
}

function Post({ label, value, onChange, media, evidenceNode }) {
  const ref = useRef(null);
  // 글 길이에 맞춰 입력칸 높이를 늘린다(스크롤 없이 게시물처럼 보이게)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const length = (value || "").length;
  return (
    <div className="flex gap-3" data-testid="threads-post">
      <div className="flex w-9 shrink-0 flex-col items-center">
        <Avatar />
        <div className="my-1.5 w-[2px] flex-1 rounded-full bg-[#E3DED5]" />
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex items-center gap-1.5 text-[14px]">
          <span className="font-bold text-[#101010]">{ACCOUNT}</span>
          <BadgeCheck className="h-3.5 w-3.5 text-[#0095F6]" aria-hidden="true" />
          <span className="rounded-full bg-[#F3F0EA] px-2 py-0.5 text-[10px] font-bold text-[#756F67]">{label}</span>
          <MoreHorizontal className="ml-auto h-4 w-4 text-[#999]" aria-hidden="true" />
        </div>
        <textarea
          ref={ref}
          value={value || ""}
          rows={1}
          placeholder="새로운 소식이 있나요?"
          aria-label={`${label} 편집`}
          onChange={(event) => onChange(event.target.value)}
          className="mt-0.5 block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[15px] leading-[1.55] text-[#101010] outline-none placeholder:text-[#999]"
        />
        {media}
        <div className="mt-2 flex items-center gap-4 text-[#8E8982]" aria-hidden="true">
          <ImageIcon className="h-[18px] w-[18px]" /><Smile className="h-[18px] w-[18px]" /><Mic className="h-[18px] w-[18px]" />
          <Hash className="h-[18px] w-[18px]" /><AlignLeft className="h-[18px] w-[18px]" />
          <span className={`ml-auto text-[11px] font-mono ${length > LIMIT ? "font-bold text-red-600" : "text-[#999]"}`}>{length}/{LIMIT}</span>
        </div>
        {evidenceNode}
      </div>
    </div>
  );
}

/** draft: 생성 결과, changed(mutate): 수정 규칙(재검수 표시 포함), Evidence: 원문 근거 접기, cards: 카드뉴스 카드들, article: 카드 사진 조회용 */
export default function ThreadsEditor({ draft, changed, Evidence, cards = [], article }) {
  const paragraphs = draft.paragraphs || [];
  const posts = [
    { key: "opening", label: "제목", value: draft.opening, evidence: draft.block_evidence?.opening, valid: draft.block_evidence_valid?.opening,
      set: (value) => changed((next) => { next.opening = value; }) },
    ...paragraphs.map((paragraph, index) => ({
      key: `p${index}`, label: `핵심 문장 ${index + 1}`, value: paragraph,
      evidence: draft.block_evidence?.paragraphs?.[index], valid: draft.block_evidence_valid?.paragraphs?.[index],
      set: (value) => changed((next) => { next.paragraphs[index] = value; }),
    })),
  ];
  return (
    <div className="rounded-[28px] bg-[#EFECE6] p-4 md:p-8" data-testid="threads-editor">
      <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-[24px] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between border-b border-[#EFECE6] px-5 py-3.5 text-[15px]">
          <span className="text-[#101010]">취소</span>
          <span className="font-bold text-[#101010]">새 스레드</span>
          <MoreHorizontal className="h-5 w-5 text-[#101010]" aria-hidden="true" />
        </div>
        <div className="px-5 pt-4">
          {posts.map((post, index) => (
            <Post
              key={post.key}
              label={post.label}
              value={post.value}
              onChange={post.set}
              evidenceNode={<Evidence quotes={post.evidence} valid={post.valid} />}
              media={index === 0 ? (
                <div className="mt-3" data-testid="threads-media">
                  {cards.length > 0 ? (
                    <div className="-mr-2 flex gap-2 overflow-x-auto pb-1">
                      {cards.map((card, cardIndex) => (
                        <CardThumb key={card.card_id || cardIndex} card={card} index={cardIndex} total={cards.length} article={article} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#D7D0C6] bg-[#FAF8F5] px-4 py-5 text-[12px] text-[#8E8982]">
                      <ImageIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span>카드뉴스를 생성하면 이미지가 이 자리에 첨부됩니다. (왼쪽에서 &quot;카드뉴스 생성&quot;을 선택하세요)</span>
                    </div>
                  )}
                </div>
              ) : null}
            />
          ))}
          <div className="flex items-center gap-3 pb-4">
            <div className="flex w-9 justify-center"><Avatar size={20} /></div>
            <span className="text-[14px] text-[#999]">스레드에 추가</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-[#EFECE6] px-5 py-3.5">
          <span className="text-[13px] text-[#999]">누구나 답글 및 인용 가능</span>
          <button type="button" disabled title="게시는 아래 SNS 작성창 준비에서 준비합니다(이 앱은 자동으로 게시하지 않습니다)"
            className="rounded-full border border-[#DDD6CB] px-4 py-1.5 text-[14px] font-bold text-[#999]">게시</button>
        </div>
      </div>
    </div>
  );
}
