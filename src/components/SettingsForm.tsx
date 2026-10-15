"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, KeyRound, LoaderCircle } from "lucide-react";

type View = { source: "env" | "settings" | "none"; maskedKey: string; model: "mini" | "pro" };

export function SettingsForm({ initial }: { initial: View }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | "model" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fromEnv = view.source === "env";

  async function put(body: object, action: NonNullable<typeof busy>, success: string) {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<View> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save settings.");
      setView(data as View);
      setKey("");
      setMessage({ tone: "ok", text: success });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Couldn't save settings." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4 text-accent" aria-hidden /> Tavily API key
        </h2>
        <p className="mt-1 text-sm text-muted">
          Get a key at{" "}
          <a href="https://app.tavily.com" target="_blank" rel="noreferrer" className="text-accent underline">
            app.tavily.com
          </a>
          . It&apos;s stored only on this computer and checked with Tavily before saving.
        </p>

        <p className="mt-4 text-sm">
          {view.maskedKey ? (
            <span className="inline-flex items-center gap-1.5">
              <CircleCheck className="size-4 text-success" aria-hidden />
              Connected with key <code className="font-mono">{view.maskedKey}</code>
              {fromEnv && <span className="text-muted"> (set by the TAVILY_API_KEY environment variable)</span>}
            </span>
          ) : (
            <span className="text-muted">No key saved. Briefs use the free local engine.</span>
          )}
        </p>

        {!fromEnv && (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (key.trim()) put({ tavilyApiKey: key.trim() }, "save", "Key checked and saved.");
            }}
          >
            <label htmlFor="tavily-key" className="sr-only">
              Tavily API key
            </label>
            <input
              id="tavily-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={view.maskedKey ? "Paste a new key to replace it" : "tvly-…"}
              className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-sm placeholder:font-sans placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={!key.trim() || busy !== null}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {busy === "save" && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Check &amp; save
            </button>
            {view.source === "settings" && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => put({ tavilyApiKey: "" }, "remove", "Key removed.")}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </form>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Tavily research model</h2>
        <fieldset className="mt-3 grid gap-2 sm:grid-cols-2" disabled={busy !== null}>
          <legend className="sr-only">Model</legend>
          {(
            [
              ["mini", "Mini (recommended)", "About 10–70 credits per brief"],
              ["pro", "Pro", "15–250 credits per brief; deeper but slower"],
            ] as const
          ).map(([value, title, desc]) => (
            <label
              key={value}
              className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                view.model === value ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="model"
                className="sr-only"
                checked={view.model === value}
                onChange={() => put({ tavilyModel: value }, "model", "Model saved.")}
              />
              <span className="font-medium">{title}</span>
              <span className="text-xs text-muted">{desc}</span>
            </label>
          ))}
        </fieldset>
      </section>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-lg px-3 py-2 text-sm ${
            message.tone === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
