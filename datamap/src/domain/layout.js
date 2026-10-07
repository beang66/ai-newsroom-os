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

export function articlePosition(cluster) {
  if (cluster === 0) return { ...MAP_CENTER };
  const angleOffsets = [-0.04, 0.07, -0.09, 0.05, -0.02, 0.08, -0.06];
  const radii = [254, 271, 259, 275, 263, 269, 256];
  const angle =
    -Math.PI / 2 +
    ((cluster - 1) * Math.PI * 2) / 7 +
    angleOffsets[cluster - 1];
  return {
    x: MAP_CENTER.x + Math.cos(angle) * radii[cluster - 1],
    y: MAP_CENTER.y + Math.sin(angle) * radii[cluster - 1],
  };
}
