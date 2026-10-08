"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

/**
 * Rendered markdown uses plain <a> tags. Internal ones are routed client-side here so reading
 * docs never triggers a full page load (which would reset in-memory app state).
 */
export function DocArticle({ html }: { html: string }) {
  const router = useRouter();
  const onClick = (e: MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const href = a.getAttribute("href") ?? "";
    if (!href.startsWith("/") || href.startsWith("//")) return;
    e.preventDefault();
    router.push(href);
  };
  return <article className="prose-imprest" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
