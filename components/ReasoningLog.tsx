"use client";

import { useEffect, useRef } from "react";

type LogEntry =
  | { kind: "section"; label: string; sub?: string }
  | { kind: "stage"; label: string; detail?: string }
  | { kind: "step"; step_num: number; op_id: string; op_type: string; profile: string; capability: string; reasoning: string; taxonomy: string[] }
  | { kind: "decomposed"; objective: string; composition: string; adversarial: string; gap: string }
  | { kind: "debug"; message: string; cache_hits: number; cache_misses: number }
  | { kind: "error"; message: string };

export type { LogEntry };

const PROFILE_COLORS: Record<string, string> = {
  "benign-common": "bg-green-100 text-green-700",
  "benign-rare":   "bg-yellow-100 text-yellow-700",
  "dual-use":      "bg-orange-100 text-orange-800",
  "concerning":    "bg-red-100 text-red-700",
};

const PROFILE_LABELS: Record<string, string> = {
  "benign-common": "benign",
  "benign-rare":   "benign-rare",
  "dual-use":      "dual-use",
  "concerning":    "concerning",
};

const SECTION_NUMBERS: Record<string, string> = {
  "Stage 1 — Step Annotation": "1.",
  "Stage 2 — Decomposition":   "2.",
};

export default function ReasoningLog({ entries, streaming }: { entries: LogEntry[]; streaming: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  if (entries.length === 0 && !streaming) return null;

  return (
    <div className="space-y-6">
      {entries.map((entry, i) => {

        if (entry.kind === "section") {
          const num = SECTION_NUMBERS[entry.label] ?? "";
          return (
            <div key={i} className="pt-2 first:pt-0">
              <div className="font-serif text-base font-bold text-neutral-900 border-b border-neutral-300 pb-1 mb-3 flex items-baseline gap-2">
                <span>{num} {entry.label.replace(/Stage \d+ — /, "")}</span>
                {entry.sub && <span className="font-sans text-xs font-normal text-neutral-400 ml-1">{entry.sub}</span>}
              </div>
            </div>
          );
        }

        if (entry.kind === "stage") {
          return (
            <div key={i} className="flex items-center gap-2 text-xs text-neutral-400 pl-1">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
              <span>{entry.label}</span>
              {entry.detail && <span className="text-neutral-300">{entry.detail}</span>}
            </div>
          );
        }

        if (entry.kind === "step") {
          return (
            <div key={i} className="grid grid-cols-[2rem_1fr] gap-x-3 text-xs border-b border-neutral-100 pb-2.5">
              <span className="font-mono text-neutral-400 pt-0.5">{String(entry.step_num).padStart(2, "0")}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-mono text-neutral-600 font-medium">{entry.op_type}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${PROFILE_COLORS[entry.profile] ?? "bg-neutral-100 text-neutral-600"}`}>
                    {PROFILE_LABELS[entry.profile] ?? entry.profile}
                  </span>
                </div>
                <div className="text-neutral-800 font-medium leading-snug">{entry.capability}</div>
                <div className="text-neutral-500 mt-0.5 leading-relaxed">{entry.reasoning}</div>
                {entry.taxonomy.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.taxonomy.map(t => (
                      <span key={t} className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">
                        {t.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        }

        if (entry.kind === "decomposed") {
          return (
            <div key={i} className="space-y-3 text-sm text-neutral-700 leading-relaxed">
              <div>
                <span className="font-semibold text-neutral-900">Inferred objective: </span>
                {entry.objective}
              </div>
              {entry.composition && !entry.composition.includes("No multi-step composition risk") && (
                <div>
                  <span className="font-semibold text-neutral-900">Composition analysis: </span>
                  {entry.composition}
                </div>
              )}
              {entry.adversarial && !entry.adversarial.includes("None apparent") && (
                <div>
                  <span className="font-semibold text-orange-700">Minimum adversarial intent: </span>
                  <span className="text-neutral-700">{entry.adversarial}</span>
                </div>
              )}
            </div>
          );
        }

        if (entry.kind === "debug") {
          return (
            <div key={i} className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <div className="font-mono text-xs text-blue-600 mb-1">DEBUG</div>
              <div>{entry.message}</div>
              {(entry.cache_hits > 0 || entry.cache_misses > 0) && (
                <div className="text-xs text-blue-600 mt-1">
                  Cache: {entry.cache_hits} hits, {entry.cache_misses} misses
                </div>
              )}
            </div>
          );
        }

        if (entry.kind === "error") {
          return (
            <div key={i} className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {entry.message}
            </div>
          );
        }

        return null;
      })}

      {streaming && (
        <div className="flex items-center gap-2 pl-1 text-neutral-400">
          <span className="inline-flex gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:300ms]" />
          </span>
          <span className="text-xs">Analyzing…</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
