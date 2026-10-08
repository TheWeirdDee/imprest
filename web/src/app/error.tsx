"use client";
import { buttonClass } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Something failed to load</h1>
      <p className="mt-2 text-sm text-fg-2">{error.message}</p>
      <button onClick={reset} className={buttonClass("secondary", "md", "mt-6")}>
        Try again
      </button>
    </main>
  );
}
