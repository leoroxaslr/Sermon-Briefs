import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { SettingsForm } from "@/components/SettingsForm";
import { maskKey, tavilySettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-muted">Connect Tavily to write briefs with AI. Without it, the free local engine is used.</p>
      <Suspense fallback={<div className="mt-6 h-72 animate-pulse rounded-xl border border-border bg-surface" />}>
        <Settings />
      </Suspense>
    </main>
  );
}

async function Settings() {
  await connection();
  const s = tavilySettings();
  return <SettingsForm initial={{ source: s.source, maskedKey: maskKey(s.apiKey), model: s.model }} />;
}
