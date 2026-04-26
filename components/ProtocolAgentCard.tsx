"use client";

const FORMAT_LABELS: Record<string, string> = {
  autoprotocol:     "Autoprotocol JSON",
  generic_json:     "Generic JSON",
  llm_extracted:    "Free text (LLM parsed)",
  opentrons_python: "Opentrons Python",
  unknown:          "Unknown format",
};

type Props = {
  state: "pending" | "detected" | "decomposed";
  title?: string;
  format?: string;
  operationCount?: number;
  objective?: string;
  composition?: string;
};

export default function ProtocolAgentCard({ state, title, format, operationCount, objective }: Props) {
  if (state === "pending") return null;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="border-b border-neutral-300 pb-6 mb-6">
      <div className="font-serif text-3xl font-bold text-neutral-900 leading-tight mb-2">
        Biosecurity Screening Report
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        {title && <span className="font-medium text-neutral-700">{title}</span>}
        {format && <span>{FORMAT_LABELS[format] ?? format}</span>}
        {operationCount !== undefined && <span>{operationCount} operations</span>}
        <span>{today}</span>
        {state === "detected" && (
          <span className="flex gap-0.5 items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:300ms]" />
          </span>
        )}
      </div>
      {objective && (
        <p className="mt-3 text-sm text-neutral-700 leading-relaxed">
          <span className="font-semibold text-neutral-900">Inferred objective: </span>
          {objective}
        </p>
      )}
    </div>
  );
}
