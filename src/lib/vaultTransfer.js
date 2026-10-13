// 다른 PC로 이전: 일회용 코드로 암호화한 이전 파일을 만들고, 새 PC에서 코드로 푼다.
// 코드는 백업 암호(코어가 12자 이상을 요구)로 그대로 쓰이는 무작위 값이다 — 사용자가 정하는 약한 암호를 피한다.
// 코어 호출(api/editorial)은 쓸 때 불러온다 — 코드 생성·정규화는 화면 없이도 시험할 수 있게
const api = () => import("../api/editorial");

// 헷갈리는 글자(0/O, 1/I)를 뺀 32자. 32 는 256 의 약수라 바이트 하나(& 31)가 편향 없이 한 글자가 된다.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUPS = 4;
const GROUP_LENGTH = 5;

/** 20자(약 100비트)를 5자씩 4묶음으로: XXXXX-XXXXX-XXXXX-XXXXX */
export function generateTransferCode(getRandomValues = (bytes) => crypto.getRandomValues(bytes)) {
  const bytes = getRandomValues(new Uint8Array(GROUPS * GROUP_LENGTH));
  const chars = Array.from(bytes, (byte) => ALPHABET[byte & 31]);
  return Array.from({ length: GROUPS }, (_, i) => chars.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH).join("")).join("-");
}

/** 사용자가 소문자·공백·하이픈 없이 입력해도 같은 코드로 맞춘다. 형식이 맞지 않으면 null */
export function normalizeTransferCode(input) {
  const letters = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (letters.length !== GROUPS * GROUP_LENGTH || [...letters].some((c) => !ALPHABET.includes(c))) return null;
  return Array.from({ length: GROUPS }, (_, i) => letters.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH)).join("-");
}

/** 이전 파일을 코드로 풀어 이 PC 의 현재 계정 자료로 바꾼다(코어가 교체 전 DB 를 안전 복사본으로 남긴다) */
export async function restoreTransferFile(code, file) {
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return (await api()).restoreVault(code, data);
}
