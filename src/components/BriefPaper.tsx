"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { formatSermonDate } from "@/lib/format";
import { SECTION_LABELS, type BriefContent, type BriefOptions } from "@/lib/types";

/** Printable area of a US Letter page at 96 CSS px per inch, minus the paper's padding. */
const PAGE_CONTENT_HEIGHT = 11 * 96 - 2 * 0.5 * 96;
const MIN_SCALE = 0.78;

/**
 * The one-page brief. It shrinks its type (down to MIN_SCALE) until the content
 * fits on a single page, and flags it when even that isn't enough.
 */
export function BriefPaper({ content, options }: { content: BriefContent; options: BriefOptions }) {
  const ref = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure from full size each time the content changes, stepping down until it fits.
    let next = 1;
    el.style.setProperty("--scale", "1");
    const contentHeight = () => el.scrollHeight - 0.5 * 96 * 2;
    while (contentHeight() > PAGE_CONTENT_HEIGHT && next > MIN_SCALE) {
      next = Math.round((next - 0.02) * 100) / 100;
      el.style.setProperty("--scale", String(next));
    }
    setScale(next);
    setOverflows(contentHeight() > PAGE_CONTENT_HEIGHT + 2);
  }, [content, options]);

  const s = options.sections;
  const meta = [content.speaker, formatSermonDate(content.date)].filter(Boolean).join(" · ");
  const hasRight = (s.quotes && content.keyQuotes.length > 0) || (s.takeaways && content.takeaways.length > 0);

  return (
    <div className="relative">
      <article
        ref={ref}
        className="paper mx-auto shadow-[0_1px_3px_rgba(0,0,0,0.08),0_12px_40px_-12px_rgba(0,0,0,0.25)] print:shadow-none"
        style={{ ["--scale" as string]: scale }}
      >
        {/* Header */}
        <header className="border-b-2 pb-[0.9em]" style={{ borderColor: "var(--paper-ink)" }}>
          <div
            className="flex items-baseline justify-between gap-4 text-[0.78em] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--paper-accent)" }}
          >
            <span>{content.series || "Sermon Brief"}</span>
            {content.scriptures[0] && <span className="text-right">{content.scriptures.join(" · ")}</span>}
          </div>
          <h1 className="mt-[0.35em] font-serif text-[2.35em] leading-[1.08] font-semibold tracking-tight">
            {content.title}
          </h1>
          {meta && (
            <p className="mt-[0.35em] text-[0.95em]" style={{ color: "var(--paper-muted)" }}>
              {meta}
            </p>
          )}
        </header>

        {/* Big idea + summary */}
        {content.bigIdea && (
          <section
            className="paper-break-avoid mt-[1.1em] rounded-[3px] border-l-[3px] px-[1em] py-[0.7em]"
            style={{ borderColor: "var(--paper-accent)", background: "var(--paper-tint)" }}
          >
            <Label>The big idea</Label>
            <p className="font-serif text-[1.35em] leading-snug italic">{content.bigIdea}</p>
          </section>
        )}
        {content.summary && <p className="mt-[0.9em] text-[1.02em]">{content.summary}</p>}

        {/* Outline | quotes & takeaways */}
        <div className={`mt-[1.1em] grid gap-x-[1.6em] gap-y-[1.1em] ${hasRight && s.outline ? "grid-cols-[1.25fr_1fr]" : ""}`}>
          {s.outline && content.outline.length > 0 && (
            <section className="paper-break-avoid">
              <SectionTitle>{SECTION_LABELS.outline}</SectionTitle>
              <ol className="space-y-[0.6em]">
                {content.outline.map((part, i) => (
                  <li key={i} className="flex gap-[0.6em]">
                    <span
                      className="mt-[0.1em] grid size-[1.45em] shrink-0 place-items-center rounded-full text-[0.8em] font-semibold text-white"
                      style={{ background: "var(--paper-accent)" }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{part.heading}</p>
                      {part.points.length > 0 && (
                        <ul className="mt-[0.15em] space-y-[0.1em]" style={{ color: "var(--paper-muted)" }}>
                          {part.points.map((point, j) => (
                            <li key={j} className="pl-[0.9em] -indent-[0.9em]">
                              <span aria-hidden>–&nbsp;</span>
                              {point}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {hasRight && (
            <div className="space-y-[1.1em]">
              {s.quotes && content.keyQuotes.length > 0 && (
                <section className="paper-break-avoid">
                  <SectionTitle>{SECTION_LABELS.quotes}</SectionTitle>
                  <div className="space-y-[0.55em]">
                    {content.keyQuotes.map((quote, i) => (
                      <blockquote key={i} className="font-serif text-[1.05em] leading-snug italic">
                        “{quote.replace(/^["“]|["”]$/g, "")}”
                      </blockquote>
                    ))}
                  </div>
                </section>
              )}
              {s.takeaways && content.takeaways.length > 0 && (
                <section className="paper-break-avoid">
                  <SectionTitle>{SECTION_LABELS.takeaways}</SectionTitle>
                  <ul className="space-y-[0.35em]">
                    {content.takeaways.map((item, i) => (
                      <li key={i} className="flex gap-[0.5em]">
                        <span className="font-semibold" style={{ color: "var(--paper-accent)" }} aria-hidden>
                          ✓
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Reflection */}
        {s.reflection && content.reflectionQuestions.length > 0 && (
          <section className="paper-break-avoid mt-[1.2em] border-t pt-[0.9em]" style={{ borderColor: "var(--paper-rule)" }}>
            <SectionTitle>{SECTION_LABELS.reflection}</SectionTitle>
            <ol className="grid grid-cols-2 gap-x-[1.6em] gap-y-[0.6em]">
              {content.reflectionQuestions.map((q, i) => (
                <li key={i} className="flex gap-[0.5em]">
                  <span className="font-semibold" style={{ color: "var(--paper-accent)" }}>
                    {i + 1}.
                  </span>
                  <span>{q}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Application + prayer */}
        {((s.application && content.application) || (s.prayer && content.prayer)) && (
          <div className="mt-[1.2em] grid grid-cols-1 gap-[1em]">
            {s.application && content.application && (
              <section
                className="paper-break-avoid rounded-[4px] border-[1.5px] px-[1em] py-[0.75em]"
                style={{ borderColor: "var(--paper-ink)" }}
              >
                <Label>{SECTION_LABELS.application}</Label>
                <p className="text-[1.05em] font-medium">{content.application}</p>
              </section>
            )}
            {s.prayer && content.prayer && (
              <section className="paper-break-avoid">
                <Label>{SECTION_LABELS.prayer}</Label>
                <p className="font-serif italic" style={{ color: "var(--paper-muted)" }}>
                  {content.prayer}
                </p>
              </section>
            )}
          </div>
        )}
      </article>

      {overflows && (
        <p className="mx-auto mt-3 max-w-[8.5in] rounded-md bg-warning-soft px-3 py-2 text-sm text-warning print:hidden">
          This brief runs slightly past one page when printed. Edit it to shorten a section, or turn a section off when
          regenerating.
        </p>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mb-[0.5em] text-[0.78em] font-bold uppercase tracking-[0.12em]"
      style={{ color: "var(--paper-accent)" }}
    >
      {children}
    </h2>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-[0.2em] text-[0.72em] font-bold uppercase tracking-[0.12em]"
      style={{ color: "var(--paper-accent)" }}
    >
      {children}
    </p>
  );
}
