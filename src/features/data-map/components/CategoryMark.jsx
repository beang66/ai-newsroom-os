import { categoryShape } from "./categoryShape.jsx";
import CategoryGradients from "./CategoryGradients.jsx";

// 분류 범례·목록용 작은 표시. 관계망 노드도 같은 categoryShape 로 그린다.
export default function CategoryMark({ category, size = 12 }) {
  return (
    <svg className="category-mark" width={size} height={size} viewBox="-8 -8 16 16" aria-hidden="true">
      <CategoryGradients />
      {category !== "missing" && (
        <circle
          cx="0"
          cy="0"
          r="6.8"
          fill={`url(#glow-radial-${category || "verify"})`}
          filter="url(#diffused-glow-filter)"
          pointerEvents="none"
        />
      )}
      {categoryShape(category, 0, 0, category === "article" ? 5.5 : 4.6)}
    </svg>
  );
}
