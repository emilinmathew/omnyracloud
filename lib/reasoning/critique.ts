import OpenAI from "openai";
import { critiquePrompt } from "./prompts";
import type { RiskReport } from "@/lib/types";

const MODEL = "gpt-4o";

export type CritiqueResult = {
  quality_score: number;
  concerns: string[];
  improvements: string[];
};

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

export async function critiqueReport(
  report: Omit<RiskReport, "critique" | "processing_time_ms">,
  client: OpenAI
): Promise<CritiqueResult> {
  const trimmed = {
    protocol_id: report.protocol_id,
    aggregate_risk: report.aggregate_risk,
    inferred_objective: report.inferred_objective,
    composition_analysis: report.composition_analysis,
    minimum_adversarial_intent: report.minimum_adversarial_intent,
    capability_gap: report.capability_gap,
    dimensions: report.dimensions.map((d) => ({
      dimension: d.dimension,
      score: d.score,
      reasoning: d.reasoning,
      triggered_steps: d.triggered_steps,
      taxonomy_matches: d.taxonomy_matches,
    })),
  };

  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: critiquePrompt(JSON.stringify(trimmed, null, 2)) }],
  });

  const text = res.choices[0].message.content ?? "";

  try {
    const json = JSON.parse(extractJson(text));
    return {
      quality_score: Math.max(0, Math.min(5, Number(json.quality_score ?? 3))),
      concerns: Array.isArray(json.concerns) ? json.concerns.slice(0, 3) : [],
      improvements: Array.isArray(json.improvements) ? json.improvements.slice(0, 3) : [],
    };
  } catch {
    return { quality_score: 0, concerns: ["Critique parse error."], improvements: [] };
  }
}
