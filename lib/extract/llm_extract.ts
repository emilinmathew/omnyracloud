import OpenAI from "openai";
import { createHash } from "node:crypto";
import { CanonicalProtocol } from "@/lib/schema/canonical";

const MODEL = "gpt-4o";

const EXTRACTION_SCHEMA_HINT = `{
  "id": string,
  "title"?: string,
  "description"?: string,
  "source_format": "llm_extracted",
  "operations": [
    {
      "id": string,
      "type": "pcr"|"ligation"|"transformation"|"transfection"|"passage"|"infection"|"inoculation"|"culture"|"amplification"|"synthesis"|"assembly"|"purification"|"sequencing"|"titration"|"measurement"|"mix"|"incubate"|"centrifuge"|"electroporation"|"assay"|"other",
      "inputs": [ { "name": string, "category"?: string, "source_organism"?: string, "sequence"?: string, "concentration"?: string, "amount"?: string } ],
      "target_organism"?: string,
      "cell_line"?: string,
      "parameters"?: object,
      "notes"?: string
    }
  ],
  "metadata"?: object
}`;

const SYSTEM = `You convert laboratory protocols of any format (free text, Opentrons Python, unknown JSON, methods-section prose) into a canonical JSON schema for biosecurity screening.

Rules:
- Output ONLY valid JSON matching the provided schema. No prose, no code fences.
- Preserve reagent names, source organisms, and any nucleotide or protein sequences verbatim.
- Use the canonical operation types listed. If no type fits, use "other" and put the original verb in notes.
- Do not invent steps. If the input is ambiguous, omit the uncertain field rather than guessing.
- Do not include a trailing comma.`;

function fallbackId(raw: string): string {
  return `ext_${createHash("sha256").update(raw).digest("hex").slice(0, 10)}`;
}

function userPrompt(raw: string, schemaHint: string, err?: string): string {
  const errBlock = err
    ? `\n\nPrevious attempt failed schema validation with:\n${err}\nFix the issues and return valid JSON.`
    : "";
  return `Canonical schema:\n${schemaHint}\n\nRaw protocol (format unknown):\n${raw}${errBlock}`;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

export async function llmExtract(
  raw: string,
): Promise<ReturnType<typeof CanonicalProtocol.parse>> {
  if (!process.env.OPENAI_API_KEY) {
    return CanonicalProtocol.parse({
      id: fallbackId(raw),
      title: "unknown protocol (no LLM key)",
      description: raw.slice(0, 400),
      source_format: "llm_extracted",
      operations: [],
      metadata: { llm_extract: "skipped: missing OPENAI_API_KEY" },
    });
  }

  const client = new OpenAI();
  let lastError: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt(raw, EXTRACTION_SCHEMA_HINT, lastError) },
      ],
    }, {
      timeout: 30_000, // 30 second timeout to prevent hangs
    });

    const text = res.choices[0].message.content ?? "";

    try {
      const json = JSON.parse(extractJson(text));
      if (!json.id) json.id = fallbackId(raw);
      if (!json.source_format) json.source_format = "llm_extracted";
      return CanonicalProtocol.parse(json);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return CanonicalProtocol.parse({
    id: fallbackId(raw),
    title: "extraction failed",
    description: raw.slice(0, 400),
    source_format: "llm_extracted",
    operations: [],
    metadata: { llm_extract_error: lastError ?? "unknown" },
  });
}
