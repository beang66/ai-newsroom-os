/** Server/Core boundary. Components call named functions, never routes or fetch.
 * App Core can inject its json(path, payload, signal) transport without UI changes.
 * knowledge/map exists in Contract v0.8, NOT yet in feature/app-core runtime.
 */
export class ApiError extends Error {
  constructor(
    message,
    { status = 0, code = "REQUEST_FAILED", requestId, retryable = true } = {},
  ) {
    super(message);
    this.name = "ApiError";
    Object.assign(this, { status, code, requestId, retryable });
  }
}

const TRANSCRIPTION_ENDPOINTS = {
  groq: "https://api.groq.com/openai/v1/audio/transcriptions",
  openai: "https://api.openai.com/v1/audio/transcriptions",
};

/**
 * Upload an audio file to the selected cloud transcription provider.
 * Audio/result shaping stays in the transcription feature; this function owns
 * the HTTP contract only.
 */
export async function requestCloudTranscription({
  file,
  provider,
  apiKey,
  signal,
  fetchImpl = globalThis.fetch,
}) {
  const normalizedProvider = provider === "groq" ? "groq" : "openai";
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "model",
    normalizedProvider === "groq" ? "whisper-large-v3" : "whisper-1",
  );
  formData.append("language", "ko");
  formData.append("response_format", "verbose_json");

  const response = await fetchImpl(
    TRANSCRIPTION_ENDPOINTS[normalizedProvider],
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal,
    },
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(errorBody.error?.message || `HTTP ${response.status}`, {
      status: response.status,
      code: errorBody.error?.code || "TRANSCRIPTION_FAILED",
      retryable: response.status >= 500,
    });
  }

  return response.json();
}

export function createDataMapApi({
  base = "",
  transport,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  async function request(path, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException("요청 시간이 초과되었습니다.", "TimeoutError"),
        ),
      timeoutMs,
    );
    try {
      if (transport) {
        // Race cancellation because a future IPC bridge may not physically cancel work.
        return await new Promise((resolve, reject) => {
          const cancel = () => reject(controller.signal.reason);
          if (controller.signal.aborted) return cancel();
          controller.signal.addEventListener("abort", cancel, { once: true });
          Promise.resolve()
            .then(() => transport.json(path, null, controller.signal))
            .then(resolve, reject)
            .finally(() =>
              controller.signal.removeEventListener("abort", cancel),
            );
        });
      }
      const response = await fetchImpl(base.replace(/\/$/, "") + path, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new ApiError(
          "데이터맵 응답을 읽을 수 없습니다. Core 연결 주소를 확인해 주세요.",
          { status: response.status, code: "INVALID_RESPONSE" },
        );
      }
      if (!response.ok) {
        const error = data?.error;
        throw new ApiError(
          typeof error === "string"
            ? error
            : error?.message || "데이터맵을 불러오지 못했습니다.",
          {
            status: response.status,
            code: error?.code,
            requestId: error?.request_id,
            retryable: error?.retryable ?? response.status >= 500,
          },
        );
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        "Core에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  return {
    getDataMap({ workspaceId, articleId, signal }) {
      if (!workspaceId || !articleId)
        return Promise.reject(
          new ApiError("작업공간과 저장된 기사를 먼저 선택해 주세요.", {
            code: "MISSING_CONTEXT",
            retryable: false,
          }),
        );
      const path = `/v1/workspaces/${encodeURIComponent(workspaceId)}/knowledge/map?article_id=${encodeURIComponent(articleId)}`;
      return request(path, signal);
    },
  };
}

const api = createDataMapApi({
  base: import.meta.env?.VITE_CORE_BASE_URL || "",
});
export const getDataMap = (params) => api.getDataMap(params);
