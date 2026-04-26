import type { SourceFormat } from "./canonical";

export type DetectedFormat = SourceFormat | "unknown";

export function detectFormat(raw: string): DetectedFormat {
  const trimmed = raw.trim();
  if (!trimmed) return "unknown";

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if ("refs" in obj && "instructions" in obj) {
        return "autoprotocol";
      }
      if (
        "operations" in obj &&
        Array.isArray((obj as { operations: unknown }).operations)
      ) {
        return "generic_json";
      }
    }
    // Parsed JSON but unrecognized shape — let LLM extraction handle it.
    return "llm_extracted";
  } catch (e) {
    // Check if this looks like it was intended to be JSON (starts with { or [)
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Not JSON - continue to other format checks
  }

  if (
    /from\s+opentrons\s+import/.test(trimmed) ||
    /def\s+run\s*\(\s*protocol/.test(trimmed)
  ) {
    return "opentrons_python";
  }

  return "llm_extracted";
}
