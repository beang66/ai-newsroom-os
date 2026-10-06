import { createElement, useEffect, useRef } from "react";
import "../assets/article-workspace.js";
export type ArticleDraft = {
  schemaVersion: number;
  articleId?: string;
  core_context?: { workspace_id: string; article_id: string; revision_id?: string; revision_no?: number };
  confirmed?: { headline: boolean; subheadline: boolean };
  title: string;
  subtitle: string;
  bodyHtml: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  photos: Record<string, unknown>[];
};
type WorkspaceElement = HTMLElement & { value: ArticleDraft; coreAdapter?: {request: (path: string,payload: unknown,state: ArticleDraft)=>Promise<unknown>;fetchPhoto:(id:string)=>Promise<Response>} };
export function ArticleWorkspace({
  initialValue,
  onChange,
  themeUrl,
  apiBase = "",
  draftKey = "current",
  coreAdapter,
}: {
  initialValue?: ArticleDraft;
  onChange?: (draft: ArticleDraft) => void;
  themeUrl?: string;
  apiBase?: string;
  draftKey?: string;
  coreAdapter?: WorkspaceElement["coreAdapter"];
}) {
  const ref = useRef<WorkspaceElement | null>(null);
  useEffect(() => { if(ref.current) ref.current.coreAdapter=coreAdapter; },[coreAdapter]);
  useEffect(() => {
    if (ref.current && initialValue) ref.current.value = initialValue;
  }, [initialValue]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const change = (e: Event) =>
      onChange?.((e as CustomEvent<ArticleDraft>).detail);
    node.addEventListener("article-change", change);
    return () => node.removeEventListener("article-change", change);
  }, [onChange]);
  return createElement("article-workspace", {
    ref,
    "theme-url": themeUrl,
    "api-base": apiBase,
    "draft-key": draftKey,
  });
}
