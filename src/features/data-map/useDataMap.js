import { useEffect, useState } from "react";
import { getDataMap } from "../../api.js";
import { normalizeDataMap } from "./model.js";
import { createDemoDataMap } from "./demo.js";

export function useDataMap({ article, workspaceId, mode, load = getDataMap }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: "loading", model: null, error: null });
  const key = `${workspaceId || ""}:${article.id}:${mode}:${article.content}:${article.title}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => mode === "demo" ? createDemoDataMap(article) : load({ workspaceId, articleId: article.id, signal: controller.signal }))
      .then(payload => {
        if (controller.signal.aborted) return;
        const model = normalizeDataMap(payload, article.id);
        setState({ key, status: "ready", model, error: null });
      }).catch(error => {
        if (!controller.signal.aborted) setState({ key, status: "error", model: null, error });
      });
    return () => controller.abort();
  }, [key, article, workspaceId, mode, load, attempt]);
  return { ...(state.key === key ? state : { status: "loading", model: null }), retry: () => setAttempt(n => n + 1) };
}
