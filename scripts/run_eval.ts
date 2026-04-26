#!/usr/bin/env tsx
(process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env.local");

/**
 * Full evaluation harness.
 * Screens every protocol in data/protocols/ and writes results/eval_results.json.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { CanonicalProtocol } from "@/lib/schema/canonical";
import { detectFormat } from "@/lib/schema/detect";
import { parseAutoprotocol } from "@/lib/schema/autoprotocol";
import { llmExtract } from "@/lib/extract/llm_extract";
import { annotateSteps, decomposeProtocol } from "@/lib/reasoning/decompose";
import { scoreDimensions } from "@/lib/reasoning/dimensions";
import { critiqueReport } from "@/lib/reasoning/critique";
import { checkSequences, sequenceScore } from "@/lib/sequence/check";
import type { RiskReport, RiskScore, DimensionScore } from "@/lib/types";

const PROTOCOLS_DIR = join(process.cwd(), "data", "protocols");
const RESULTS_PATH = join(process.cwd(), "results", "eval_results.json");

type EvalRecord = {
  protocol_id: string;
  source_dir: string;
  filename: string;
  ground_truth_risk?: number;
  ground_truth_taxonomy?: string[];
  report: RiskReport;
  error?: string;
};

function aggregateRisk(dimensions: DimensionScore[]): RiskScore {
  if (dimensions.length === 0) return 0;
  return Math.max(0, Math.min(5, Math.max(...dimensions.map((d) => d.score)))) as RiskScore;
}

function walkProtocols(dir: string): Array<{ path: string; subdir: string }> {
  const results: Array<{ path: string; subdir: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const file of readdirSync(full)) {
        if (file.endsWith(".json")) {
          results.push({ path: join(full, file), subdir: entry });
        }
      }
    }
  }
  return results;
}

async function screenProtocol(
  contents: string,
  client: OpenAI
): Promise<RiskReport> {
  const started = Date.now();
  const format = detectFormat(contents);
  let protocol;
  if (format === "autoprotocol") {
    protocol = parseAutoprotocol(contents);
  } else if (format === "generic_json") {
    protocol = CanonicalProtocol.parse(JSON.parse(contents));
  } else {
    protocol = await llmExtract(contents);
  }

  const sequenceFindings = await checkSequences(protocol);
  const seqScore = sequenceScore(sequenceFindings);
  const annotations = await annotateSteps(protocol, client);
  const decomposition = await decomposeProtocol(protocol, annotations, client);
  const scored = await scoreDimensions(protocol, annotations, decomposition, client);
  const dimensions = scored.map((d) =>
    d.dimension === "sequence" ? { ...d, score: seqScore as RiskScore } : d
  );
  const aggregate = aggregateRisk(dimensions);
  const partial = {
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
  const critique = await critiqueReport(partial, client);
  return { ...partial, critique, processing_time_ms: Date.now() - started };
}

async function main() {
  const client = new OpenAI();
  const protocols = walkProtocols(PROTOCOLS_DIR);
  console.log(`Found ${protocols.length} protocols to evaluate`);

  const records: EvalRecord[] = [];
  let passed = 0;
  let failed = 0;

  for (const { path, subdir } of protocols) {
    const filename = path.split("/").pop()!;
    console.log(`\n[${subdir}] ${filename}`);
    try {
      const raw = readFileSync(path, "utf-8");
      const parsed = JSON.parse(raw);
      const groundTruthRisk = parsed.metadata?.ground_truth_risk;
      const groundTruthTaxonomy = parsed.metadata?.ground_truth_taxonomy;
      const report = await screenProtocol(raw, client);
      records.push({
        protocol_id: report.protocol_id,
        source_dir: subdir,
        filename,
        ground_truth_risk: groundTruthRisk,
        ground_truth_taxonomy: groundTruthTaxonomy,
        report,
      });
      console.log(`  aggregate_risk=${report.aggregate_risk} (ground_truth=${groundTruthRisk ?? "?"})`);
      passed++;
    } catch (e) {
      console.error(`  ERROR: ${e}`);
      records.push({
        protocol_id: filename,
        source_dir: subdir,
        filename,
        report: {} as RiskReport,
        error: String(e),
      });
      failed++;
    }
  }

  // Compute summary metrics.
  const withGroundTruth = records.filter(
    (r) => r.ground_truth_risk !== undefined && !r.error
  );
  const THRESHOLD = 3; // flag if aggregate_risk >= 3
  const tp = withGroundTruth.filter(
    (r) => r.ground_truth_risk! >= THRESHOLD && r.report.aggregate_risk >= THRESHOLD
  ).length;
  const fp = withGroundTruth.filter(
    (r) => r.ground_truth_risk! < THRESHOLD && r.report.aggregate_risk >= THRESHOLD
  ).length;
  const fn = withGroundTruth.filter(
    (r) => r.ground_truth_risk! >= THRESHOLD && r.report.aggregate_risk < THRESHOLD
  ).length;
  const tn = withGroundTruth.filter(
    (r) => r.ground_truth_risk! < THRESHOLD && r.report.aggregate_risk < THRESHOLD
  ).length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  const summary = {
    total: records.length,
    passed,
    failed,
    with_ground_truth: withGroundTruth.length,
    confusion_matrix: { tp, fp, fn, tn },
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1: Math.round(f1 * 1000) / 1000,
    by_source: {} as Record<string, { count: number; mean_risk: number; flag_rate: number }>,
  };

  const bySource: Record<string, number[]> = {};
  for (const r of records.filter((r) => !r.error)) {
    (bySource[r.source_dir] ??= []).push(r.report.aggregate_risk);
  }
  for (const [src, scores] of Object.entries(bySource)) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const flagRate = scores.filter((s) => s >= THRESHOLD).length / scores.length;
    summary.by_source[src] = {
      count: scores.length,
      mean_risk: Math.round(mean * 100) / 100,
      flag_rate: Math.round(flagRate * 100) / 100,
    };
  }

  const output = { summary, records };
  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2));
  console.log(`\n=== Summary ===`);
  console.log(`Precision: ${summary.precision}, Recall: ${summary.recall}, F1: ${summary.f1}`);
  console.log(`Confusion: TP=${tp} FP=${fp} FN=${fn} TN=${tn}`);
  console.log(`Wrote results to ${RESULTS_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
