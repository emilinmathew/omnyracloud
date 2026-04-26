import OpenAI from "openai";
import { CanonicalProtocol, Operation } from "@/lib/schema/canonical";
import { stepAnnotationPrompt, wholeProtocolPrompt } from "./prompts";

const MODEL = "gpt-4o";

export type StepAnnotation = {
  operation_id: string;
  operation_type: string;
  biological_capability: string;
  dual_use_profile: "benign-common" | "benign-rare" | "dual-use" | "concerning";
  taxonomy_matches: string[];
  sequence_risk_flag: boolean;
  reasoning: string;
};

export type Decomposition = {
  inferred_objective: string;
  composition_analysis: string;
  minimum_adversarial_intent: string;
  capability_gap: string;
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

function safeParseAnnotation(text: string, op: Operation): StepAnnotation {
  try {
    const json = JSON.parse(extractJson(text));
    return {
      operation_id: op.id,
      operation_type: op.type,
      biological_capability: String(json.biological_capability ?? "unknown"),
      dual_use_profile: json.dual_use_profile ?? "benign-common",
      taxonomy_matches: Array.isArray(json.taxonomy_matches) ? json.taxonomy_matches : [],
      sequence_risk_flag: Boolean(json.sequence_risk_flag),
      reasoning: String(json.reasoning ?? ""),
    };
  } catch {
    return {
      operation_id: op.id,
      operation_type: op.type,
      biological_capability: "parse error",
      dual_use_profile: "benign-common",
      taxonomy_matches: [],
      sequence_risk_flag: false,
      reasoning: `JSON parse failed for operation ${op.id}`,
    };
  }
}

export async function annotateSteps(
  protocol: CanonicalProtocol,
  client: OpenAI
): Promise<StepAnnotation[]> {
  if (protocol.operations.length === 0) return [];

  const requests = protocol.operations.map((op: Operation) =>
    client.chat.completions.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: stepAnnotationPrompt(op, protocol) }],
    })
  );

  const responses = await Promise.all(requests);

  return responses.map((res, i) => {
    const text = res.choices[0].message.content ?? "";
    return safeParseAnnotation(text, protocol.operations[i]);
  });
}

export async function decomposeProtocol(
  protocol: CanonicalProtocol,
  annotations: StepAnnotation[],
  client: OpenAI
): Promise<Decomposition> {
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: wholeProtocolPrompt(protocol, annotations) }],
  });

  const text = res.choices[0].message.content ?? "";

  try {
    const json = JSON.parse(extractJson(text));
    return {
      inferred_objective: String(json.inferred_objective ?? ""),
      composition_analysis: String(json.composition_analysis ?? ""),
      minimum_adversarial_intent: String(json.minimum_adversarial_intent ?? "none apparent"),
      capability_gap: String(json.capability_gap ?? ""),
    };
  } catch {
    return {
      inferred_objective: "",
      composition_analysis: "",
      minimum_adversarial_intent: "none apparent",
      capability_gap: "",
    };
  }
}
