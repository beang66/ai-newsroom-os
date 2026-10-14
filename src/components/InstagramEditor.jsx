// Instagram 편집 화면 — 콘텐츠 변환의 Threads 편집 화면과 같은 디자인으로, 실제 Instagram "새 게시물 만들기" 화면처럼 보이고 그 자리에서 바로 고친다.
//  - 맨 위 뒤로 · 새 게시물 만들기 · 공유하기(게시는 SNS 작성창 준비에서 하므로 비활성), 게시물 이미지 자리(카드뉴스), 계정 줄, 캡션
//  - 데이터와 수정 규칙은 기존 Instagram 편집과 같다: opening(도입) · paragraphs[](본문) · closing(마무리) · hashtags(해시태그)를 고치면
//    validation_status 가 needs_recheck 로 바뀌어 원문 근거 재검수를 요구한다(changed). 여기서는 겉모습과 배치만 바꾼다.
import { useLayoutEffect, useRef } from "react";
import { ArrowLeft, Image as ImageIcon, Smile, User } from "lucide-react";
import { CardThumb } from "./ThreadsEditor.jsx";

const LIMIT = 2200; // Instagram 캡션 글자 수 제한
const ACCOUNT = "AI NEWSROOM";

function Avatar({ size = 32 }) {
  return (
    <div style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-[#EFECE6]">
      <User style={{ width: size * 0.55, height: size * 0.55 }} className="text-[#8E8982]" />
    </div>
  );
}

/** 캡션의 한 부분(도입·본문·마무리·해시태그). 테두리 없이 이어지는 캡션처럼 보이고, 글 길이에 맞춰 높이가 늘어난다. */
function CaptionPart({ label, value, onChange, evidenceNode, hashtag = false }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <div className="group" data-testid="instagram-caption-part">
      <span className="text-[10px] font-bold text-[#B0AAA2] group-focus-within:text-[#756F67]">{label}</span>
      <textarea
        ref={ref}
        value={value || ""}
        rows={1}
        aria-label={`${label} 편집`}
        onChange={(event) => onChange(event.target.value)}
        className={`block w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent p-0 text-[14px] leading-[1.55] outline-none transition hover:bg-[#FAF8F5] focus:bg-[#FAF8F5] ${hashtag ? "text-[#00376B]" : "text-[#101010]"}`}
      />
      {evidenceNode}
    </div>
  );
}

/** draft: 생성 결과, changed(mutate): 수정 규칙(재검수 표시 포함), Evidence: 원문 근거 접기, cards: 카드뉴스 카드들, article: 카드 사진 조회용 */
export default function InstagramEditor({ draft, changed, Evidence, cards = [], article, showCards = true }) {
  const paragraphs = draft.paragraphs || [];
  const hashtags = (draft.hashtags || []).join(" ");
  const caption = [draft.opening, ...paragraphs, draft.closing, hashtags].filter(Boolean).join("\n\n");
  return (
    <div className="w-full min-w-0 max-w-[620px]" data-testid="instagram-editor">
      <div className="mx-auto w-full overflow-hidden rounded-[24px] border border-[#E7E2D9] bg-white shadow-[0_10px_35px_rgba(0,0,0,0.08)]">
        {/* 상단 헤더: 뒤로 · 새 게시물 만들기 · 공유하기 */}
        <div className="flex items-center justify-between border-b border-[#F0EFEA] px-5 py-3.5 text-[15px]">
          <span className="text-[#101010]" aria-hidden="true"><ArrowLeft className="h-5 w-5" /></span>
          <span className="font-bold text-[#101010]">새 게시물 만들기</span>
          <button
            type="button"
            disabled
            title="게시는 오른쪽 사이드바의 SNS 작성창 준비에서 진행합니다"
            className="text-[14px] font-bold text-[#0095F6] disabled:opacity-50"
          >
            공유하기
          </button>
        </div>

        {/* 게시물 이미지 자리: 카드뉴스 */}
        {showCards && (
          <div className="border-b border-[#F0EFEA] bg-[#FAFAFA] px-5 py-4" data-testid="instagram-media">
            {cards.length > 0 ? (
              <div className="-mr-2 flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {cards.map((card, cardIndex) => (
                  <CardThumb key={card.card_id || cardIndex} card={card} index={cardIndex} total={cards.length} article={article} />
                ))}
              </div>
            ) : (
              <div className="mx-auto flex aspect-[4/5] w-full max-w-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDD6CB] bg-white text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FAF8F5] text-[#756F67] shadow-sm">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <p className="mt-3 text-xs font-bold text-[#292929]">카드뉴스 불러오기</p>
                <p className="mt-1 px-6 text-[11px] text-[#8E8982]">생성된 카드뉴스가 여기에 인스타그램 게시물 이미지로 첨부됩니다.</p>
              </div>
            )}
          </div>
        )}

        {/* 계정 줄 + 캡션 */}
        <div className="px-5 pt-4">
          <div className="mb-3 flex items-center gap-2.5">
            <Avatar />
            <span className="text-[14px] font-bold text-[#101010]">{ACCOUNT}</span>
          </div>
          <div className="space-y-3">
            <CaptionPart
              label="도입"
              value={draft.opening}
              onChange={(value) => changed((next) => { next.opening = value; })}
              evidenceNode={<Evidence quotes={draft.block_evidence?.opening} />}
            />
            {paragraphs.map((paragraph, index) => (
              <CaptionPart
                key={index}
                label={`본문 ${index + 1}`}
                value={paragraph}
                onChange={(value) => changed((next) => { next.paragraphs[index] = value; })}
                evidenceNode={<Evidence quotes={draft.block_evidence?.paragraphs?.[index]} />}
              />
            ))}
            <CaptionPart
              label="마무리"
              value={draft.closing}
              onChange={(value) => changed((next) => { next.closing = value; })}
              evidenceNode={<Evidence quotes={draft.block_evidence?.closing} />}
            />
            <CaptionPart
              label="해시태그 · 3~5개"
              hashtag
              value={hashtags}
              onChange={(value) => changed((next) => {
                next.hashtags = value.trim() ? value.trim().split(/\s+/u) : [];
              })}
            />
          </div>
        </div>

        {/* 하단: 이모지 · 캡션 글자 수 */}
        <div className="mt-3 flex items-center justify-between border-t border-[#F0EFEA] px-5 py-3 text-[#8E8982]">
          <Smile className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className={`text-[11px] font-mono ${caption.length > LIMIT ? "font-bold text-red-600" : "text-[#999]"}`}>
            {caption.length.toLocaleString()}/{LIMIT.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
