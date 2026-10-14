import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, MapPin, MoreHorizontal, Music, SlidersHorizontal, Smile, X } from "lucide-react";
import { photoDataUrl } from "../api/platform.js";
import { selectedCardPhoto } from "../lib/platformState.js";
import * as CardModel from "../../platform-generator/lib/card-model.js";
import * as CardTemplate from "../../platform-generator/lib/card-template.js";

const LIMIT = 500; // Threads 게시물 글자 수 제한
const ACCOUNT = "AI NEWSROOM";
const CARD_W = 1080, CARD_H = 1350, THUMB_W = 280;

function Avatar({ size = 36 }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-black text-white shadow-xs"
      title="Threads"
    >
      <svg
        style={{ width: size * 0.58, height: size * 0.58 }}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12.186 24C5.456 24 0 18.544 0 11.814 0 5.084 5.456 0 12.186 0c6.643 0 11.968 5.247 12.012 11.814v.373c0 3.003-1.666 4.887-4.148 4.887-1.42 0-2.616-.764-3.136-1.921-.762 1.258-2.022 1.921-3.649 1.921-2.923 0-5.071-2.31-5.071-5.26 0-3.045 2.193-5.355 5.26-5.355 1.764 0 3.19.789 3.864 2.115v-1.89h2.383v6.07c0 1.637.893 2.502 2.298 2.502 1.353 0 2.21-.968 2.21-2.482v-.373C21.768 6.398 17.433 2.2 12.186 2.2 6.678 2.2 2.2 6.678 2.2 12.186c0 5.508 4.478 9.986 9.986 9.986 3.152 0 5.923-1.455 7.747-3.866l1.764 1.341C19.467 22.39 16.035 24 12.186 24zm-.724-10.46c-1.637 0-2.872 1.235-2.872 2.872 0 1.637 1.235 2.872 2.872 2.872 1.637 0 2.872-1.235 2.872-2.872 0-1.637-1.235-2.872-2.872-2.872z" />
      </svg>
    </div>
  );
}

/** 카드뉴스 한 장의 미리보기(첨부 이미지 자리). 실제 스레드 첨부 사진 스타일로 렌더링 */
export function CardThumb({ card, index, total, article }) {
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
    <div
      className="group relative shrink-0 overflow-hidden rounded-2xl border border-[#E3DED5] bg-black shadow-sm"
      style={{ width: THUMB_W, height: CARD_H * scale }}
      data-testid="threads-card"
    >
      <iframe
        title={`카드 ${index + 1} 미리보기`}
        sandbox="allow-scripts"
        srcDoc={html}
        tabIndex={-1}
        style={{ width: CARD_W, height: CARD_H, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
      />
      {/* 우측 상단 닫기/삭제 버튼 */}
      <div className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
        <X className="h-3.5 w-3.5" />
      </div>
      {/* 좌측 하단 더보기 버튼 */}
      <div className="absolute bottom-2.5 left-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </div>
      {/* 페이지 표시 */}
      <span className="absolute right-2.5 bottom-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
        {index + 1}/{total}
      </span>
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

export default function ThreadsEditor({ draft, changed, Evidence, cards = [], article, showCards = true }) {
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
  const [activePost, setActivePost] = useState(null);
  const postId = (key) => `threads-post-${key}`;
  const goTo = (key) => {
    const el = document.getElementById(postId(key));
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  // 타래는 게시물마다 따로 올라가므로 500자 제한은 가장 긴 게시물 기준이다
  const longest = Math.max(0, ...posts.map((post) => (post.value || "").length));

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
    <div className="w-full min-w-0 max-w-[620px]" data-testid="threads-editor">
      <div className="mx-auto w-full overflow-hidden rounded-[24px] border border-[#E7E2D9] bg-white shadow-[0_10px_35px_rgba(0,0,0,0.08)]">
        {/* 상단 헤더: 취소 · 새로운 스레드 · 초안/더보기 */}
        <div className="flex items-center justify-between border-b border-[#F0EFEA] px-5 py-3.5 text-[15px]">
          <button type="button" className="text-[15px] font-medium text-[#101010] hover:opacity-70 transition">
            취소
          </button>
          <span className="font-bold text-[#101010]">새로운 스레드</span>
          <div className="flex items-center gap-2">
            <button type="button" className="p-1 text-[#101010] hover:opacity-70 transition" title="작성 초안">
              <FileText className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#DDD6CB] text-[#101010] hover:bg-black/5 transition"
              title="더보기"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 본문 단일 게시물 영역 */}
        <div className="px-5 pt-4">
          <div className="flex gap-3" data-testid="threads-post">
            {/* 왼쪽: 아바타와 하단 스레드에 추가로 이어지는 연결선 */}
            <div className="flex w-9 shrink-0 flex-col items-center">
              <Avatar />
              <div className="my-1.5 w-[2px] flex-1 rounded-full bg-[#E5E5E5]" />
            </div>

            {/* 오른쪽: 계정명 + 상단 텍스트 + 하단 이미지 + 툴바 */}
            <div className="min-w-0 flex-1 pb-2">
              <div className="flex items-center gap-1.5 text-[14px]">
                <span className="font-bold text-[#101010]">{ACCOUNT}</span>
                <span className="text-[#999]">›</span>
                <span className="text-[13px] text-[#999]">커뮤니티 또는 주제</span>
              </div>

              {/* 상단 텍스트 입력 영역 */}
              <div className="mt-1 space-y-2">
                {posts.map((post) => (
                  <ThreadTextPart
                    key={post.key}
                    id={postId(post.key)}
                    label={post.label}
                    value={post.value}
                    onChange={post.set}
                    onFocus={() => setActivePost(post.key)}
                    placeholder={post.key === "opening" ? "새로운 소식을 공유해보세요." : `${post.label}을 입력하세요...`}
                  />
                ))}
              </div>

              {/* 그 아래 이미지 영역 (카드뉴스 또는 카드뉴스 불러오기) */}
              {showCards && (
                <div className="mt-3" data-testid="threads-media">
                  {cards.length > 0 ? (
                    <div className="-mr-2 flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                      {cards.map((card, cardIndex) => (
                        <CardThumb key={card.card_id || cardIndex} card={card} index={cardIndex} total={cards.length} article={article} />
                      ))}
                    </div>
                  ) : (
                    /* 카드뉴스가 없을 때: 스레드 사진 박스 위치에 카드뉴스 불러오기 자리 */
                    <div className="group relative flex aspect-[16/10] w-full max-w-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#DDD6CB] bg-[#FAF8F5] p-6 text-center transition hover:border-[#292929] hover:bg-[#F3F0EA]">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm text-[#756F67] group-hover:scale-105 transition">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                      <p className="mt-3 text-xs font-bold text-[#292929]">카드뉴스 불러오기</p>
                      <p className="mt-1 text-[11px] text-[#8E8982]">
                        생성된 카드뉴스가 여기에 스레드 이미지로 첨부됩니다.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 이미지 아래 툴바 */}
              <div className="mt-3 flex items-center gap-4 text-[#999]" aria-hidden="true">
                <div className="flex items-center gap-1 text-[13px] text-[#8E8982]">
                  <ImageIcon className="h-[18px] w-[18px]" />
                  <span>추가</span>
                </div>
                <Smile className="h-[18px] w-[18px] text-[#8E8982]" />
                <FileText className="h-[18px] w-[18px] text-[#8E8982]" />
                <MapPin className="h-[18px] w-[18px] text-[#8E8982]" />
                <Music className="h-[18px] w-[18px] text-[#8E8982]" />
                <span className={`ml-auto text-[11px] font-mono ${longest > LIMIT ? "font-bold text-red-600" : "text-[#999]"}`}>
                  {longest}/{LIMIT}
                </span>
              </div>
            </div>
          </div>

          {/* 스레드에 추가 연결 줄 */}
          <div className="flex items-center gap-3 py-3">
            <div className="flex w-9 justify-center">
              <Avatar size={20} />
            </div>
            <span className="text-[14px] text-[#999]">스레드에 추가</span>
          </div>
        </div>

        {/* 하단 푸터 바: 게시물 옵션 · 게시 */}
        <div className="flex items-center justify-between border-t border-[#F0EFEA] px-5 py-3">
          <button type="button" className="flex items-center gap-1.5 text-[13px] font-medium text-[#756F67] hover:text-[#101010] transition">
            <SlidersHorizontal className="h-4 w-4" />
            <span>게시물 옵션</span>
          </button>
          <button
            type="button"
            disabled
            title="게시는 오른쪽 사이드바의 SNS 작성창 준비에서 진행합니다"
            className="rounded-xl border border-[#DDD6CB] bg-white px-5 py-1.5 text-[14px] font-bold text-[#101010] shadow-sm disabled:opacity-50"
          >
            게시
          </button>
        </div>
      </div>
    </div>

    {/* 오른쪽 옆: 단락별 흐름(게시물 순서대로 무엇을 말하는지). 누르면 그 게시물로 이동한다 */}
    <aside className="w-full max-w-[620px] space-y-1.5 lg:w-[200px] lg:max-w-none lg:sticky lg:top-4" data-testid="threads-flow">
      {posts.map((post, index) => (
        <button
          key={post.key}
          type="button"
          onClick={() => goTo(post.key)}
          className={`block w-full rounded-xl border px-2.5 py-2 text-left transition cursor-pointer ${activePost === post.key ? "border-[#292929] bg-white" : "border-[#E7E2D9] bg-white/70 hover:bg-white"}`}
        >
          <span className="flex items-center justify-between text-[11px] font-bold text-[#57514A]">
            <span>{index + 1}. {post.label}</span>
            <span className="font-mono text-[10px] font-normal text-[#B0AAA2]">{(post.value || "").length}</span>
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-[#756F67] line-clamp-3">{post.value || "—"}</span>
        </button>
      ))}
    </aside>
    </div>
  );
}

