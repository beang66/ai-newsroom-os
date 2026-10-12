// 관계망 좌표계(KnowledgeGraph viewBox 1100×910)의 중심과 노드가 놓일 원.
export const MAP_CENTER = { x: 550, y: 455 };
export const MAP_RADIUS = 390;

export function insideCircle(point, radius = MAP_RADIUS) {
  const dx = point.x - MAP_CENTER.x;
  const dy = point.y - MAP_CENTER.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return point;
  const scale = radius / distance;
  return { x: MAP_CENTER.x + dx * scale, y: MAP_CENTER.y + dy * scale };
}
