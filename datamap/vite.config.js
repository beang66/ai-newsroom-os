import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 코어는 CORS 헤더가 없고 Host/Origin 이 자기 주소일 때만 허용하므로
// 개발 중에는 /api 를 프록시한다. 코어 포트는 런처가 8877~8899 중에서 고른다.
//   .env.local:  CORE_PROXY_TARGET=http://127.0.0.1:8877
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.CORE_PROXY_TARGET;
  return {
    plugins: [react()],
    server: {
      strictPort: true,
      proxy: target
        ? {
            "/api": {
              target,
              changeOrigin: true, // Host 를 코어 주소로 바꾼다
              configure(proxy) {
                proxy.on("proxyReq", (proxyReq) => {
                  if (proxyReq.getHeader("origin")) proxyReq.setHeader("origin", target);
                });
              },
            },
          }
        : undefined,
    },
  };
});
