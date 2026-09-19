import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialize Gemini client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAIClient;
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", aiConfigured: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" });
});

// AI Review critique endpoint
app.post("/api/ai/review", async (req, res) => {
  const { title, nodes, materials } = req.body;
  const ai = getGenAI();

  if (!ai) {
    // Return high-quality heuristic editorial critiques if no API key
    return res.json({
      success: true,
      critiques: generateHeuristicCritiques(nodes, materials),
      source: "editorial-engine",
    });
  }

  try {
    const prompt = `당신은 탐사보도 전문 뉴스룸(로이터, 프로퍼블리카, 블룸버그 등)의 수석 데스크 및 팩트체커입니다.
구조화된 노드와 취재 자료로 구성된 기사 초고를 분석하십시오.
네 가지 범주("fact", "logic", "balance", "source")로 평가하십시오.
핵심 원칙:
- 단정적인 어조나 기자를 비난하는 표현을 절대 사용하지 마십시오.
- 절제된 언론 윤리 표현을 사용하십시오: "추가 검증 필요", "근거 자료 누락", "확인 필요", "논리적 인과관계 보완", "출처 표기 권장".
- 기자가 최종 보도 결정권을 갖습니다.
- 중요: 모든 title, description, suggestedFix는 자연스럽고 정제된 한국어 언론 보도 용어로 작성하십시오.

기사 제목: ${title || "무제"}
기사 본문 노드:
${JSON.stringify(nodes, null, 2)}

취재 자료 목록:
${JSON.stringify(materials, null, 2)}

반드시 다음 스키마를 만족하는 JSON 배열만 반환하십시오:
[
  {
    "id": "critique-1",
    "category": "fact" | "logic" | "balance" | "source",
    "severity": "warning" | "suggestion" | "note",
    "title": "간결한 검토 제목 (예: 근거 자료 누락)",
    "description": "저널리즘 관점에서의 명확한 지적 및 설명",
    "nodeId": "특정 노드 ID 또는 빈 문자열",
    "suggestedFix": "실질적인 수정 제안 또는 대체 문장 (한국어)"
  }
]
JSON 형식만 출력하십시오.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "[]";
    const parsed = JSON.parse(text);
    return res.json({ success: true, critiques: parsed, source: "gemini" });
  } catch (error: any) {
    console.warn("Gemini review failed, using editorial engine:", error?.message);
    return res.json({
      success: true,
      critiques: generateHeuristicCritiques(nodes, materials),
      source: "editorial-engine-fallback",
    });
  }
});

// Text transformation endpoint (Rewrite, More neutral, More concise, Find source)
app.post("/api/ai/transform", async (req, res) => {
  const { action, text, context, materials } = req.body;
  const ai = getGenAI();

  if (!ai) {
    return res.json({
      success: true,
      result: heuristicTransform(action, text),
      source: "editorial-engine",
    });
  }

  try {
    let instruction = "";
    if (action === "neutral") {
      instruction = "이 기사 문장에서 주관적 편향, 감정적 수식어, 미확인 전제를 제거하고, 통신사(연합뉴스, 로이터 등)의 객관적·중립적 보도 문체로 한국어로 재작성하십시오.";
    } else if (action === "concise") {
      instruction = "기사의 사실 관계와 인용 출처는 온전히 보존하면서, 불필요한 군더더기 문구와 수동태를 덜어내고 간결하고 단문 위주의 한국어 통신사 문체로 압축하십시오.";
    } else if (action === "find-source") {
      instruction = "해당 문장의 주장을 뒷받침하기 위해 어떤 공공 기록, 전문 자료, 인터뷰 대상이 추가로 필요한지 구체적인 취재 방안을 한국어로 제안하십시오.";
    } else {
      instruction = "명확하고 능동적인 정통 저널리즘 리듬을 살려 전달력 높은 한국어 보도 문장으로 다듬어주십시오.";
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `${instruction}\n\n원문: "${text}"\n노드 전후 문맥: "${context || ""}"`,
    });

    return res.json({
      success: true,
      result: (response.text || "").trim(),
      source: "gemini",
    });
  } catch (err: any) {
    return res.json({
      success: true,
      result: heuristicTransform(action, text),
      source: "editorial-engine-fallback",
    });
  }
});

// Ask Journalist Assistant endpoint
app.post("/api/ai/ask", async (req, res) => {
  const { question, materials, nodes } = req.body;
  const ai = getGenAI();

  if (!ai) {
    return res.json({
      success: true,
      answer: heuristicAsk(question, materials),
      source: "editorial-engine",
    });
  }

  try {
    const prompt = `당신은 AI 뉴스룸 취재 보조 어시스턴트입니다. 기자가 현재 작성 중인 기사와 관련된 취재 자료(녹취록, 공문서, 감사 보고서 등)에 대해 질문하고 있습니다.
모든 답변은 철저히 제공된 취재 자료에 근거하여 한국어로 답변하십시오. 정보가 없거나 불명확한 경우 "추가 검증 필요" 또는 "현재 취재 자료에서 확인되지 않음"이라고 명확히 밝히십시오. 자료명, 인터뷰 대상자, 발언 시점(타임스탬프)을 구체적으로 인용하십시오.

기자의 질문:
${question}

취재 자료 목록:
${JSON.stringify(materials, null, 2)}

현재 기사 노드:
${JSON.stringify(nodes, null, 2)}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });

    return res.json({
      success: true,
      answer: response.text || "응답을 생성하지 못했습니다.",
      source: "gemini",
    });
  } catch (err: any) {
    return res.json({
      success: true,
      answer: heuristicAsk(question, materials),
      source: "editorial-engine-fallback",
    });
  }
});

// Heuristic fallbacks for robust operation
function generateHeuristicCritiques(nodes: any[], materials: any[]) {
  const critiques: any[] = [];
  
  // Check for claims without linked sources
  nodes?.forEach((node) => {
    if (node.type === "CLAIM" && (!node.linkedSourceIds || node.linkedSourceIds.length === 0)) {
      critiques.push({
        id: `c-claim-${node.id}`,
        category: "source",
        severity: "warning",
        title: "근거 자료 누락",
        description: "해당 주장은 공식 1차 공문서나 실명 인터뷰 기록과 연결되어 있지 않습니다.",
        nodeId: node.id,
        suggestedFix: "엘레나 밴스 박사 인터뷰 녹취(14:32) 또는 2024 환경청 특별감사 보고서 링크를 연결하십시오.",
      });
    }

    if (node.type === "FACT" && node.text?.match(/\d+%/)) {
      critiques.push({
        id: `c-stat-${node.id}`,
        category: "fact",
        severity: "warning",
        title: "추가 검증 필요",
        description: "이 문장의 백분율 수치는 지자체 정밀 측정치 로그와 대조하여 교차 검증을 거쳐야 합니다.",
        nodeId: node.id,
        suggestedFix: "해당 수치가 순간 최고 농도인지, 분기별 평균치인지 명확히 구분하여 표기하십시오.",
      });
    }

    if (node.type === "QUOTE" && (!node.timestamp || !node.interviewSource)) {
      critiques.push({
        id: `c-quote-${node.id}`,
        category: "source",
        severity: "note",
        title: "확인 필요",
        description: "인용구의 화자 직책이나 음성 녹음 상의 구체적 발언 시점(타임스탬프)이 누락되었습니다.",
        nodeId: node.id,
        suggestedFix: "보도 공정성 확보를 위해 인터뷰 음성 파일의 정확한 재생 시점(예: 14:32)을 기재하십시오.",
      });
    }
  });

  // Balance critique
  const hasOfficialDenial = nodes?.some((n: any) => 
    n.text?.includes("부인") || 
    n.text?.includes("해명") || 
    n.text?.includes("대변인") || 
    n.text?.includes("입장을 밝히지 않") ||
    n.text?.toLowerCase().includes("denied")
  );
  if (!hasOfficialDenial) {
    critiques.push({
      id: "c-balance-1",
      category: "balance",
      severity: "warning",
      title: "균형성 검토 필요",
      description: "기사 발행 전 피고발 기관(수자원청) 또는 당사자의 공식 해명이나 반론권 보장 여부가 누락되었습니다.",
      nodeId: "",
      suggestedFix: "수자원청 대변인실에 질의서를 발송한 일시 및 반론 접수 여부를 본문 맥락에 추가하십시오.",
    });
  }

  // Logic critique
  critiques.push({
    id: "c-logic-1",
    category: "logic",
    severity: "suggestion",
    title: "논리적 인과관계 보완",
    description: "내부 감사 보고서 인지 시점과 이사회 표결 시점 간의 인과관계를 명확히 서술할 필요가 있습니다.",
    nodeId: nodes?.[2]?.id || "",
    suggestedFix: "일정 명시: 3월 12일 최종 감사 보고서 수신 후, 3월 18일 안건 표결이 강행되었음을 명확히 기재하십시오.",
  });

  return critiques;
}

function heuristicTransform(action: string, text: string): string {
  if (action === "neutral") {
    return text
      .replace(/충격적인/g, "공식 확인된")
      .replace(/노골적으로/g, "")
      .replace(/의혹이 짙은/g, "내부 감사 기록에 따르면")
      .replace(/파괴적인/g, "중대한 영향이 있는")
      .trim();
  }
  if (action === "concise") {
    return text
      .replace(/주목할 필요가 있는 점은/g, "")
      .replace(/~라는 사실에 기인하여/g, "~로 인해")
      .replace(/진행 중에 있는 상황이다/g, "진행 중이다")
      .trim();
  }
  if (action === "find-source") {
    return "2024년도 환경청 감사 결과 보고서(42페이지) 또는 엘레나 밴스 박사 증언 녹취(14:32)와 대조 확인하십시오.";
  }
  return text.trim();
}

function heuristicAsk(question: string, materials: any[]): string {
  const q = question.toLowerCase();
  if (q.includes("밴스") || q.includes("vance") || q.includes("인터뷰") || q.includes("증언")) {
    return `[취재 자료 근거 - 주 수자원청 전 부국장 엘레나 밴스 박사 인터뷰 녹취록 [14:32]]:
"지난 5월 벤젠 검출치가 허용 기준인 18 ppb를 두 차례 초과 감지되었으나, 시의회에 보고된 월간 종합 보고서에서는 두 차례의 이상 수치 기록이 모두 삭제되었습니다."

검증 참고: 이사회 간사가 해당 원본 수치 보고서를 실제로 열람·결재했는지 추가 확인이 필요합니다.`;
  }
  if (q.includes("감사") || q.includes("보고서") || q.includes("검출") || q.includes("수치") || q.includes("오염")) {
    return `[취재 자료 근거 - 2024년 환경청 제5지부 정기 감사 보고서 (문서번호 #EPA-2024-W8)]:
- 14페이지: 폭우 유입 집중 시기에 수질 센서 재보정이 3차례 연속 임의 실행된 내역 확인.
- 28페이지: 손 이사장 및 수자원청장 직속 보고가 6월 4일 최종 완료됨.
- 상태: 뉴스룸 보관소 정합성 검증 완료.`;
  }
  return `[현재 등록된 취재 자료 분석 결과]:
- 총 4건의 주요 1차 사료(단독 인터뷰 녹취록 2건, 공공 규제 문서 1건, 외부 수질시험 성적서 1건) 연계 중.
- 외주 용역업체 내부 업무 메신저/이메일 기록은 미확보 상태이므로, 정보공개청구(FOIA) 신청을 권장합니다.`;
}

// Start server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Newsroom OS Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
