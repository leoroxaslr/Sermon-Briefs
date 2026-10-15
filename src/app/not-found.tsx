import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">We couldn&apos;t find that brief</h1>
      <p className="mt-2 text-muted">It may have been deleted. Your other briefs are still on the dashboard.</p>
      <Link href="/" className="mt-6 rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:bg-accent-hover">
        Back to dashboard
      </Link>
    </main>
  );
}
