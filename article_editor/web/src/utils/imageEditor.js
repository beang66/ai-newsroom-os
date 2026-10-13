export function cropForRatio(w, h, ratio) {
  const r = ratio || w / h;
  let cw = w,
    ch = w / r;
  if (ch > h) {
    ch = h;
    cw = h * r;
  }
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}

export function renderDerivative(
  img,
  crop,
  masks,
  width = 1600,
  opacity = 1,
  hardness = 100,
) {
  const c = document.createElement("canvas");
  c.width = Math.min(width, Math.round(crop.w));
  c.height = Math.round((c.width * crop.h) / crop.w);
  const g = c.getContext("2d");
  g.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
  const s = c.width / crop.w;
  renderMosaics(g, img, masks, s, crop.x, crop.y, opacity, hardness);
  return c.toDataURL("image/jpeg", 0.92);
}

export function maskPath(mask, scale = 1, ox = 0, oy = 0) {
  const path = new Path2D();
  if (mask.type !== "brush") {
    path.rect(
      (mask.x - ox) * scale,
      (mask.y - oy) * scale,
      mask.w * scale,
      mask.h * scale,
    );
    return path;
  }
  const points = mask.points || [],
    r = mask.diameter / 2;
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      prev = points[i - 1] || p;
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(1, r / 3)),
    );
    for (let j = 0; j <= steps; j++) {
      const x = (prev.x + ((p.x - prev.x) * j) / steps - ox) * scale,
        y = (prev.y + ((p.y - prev.y) * j) / steps - oy) * scale;
      path.moveTo(x + r * scale, y);
      path.arc(x, y, r * scale, 0, Math.PI * 2);
    }
  }
  return path;
}

export function renderMosaics(
  g,
  img,
  masks,
  scale = 1,
  ox = 0,
  oy = 0,
  opacity = 1,
  hardness = 100,
) {
  if (!masks.length) return;
  const make = () => {
    const c = document.createElement("canvas");
    c.width = g.canvas.width;
    c.height = g.canvas.height;
    return c;
  };
  const union = make(),
    u = union.getContext("2d"),
    shape = make(),
    s = shape.getContext("2d");
  const raw = make(),
    r = raw.getContext("2d");
  const stamp = (mask, operation) => {
    r.clearRect(0, 0, raw.width, raw.height);
    r.fillStyle = "#fff";
    r.fill(maskPath(mask, scale, ox, oy));
    const diameter = mask.diameter || Math.min(mask.w, mask.h);
    const feather =
      diameter *
      scale *
      0.18 *
      (1 - Math.max(0, Math.min(100, hardness)) / 100);
    s.globalCompositeOperation = operation;
    s.filter = feather > 0 ? `blur(${feather}px)` : "none";
    s.drawImage(raw, 0, 0);
    s.filter = "none";
  };
  for (const m of masks) {
    s.clearRect(0, 0, shape.width, shape.height);
    s.globalCompositeOperation = "source-over";
    s.fillStyle = "#fff";
    stamp(m, "source-over");
    s.globalCompositeOperation = "destination-out";
    for (const e of m.erasures || []) stamp(e, "destination-out");
    u.drawImage(shape, 0, 0);
  }
  const layer = make(),
    l = layer.getContext("2d");
  l.filter = `blur(${Math.max(1, img.width / 75) * scale}px)`;
  l.drawImage(
    img,
    -ox * scale,
    -oy * scale,
    img.width * scale,
    img.height * scale,
  );
  l.filter = "none";
  l.globalCompositeOperation = "destination-in";
  l.drawImage(union, 0, 0);
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, opacity));
  g.drawImage(layer, 0, 0);
  g.restore();
}
