// 파일 목록(ResourceTable)에 보이는 자료 종류.
// 프로토타입의 세션 파일 추가/삭제(addSessionFiles/removeSessionFile)는 메모리 속 데모 데이터만 바꾸므로 옮기지 않았다 —
// 코어에 자료 업로드·삭제 라우트가 생기면(M4) web/src/api 를 거쳐 다시 붙인다.
export const FILE_KINDS = new Set(["source", "audio", "note"]);
