// 전사 결과를 화면·복사·다운로드용 글로 만드는 도우미 — STT 서버와 전사 저장 구조는 바꾸지 않고 화면에서만 가공한다.
//  - 화자·단락 구분: 같은 화자가 이어서 말한 구간을 한 단락으로 묶고 "[화자 1] 00:00:00" 머리말을 붙인다
//  - 통글: 화자 표시와 단락 구분 없이 이어진 한 덩어리 글

/** 같은 화자의 연속된 발언(dialogues)을 한 단락으로 묶는다. id 는 단락의 첫 발언 id, ids 는 묶인 발언 id 전부. */
export function mergeBySpeaker(dialogues) {
  const paragraphs = [];
  for (const item of dialogues || []) {
    const text = String(item.text || "").trim();
    if (!text) continue;
    const last = paragraphs[paragraphs.length - 1];
    if (last && last.speakerName === item.speakerName) {
      last.ids.push(item.id);
      last.items.push(item);
      last.text = `${last.text} ${text}`;
    } else {
      paragraphs.push({ id: item.id, ids: [item.id], items: [item], speaker: item.speaker, speakerName: item.speakerName, timestamp: item.timestamp, text });
    }
  }
  return paragraphs;
}

/** 화자·단락 구분 글: 단락마다 "[화자] 시각" 머리말 + 본문, 단락 사이는 빈 줄 */
export function speakerText(dialogues, formatTime) {
  return mergeBySpeaker(dialogues)
    .map((paragraph) => `[${paragraph.speakerName}] ${formatTime(paragraph.timestamp)}\n${paragraph.text}`)
    .join("\n\n");
}

/** 통글: 화자·단락 구분 없이 이어 붙인 글 */
export function plainText(dialogues) {
  return (dialogues || []).map((item) => String(item.text || "").trim()).filter(Boolean).join(" ");
}
