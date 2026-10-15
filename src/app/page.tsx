import { Suspense } from "react";
import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";
import { BriefList } from "@/components/BriefList";
import { NewBriefForm } from "@/components/NewBriefForm";
import { isTavilyConfigured, loadBriefs, loadTavilyStatus, loadTotals } from "@/lib/data";
import { pluralize } from "@/lib/format";

export default function Dashboard() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Turn a sermon into a one-page brief</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Upload slides, a PDF, or a transcript. You&apos;ll get a printable page with the big idea, outline, key
          quotes, takeaways and reflection questions, ready for bulletins and small groups.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Suspense fallback={<div className="h-[520px] animate-pulse rounded-xl border border-border bg-surface" />}>
          <NewBrief />
        </Suspense>

        <aside className="grid content-start gap-4">
          <Suspense fallback={<StatsSkeleton />}>
            <Stats />
          </Suspense>
          <Suspense fallback={<div className="h-36 animate-pulse rounded-xl border border-border bg-surface" />}>
            <TavilyCard />
          </Suspense>
        </aside>
      </div>

      <section className="mt-10" aria-labelledby="briefs-heading">
        <h2 id="briefs-heading" className="mb-3 text-lg font-semibold">
          Your briefs
        </h2>
        <Suspense fallback={<div className="h-48 animate-pulse rounded-xl border border-border bg-surface" />}>
          <Briefs />
        </Suspense>
      </section>
    </main>
  );
}

async function NewBrief() {
  return <NewBriefForm tavilyReady={await isTavilyConfigured()} />;
}

async function Briefs() {
  return <BriefList briefs={await loadBriefs()} />;
}

async function Stats() {
  const totals = await loadTotals();
  const items = [
    ["Briefs created", totals.total],
    ["This month", totals.thisMonth],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="h-[68px] animate-pulse rounded-xl border border-border bg-surface" />
      ))}
    </div>
  );
}

async function TavilyCard() {
  const [status, totals] = await Promise.all([loadTavilyStatus(), loadTotals()]);

  if (!status.connected) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4 text-muted" aria-hidden /> Tavily isn&apos;t connected
        </p>
        <p className="mt-1 text-muted">
          Briefs use the free local engine until you{" "}
          <Link href="/settings" className="text-accent underline">
            add your Tavily key in Settings
          </Link>
          .
        </p>
      </div>
    );
  }

  const usage = status.usage;
  const limit = usage?.planLimit ?? null;
  const percent = usage && limit ? Math.min(100, Math.round((usage.planUsage / limit) * 100)) : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-medium">
          <Coins className="size-4 text-accent" aria-hidden /> Tavily credits
        </p>
        {usage && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{usage.plan}</span>}
      </div>

      {usage ? (
        <>
          <p className="mt-3 text-2xl font-semibold tabular-nums">
            {usage.planUsage.toLocaleString()}
            {limit !== null && <span className="text-base font-normal text-muted"> / {limit.toLocaleString()}</span>}
          </p>
          <p className="text-xs text-muted">used on your plan this cycle (Tavily can take a while to update this)</p>
          {percent !== null && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Plan credits used"
            >
              <div
                className={`h-full rounded-full ${percent > 85 ? "bg-warning" : "bg-accent"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-muted">{status.error}</p>
      )}
      <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
        This app has used {pluralize(totals.credits, "credit")} across {pluralize(totals.total, "brief")}.
      </p>
    </div>
  );
}
