// 로그인 필요 알림은 main 의 api/auth-gate.js 하나를 쓴다.
// 내 서비스(editorialStore)와 main 의 API 계층이 같은 로그인 창 핸들러를 공유한다.
export { setLoginHandler, askLogin } from "../api/auth-gate.js";
