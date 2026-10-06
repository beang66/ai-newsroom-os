// 로컬 앱(코어) 연결 지점 — UI 컴포넌트는 **이 모듈만** 쓴다.
//
//   창 모드(pywebview): IPC 브리지  → 포트 없음
//   브라우저 개발(npm run dev): HTTP → /api (vite 프록시가 로컬 코어로 넘김)
//
// 경로 하드코딩은 src/api/core-api.js(계약) 밖에서 하지 않는다.
import { createAppApi } from "./index.js";

export const core = createAppApi({ mode: "auto" });

/** 코어 준비 상태 + 로그인 상태를 한 번에 (Header 표시용) */
export async function coreSnapshot() {
  try {
    const status = await core.status();
    let session = null;
    try {
      session = await core.session();
    } catch {
      session = null;
    }
    return { ok: true, status, session };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

/** 공용 테스트 계정 자동 로그인 켜기/끄기(개발 실행 전용) → 새 세션 상태 */
export const setAutoLogin = (enabled) => core.setAutoLogin(enabled);
