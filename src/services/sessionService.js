import { core } from "../api/core.js";

// 토큰은 Core 안에만 있고, 화면은 { signedIn, email, userId, expiresIn } 상태만 받는다.
// 로그인·가입·로그인 유지는 main 의 api/editorial(signIn, signUp, setKeepLogin)을 쓴다.
export const getSession = () => core.session();
export const signOut = () => core.signOut();
