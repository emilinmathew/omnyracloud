#!/usr/bin/env tsx
(process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env.local");

/**
 * Score Consistency Experiment
 * Tests LLM scoring reliability by running same protocols multiple times
 * Measures variance in risk scores across repeated evaluations
 */

import { readFileSync, writeFileSync } from "node:fs";
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

const RUNS = 3;
// Test on key protocols with different expected risk levels
const PROTOCOLS = [
  { path: "concerning/enhanced_transmissibility_passage.json", label: "Enhanced Transmissibility (H7N9)", expected: 5 },
  { path: "concerning/antibiotic_resistance_transfer.json", label: "NDM-1 Resistance", expected: 4 },
  { path: "benign/crispr_knockout.json", label: "CRISPR Knockout", expected: 0 },
  { path: "benign/plasmid_cloning.json", label: "GFP Cloning", expected: 0 },
];

function aggregateRisk(dimensions: DimensionScore[]): RiskScore {
  if (dimensions.length === 0) return 0;
  return Math.max(0, Math.min(5, Math.max(...dimensions.map((d) => d.score)))) as RiskScore;
}

async function screenOnce(contents: string, client: OpenAI) {
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

  return {
    aggregate: partial.aggregate_risk,
    dimensions: Object.fromEntries(dimensions.map((d) => [d.dimension, d.score])),
    objective: decomposition.inferred_objective,
    critique_quality: critique.quality_score,
  };
}

function calculateStats(values: number[]) {
  if (values.length === 0) return { mean: 0, variance: 0, std: 0, min: 0, max: 0, range: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  return { mean, variance, std, min, max, range };
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const client = new OpenAI();
  const results: Record<string, {
    label: string;
    expected_risk: number;
    runs: Array<{
      aggregate: number;
      dimensions: Record<string, number>;
      objective: string;
      critique_quality: number;
    }>;
    stats: {
      aggregate: ReturnType<typeof calculateStats>;
      dimensions: Record<string, ReturnType<typeof calculateStats>>;
    };
  }> = {};

  console.log(`🔄 Running Score Consistency Experiment (${RUNS} runs per protocol)\n`);

  for (const { path: relPath, label, expected } of PROTOCOLS) {
    const fullPath = join(process.cwd(), "data", "protocols", relPath);
    const contents = readFileSync(fullPath, "utf-8");
    const protocolId = relPath.split("/").pop()!.replace(".json", "");

    console.log(`📋 ${label} (Expected: ${expected}/5)`);
    console.log(`   Protocol: ${protocolId}`);

    results[protocolId] = {
      label,
      expected_risk: expected,
      runs: [],
      stats: { aggregate: calculateStats([]), dimensions: {} }
    };

    for (let i = 0; i < RUNS; i++) {
      console.log(`  🔄 Run ${i + 1}/${RUNS}...`);
      try {
        const result = await screenOnce(contents, client);
        results[protocolId].runs.push(result);

        console.log(`     ✅ Aggregate: ${result.aggregate}/5`);
        console.log(`     📊 Dimensions: ${JSON.stringify(result.dimensions)}`);
        console.log(`     🎯 Objective: "${result.objective.slice(0, 60)}..."`);

        // Rate limit protection between runs
        if (i < RUNS - 1) await sleep(2000);

      } catch (e) {
        console.error(`     ❌ ERROR: ${e}`);
        await sleep(5000);
      }
    }

    // Calculate statistics for this protocol
    const runs = results[protocolId].runs;
    if (runs.length > 1) {
      const aggScores = runs.map((r) => r.aggregate);
      results[protocolId].stats.aggregate = calculateStats(aggScores);

      // Calculate dimension-wise stats
      const dimensions = ["capability", "reagent", "composition", "intent", "sequence"];
      for (const dim of dimensions) {
        const dimScores = runs.map(r => r.dimensions[dim] || 0);
        results[protocolId].stats.dimensions[dim] = calculateStats(dimScores);
      }

      const aggStats = results[protocolId].stats.aggregate;
      console.log(`\n  📊 CONSISTENCY ANALYSIS:`);
      console.log(`     Mean: ${aggStats.mean.toFixed(2)}/5`);
      console.log(`     Std Dev: ${aggStats.std.toFixed(3)}`);
      console.log(`     Range: ${aggStats.min}-${aggStats.max} (spread: ${aggStats.range})`);
      console.log(`     Scores: [${aggScores.join(", ")}]`);

      if (aggStats.std > 0.5) {
        console.log(`     ⚠️  HIGH VARIANCE detected!`);
      } else if (aggStats.std < 0.1) {
        console.log(`     ✅ Very consistent scoring`);
      }

      // Check dimension consistency
      const highVarDims = dimensions.filter(dim =>
        (results[protocolId].stats.dimensions[dim]?.std || 0) > 0.5
      );
      if (highVarDims.length > 0) {
        console.log(`     🔄 Variable Dimensions: ${highVarDims.join(", ")}`);
      }
    }

    console.log(); // Spacing between protocols
    await sleep(3000); // Longer pause between protocols
  }

  // Overall consistency analysis
  console.log(`\n📊 OVERALL CONSISTENCY ANALYSIS:`);

  const allStats = Object.values(results).map(r => r.stats.aggregate);
  const avgStd = allStats.reduce((sum, stat) => sum + stat.std, 0) / allStats.length;
  const maxStd = Math.max(...allStats.map(stat => stat.std));
  const consistentProtocols = allStats.filter(stat => stat.std < 0.5).length;

  console.log(`  📈 Average Standard Deviation: ${avgStd.toFixed(3)}`);
  console.log(`  📈 Maximum Standard Deviation: ${maxStd.toFixed(3)}`);
  console.log(`  ✅ Consistent Protocols: ${consistentProtocols}/${allStats.length} (std < 0.5)`);

  if (avgStd < 0.3) {
    console.log(`  🎯 EXCELLENT consistency across all protocols`);
  } else if (avgStd < 0.5) {
    console.log(`  ✅ GOOD consistency overall`);
  } else {
    console.log(`  ⚠️  CONCERNING variance detected in scoring`);
  }

  // Identify most/least consistent protocols
  const sortedByStd = Object.entries(results)
    .map(([id, data]) => ({ id, label: data.label, std: data.stats.aggregate.std }))
    .sort((a, b) => a.std - b.std);

  console.log(`\n🏆 MOST CONSISTENT: ${sortedByStd[0].label} (std: ${sortedByStd[0].std.toFixed(3)})`);
  console.log(`📊 LEAST CONSISTENT: ${sortedByStd[sortedByStd.length - 1].label} (std: ${sortedByStd[sortedByStd.length - 1].std.toFixed(3)})`);

  const outPath = join(process.cwd(), "results", "consistency_results.json");
  writeFileSync(outPath, JSON.stringify({
    summary: {
      total_protocols: Object.keys(results).length,
      runs_per_protocol: RUNS,
      average_std_deviation: avgStd,
      max_std_deviation: maxStd,
      consistent_protocols: consistentProtocols,
      consistency_rate: consistentProtocols / Object.keys(results).length
    },
    detailed_results: results
  }, null, 2));

  console.log(`\n💾 Wrote detailed results to ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });