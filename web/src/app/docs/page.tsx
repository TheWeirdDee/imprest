import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { SiteHeader } from "@/components/shell";
import { listDocs, readDoc } from "@/lib/proof";

export const metadata: Metadata = {
  title: "Docs",
  description: "Imprest documentation rendered from the repository: architecture, security, risk, testnet deployment and known limitations.",
  alternates: { canonical: "/docs" },
};
export const dynamic = "force-static";

const ORDER = ["README_JUDGES", "ARCHITECTURE", "SECURITY", "THREAT_MODEL", "EVIDENCE_STANDARD", "SETUP", "DEMO_RUNBOOK", "TESTNET_DEPLOYMENT", "KNOWN_LIMITATIONS", "FINAL_STATUS"];

function firstLine(md: string | null): string {
  if (!md) return "";
  const l = md.split("\n").find((x) => x.trim() && !x.startsWith("#"));
  return (l ?? "").replace(/[*`_]/g, "").slice(0, 160);
}

export default function DocsIndex() {
  const docs = listDocs().sort((a, b) => {
    const ia = ORDER.indexOf(a.replace(".md", ""));
    const ib = ORDER.indexOf(b.replace(".md", ""));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Documentation</h1>
        <p className="mt-1 text-sm text-fg-2">Rendered from the repository&apos;s docs/ folder.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {docs.map((d) => (
            <li key={d} className="min-w-0">
              <Link href={`/docs/${d}`} className="flex h-full gap-3 rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
                <FileText size={17} aria-hidden className="mt-0.5 shrink-0 text-accent" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="block text-sm font-semibold">{d.replace(".md", "").replace(/_/g, " ")}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">{firstLine(readDoc(d))}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
