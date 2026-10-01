import { createElement, useEffect, useRef } from "react";
import "../assets/article-workspace.js";
export type ArticleDraft = {
  schemaVersion: number;
  articleId?: string;
  confirmed?: { headline: boolean; subheadline: boolean };
  title: string;
  subtitle: string;
  bodyHtml: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  photos: Record<string, unknown>[];
};
type WorkspaceElement = HTMLElement & { value: ArticleDraft };
export function ArticleWorkspace({
  initialValue,
  onChange,
  themeUrl,
  apiBase = "",
  draftKey = "current",
}: {
  initialValue?: ArticleDraft;
  onChange?: (draft: ArticleDraft) => void;
  themeUrl?: string;
  apiBase?: string;
  draftKey?: string;
}) {
  const ref = useRef<WorkspaceElement | null>(null);
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
