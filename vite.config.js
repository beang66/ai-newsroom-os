import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// platform-generator/lib/card-model.js · card-template.js 는 Node(require)와 브라우저(전역)가 함께 쓰는 UMD 스크립트다.
// 빌드(npm run build)는 번들러가 CommonJS 로 처리해 import 가 되지만, 개발 서버(npm run dev)는 파일을 그대로
// 내려 보내서 export 가 하나도 없다("does not provide an export named 'default'").
// 개발 서버에서만 이 두 파일을 ES 모듈로 감싼다: 스크립트가 만든 전역(window.CardModel 등)을 default 와 이름 있는 export 로 내보낸다.
// (platform-generator 의 원본 파일은 건드리지 않는다)
const UMD_GLOBALS = { 'card-model.js': 'CardModel', 'card-template.js': 'CardTemplate' };
const umdAsEsm = () => ({
  name: 'platform-umd-as-esm',
  apply: 'serve',
  enforce: 'pre',
  transform(code, id) {
    const file = id.split('?')[0].replace(/\\/g, '/');
    const match = /\/platform-generator\/lib\/([^/]+\.js)$/.exec(file);
    const global = match && UMD_GLOBALS[match[1]];
    if (!global) return null;
    // 모듈 끝의 `const api={a,b,c}` 에서 공개 이름을 읽는다(이름 있는 import 도 되게)
    // `이름` 또는 `이름:값`(예: css:css+trailingCss) 형태 모두에서 이름만 읽고, 올바른 이름만 내보낸다
    const names = (/const api=\{([^}]*)\}/.exec(code)?.[1] || '').split(',').map((entry) => entry.split(':')[0].trim()).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
    const named = names.length ? `\nexport const { ${names.join(', ')} } = __umd;` : '';
    return { code: `${code}\nconst __umd = globalThis.${global};\nexport default __umd;${named}\n`, map: null };
  },
});

// 로컬 앱(파이썬 코어)이 이 빌드 결과를 그대로 서빙한다.
//   npm run build  →  article_editor/app/frontend/ (코어 서빙·PyInstaller 동봉)
export default defineConfig({
  plugins: [umdAsEsm(), react(), tailwindcss()],
  base: './',
  build: {
    outDir: 'article_editor/app/frontend',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      // platform-generator Node 서버의 로컬 초안 저장소 경로
      '/api/local': {
        target: process.env.PLATFORM_SERVER_URL || 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      // 개발(`npm run dev`) 중에는 로컬 코어(창 모드 서버)로 /api 를 넘긴다.
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        // 코어는 자기 주소에서 온 POST 만 받는다(Origin 검사). 개발 서버(5173)의 Origin 을 코어 주소로 바꿔야 저장·팩트체크가 된다
        headers: { Origin: 'http://127.0.0.1:8765' }
      }
    }
  }
})
