"use client";

import type { DimensionScore } from "@/lib/types";

const DIM_LABELS: Record<string, string> = {
  capability:  "Capability",
  reagent:     "Reagent",
  composition: "Composition",
  intent:      "Intent",
  sequence:    "Sequence",
};

const RISK_LABEL = ["No concern", "Low", "Moderate", "Elevated", "High", "Critical"];
const BAR_COLOR  = ["bg-green-500","bg-lime-500","bg-yellow-400","bg-orange-400","bg-orange-600","bg-red-600"];
const SCORE_COLOR = ["text-green-700","text-lime-700","text-yellow-700","text-orange-600","text-orange-700","text-red-700"];

type Props = {
  dimension: DimensionScore;
  state: "pending" | "scoring" | "scored";
};

export default function AgentPanel({ dimension, state }: Props) {
  const label = DIM_LABELS[dimension.dimension] ?? dimension.dimension;

  if (state === "pending") {
    return (
      <div className="py-3 border-b border-neutral-200 opacity-40">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-neutral-500">{label}</span>
          <span className="text-sm text-neutral-300">—/5</span>
        </div>
        <div className="h-1.5 w-full rounded-sm bg-neutral-100" />
      </div>
    );
  }

  if (state === "scoring") {
    return (
      <div className="py-3 border-b border-neutral-200">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-neutral-600">{label}</span>
          <span className="flex gap-0.5 items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:300ms]" />
          </span>
        </div>
        <div className="h-1.5 w-full rounded-sm bg-neutral-100 animate-pulse" />
      </div>
    );
  }

  const score = Math.max(0, Math.min(5, dimension.score));

  return (
    <div className="py-3 border-b border-neutral-200 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-neutral-800">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${SCORE_COLOR[score]}`}>
          {score}/5
          <span className="font-normal text-xs text-neutral-400 ml-1.5">{RISK_LABEL[score]}</span>
        </span>
      </div>
      <div className="relative h-1.5 w-full rounded-sm bg-neutral-100 mb-2">
        <div
          className={`absolute inset-y-0 left-0 rounded-sm transition-all ${BAR_COLOR[score]}`}
          style={{ width: `${(score / 5) * 100}%` }}
        />
      </div>
      {dimension.reasoning && (
        <p className="text-xs text-neutral-600 leading-relaxed">{dimension.reasoning}</p>
      )}
      {dimension.taxonomy_matches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {dimension.taxonomy_matches.map(t => (
            <span key={t} className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
