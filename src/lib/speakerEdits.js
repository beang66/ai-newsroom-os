// 화자 수정(이름 바꾸기 · 합치기 · 구간 지정)은 CLOVA 가 준 발언(dialogues) 위에 덧씌우는 얇은 층이다. 원본은 바꾸지 않는다.
//  - names:  { 화자키: 표시 이름 }          화자 키 하나의 이름
//  - merge:  { 화자키: 합칠 대상 화자키 }    이 화자의 모든 발언을 대상 화자로 본다
//  - assign: { 발언 id: 화자키 }           발언 하나를 다른 화자로 지정한다(구간 지정). 합치기보다 먼저 적용된다

export const emptyEdits = () => ({ names: {}, merge: {}, assign: {} });

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const text = (value) => String(value ?? "").trim();
const NAME_MAX = 40;
const CUSTOM = /^custom-(\d+)$/;

export const speakerKey = (item) => text(item?.speaker) || text(item?.speakerName) || "unknown";

/** 합치기 사슬을 따라 최종 화자 키를 찾는다. 순환은 끊는다. */
export function resolveKey(key, merge = {}) {
  const seen = new Set();
  let current = key;
  while (own(merge, current) && !seen.has(current)) {
    seen.add(current);
    current = merge[current];
  }
  return current;
}

/** 코어에서 받은 값이 어떤 모양이어도 안전한 수정 객체로 만든다(문자열 값만 남긴다). */
function sanitizeSpeakerEdits(raw) {
  const clean = emptyEdits();
  for (const field of Object.keys(clean)) {
    const source = raw && typeof raw === "object" ? raw[field] : null;
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === "string" && key && value) clean[field][key] = value;
    }
  }
  return clean;
}

export const isEdited = (edits) => Boolean(edits) && ["names", "merge", "assign"].some((field) => Object.keys(edits[field] || {}).length > 0);

/** 원본 발언에 수정을 적용한 발언 목록. 바뀐 것만 새 객체로 만들고 나머지는 그대로 돌려준다. */
export function applySpeakerEdits(dialogues, edits) {
  const e = edits || emptyEdits();
  const baseName = {};
  for (const item of dialogues || []) {
    const key = speakerKey(item);
    if (!own(baseName, key)) baseName[key] = text(item.speakerName) || key;
  }
  return (dialogues || []).map((item) => {
    const original = speakerKey(item);
    const picked = own(e.assign || {}, String(item.id)) ? e.assign[String(item.id)] : original;
    const key = resolveKey(picked, e.merge || {});
    const name = own(e.names || {}, key) ? e.names[key] : own(baseName, key) ? baseName[key] : key;
    return key === original && name === item.speakerName ? item : { ...item, speaker: key, speakerName: name };
  });
}

/** 화자 프로필 목록: 처음 나온 순서, 발언 수. 발언이 없는 새 화자(custom)도 함께 보여 준다. */
export function speakerList(dialogues, edits) {
  const applied = applySpeakerEdits(dialogues, edits);
  const order = [];
  const info = {};
  for (const item of applied) {
    if (!own(info, item.speaker)) {
      info[item.speaker] = { key: item.speaker, name: item.speakerName, count: 0 };
      order.push(item.speaker);
    }
    info[item.speaker].count += 1;
  }
  const e = edits || emptyEdits();
  for (const key of Object.keys(e.names || {})) {
    if (!own(info, key) && CUSTOM.test(key) && !own(e.merge || {}, key)) {
      info[key] = { key, name: e.names[key], count: 0 };
      order.push(key);
    }
  }
  return order.map((key) => info[key]);
}

/** 이름 바꾸기. 빈 이름은 원래 이름으로 되돌린다. */
export function renameSpeaker(edits, key, name) {
  const clean = text(name).slice(0, NAME_MAX);
  const names = { ...edits.names };
  if (clean) names[key] = clean;
  else delete names[key];
  return { ...edits, names };
}

/** from 화자를 into 화자로 합친다. 이미 같은 화자이거나 서로를 가리키게 되면 아무것도 하지 않는다. */
export function mergeSpeaker(edits, from, into) {
  const source = resolveKey(from, edits.merge);
  const target = resolveKey(into, edits.merge);
  if (source === target) return edits;
  return { ...edits, merge: { ...edits.merge, [source]: target } };
}

/** 발언 여러 개를 한 화자로 지정한다(구간 지정). */
export function assignDialogues(edits, ids, key) {
  const assign = { ...edits.assign };
  for (const id of ids) assign[String(id)] = key;
  return { ...edits, assign };
}

/** 새 화자를 만든다. 돌려주는 key 로 assignDialogues 를 이어서 부른다. */
export function addSpeaker(edits, name) {
  const used = [...Object.keys(edits.names), ...Object.keys(edits.merge), ...Object.values(edits.merge), ...Object.values(edits.assign)]
    .map((key) => CUSTOM.exec(key)).filter(Boolean).map((match) => Number(match[1]));
  const key = `custom-${(used.length ? Math.max(...used) : 0) + 1}`;
  return { key, edits: { ...edits, names: { ...edits.names, [key]: text(name).slice(0, NAME_MAX) || "새 화자" } } };
}

/** 화자 목록에서 몇 번째인지(프로필 모양을 정하는 데 쓴다. 같은 화자는 늘 같은 모양). */
export const speakerIndex = (speakers, key) => Math.max(0, speakers.findIndex((speaker) => speaker.key === key));

const sameName = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();

/** 화자 하나의 이름을 바꾼다. 다른 화자와 이름이 같으면 같은 사람이라는 뜻이라 그 화자로 합친다. 빈 이름은 원래 이름으로 되돌린다. */
export function renameSpeakerSmart(edits, speakers, key, name) {
  const clean = text(name).slice(0, NAME_MAX);
  if (!clean) return renameSpeaker(edits, key, "");
  const other = speakers.find((speaker) => speaker.key !== key && sameName(speaker.name, clean));
  return other ? mergeSpeaker(edits, key, other.key) : renameSpeaker(edits, key, clean);
}

/** 발언들을 이름으로 고른 화자에게 옮긴다. 같은 이름의 화자가 있으면 그 화자로, 없으면 새 화자를 만든다. */
export function assignByName(edits, speakers, ids, name) {
  const clean = text(name).slice(0, NAME_MAX);
  if (!clean || !ids.length) return edits;
  const existing = speakers.find((speaker) => sameName(speaker.name, clean));
  if (existing) return assignDialogues(edits, ids, existing.key);
  const added = addSpeaker(edits, clean);
  return assignDialogues(added.edits, ids, added.key);
}

/** 화자 고르기 목록: speakerList 에 "원래 CLOVA 가 붙인 이름"을 더한다. 이름을 고치거나 합쳐도 원래 이름이 남아 있다. */
export function speakerRoster(dialogues, edits) {
  const applied = applySpeakerEdits(dialogues, edits);
  const originals = {};
  (dialogues || []).forEach((item, index) => {
    const key = applied[index].speaker;
    const label = text(item.speakerName) || speakerKey(item);
    if (!originals[key]) originals[key] = [];
    if (!originals[key].includes(label)) originals[key].push(label);
  });
  return speakerList(dialogues, edits).map((speaker) => ({ ...speaker, originals: (originals[speaker.key] || []).filter((label) => label !== speaker.name) }));
}

/** 화면에 보이는 박스: CLOVA 가 나눈 대로(원래 화자가 같은 연속 발언) 묶는다. 이름을 고치거나 합쳐도 박스는 그대로이고 이름만 바뀐다. */
export function groupByOriginalSpeaker(dialogues, baseDialogues) {
  const original = {};
  for (const item of baseDialogues || []) original[String(item.id)] = speakerKey(item);
  const boxes = [];
  for (const item of dialogues || []) {
    const body = text(item.text);
    if (!body) continue;
    const origin = original[String(item.id)] ?? speakerKey(item);
    const last = boxes[boxes.length - 1];
    if (last && last.origin === origin) {
      last.ids.push(item.id);
      last.items.push(item);
      last.text = `${last.text} ${body}`;
    } else {
      boxes.push({ id: item.id, ids: [item.id], items: [item], origin, speaker: item.speaker, speakerName: item.speakerName, timestamp: item.timestamp, text: body });
    }
  }
  return boxes;
}

// ── 텍스트 수정과 형광펜: 화자 수정처럼 CLOVA 원본 위에 덧씌운다. 키는 화자 박스의 id(박스 첫 발언의 id) ──────────────
//  - texts: { 박스 id: 고친 글 }                      박스 전체 글을 대신한다
//  - marks: { 박스 id: [{ s, e, c }] }               글자 위치 [s, e) 에 형광펜 색 c. 글을 고치면 칠한 글 안에서 고친 만큼만 늘거나 줄어든다(앞·뒤 글이 바뀌어도 이동하지 않는다)
export const MARK_COLORS = {
  yellow: { label: "노랑", bg: "#FFF1A8" },
  orange: { label: "주황", bg: "#FFD9B0" },
  green: { label: "초록", bg: "#CDEFD4" },
  blue: { label: "파랑", bg: "#CFE3FF" },
  pink: { label: "분홍", bg: "#FFD3E2" },
};
const TEXT_MAX = 60_000;

/** 코어에서 받은 값이 어떤 모양이어도 안전한 수정 객체로 만든다. 글·형광펜은 쓰인 것만 남긴다. */
export function sanitizeEdits(raw) {
  const clean = sanitizeSpeakerEdits(raw);
  const texts = raw && typeof raw === "object" && raw.texts && typeof raw.texts === "object" && !Array.isArray(raw.texts) ? raw.texts : {};
  for (const [id, value] of Object.entries(texts)) {
    if (id && typeof value === "string" && value.trim() && value.length <= TEXT_MAX) (clean.texts ||= {})[id] = value;
  }
  const marks = raw && typeof raw === "object" && raw.marks && typeof raw.marks === "object" && !Array.isArray(raw.marks) ? raw.marks : {};
  for (const [id, list] of Object.entries(marks)) {
    if (!id || !Array.isArray(list)) continue;
    const valid = list.filter((m) => m && Number.isInteger(m.s) && Number.isInteger(m.e) && m.s >= 0 && m.e > m.s && m.e <= TEXT_MAX && own(MARK_COLORS, m.c))
      .map((m) => ({ s: m.s, e: m.e, c: m.c }));
    if (valid.length) (clean.marks ||= {})[id] = valid;
  }
  return clean;
}

/** 발언 박스 목록에 고친 글을 덧씌운다. 박스마다 원래 글(originalText)과 형광펜(marks)도 함께 돌려준다. */
export function applyTextEdits(boxes, edits) {
  const texts = (edits && edits.texts) || {};
  const marks = (edits && edits.marks) || {};
  return boxes.map((box) => ({
    ...box,
    originalText: box.text,
    text: own(texts, box.id) ? texts[box.id] : box.text,
    marks: marks[box.id] || [],
  }));
}

/** 글을 형광펜 조각으로 나눈다: [{ text, start, color|null }] — 이어 붙이면 원래 글이 된다. */
export function segmentsOf(textValue, marks) {
  const sorted = [...(marks || [])].filter((m) => m.s < textValue.length).sort((a, b) => a.s - b.s);
  const parts = [];
  let cursor = 0;
  for (const m of sorted) {
    const start = Math.max(m.s, cursor);
    const end = Math.min(m.e, textValue.length);
    if (end <= start) continue;
    if (start > cursor) parts.push({ text: textValue.slice(cursor, start), start: cursor, color: null });
    parts.push({ text: textValue.slice(start, end), start, color: m.c });
    cursor = end;
  }
  if (cursor < textValue.length) parts.push({ text: textValue.slice(cursor), start: cursor, color: null });
  return parts.length ? parts : [{ text: textValue, start: 0, color: null }];
}

// 형광펜 목록에서 [s, e) 구간을 비운다(겹친 형광펜은 남는 부분만 남긴다).
const carve = (list, s, e) => list.flatMap((m) => {
  if (m.e <= s || m.s >= e) return [m];
  return [m.s < s ? { ...m, e: s } : null, m.e > e ? { ...m, s: e } : null].filter(Boolean);
});
// 같은 색이 맞닿아 있으면 하나로 합친다.
const joinSame = (list) => [...list].sort((a, b) => a.s - b.s).reduce((out, m) => {
  const last = out[out.length - 1];
  if (last && last.c === m.c && last.e >= m.s) last.e = Math.max(last.e, m.e);
  else out.push({ ...m });
  return out;
}, []);
const withMarks = (edits, boxId, list) => {
  const marks = { ...(edits.marks || {}) };
  if (list.length) marks[boxId] = list;
  else delete marks[boxId];
  const next = { ...edits, marks };
  if (!Object.keys(marks).length) delete next.marks;
  return next;
};

/** 글자 위치 [start, end) 에 형광펜을 칠한다. */
export function addMark(edits, boxId, start, end, color, length) {
  const s = Math.max(0, start);
  const e = Math.min(length, end);
  if (e <= s || !own(MARK_COLORS, color)) return edits;
  const list = joinSame([...carve((edits.marks || {})[boxId] || [], s, e), { s, e, c: color }]);
  return withMarks(edits, boxId, list);
}

/** 글자 위치 [start, end) 의 형광펜을 지운다. */
export function removeMarks(edits, boxId, start, end) {
  const current = (edits.marks || {})[boxId] || [];
  const list = carve(current, start, end);
  return list.length === current.length && list.every((m, i) => m === current[i]) ? edits : withMarks(edits, boxId, list);
}

// ── 글을 고쳤을 때 형광펜 ─────────────────────────────────────────────────────────────────────────
// 형광펜은 글자 번호(위치)에 그대로 있고, "칠한 글 안에서" 고친 만큼만 늘거나 줄어든다. 앞·뒤 글이 바뀌어도 형광펜은 이동하지 않는다.
//  - 칠한 글 안에서 글자를 지우면 줄어든다.
//  - 칠한 글 한가운데에 글을 끼워 넣으면 함께 칠해진다.
//  - 칠한 단어를 통째로 다른 말로 바꾸면 새 말에도 형광펜이 이어진다.
//  - 칠한 글이 전부 지워지면 그 형광펜은 사라진다.
// 고치기 전·후 글은 글자 단위로 비교한다(앞·뒤 같은 부분은 먼저 걷어 내고, 가운데만 LCS 로 맞춘다).
const LCS_CELL_LIMIT = 4_000_000; // 가운데 부분이 이보다 크면(고친 곳이 아주 넓으면) 맞추지 않고 통째로 바뀐 것으로 본다

/** 글자 하나씩 짝: 앞·뒤 같은 부분 + 가운데 LCS. 돌려주는 값은 [옛 위치, 새 위치] 목록(순서대로). */
function matchChars(before, after) {
  let prefix = 0;
  const limit = Math.min(before.length, after.length);
  while (prefix < limit && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < limit - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const pairs = [];
  for (let i = 0; i < prefix; i += 1) pairs.push([i, i]);
  const n = before.length - prefix - suffix;
  const m = after.length - prefix - suffix;
  if (n > 0 && m > 0 && (n + 1) * (m + 1) <= LCS_CELL_LIMIT) {
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i * width + j] = before[prefix + i] === after[prefix + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (before[prefix + i] === after[prefix + j]) {
        pairs.push([prefix + i, prefix + j]);
        i += 1;
        j += 1;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i += 1;
      else j += 1;
    }
  }
  for (let k = suffix; k > 0; k -= 1) pairs.push([before.length - k, after.length - k]);
  return pairs;
}

/** 글을 고쳤을 때 형광펜을 맞춘다: 칠한 글 안에서 고친 만큼만 늘거나 줄이고, 나머지는 그대로 둔다. */
export function remapMarks(before, after, marks) {
  if (!marks || !marks.length || before === after) return marks || [];
  const pairs = matchChars(before, after);
  const edges = [[-1, -1], ...pairs, [before.length, after.length]];
  const hunks = []; // 바뀐 곳: 옛 글 [a, b) 가 새 글 [c, d) 로
  for (let k = 1; k < edges.length; k += 1) {
    const hunk = { a: edges[k - 1][0] + 1, b: edges[k][0], c: edges[k - 1][1] + 1, d: edges[k][1] };
    if (hunk.b > hunk.a || hunk.d > hunk.c) hunks.push(hunk);
  }
  let list = [];
  for (const m of [...marks].sort((x, y) => x.s - y.s)) {
    let end = m.e;
    for (const h of hunks) {
      const removed = h.b - h.a;
      const inserted = h.d - h.c;
      if (removed === 0) {
        if (m.s < h.a && h.a < m.e) end += inserted;                      // 칠한 글 한가운데에 끼워 넣은 글은 함께 칠한다(끝 경계는 아니다)
        continue;
      }
      const overlap = Math.min(h.b, m.e) - Math.max(h.a, m.s);
      if (overlap <= 0) continue;                                          // 칠한 글과 상관없는 곳은 건드리지 않는다
      end += m.s <= h.a && h.b <= m.e ? inserted - removed : -overlap;    // 칠한 글 안의 수정: 통째로 바꾸면 새 말도 칠하고, 지우면 줄어든다
    }
    end = Math.min(end, after.length);
    if (end > m.s) list = joinSame([...carve(list, m.s, end), { s: m.s, e: end, c: m.c }]);
  }
  return list;
}

/** 박스의 글을 고친다. 원래 글과 같아지면 고친 기록을 지운다. 형광펜은 칠한 글 안에서 고친 만큼만 늘거나 줄인다. */
export function setBoxText(edits, boxId, value, originalText) {
  const current = own(edits.texts || {}, boxId) ? edits.texts[boxId] : originalText;
  const texts = { ...(edits.texts || {}) };
  if (value === originalText) delete texts[boxId];
  else texts[boxId] = value;
  let next = { ...edits, texts };
  if (!Object.keys(texts).length) delete next.texts;
  next = withMarks(next, boxId, remapMarks(current, value, (edits.marks || {})[boxId] || []));
  return next;
}

/** 화자 이름·합치기·지정만 원래대로(글 수정과 형광펜은 남긴다). */
export function resetSpeakers(edits) {
  return { ...edits, names: {}, merge: {}, assign: {} };
}

/** 화면의 화자 박스: CLOVA 박스에 고친 화자 이름·글·형광펜을 모두 덧씌운 것. */
export const buildBoxes = (baseDialogues, edits) => applyTextEdits(groupByOriginalSpeaker(applySpeakerEdits(baseDialogues, edits), baseDialogues), edits);
