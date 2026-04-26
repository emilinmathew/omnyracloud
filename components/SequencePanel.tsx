import type { SequenceFinding } from "@/lib/types";

const RESULT_STYLE: Record<string, { dot: string; label: string; text: string }> = {
  flagged: { dot: "bg-red-500",     label: "Flagged", text: "text-red-700" },
  clear:   { dot: "bg-green-500",   label: "Clear",   text: "text-green-700" },
  unknown: { dot: "bg-neutral-300", label: "Unknown", text: "text-neutral-500" },
};

function FindingRow({ f }: { f: SequenceFinding }) {
  const s = RESULT_STYLE[f.result] ?? RESULT_STYLE.unknown;
  const lenStr = f.sequence_length != null ? `${f.sequence_length} nt` : null;

  return (
    <div className="flex items-start gap-3 py-2 border-b border-neutral-100 last:border-0">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-neutral-800">{f.reagent_name}</span>
          <span className={`text-xs font-semibold ${s.text}`}>{s.label}</span>
          {lenStr && <span className="text-xs text-neutral-400">{lenStr}</span>}
          {f.category && (
            <span className="text-xs text-red-600 font-medium">{f.category}</span>
          )}
        </div>
        {f.reason && (
          <div className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{f.reason}</div>
        )}
        {f.hits && f.hits.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {f.hits.map((h, j) => (
              <div key={j} className="font-mono text-[11px] text-neutral-600 flex flex-wrap gap-x-3 gap-y-0.5 leading-snug">
                <span className="text-red-700 font-semibold truncate max-w-[220px]">{h.hmm}</span>
                <span className="text-neutral-400">e={h.evalue}</span>
                <span className="text-neutral-400">score={h.score.toFixed(1)} bits</span>
                {h.bias > 0 && <span className="text-neutral-400">bias={h.bias.toFixed(1)}</span>}
                {h.organism && <span className="text-neutral-500 italic">{h.organism}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SequencePanel({
  findings,
  sequenceScreeningCount,
}: {
  findings: SequenceFinding[];
  sequenceScreeningCount: number;
}) {
  const calling = sequenceScreeningCount > 0 && findings.length === 0;

  return (
    <div className="pt-6 mt-2">
      <div className="flex items-baseline justify-between border-b border-neutral-200 pb-1 mb-3">
        <div className="font-serif text-base font-bold text-neutral-900">
          Sequence Screening
        </div>
        <a
          href="https://github.com/ibbis-screening/common-mechanism"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-neutral-400 hover:underline"
        >
          IBBIS Common Mechanism · biorisk HMM v1.0.0
        </a>
      </div>

      {calling ? (
        <div className="flex items-center gap-2 text-xs text-neutral-400 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:300ms]" />
          <span className="ml-1">
            Calling IBBIS Common Mechanism… screening {sequenceScreeningCount} sequence{sequenceScreeningCount !== 1 ? "s" : ""}
          </span>
        </div>
      ) : (
        <div>
          {findings.map((f, i) => (
            <FindingRow key={i} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}
