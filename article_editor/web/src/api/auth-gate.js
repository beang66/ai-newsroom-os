// 로그인 필요 알림 — 코어가 AUTH_REQUIRED 로 답하면 화면이 로그인 창을 열고, 로그인하면 하던 요청을 한 번 다시 보낸다.
// App 이 setLoginHandler 로 "로그인 창을 열고 결과(true/false)를 돌려주는 함수"를 등록한다.
let handler = null;

export const setLoginHandler = (fn) => {
  handler = fn;
};

export const askLogin = () => (handler ? handler() : Promise.resolve(false));
