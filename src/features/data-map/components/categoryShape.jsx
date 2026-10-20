// 분류 표시 — 색과 모양을 함께 쓴다(The Evidence Rule: 색 하나로만 구분하지 않는다).
// 기사 ● 큰 원 · 기획 ◆ · 원자료 ■ · 인터뷰 ● · 검증 ▲ · 노트 ● 작은 원 · 미확보 ◌ 점선
export function categoryShape(category, x, y, r, props = {}) {
  const className = `mark-${category}`;
  switch (category) {
    case "plan":
      return <polygon className={className} points={`${x},${y - r * 1.3} ${x + r * 1.3},${y} ${x},${y + r * 1.3} ${x - r * 1.3},${y}`} {...props} />;
    case "data":
      return <rect className={className} x={x - r} y={y - r} width={r * 2} height={r * 2} rx={r * 0.25} {...props} />;
    case "interview": {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const rad = i % 2 === 0 ? r * 1.35 : r * 0.58;
        pts.push(`${(x + Math.cos(angle) * rad).toFixed(2)},${(y + Math.sin(angle) * rad).toFixed(2)}`);
      }
      return <polygon className={className} points={pts.join(" ")} {...props} />;
    }
    case "verify":
      return <polygon className={className} points={`${x},${y - r * 1.25} ${x + r * 1.2},${y + r * 0.9} ${x - r * 1.2},${y + r * 0.9}`} {...props} />;
    case "note":
      return <polygon className={className} points={`${x},${y + r * 1.25} ${x + r * 1.2},${y - r * 0.9} ${x - r * 1.2},${y - r * 0.9}`} {...props} />;
    default:
      return <circle className={className} cx={x} cy={y} r={r} {...props} />;
  }
}
