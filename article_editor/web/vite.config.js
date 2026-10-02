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
        changeOrigin: true
      }
    }
  }
})