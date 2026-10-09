import { SiteHeader } from "@/components/shell";
import { PageLoading } from "@/components/ui";

/** /status runs its live RPC and service checks on the server before rendering; show progress. */
export default function Loading() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <PageLoading label="Running live checks…" />
    </div>
  );
}
