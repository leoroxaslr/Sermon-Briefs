import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BriefWorkspace } from "@/components/BriefWorkspace";
import { isTavilyConfigured, loadBrief } from "@/lib/data";

export default function BriefPage({ params }: PageProps<"/briefs/[id]">) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <div className="mb-6 h-10 w-72 animate-pulse rounded-lg bg-surface-2" />
          <div className="mx-auto h-[70vh] max-w-[8.5in] animate-pulse rounded-sm bg-surface" />
        </main>
      }
    >
      <Brief params={params} />
    </Suspense>
  );
}

async function Brief({ params }: Pick<PageProps<"/briefs/[id]">, "params">) {
  const { id } = await params;
  const [brief, tavilyReady] = await Promise.all([loadBrief(id), isTavilyConfigured()]);
  if (!brief) notFound();
  return <BriefWorkspace initial={brief} tavilyReady={tavilyReady} />;
}
