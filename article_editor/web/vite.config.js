import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 로컬 앱(파이썬 코어)이 이 빌드 결과를 그대로 서빙한다.
//   npm run build  →  ../app/frontend/   (코어가 / · /assets/* 를 서빙, PyInstaller 동봉)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: '../app/frontend',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
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