// Instagram 편집 화면 — 실제 Instagram 게시물 모양(계정 줄 · 사진 · 좋아요/댓글/보내기/저장 아이콘 · 캡션)으로 보이고, 캡션을 그 자리에서 바로 고친다.
//  - 캡션 안에는 단락 이름을 넣지 않는다. 단락별 흐름(도입·본문·마무리·해시태그)은 오른쪽 옆 목록에서 본다(누르면 그 단락으로 이동).
//  - 데이터와 수정 규칙은 기존 Instagram 편집과 같다: opening · paragraphs[] · closing · hashtags 를 고치면
//    validation_status 가 needs_recheck 로 바뀌어 원문 근거 재검수를 요구한다(changed). 여기서는 겉모습과 배치만 바꾼다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bookmark, Heart, Image as ImageIcon, MessageCircle, MoreHorizontal, Send } from "lucide-react";
import { CardThumb } from "./ThreadsEditor.jsx";

const LIMIT = 2200; // Instagram 캡션 글자 수 제한
const ACCOUNT = "AI NEWSROOM";

function Avatar({ size = 32 }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] shadow-xs"
      title="Instagram"
    >
      <svg
        style={{ width: size * 0.58, height: size * 0.58 }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
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

// 캡션 한 덩어리 ↔ 도입·본문·마무리·해시태그: 빈 줄로 단락을 나누고, 마지막 단락이 모두 #태그면 해시태그, 첫 단락은 도입, 마지막 단락은 마무리
const captionOf = (d) => [d.opening, ...(d.paragraphs || []), d.closing, (d.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
function parseCaption(text) {
  const blocks = text.split(/\n\s*\n/u).map((block) => block.trim()).filter(Boolean);
  let hashtags = [];
  if (blocks.length && blocks[blocks.length - 1].split(/\s+/u).every((word) => word.startsWith("#"))) hashtags = blocks.pop().split(/\s+/u);
  return {
    opening: blocks[0] || "",
    paragraphs: blocks.length > 2 ? blocks.slice(1, -1) : [],
    closing: blocks.length > 1 ? blocks[blocks.length - 1] : "",
    hashtags,
  };
}

/** draft: 생성 결과, changed(mutate): 수정 규칙(재검수 표시 포함), cards: 카드뉴스 카드들, article: 카드 사진 조회용 */
export default function InstagramEditor({ draft, changed, cards = [], article, showCards = true }) {
  const [activePart, setActivePart] = useState(null);
  const [text, setText] = useState(() => captionOf(draft));
  // 밖에서 원고가 바뀌었을 때(재생성 등)만 입력 내용을 다시 맞춘다 — 입력 중의 빈 줄·공백은 그대로 둔다
  useEffect(() => { if (captionOf(parseCaption(text)) !== captionOf(draft)) setText(captionOf(draft)); }, [draft]);
  const edit = (value) => {
    setText(value);
    const parsed = parseCaption(value);
    changed((next) => { Object.assign(next, parsed); });
  };
  const paragraphs = draft.paragraphs || [];
  const hashtags = (draft.hashtags || []).join(" ");
  const caption = [draft.opening, ...paragraphs, draft.closing, hashtags].filter(Boolean).join("\n\n");
  const partId = (key) => `instagram-part-${key}`;

  return (
    <div className="w-full max-w-4xl mx-auto" data-testid="instagram-editor">
      {/* 가로형 인스타그램 게시물 편집 카드 */}
      <article className="w-full overflow-hidden rounded-[24px] border border-[#ECECEC] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.08)] flex flex-col md:flex-row min-h-[500px]">
        {/* 좌측 열: 카드뉴스 및 이미지 미디어 영역 */}
        {showCards && (
          <div className="md:w-1/2 lg:w-[48%] border-b md:border-b-0 md:border-r border-[#F2F2F2] bg-[#FAFAFA] flex flex-col justify-center items-center p-4 relative shrink-0" data-testid="instagram-media">
            {cards.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto w-full py-2 scrollbar-thin">
                {cards.map((card, cardIndex) => (
                  <CardThumb key={card.card_id || cardIndex} card={card} index={cardIndex} total={cards.length} article={article} />
                ))}
              </div>
            ) : (
              <div className="flex aspect-[4/5] w-full max-w-[320px] items-center justify-center text-[#C7C2BB] rounded-2xl border border-dashed border-zinc-200 bg-white/60" title="카드뉴스를 생성하면 이 자리에 붙습니다">
                <ImageIcon className="h-10 w-10 text-zinc-300" />
              </div>
            )}
          </div>
        )}

        {/* 우측 열: 프로필 헤더 + 캡션 본문 편집 + 액션바/글자수 */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <header className="flex items-center gap-2.5 border-b border-[#F2F2F2] px-5 py-3.5 shrink-0">
            <Avatar />
            <span className="text-[14px] font-bold text-[#101010]">{ACCOUNT}</span>
            <MoreHorizontal className="ml-auto h-5 w-5 text-[#101010]" aria-hidden="true" />
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-[280px]">
            <div className="flex items-center gap-2 mb-2">
              <Avatar size={24} />
              <span className="text-[13px] font-bold text-[#101010]">{ACCOUNT}</span>
            </div>
            <div className="mt-1">
              <CaptionPart id={partId("caption")} label="캡션" value={text} onChange={edit} onFocus={() => setActivePart(null)} />
            </div>
          </div>

          <div className="border-t border-[#F2F2F2] px-5 py-3 shrink-0 bg-white">
            <div className="flex items-center gap-4 text-[#101010]" aria-hidden="true">
              <Heart className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <Send className="h-5 w-5" />
              <Bookmark className="ml-auto h-5 w-5" />
            </div>
            <p className={`mt-2 text-right font-mono text-[11px] ${caption.length > LIMIT ? "font-bold text-red-600" : "text-[#B0AAA2]"}`}>
              {caption.length.toLocaleString()}/{LIMIT.toLocaleString()}
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
