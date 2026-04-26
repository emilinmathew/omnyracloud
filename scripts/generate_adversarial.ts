#!/usr/bin/env tsx
(process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env.local");

/**
 * Generate adversarial obfuscated variants of concerning protocols.
 * Three variants per protocol: reagent_renaming, step_reordering, benign_framing.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { CanonicalProtocol } from "@/lib/schema/canonical";
import { adversarialVariantPrompt } from "@/lib/reasoning/prompts";

const CONCERNING_DIR = join(process.cwd(), "data", "protocols", "concerning");
const ADV_DIR = join(process.cwd(), "data", "protocols", "adversarial");
const MODEL = "claude-sonnet-4-6";
const METHODS = ["reagent_renaming", "step_reordering", "benign_framing"] as const;

function extractJson(text: string): string {
  const t = text.trim();
  if (t.startsWith("{")) return t;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) return t.slice(first, last + 1);
  return t;
}

async function generateVariant(
  protocol: CanonicalProtocol,
  method: (typeof METHODS)[number],
  client: Anthropic
): Promise<CanonicalProtocol | null> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: adversarialVariantPrompt(protocol, method) }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const json = JSON.parse(extractJson(text));
    if (!json.source_format) json.source_format = "generic_json";
    return CanonicalProtocol.parse(json);
  } catch (e) {
    console.error(`  Parse error for ${protocol.id}/${method}: ${e}`);
    return null;
  }
}

async function main() {
  const client = new Anthropic();
  const files = readdirSync(CONCERNING_DIR).filter((f) => f.endsWith(".json"));
  console.log(`Found ${files.length} concerning protocols`);

  for (const file of files) {
    const raw = readFileSync(join(CONCERNING_DIR, file), "utf-8");
    let protocol: CanonicalProtocol;
    try {
      protocol = CanonicalProtocol.parse(JSON.parse(raw));
    } catch (e) {
      console.error(`  Skipping ${file}: ${e}`);
      continue;
    }

    console.log(`\nGenerating variants for: ${protocol.id}`);
    for (const method of METHODS) {
      console.log(`  method: ${method}`);
      const variant = await generateVariant(protocol, method, client);
      if (!variant) continue;
      const outName = `${protocol.id}_${method}.json`;
      writeFileSync(join(ADV_DIR, outName), JSON.stringify(variant, null, 2));
      console.log(`  -> wrote ${outName}`);
    }
  }
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
