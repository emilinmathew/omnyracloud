#!/usr/bin/env tsx
(process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env.local");

/**
 * Master Script: Run All Evaluation Experiments
 * 1. Score Consistency (lightweight, ~5 min)
 * 2. Critique Layer Ablation (~10 min)
 * 3. Adversarial Robustness (~15 min)
 *
 * Total estimated time: ~30 minutes with rate limiting
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

const SCRIPTS = [
  {
    name: "Score Consistency",
    script: "run_consistency.ts",
    description: "Testing LLM scoring reliability across multiple runs",
    estimatedMinutes: 5
  },
  {
    name: "Critique Layer Ablation",
    script: "run_ablation.ts",
    description: "Comparing risk scores with and without critique layer",
    estimatedMinutes: 10
  },
  {
    name: "Adversarial Robustness",
    script: "run_adversarial_eval.ts",
    description: "Testing against obfuscated protocol variants",
    estimatedMinutes: 15
  }
];

function runScript(scriptPath: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", scriptPath], {
      stdio: ["inherit", "pipe", "pipe"],
      cwd: process.cwd()
    });

    let output = "";
    let error = "";

    child.stdout?.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(text); // Stream to console
      output += text;
    });

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      process.stderr.write(text); // Stream to console
      error += text;
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        output: output + (error ? `\nERROR: ${error}` : "")
      });
    });
  });
}

async function main() {
  console.log(`🧪 COMPREHENSIVE EVALUATION EXPERIMENT SUITE`);
  console.log(`============================================\n`);

  const totalEstimated = SCRIPTS.reduce((sum, s) => sum + s.estimatedMinutes, 0);
  console.log(`📋 Running ${SCRIPTS.length} experiments (estimated: ${totalEstimated} minutes)\n`);

  const results: Array<{
    name: string;
    success: boolean;
    duration: string;
    output?: string;
  }> = [];

  for (let i = 0; i < SCRIPTS.length; i++) {
    const { name, script, description, estimatedMinutes } = SCRIPTS[i];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 EXPERIMENT ${i + 1}/${SCRIPTS.length}: ${name.toUpperCase()}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📝 ${description}`);
    console.log(`⏱️  Estimated time: ${estimatedMinutes} minutes\n`);

    const startTime = Date.now();
    const scriptPath = join(process.cwd(), "scripts", script);

    try {
      const result = await runScript(scriptPath);
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

      if (result.success) {
        console.log(`\n✅ ${name} completed successfully in ${duration} minutes`);
        results.push({ name, success: true, duration: `${duration}m` });
      } else {
        console.log(`\n❌ ${name} failed after ${duration} minutes`);
        results.push({ name, success: false, duration: `${duration}m`, output: result.output });
      }

    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.error(`\n💥 ${name} crashed after ${duration} minutes: ${error}`);
      results.push({ name, success: false, duration: `${duration}m`, output: String(error) });
    }

    // Brief pause between experiments
    if (i < SCRIPTS.length - 1) {
      console.log(`\n⏳ Pausing 30 seconds before next experiment...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  // Final summary
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`📊 EXPERIMENT SUITE COMPLETE`);
  console.log(`${'='.repeat(60)}`);

  const successful = results.filter(r => r.success).length;
  const totalDuration = results.reduce((sum, r) => {
    const minutes = parseFloat(r.duration.replace('m', ''));
    return sum + minutes;
  }, 0);

  console.log(`✅ Successful: ${successful}/${results.length}`);
  console.log(`⏱️  Total Duration: ${totalDuration.toFixed(1)} minutes`);
  console.log(`\n📋 EXPERIMENT RESULTS:`);

  for (const result of results) {
    const status = result.success ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${status} ${result.name} (${result.duration})`);
    if (!result.success && result.output) {
      console.log(`      Error: ${result.output.slice(0, 100)}...`);
    }
  }

  console.log(`\n📁 Results written to:`);
  console.log(`  🔄 results/consistency_results.json`);
  console.log(`  🧪 results/ablation_results.json`);
  console.log(`  🎭 results/adversarial_results.json`);

  if (successful === results.length) {
    console.log(`\n🎉 All experiments completed successfully!`);
    console.log(`📝 You can now add these results to your research paper.`);
  } else {
    console.log(`\n⚠️  Some experiments failed. Check the error output above.`);
  }
}

main().catch((e) => {
  console.error(`💥 Master script crashed: ${e}`);
  process.exit(1);
});