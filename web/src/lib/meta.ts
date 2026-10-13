import type { Metadata } from "next";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://imprest-chi.vercel.app";
export const SITE_NAME = "Imprest";

/**
 * Per-page metadata: title, description, canonical URL, and matching Open Graph and Twitter tags
 * (with og:url), so a shared link to any page shows that page, not the landing page. The social
 * image comes from app/opengraph-image.tsx and app/twitter-image.tsx.
 */
export function pageMeta(title: string, description: string, path: string): Metadata {
  const full = `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", url: path, title: full, description },
    twitter: { card: "summary_large_image", title: full, description },
  };
}
