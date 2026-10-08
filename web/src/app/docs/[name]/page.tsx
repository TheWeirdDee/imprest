import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/shell";
import { listDocs, readDoc } from "@/lib/proof";
import { renderMarkdown } from "@/lib/markdown";
import { DocArticle } from "@/components/doc-article";

export function generateStaticParams() {
  return listDocs().map((name) => ({ name }));
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  return { title: name.replace(".md", "").replace(/_/g, " ") };
}

export default async function DocPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const md = readDoc(name);
  if (!md) notFound();
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/docs" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft size={14} aria-hidden /> All docs
        </Link>
        <DocArticle html={renderMarkdown(md)} />
      </main>
    </div>
  );
}
