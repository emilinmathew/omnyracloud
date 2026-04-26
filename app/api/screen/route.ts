import { NextRequest } from "next/server";
import OpenAI from "openai";
import { detectFormat } from "@/lib/schema/detect";
import { parseAutoprotocol } from "@/lib/schema/autoprotocol";
import { CanonicalProtocol } from "@/lib/schema/canonical";
import { llmExtract } from "@/lib/extract/llm_extract";
import { annotateSteps, decomposeProtocol } from "@/lib/reasoning/decompose";
import { scoreDimensions } from "@/lib/reasoning/dimensions";
import { critiqueReport } from "@/lib/reasoning/critique";
import { checkSequences, sequenceDimension } from "@/lib/sequence/check";
import { mockStream } from "@/lib/reasoning/mock";
import type { StreamEvent } from "@/lib/stream-types";
import type { DimensionScore, RiskScore } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MOCK_MODE =
  !process.env.OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY.startsWith("sk-...") ||
  process.env.MOCK_SCREENING === "true";

const SEQUENCE_ONLY = process.env.SEQUENCE_ONLY === "true";

function aggregateRisk(dimensions: DimensionScore[]): RiskScore {
  if (dimensions.length === 0) return 0;
  return Math.max(0, Math.min(5, Math.max(...dimensions.map((d) => d.score)))) as RiskScore;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  let body: { contents?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    const err: StreamEvent = { type: "error", message: "invalid json body" };
    return new Response(JSON.stringify(err) + "\n", { status: 400 });
  }

  const contents = body.contents ?? "";
  if (!contents.trim()) {
    const err: StreamEvent = { type: "error", message: "empty contents" };
    return new Response(JSON.stringify(err) + "\n", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();
      let controllerClosed = false;
      const send = (event: StreamEvent) => {
        if (!controllerClosed) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      };

      try {
        // Stage 0 — Parse.
        const format = detectFormat(contents);
        let protocol;
        try {
          if (format === "autoprotocol") {
            protocol = parseAutoprotocol(contents);
          } else if (format === "generic_json") {
            protocol = CanonicalProtocol.parse(JSON.parse(contents));
          } else if (MOCK_MODE) {
            // In mock mode, don't call expensive LLM for malformed JSON
            send({ type: "error", message: "Invalid protocol format. Enable real screening for LLM extraction." });
            return;
          } else {
            protocol = await llmExtract(contents);
          }
        } catch (e) {
          send({ type: "error", message: `Protocol parsing failed: ${e instanceof Error ? e.message : String(e)}` });
          return;
        }

        send({
          type: "format_detected",
          format,
          protocol_id: protocol.id,
          title: protocol.title,
          operation_count: protocol.operations.length,
        });

        // Count sequences and signal UI before screening starts.
        const seqCount = protocol.operations.reduce((n, op) => n + op.inputs.filter(r => r.sequence).length, 0);
        send({ type: "sequence_screening", count: seqCount });

        // Sequence check always runs — real IBBIS if available, cache otherwise.
        const sequenceFindings = await checkSequences(protocol, send);
        send({ type: "sequence_checked", findings: sequenceFindings });

        if (SEQUENCE_ONLY) {
          // Sequence-only mode: just return the IBBIS results without LLM analysis
          const seqDim = sequenceDimension(sequenceFindings);
          const report = {
            protocol_id: protocol.id,
            aggregate_risk: seqDim.score as RiskScore,
            dimensions: [seqDim],
            inferred_objective: "IBBIS sequence screening only",
            composition_analysis: "Sequence-only mode - no composition analysis",
            minimum_adversarial_intent: "N/A",
            capability_gap: "N/A",
            sequence_findings: sequenceFindings,
            source_format: format,
            critique: { quality_score: 0, concerns: [], improvements: [] },
            processing_time_ms: Date.now() - started,
          };
          send({ type: "complete", report });
          controllerClosed = true;
          controller.close();
          return;
        }

        if (MOCK_MODE) {
          await mockStream(protocol, send, sequenceFindings);
          controllerClosed = true;
          controller.close();
          return;
        }

        const client = new OpenAI();

        // Stage 1 — Per-step annotation (parallel).
        for (const op of protocol.operations) {
          send({ type: "step_annotating", operation_id: op.id, operation_type: op.type, step_index: protocol.operations.indexOf(op), total_steps: protocol.operations.length });
        }
        const annotations = await annotateSteps(protocol, client);
        for (const ann of annotations) {
          send({ type: "step_annotated", annotation: { ...ann } });
        }

        // Stage 2 — Whole-protocol decomposition.
        send({ type: "decomposing" });
        const decomposition = await decomposeProtocol(protocol, annotations, client);
        send({
          type: "decomposed",
          inferred_objective: decomposition.inferred_objective,
          composition_analysis: decomposition.composition_analysis,
          minimum_adversarial_intent: decomposition.minimum_adversarial_intent,
          capability_gap: decomposition.capability_gap,
        });

        // Stage 3 — Five-dimension scoring (parallel, emit as each resolves).
        const dimensionNames = ["capability", "reagent", "composition", "intent", "sequence"];
        for (const d of dimensionNames) send({ type: "dimension_scoring", dimension: d });
        const scored = await scoreDimensions(protocol, annotations, decomposition, client);
        const seqDim = sequenceDimension(sequenceFindings);
        const dimensions = scored.map((d) =>
          d.dimension === "sequence" ? seqDim : d
        );
        for (const dim of dimensions) send({ type: "dimension_scored", score: dim });

        const aggregate = aggregateRisk(dimensions);

        // Stage 5 — Critique.
        send({ type: "critiquing" });
        const partialReport = {
          protocol_id: protocol.id,
          aggregate_risk: aggregate,
          dimensions,
          inferred_objective: decomposition.inferred_objective,
          composition_analysis: decomposition.composition_analysis,
          minimum_adversarial_intent: decomposition.minimum_adversarial_intent,
          capability_gap: decomposition.capability_gap,
          sequence_findings: sequenceFindings,
          source_format: format,
        };
        const critique = await critiqueReport(partialReport, client);
        send({ type: "critique_done", ...critique });

        const report = { ...partialReport, critique, processing_time_ms: Date.now() - started };
        send({ type: "complete", report });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!controllerClosed) {
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
