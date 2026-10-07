import Link from "next/link";
import { SiteHeader } from "@/components/shell";

export default function NotFound() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-fg-2">That page does not exist.</p>
        <Link href="/" className="mt-6 inline-block text-accent underline">
          Back to Imprest
        </Link>
      </main>
    </div>
  );
}
