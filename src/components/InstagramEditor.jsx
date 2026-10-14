// Instagram 편집 화면 — 실제 Instagram 게시물 모양(계정 줄 · 사진 · 좋아요/댓글/보내기/저장 아이콘 · 캡션)으로 보이고, 캡션을 그 자리에서 바로 고친다.
//  - 캡션 안에는 단락 이름을 넣지 않는다. 단락별 구분(도입·본문·마무리·해시태그)과 원문 근거는 오른쪽 옆 목록에서 본다(누르면 그 단락으로 이동).
//  - 데이터와 수정 규칙은 기존 Instagram 편집과 같다: opening · paragraphs[] · closing · hashtags 를 고치면
//    validation_status 가 needs_recheck 로 바뀌어 원문 근거 재검수를 요구한다(changed). 여기서는 겉모습과 배치만 바꾼다.
import { useLayoutEffect, useRef, useState } from "react";
import { Bookmark, Heart, Image as ImageIcon, MessageCircle, MoreHorizontal, Send, User } from "lucide-react";
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

/** 캡션의 한 단락. 단락 이름 없이 이어지는 캡션처럼 보이고, 글 길이에 맞춰 높이가 늘어난다. */
function CaptionPart({ id, label, value, onChange, active, onFocus, hashtag = false }) {
  const ref = useRef(null);
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
      aria-label={`${label} 편집`}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
      data-testid="instagram-caption-part"
      className={`block w-full resize-none overflow-hidden rounded-md bg-transparent px-1 -mx-1 py-0.5 text-[14px] leading-[1.55] outline-none transition ${active ? "bg-[#FAF8F5]" : "hover:bg-[#FAF8F5]"} ${hashtag ? "text-[#00376B]" : "text-[#101010]"}`}
    />
  );
}

/** draft: 생성 결과, changed(mutate): 수정 규칙(재검수 표시 포함), Evidence: 원문 근거 접기, cards: 카드뉴스 카드들, article: 카드 사진 조회용 */
export default function InstagramEditor({ draft, changed, Evidence, cards = [], article, showCards = true }) {
  const [activePart, setActivePart] = useState(null);
  const paragraphs = draft.paragraphs || [];
  const hashtags = (draft.hashtags || []).join(" ");
  const caption = [draft.opening, ...paragraphs, draft.closing, hashtags].filter(Boolean).join("\n\n");
  const parts = [
    { key: "opening", label: "도입", value: draft.opening, evidence: draft.block_evidence?.opening,
      set: (value) => changed((next) => { next.opening = value; }) },
    ...paragraphs.map((paragraph, index) => ({
      key: `p${index}`, label: `본문 ${index + 1}`, value: paragraph, evidence: draft.block_evidence?.paragraphs?.[index],
      set: (value) => changed((next) => { next.paragraphs[index] = value; }),
    })),
    { key: "closing", label: "마무리", value: draft.closing, evidence: draft.block_evidence?.closing,
      set: (value) => changed((next) => { next.closing = value; }) },
    { key: "hashtags", label: "해시태그", value: hashtags, hashtag: true,
      set: (value) => changed((next) => { next.hashtags = value.trim() ? value.trim().split(/\s+/u) : []; }) },
  ];
  const partId = (key) => `instagram-part-${key}`;
  const goTo = (key) => {
    const el = document.getElementById(partId(key));
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center" data-testid="instagram-editor">
      {/* 게시물 카드 */}
      <article className="w-full max-w-[470px] min-w-0 overflow-hidden rounded-[20px] border border-[#ECECEC] bg-white shadow-[0_10px_35px_rgba(0,0,0,0.08)]">
        <header className="flex items-center gap-2.5 border-b border-[#F2F2F2] px-4 py-3">
          <Avatar />
          <span className="text-[14px] font-bold text-[#101010]">{ACCOUNT}</span>
          <MoreHorizontal className="ml-auto h-5 w-5 text-[#101010]" aria-hidden="true" />
        </header>

        {showCards && (
          <div className="border-b border-[#F2F2F2] bg-[#FAFAFA]" data-testid="instagram-media">
            {cards.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto px-4 py-4 scrollbar-thin">
                {cards.map((card, cardIndex) => (
                  <CardThumb key={card.card_id || cardIndex} card={card} index={cardIndex} total={cards.length} article={article} />
                ))}
              </div>
            ) : (
              <div className="flex aspect-[4/5] w-full items-center justify-center text-[#C7C2BB]" title="카드뉴스를 생성하면 이 자리에 붙습니다">
                <ImageIcon className="h-10 w-10" />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 px-4 pt-3 text-[#101010]" aria-hidden="true">
          <Heart className="h-6 w-6" />
          <MessageCircle className="h-6 w-6" />
          <Send className="h-6 w-6" />
          <Bookmark className="ml-auto h-6 w-6" />
        </div>

        <div className="px-4 pb-3 pt-2.5">
          <span className="text-[13px] font-bold text-[#101010]">{ACCOUNT}</span>
          <div className="mt-1 space-y-2">
            {parts.map((part) => (
              <CaptionPart
                key={part.key}
                id={partId(part.key)}
                label={part.label}
                value={part.value}
                hashtag={part.hashtag}
                active={activePart === part.key}
                onFocus={() => setActivePart(part.key)}
                onChange={part.set}
              />
            ))}
          </div>
          <p className={`mt-2 text-right font-mono text-[11px] ${caption.length > LIMIT ? "font-bold text-red-600" : "text-[#B0AAA2]"}`}>
            {caption.length.toLocaleString()}/{LIMIT.toLocaleString()}
          </p>
        </div>
      </article>

      {/* 오른쪽 옆: 단락별 구분과 원문 근거 */}
      <aside className="w-full max-w-[470px] space-y-1.5 lg:w-[180px] lg:max-w-none lg:sticky lg:top-4" data-testid="instagram-parts">
        {parts.map((part) => (
          <div key={part.key} className={`rounded-xl border px-2.5 py-2 transition ${activePart === part.key ? "border-[#292929] bg-white" : "border-[#E7E2D9] bg-white/70"}`}>
            <button
              type="button"
              onClick={() => goTo(part.key)}
              className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-bold text-[#57514A] cursor-pointer"
            >
              <span>{part.label}</span>
              <span className="font-mono text-[10px] font-normal text-[#B0AAA2]">{(part.value || "").length}</span>
            </button>
            {part.evidence && <Evidence quotes={part.evidence} />}
          </div>
        ))}
      </aside>
    </div>
  );
}
