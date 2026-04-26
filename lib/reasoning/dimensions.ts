import OpenAI from "openai";
import { CanonicalProtocol } from "@/lib/schema/canonical";
import { DIMENSIONS, dimensionScoringPrompt } from "./prompts";
import type { StepAnnotation, Decomposition } from "./decompose";
import type { DimensionScore, RiskScore, Citation } from "@/lib/types";
import { retrieveChunks } from "@/lib/retrieval/search";

const MODEL = "gpt-4o";

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

function clampScore(n: unknown): RiskScore {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.max(0, Math.min(5, Math.round(v))) as RiskScore;
}

export async function scoreDimensions(
  protocol: CanonicalProtocol,
  annotations: StepAnnotation[],
  decomposition: Decomposition,
  client: OpenAI
): Promise<DimensionScore[]> {
  const queryBase = [
    protocol.title ?? "",
    protocol.description ?? "",
    decomposition.inferred_objective,
    annotations.map((a) => a.biological_capability).join(" "),
    annotations.flatMap((a) => a.taxonomy_matches).join(" "),
  ].join(" ").trim();

  const retrievalResults = await Promise.all(
    DIMENSIONS.map((dim) => retrieveChunks(`${dim.name} ${queryBase}`, 5))
  );

  const requests = DIMENSIONS.map((dim, i) =>
    client.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: dimensionScoringPrompt(dim, protocol, annotations, decomposition, retrievalResults[i]),
      }],
    })
  );

  const responses = await Promise.all(requests);

  return responses.map((res, i) => {
    const dim = DIMENSIONS[i];
    const text = res.choices[0].message.content ?? "";

    try {
      const json = JSON.parse(extractJson(text));
      const precedentIds: string[] = Array.isArray(json.retrieved_precedent_ids)
        ? json.retrieved_precedent_ids : [];
      const citations: Citation[] = retrievalResults[i]
        .filter((c) => precedentIds.includes(c.id))
        .map((c) => ({ chunk_id: c.id, title: c.title, source: c.source, snippet: c.text.slice(0, 200) }));

      return {
        dimension: dim.id as DimensionScore["dimension"],
        score: clampScore(json.score),
        reasoning: String(json.reasoning ?? ""),
        triggered_steps: Array.isArray(json.triggered_steps) ? json.triggered_steps : [],
        retrieved_precedents: citations,
        taxonomy_matches: Array.isArray(json.taxonomy_matches) ? json.taxonomy_matches : [],
      } satisfies DimensionScore;
    } catch {
      return {
        dimension: dim.id as DimensionScore["dimension"],
        score: 0 as RiskScore,
        reasoning: "Scoring parse error.",
        triggered_steps: [],
        retrieved_precedents: [],
        taxonomy_matches: [],
      } satisfies DimensionScore;
    }
  });
}
