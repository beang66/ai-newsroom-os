import React from "react";

/**
 * 데이터 맵 관계망 노드 및 범례 마크용 SVG 정의입니다.
 *
 * [색상 규칙 — 밝은 글래스 바탕 위의 회블랙 관계망]
 * - 분류와 관계없이 노드 색은 하나로 통일합니다(회블랙 그라데이션). 분류는 모양으로 구분합니다.
 * - 연결이 많은 노드(허브)·기사 노드는 더 진한 블랙 그라데이션(grad-hub).
 * - 선택한 노드만 짙은 하늘색 그라데이션(grad-selected)과 하늘색 빛 번짐(glow-radial-selected).
 */
const CATEGORIES = ["article", "plan", "data", "interview", "note", "verify"];

export default function CategoryGradients() {
  return (
    <defs>
      {/* 빛 번짐 효과를 위한 가우시안 블러 필터 */}
      <filter id="diffused-glow-filter" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5.5" />
      </filter>

      {/* 일반 노드: 모든 분류가 같은 회블랙 그라데이션과 은은한 회색 빛 번짐 */}
      {CATEGORIES.map((category) => (
        <radialGradient key={`glow-${category}`} id={`glow-radial-${category}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3F4349" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#3F4349" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#3F4349" stopOpacity="0" />
        </radialGradient>
      ))}
      {CATEGORIES.map((category) => (
        <radialGradient key={`grad-${category}`} id={`grad-${category}`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#6F747C" />
          <stop offset="100%" stopColor="#34373C" />
        </radialGradient>
      ))}

      {/* 허브(연결이 많은 노드)·기사 노드: 더 진한 블랙 */}
      <radialGradient id="grad-hub" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#4A4E55" />
        <stop offset="100%" stopColor="#141517" />
      </radialGradient>

      {/* 관계망 노드: 글래스모피즘 검회색(반투명 + 왼쪽 위 은은한 빛) */}
      <linearGradient id="grad-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#8A9099" stopOpacity="0.78" />
        <stop offset="100%" stopColor="#3A3E45" stopOpacity="0.88" />
      </linearGradient>
      <linearGradient id="grad-glass-hub" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#5A5F67" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#23262B" stopOpacity="0.94" />
      </linearGradient>

      {/* 선택한 노드: 짙은 하늘색 그라데이션과 하늘색 빛 번짐 */}
      <linearGradient id="grad-selected" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#0369A1" />
      </linearGradient>
      <radialGradient id="glow-radial-selected" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.85" />
        <stop offset="45%" stopColor="#0284C7" stopOpacity="0.40" />
        <stop offset="100%" stopColor="#075985" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}
