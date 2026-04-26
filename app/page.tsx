"use client";

import { useState, useCallback } from "react";
import DropZone from "@/components/DropZone";
import ReasoningLog, { type LogEntry } from "@/components/ReasoningLog";
import AgentPanel from "@/components/AgentPanel";
import ProtocolAgentCard from "@/components/ProtocolAgentCard";
import SourcesPanel from "@/components/SourcesPanel";
import NextStepsPanel from "@/components/NextStepsPanel";
import SequencePanel from "@/components/SequencePanel";
import type { DimensionScore, RiskReport, RiskScore, SequenceFinding } from "@/lib/types";
import type { StreamEvent } from "@/lib/stream-types";

const RISK_LABEL = ["No concern", "Low", "Moderate", "Elevated", "High", "Critical"];
const RISK_COLOR  = ["text-green-700","text-lime-700","text-yellow-700","text-orange-600","text-orange-700","text-red-700"];
const DIMENSIONS  = ["capability","reagent","composition","intent","sequence"] as const;

type DimState = "pending" | "scoring" | "scored";

type ScreenState = {
  streaming: boolean;
  protocolTitle?: string;
  format?: string;
  operationCount?: number;
  protocolState: "pending" | "detected" | "decomposed";
  protocolObjective?: string;
  protocolComposition?: string;
  logEntries: LogEntry[];
  sequenceFindings: SequenceFinding[];
  sequenceScreeningCount: number;
  dimStates: Record<string, DimState>;
  dimScores: Record<string, DimensionScore>;
  aggregate?: RiskScore;
  report?: RiskReport;
  error?: string;
};

const initState = (): ScreenState => ({
  streaming: false,
  protocolState: "pending",
  logEntries: [],
  sequenceFindings: [],
  sequenceScreeningCount: 0,
  dimStates: Object.fromEntries(DIMENSIONS.map(d => [d, "pending"])),
  dimScores: {},
});

export default function Home() {
  const [state, setState] = useState<ScreenState>(initState());
  const showResults = state.logEntries.length > 0 || state.streaming;

  const handleFile = useCallback(async (contents: string, filename: string) => {
    setState(() => ({ ...initState(), streaming: true }));

    let res: Response;
    try {
      res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents, filename }),
      });
    } catch (e) {
      setState(s => ({ ...s, streaming: false, error: String(e) }));
      return;
    }

    if (!res.body) {
      setState(s => ({ ...s, streaming: false, error: "No response body." }));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const processEvent = (event: StreamEvent) => {
      setState(s => {
        const log   = [...s.logEntries];
        const dims  = { ...s.dimStates };
        const scores = { ...s.dimScores };

        switch (event.type) {
          case "format_detected":
            log.push({ kind: "section", label: "Stage 1 — Step Annotation", sub: `${event.operation_count} operations · ${event.format}` });
            return { ...s, logEntries: log, format: event.format, protocolTitle: event.title, operationCount: event.operation_count, protocolState: "detected" };

          case "step_annotating":
            return { ...s };

          case "step_annotated": {
            const a = event.annotation;
            const stepNum = log.filter(e => e.kind === "step").length + 1;
            log.push({ kind: "step", step_num: stepNum, op_id: a.operation_id, op_type: a.operation_type, profile: a.dual_use_profile, capability: a.biological_capability, reasoning: a.reasoning, taxonomy: a.taxonomy_matches });
            return { ...s, logEntries: log };
          }

          case "decomposing":
            log.push({ kind: "section", label: "Stage 2 — Decomposition" });
            return { ...s, logEntries: log };

          case "decomposed":
            log.push({ kind: "decomposed", objective: event.inferred_objective, composition: event.composition_analysis, adversarial: event.minimum_adversarial_intent, gap: event.capability_gap });
            return { ...s, logEntries: log, protocolState: "decomposed", protocolObjective: event.inferred_objective, protocolComposition: event.composition_analysis };

          case "sequence_screening":
            return { ...s, sequenceScreeningCount: event.count };

          case "sequence_debug":
            log.push({ kind: "debug", message: event.message, cache_hits: event.cache_hits, cache_misses: event.cache_misses });
            return { ...s, logEntries: log };

          case "sequence_checked":
            return { ...s, logEntries: log, sequenceFindings: event.findings };

          case "dimension_scoring":
            dims[event.dimension] = "scoring";
            return { ...s, dimStates: dims };

          case "dimension_scored": {
            const d = event.score;
            dims[d.dimension] = "scored";
            scores[d.dimension] = d;
            return { ...s, dimStates: dims, dimScores: scores };
          }

          case "critiquing":
          case "critique_done":
            return { ...s };

          case "complete":
            return { ...s, logEntries: log, streaming: false, aggregate: event.report.aggregate_risk, report: event.report, dimStates: dims, dimScores: scores };

          case "error":
            log.push({ kind: "error", message: event.message });
            return { ...s, logEntries: log, streaming: false, error: event.message };
        }
      });
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try { processEvent(JSON.parse(line)); } catch {}
        }
      }
    } catch {
      // Stream closed or network error after streaming completed — ignore
    } finally {
      setState(s => ({ ...s, streaming: false }));
    }
  }, []);

  const reset = useCallback(() => setState(initState()), []);

  const { streaming, logEntries, sequenceFindings, sequenceScreeningCount, dimStates, dimScores,
          aggregate, report, format, operationCount, protocolState, protocolTitle,
          protocolObjective, protocolComposition } = state;

  const protocolCategories = [
    {
      title: "DURC Reconstructions",
      subtitle: "Historical dual-use research of concern",
      color: "border-red-300 bg-red-50",
      protocols: [
        { label: "Poliovirus synthesis (Cello 2002)", file: "/examples/durc/cello_2002_polio_synthesis.json", risk: "Critical" },
        { label: "H5N1 gain-of-function (Fouchier 2012)", file: "/examples/durc/fouchier_2012_h5n1_gof.json", risk: "Critical" },
        { label: "Horsepox reconstruction (Noyce 2018)", file: "/examples/durc/noyce_2018_horsepox.json", risk: "Critical" },
      ]
    },
    {
      title: "Concerning Protocols",
      subtitle: "Synthetic concerning workflows",
      color: "border-orange-300 bg-orange-50",
      protocols: [
        { label: "SARS-CoV-2 reconstruction", file: "/examples/concerning/sars_cov_reconstruction.json", risk: "High" },
        { label: "Enhanced transmissibility", file: "/examples/concerning/enhanced_transmissibility_passage.json", risk: "High" },
        { label: "Immune evasion (IL-4 poxvirus)", file: "/examples/concerning/immune_evasion_il4_poxvirus.json", risk: "High" },
        { label: "Antibiotic resistance transfer", file: "/examples/concerning/antibiotic_resistance_transfer.json", risk: "Moderate" },
        { label: "Delivery system (aerosolization)", file: "/examples/concerning/delivery_aerosolization.json", risk: "Moderate" },
      ]
    },
    {
      title: "Benign Controls",
      subtitle: "Standard laboratory procedures",
      color: "border-green-300 bg-green-50",
      protocols: [
        { label: "Plasmid cloning", file: "/examples/benign/plasmid_cloning.json", risk: "Low" },
        { label: "qPCR gene expression", file: "/examples/benign/qpcr_gene_expression.json", risk: "Low" },
        { label: "CRISPR knockout", file: "/examples/benign/crispr_knockout.json", risk: "Low" },
        { label: "Basic PCR", file: "/examples/benign/test_pcr_simple.json", risk: "Low" },
      ]
    }
  ];

  const protocolExamples = (
    <div className="space-y-4">
      {protocolCategories.map((category, idx) => (
        <div key={idx} className={`rounded-lg border p-3 ${category.color}`}>
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-neutral-900">{category.title}</h3>
            <p className="text-xs text-neutral-600">{category.subtitle}</p>
          </div>
          <div className="space-y-1">
            {category.protocols.map(({ label, file, risk }) => (
              <button
                key={file}
                onClick={async () => {
                  const res = await fetch(file);
                  const text = await res.text();
                  handleFile(text, file.split("/").pop() ?? file);
                }}
                className="w-full flex items-center justify-between rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 transition-colors text-left"
              >
                <span className="font-medium">{label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded text-[10px] ${
                  risk === "Critical" ? "bg-red-100 text-red-700" :
                  risk === "High" ? "bg-orange-100 text-orange-700" :
                  risk === "Moderate" ? "bg-yellow-100 text-yellow-700" :
                  "bg-green-100 text-green-700"
                }`}>{risk}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* Header */}
      <header className="shrink-0 border-b border-neutral-200 bg-white px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-neutral-900">OmnyraCloud</h1>
          <p className="text-xs text-neutral-400">Protocol level biosecurity screening</p>
        </div>
        <nav className="flex items-center gap-4">
          {aggregate !== undefined && (
            <span className={`font-serif text-lg font-bold tabular-nums whitespace-nowrap ${RISK_COLOR[aggregate]}`}>
              {aggregate}/5 <span className="text-sm font-sans font-normal text-neutral-500 ml-1">{RISK_LABEL[aggregate]}</span>
            </span>
          )}
          {showResults && (
            <button onClick={reset} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
              New screen
            </button>
          )}
        </nav>
      </header>

      {/* Landing — D2 Editorial */}
      {!showResults ? (
        <main className="flex-1 grid grid-cols-[55fr_45fr] overflow-hidden">
          {/* Left: headline + description + stats */}
          <div className="flex flex-col justify-center px-12 py-14 border-r border-neutral-200 overflow-y-auto">
            <div className="max-w-md">
              <div className="font-serif text-5xl font-bold text-neutral-900 leading-[1.1] mb-6">
                Biology is now<br />an API call.<br />
                <span className="text-neutral-400">Biosecurity<br />hasn't kept up.</span>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed mb-8">
                OmnyraCloud analyzes cloud lab protocols for biosecurity risk before execution —
                screening for dangerous capabilities, dual use composition, and sequence level threats
                across five independent risk dimensions.
              </p>
              <div className="border-t border-neutral-200 pt-6 grid grid-cols-3 gap-6">
                <div>
                  <div className="font-serif text-3xl font-bold text-neutral-900">0</div>
                  <div className="text-xs text-neutral-500 leading-snug mt-1">mandatory biosecurity<br />reviews today</div>
                </div>
                <div>
                  <div className="font-serif text-3xl font-bold text-neutral-900">5</div>
                  <div className="text-xs text-neutral-500 leading-snug mt-1">risk dimensions<br />analyzed in parallel</div>
                </div>
                <div>
                  <div className="font-serif text-3xl font-bold text-neutral-900">Real time</div>
                  <div className="text-xs text-neutral-500 leading-snug mt-1">streaming<br />analysis</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: example output element + upload */}
          <div className="flex flex-col px-12 py-8 overflow-y-auto h-full">
            <div className="mb-6">
              <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">Example output</div>
              <div className="inline-flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <span className="font-serif text-3xl font-bold text-red-700 leading-none">5/5</span>
                <div>
                  <div className="text-sm font-semibold text-red-800">Critical Risk Detected</div>
                  <div className="text-xs text-red-600 mt-0.5">Enhanced transmissibility · DURC pathogen · Gain-of-function</div>
                </div>
              </div>
            </div>

            <DropZone onFile={handleFile} loading={false} stage="" error={null} />

            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-neutral-400 mb-3">Protocol Examples</div>
              {protocolExamples}
            </div>
          </div>
        </main>
      ) : (
        /* Results — C-Report document */
        <div className="flex-1 overflow-y-auto bg-[#fafaf8]">
          <div className="max-w-3xl mx-auto px-8 py-10">

            {/* Document header */}
            <ProtocolAgentCard
              state={protocolState}
              title={protocolTitle}
              format={format}
              operationCount={operationCount}
              objective={protocolObjective}
              composition={protocolComposition}
            />

            {/* Reasoning chain */}
            <ReasoningLog entries={logEntries} streaming={streaming} />

            {/* Sequence Screening — IBBIS Common Mechanism */}
            {(sequenceFindings.length > 0 || sequenceScreeningCount > 0) && (
              <SequencePanel findings={sequenceFindings} sequenceScreeningCount={sequenceScreeningCount} />
            )}

            {/* Risk Assessment */}
            {Object.values(dimStates).some(s => s !== "pending") && (
              <div className="mt-8">
                <div className="font-serif text-base font-bold text-neutral-900 border-b border-neutral-200 pb-1 mb-1">
                  3. Risk Assessment
                </div>
                <div>
                  {DIMENSIONS.map(dim => {
                    const score = dimScores[dim] ?? {
                      dimension: dim, score: 0 as RiskScore, reasoning: "", triggered_steps: [], retrieved_precedents: [], taxonomy_matches: [],
                    };
                    return <AgentPanel key={dim} dimension={score} state={dimStates[dim] ?? "pending"} />;
                  })}
                </div>

                {/* Aggregate total */}
                {aggregate !== undefined && (
                  <div className="flex items-baseline justify-between pt-3 mt-1 border-t-2 border-neutral-900">
                    <span className="text-sm font-semibold text-neutral-900">Aggregate Risk Score</span>
                    <span className={`font-serif text-2xl font-bold tabular-nums ${RISK_COLOR[aggregate]}`}>
                      {aggregate}/5
                      <span className="font-sans text-sm font-normal text-neutral-500 ml-2">{RISK_LABEL[aggregate]}</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Recommendations */}
            {report && <NextStepsPanel report={report} />}

            {/* References */}
            {report && (
              <SourcesPanel citations={report.dimensions.flatMap(d => d.retrieved_precedents)} />
            )}

            {/* Meta */}
            {report && (
              <div className="mt-8 pt-4 border-t border-neutral-100 text-xs text-neutral-400 flex justify-between">
                <span>Omnyra-Gate · {format}</span>
                <span>{report.processing_time_ms}ms</span>
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="shrink-0 border-t border-neutral-200 bg-white px-6 py-2 text-xs text-neutral-400">
        Apart AI × Biosecurity Hackathon · April 2026
      </footer>
    </div>
  );
}
