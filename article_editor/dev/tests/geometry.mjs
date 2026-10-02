import assert from "node:assert/strict";
import fs from "node:fs";
const src = fs.readFileSync(
  new URL("../../app/frontend-legacy/assets/image-editor.js", import.meta.url),  // 레거시 UI(이식 전) 전용
  "utf8",
);
const { cropForRatio, clampCrop, resizeCrop } = await import(
  "data:text/javascript;base64," + Buffer.from(src).toString("base64")
);
let count = 0;
for (const [w, h] of [
  [800, 600],
  [600, 800],
  [4000, 500],
  [1280, 720],
  [1, 1],
])
  for (const ratio of [0, 16 / 9, 4 / 3, 1, 3 / 2]) {
    const c = cropForRatio(w, h, ratio);
    assert.ok(c.x >= 0 && c.y >= 0);
    assert.ok(c.x + c.w <= w + 1e-8 && c.y + c.h <= h + 1e-8);
    assert.ok(Math.abs(c.w / c.h - (ratio || w / h)) < 1e-8);
    count++;
    const moved = clampCrop({ ...c, x: -4000, y: 4000 }, w, h);
    assert.ok(
      moved.x >= 0 &&
        moved.y >= 0 &&
        moved.x + moved.w <= w + 1e-8 &&
        moved.y + moved.h <= h + 1e-8,
    );
    count++;
  }
console.log("PASS crop ratios and boundaries:", count, "cases");

for (const handle of ["nw", "ne", "sw", "se"]) {
  const rect = resizeCrop(
    { x: 100, y: 100, w: 400, h: 225 },
    handle,
    { x: 50, y: 50 },
    800,
    600,
    16 / 9,
  );
  assert.ok(
    rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.w <= 800 + 1e-7 &&
      rect.y + rect.h <= 600 + 1e-7,
  );
  assert.ok(Math.abs(rect.w / rect.h - 16 / 9) < 1e-7);
}
console.log("PASS four corner handles preserve ratio and boundaries");
