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
export function sanitizeEdits(raw) {
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
