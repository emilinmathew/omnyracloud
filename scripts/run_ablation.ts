#!/usr/bin/env tsx
(process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env.local");

/**
 * Critique Layer Ablation Study
 * Compares risk scores with and without the LLM critique step
 * Tests whether critique layer affects final risk assessments
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
import type { RiskScore, DimensionScore } from "@/lib/types";

const PROTOCOLS_DIR = join(process.cwd(), "data", "protocols");

function aggregateRisk(dimensions: DimensionScore[]): RiskScore {
  if (dimensions.length === 0) return 0;
  return Math.max(0, Math.min(5, Math.max(...dimensions.map((d) => d.score)))) as RiskScore;
}

function walkProtocols(dir: string) {
  const results: Array<{ path: string; subdir: string; filename: string }> = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory() && entry !== "adversarial") {
      for (const file of readdirSync(full)) {
        if (file.endsWith(".json")) results.push({ path: join(full, file), subdir: entry, filename: file });
      }
    }
  }
  return results;
}

async function screenWithCritique(contents: string, client: OpenAI) {
  const format = detectFormat(contents);
  let protocol;
  if (format === "autoprotocol") {
    protocol = parseAutoprotocol(contents);
  } else if (format === "generic_json") {
    protocol = CanonicalProtocol.parse(JSON.parse(contents));
  } else {
    protocol = await llmExtract(contents);
  }

  const seqFindings = await checkSequences(protocol);
  const seqScore = sequenceScore(seqFindings);
  const annotations = await annotateSteps(protocol, client);
  const decomposition = await decomposeProtocol(protocol, annotations, client);
  const scored = await scoreDimensions(protocol, annotations, decomposition, client);
  const dimensions = scored.map((d) =>
    d.dimension === "sequence" ? { ...d, score: seqScore as RiskScore } : d
  );

  const partial = {
    protocol_id: protocol.id,
    aggregate_risk: aggregateRisk(dimensions),
    dimensions,
    inferred_objective: decomposition.inferred_objective,
    composition_analysis: decomposition.composition_analysis,
    minimum_adversarial_intent: decomposition.minimum_adversarial_intent,
    capability_gap: decomposition.capability_gap,
    sequence_findings: seqFindings,
    source_format: format,
  };

  const critique = await critiqueReport(partial, client);
  return { ...partial, critique, processing_time_ms: 0 };
}

async function screenNoCritique(contents: string, client: OpenAI) {
  const format = detectFormat(contents);
  let protocol;
  if (format === "autoprotocol") {
    protocol = parseAutoprotocol(contents);
  } else if (format === "generic_json") {
    protocol = CanonicalProtocol.parse(JSON.parse(contents));
  } else {
    protocol = await llmExtract(contents);
  }

  const seqFindings = await checkSequences(protocol);
  const seqScore = sequenceScore(seqFindings);
  const annotations = await annotateSteps(protocol, client);
  const decomposition = await decomposeProtocol(protocol, annotations, client);
  const scored = await scoreDimensions(protocol, annotations, decomposition, client);
  const dimensions = scored.map((d) =>
    d.dimension === "sequence" ? { ...d, score: seqScore as RiskScore } : d
  );

  return {
    protocol_id: protocol.id,
    aggregate_risk: aggregateRisk(dimensions),
    dimensions: Object.fromEntries(dimensions.map((d) => [d.dimension, d.score])),
  };
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const client = new OpenAI();
  const protocols = walkProtocols(PROTOCOLS_DIR);
  console.log(`🧪 Running Critique Layer Ablation on ${protocols.length} protocols...\n`);

  const ablationResults: Array<{
    filename: string; subdir: string; protocol_id: string;
    no_critique: number; with_critique: number; delta: number;
    dimensions_no_critique: Record<string, number>;
    dimensions_with_critique: Record<string, number>;
  }> = [];

  for (const { path, subdir, filename } of protocols) {
    console.log(`📋 [${subdir}] ${filename}`);
    try {
      const contents = readFileSync(path, "utf-8");

      // Screen without critique first
      console.log(`  🚫 Screening WITHOUT critique...`);
      const noCritiqueResult = await screenNoCritique(contents, client);

      await sleep(1000); // Brief pause

      // Screen with critique
      console.log(`  ✅ Screening WITH critique...`);
      const withCritiqueResult = await screenWithCritique(contents, client);

      const delta = noCritiqueResult.aggregate_risk - withCritiqueResult.aggregate_risk;

      console.log(`    📊 Results:`);
      console.log(`       Without Critique: ${noCritiqueResult.aggregate_risk}/5`);
      console.log(`       With Critique: ${withCritiqueResult.aggregate_risk}/5`);
      console.log(`       Delta: ${delta > 0 ? "+" : ""}${delta} ${delta !== 0 ? (delta > 0 ? "(critique lowered score)" : "(critique raised score)") : "(no change)"}`);

      ablationResults.push({
        filename, subdir,
        protocol_id: noCritiqueResult.protocol_id,
        no_critique: noCritiqueResult.aggregate_risk,
        with_critique: withCritiqueResult.aggregate_risk,
        delta,
        dimensions_no_critique: noCritiqueResult.dimensions,
        dimensions_with_critique: Object.fromEntries(withCritiqueResult.dimensions.map(d => [d.dimension, d.score])),
      });

      // Rate limit protection
      await sleep(3000);

    } catch (e) {
      console.error(`    ❌ ERROR: ${e}`);
      await sleep(5000);
    }
  }

  // Analysis
  const changed = ablationResults.filter((r) => r.delta !== 0);
  const raisedBycritique = changed.filter(r => r.delta < 0);
  const loweredByCritique = changed.filter(r => r.delta > 0);

  console.log(`\n📊 ABLATION ANALYSIS:`);
  console.log(`  📝 Total Protocols: ${ablationResults.length}`);
  console.log(`  🔄 Scores Changed: ${changed.length}/${ablationResults.length} (${((changed.length / ablationResults.length) * 100).toFixed(1)}%)`);
  console.log(`  📈 Raised by Critique: ${raisedBycritique.length}`);
  console.log(`  📉 Lowered by Critique: ${loweredByCritique.length}`);

  if (changed.length > 0) {
    console.log(`\n📋 DETAILED CHANGES:`);
    for (const r of changed) {
      const direction = r.delta > 0 ? "↘️ LOWERED" : "↗️ RAISED";
      console.log(`  ${r.filename}: ${r.no_critique} -> ${r.with_critique} ${direction}`);
    }

    const avgDelta = changed.reduce((sum, r) => sum + Math.abs(r.delta), 0) / changed.length;
    console.log(`\n📊 Average Score Change: ${avgDelta.toFixed(2)} points`);
  } else {
    console.log(`\n✅ Critique layer had NO EFFECT on aggregate risk scores`);
  }

  // Check for dimension-level changes
  console.log(`\n🔍 DIMENSION-LEVEL IMPACT:`);
  const dimensions = ["capability", "reagent", "composition", "intent", "sequence"];
  for (const dim of dimensions) {
    const dimChanges = ablationResults.filter(r =>
      r.dimensions_no_critique[dim] !== r.dimensions_with_critique[dim]
    );
    if (dimChanges.length > 0) {
      console.log(`  ${dim}: ${dimChanges.length}/${ablationResults.length} protocols affected`);
    }
  }

  const outPath = join(process.cwd(), "results", "ablation_results.json");
  writeFileSync(outPath, JSON.stringify({
    summary: {
      total_protocols: ablationResults.length,
      scores_changed: changed.length,
      change_rate: changed.length / ablationResults.length,
      raised_by_critique: raisedBycritique.length,
      lowered_by_critique: loweredByCritique.length,
      average_absolute_change: changed.length > 0 ? changed.reduce((sum, r) => sum + Math.abs(r.delta), 0) / changed.length : 0
    },
    results: ablationResults
  }, null, 2));

  console.log(`\n💾 Wrote detailed results to ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });