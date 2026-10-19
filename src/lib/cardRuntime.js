// 카드 템플릿은 Node에서는 CommonJS, 브라우저에서는 전역 객체로 공개하는 기존 모듈이다.
// Vite 개발 서버의 ESM namespace에는 함수가 없으므로 두 실행 형태를 여기서 연결한다.
import * as modelModule from "../../platform-generator/lib/card-model.js";
import * as templateModule from "../../platform-generator/lib/card-template.js";

export const CardModel = modelModule.normalize ? modelModule : modelModule.default?.normalize ? modelModule.default : globalThis.CardModel;
export const CardTemplate = templateModule.markup ? templateModule : templateModule.default?.markup ? templateModule.default : globalThis.CardTemplate;
