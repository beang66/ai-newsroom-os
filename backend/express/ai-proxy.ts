/**
 * 우리 백엔드(Render = 기존 Express 서버)에 붙이는 AI·사진 프록시 라우터.
 *
 * 앱(데스크톱 코어)에는 운영키가 없다. 이 라우터가 키를 보관하고 대신 호출하며,
 * 앱이 보낸 **Supabase 사용자 JWT**를 검증한다.
 *
 * 붙이는 방법 (server.ts):
 *   import { createAiProxyRouter } from "./backend/express/ai-proxy";
 *   app.use(createAiProxyRouter());          // ← 반드시 app.use(express.json(...)) **앞**에
 *
 * 환경변수(Render 대시보드):
 *   OPENAI_API_KEY, UNSPLASH_ACCESS_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
 *   AUTH_REQUIRED(기본 true), RATE_LIMIT_PER_MIN(기본 120)
 *   OPENAI_BASE_URL / UNSPLASH_BASE_URL  ← 시험용 대체(기본은 실제 서비스)
 *
 * 의존성 추가 없음 — Node 18+ 의 fetch 만 쓴다.
 */
import express, { type Request, type Response, type Router } from "express";

const OPENAI_BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const UNSPLASH_BASE = (process.env.UNSPLASH_BASE_URL || "https://api.unsplash.com").replace(/\/+$/, "");
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const AUTH_REQUIRED = process.env.AUTH_REQUIRED !== "false";
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 120);

const hits = new Map<string, number[]>();
function rateOk(user: string): boolean {
  const now = Date.now();
  const recent = (hits.get(user) || []).filter((t) => now - t < 60_000);
  if (recent.length >= RATE_LIMIT_PER_MIN) {
    hits.set(user, recent);
    return false;
  }
  recent.push(now);
  hits.set(user, recent);
  return true;
}

async function userId(req: Request): Promise<string | null> {
  if (!AUTH_REQUIRED) return "dev";
  const header = req.header("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  if (!token || !SUPABASE_URL) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: unknown };
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

async function guard(req: Request, res: Response): Promise<string | null> {
  const user = await userId(req);
  if (!user) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return null;
  }
  if (!rateOk(user)) {
    res.status(429).json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." });
    return null;
  }
  return user;
}

async function relay(
  res: Response,
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string | Buffer },
): Promise<void> {
  try {
    const upstream = await fetch(url, init);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res
      .status(upstream.status)
      .type(upstream.headers.get("content-type") || "application/json")
      .set("Cache-Control", "no-store")
      .send(buffer);
  } catch {
    res.status(504).json({ error: "업스트림에 연결하지 못했습니다." });
  }
}

export function createAiProxyRouter(): Router {
  const router = express.Router();
  const json = express.json({ limit: "40mb" });

  router.get("/ai/health", (_req, res) => {
    res.json({
      ok: true,
      service: "ainewsroom-proxy",
      authRequired: AUTH_REQUIRED,
      openai: Boolean(process.env.OPENAI_API_KEY),
      unsplash: Boolean(process.env.UNSPLASH_ACCESS_KEY),
    });
  });

  router.post(["/ai/responses", "/ai/images/generations"], json, async (req, res) => {
    if (!(await guard(req, res))) return;
    const sub = req.path.replace(/^\/ai\//, "");
    await relay(res, `${OPENAI_BASE}/${sub}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}`,
      },
      body: JSON.stringify(req.body ?? {}),
    });
  });

  // 녹음 전사: multipart 본문을 파싱하지 않고 그대로 넘긴다(boundary 포함 Content-Type 유지)
  router.post("/ai/audio/transcriptions", express.raw({ type: "multipart/form-data", limit: "40mb" }), async (req, res) => {
    if (!(await guard(req, res))) return;
    await relay(res, `${OPENAI_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: {
        "Content-Type": req.headers["content-type"] || "multipart/form-data",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}`,
      },
      body: req.body as Buffer,
    });
  });

  router.get("/unsplash/*", async (req, res) => {
    if (!(await guard(req, res))) return;
    const suffix = req.path.replace(/^\/unsplash/, "");
    if (suffix === "/absolute") {
      const target = String(req.query.url || "");
      let host = "";
      try {
        host = new URL(target).hostname;
      } catch {
        host = "";
      }
      if (host !== "api.unsplash.com") {
        res.status(400).json({ error: "허용되지 않은 사진 주소입니다." });
        return;
      }
      await relay(res, target, { method: "GET", headers: { Accept: "application/json" } });
      return;
    }
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    await relay(res, `${UNSPLASH_BASE}${suffix}${query}`, {
      method: "GET",
      headers: {
        Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY || ""}`,
        "Accept-Version": "v1",
      },
    });
  });

  return router;
}
