import { execFile } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { SequenceFinding, DimensionScore, RiskScore } from "@/lib/types";
import type { CanonicalProtocol } from "@/lib/schema/canonical";

const execFileAsync = promisify(execFile);

// Priority order for live screening:
//   1. COMMEC_SERVICE_URL  — HTTP microservice (production / Vercel)
//   2. COMMEC_BIN + COMMEC_DB — local subprocess (dev)
//   3. cache fallback
const COMMEC_SERVICE_URL = process.env.COMMEC_SERVICE_URL;
const COMMEC_BIN  = process.env.COMMEC_BIN;
const COMMEC_DB   = process.env.COMMEC_DB;
const COMMEC_PYPATH = process.env.COMMEC_PYTHONPATH;

function isPlaceholder(seq: string): boolean {
  return /^\[.+\]$/.test(seq.trim()) || seq.trim().startsWith("[PLACEHOLDER:");
}

function seqHash(seq: string): string {
  return createHash("sha256").update(seq.toUpperCase().replace(/\s/g, "")).digest("hex");
}

// ------------------------------------------------------------------
// Commec subprocess path
// ------------------------------------------------------------------

type CommecQueryStatus = {
  screen_status: string;
  biorisk: string;
  rationale: string;
};

type CommecQuery = {
  status: CommecQueryStatus;
  hits: Record<string, unknown>;
};

type CommecOutput = {
  queries: Record<string, CommecQuery>;
};

async function runCommec(
  sequences: Array<{ name: string; sequence: string }>,
): Promise<SequenceFinding[]> {
  const tmpDir = mkdtempSync(join(tmpdir(), "commec-"));
  const fastaPath = join(tmpDir, "input.fasta");
  const outputPrefix = join(tmpDir, "out");

  const fasta = sequences.map(s => `>${s.name}\n${s.sequence}`).join("\n");
  writeFileSync(fastaPath, fasta);

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (COMMEC_PYPATH) env.PYTHONPATH = COMMEC_PYPATH;

  try {
    await execFileAsync(
      COMMEC_BIN!,
      ["screen", "-d", COMMEC_DB!, "--skip-tx", "--skip-nt", "-o", outputPrefix, "-F", fastaPath],
      { env, timeout: 90_000 },
    );

    const jsonPath = outputPrefix + ".output.json";
    const out: CommecOutput = JSON.parse(readFileSync(jsonPath, "utf-8"));

    return sequences.map(s => {
      const q = out.queries?.[s.name];
      const hash = seqHash(s.sequence);
      if (!q) {
        return { reagent_name: s.name, sequence_hash: hash, result: "unknown" as const,
                 reason: "commec returned no result for this sequence.", sequence: s.sequence };
      }

      const status = q.status?.screen_status ?? "Warning";
      const rationale = q.status?.rationale ?? "";
      const hitCategories = Object.keys(q.hits ?? {}).join(", ");

      let result: SequenceFinding["result"];
      if (status === "Flag")      result = "flagged";
      else if (status === "Pass") result = "clear";
      else                        result = "unknown";

      return {
        reagent_name: s.name,
        sequence_hash: hash,
        result,
        reason: rationale || `biorisk: ${q.status?.biorisk ?? "unknown"}`,
        category: hitCategories || undefined,
        sequence: s.sequence,
      };
    });
  } finally {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  }
}

// ------------------------------------------------------------------
// HTTP microservice path (production / Vercel)
// ------------------------------------------------------------------

async function callCommecService(
  sequences: Array<{ name: string; sequence: string }>,
): Promise<SequenceFinding[]> {
  const res = await fetch(`${COMMEC_SERVICE_URL}/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sequences }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`commec service returned ${res.status}`);
  const data = await res.json() as { findings: SequenceFinding[] };

  // Map sequences back to findings since Railway service doesn't include them
  const seqMap = new Map(sequences.map(s => [s.name, s.sequence]));
  return data.findings.map(f => ({
    ...f,
    sequence: seqMap.get(f.reagent_name) || undefined
  }));
}

// ------------------------------------------------------------------
// Cache fallback (used when commec isn't available, e.g. on Vercel)
// ------------------------------------------------------------------

type CMCacheEntry = { flag: boolean; reason: string; category: string };
type CMCache = Record<string, CMCacheEntry>;

let _cache: CMCache | null = null;

function loadCache(): CMCache {
  if (_cache) return _cache;
  const p = join(process.cwd(), "lib", "sequence", "common_mechanism_cache.json");
  try {
    _cache = existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as CMCache) : {};
  } catch {
    _cache = {};
  }
  return _cache;
}

function checkViaCache(sequences: Array<{ name: string; sequence: string }>): SequenceFinding[] {
  const cache = loadCache();
  return sequences.map(s => {
    const hash = seqHash(s.sequence);
    const entry = cache[hash];
    if (entry) {
      return { reagent_name: s.name, sequence_hash: hash,
               result: entry.flag ? "flagged" : "clear", reason: entry.reason, category: entry.category, sequence: s.sequence };
    }
    return { reagent_name: s.name, sequence_hash: hash, result: "unknown" as const,
             reason: "Sequence not in precomputed cache — flag for offline commec screening.", sequence: s.sequence };
  });
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

export async function checkSequences(
  protocol: CanonicalProtocol,
  send?: (event: { type: "sequence_debug"; message: string; cache_hits: number; cache_misses: number }) => void
): Promise<SequenceFinding[]> {
  const findings: SequenceFinding[] = [];
  const toScreen: Array<{ name: string; sequence: string }> = [];

  for (const op of protocol.operations) {
    for (const reagent of op.inputs) {
      if (!reagent.sequence) continue;
      if (isPlaceholder(reagent.sequence)) {
        findings.push({
          reagent_name: reagent.name,
          sequence_hash: seqHash(reagent.sequence),
          result: "unknown",
          reason: "Placeholder token — real sequence must be submitted to commec for screening.",
          sequence: reagent.sequence,
        });
      } else {
        toScreen.push({ name: reagent.name, sequence: reagent.sequence });
      }
    }
  }

  if (toScreen.length === 0) return findings;

  // 1. CACHE LOOKUP FIRST - instant SHA-256 lookup for known sequences
  const cache = loadCache();
  const cacheResults: SequenceFinding[] = [];
  const cacheMisses: Array<{ name: string; sequence: string }> = [];

  for (const seq of toScreen) {
    const hash = seqHash(seq.sequence);
    const entry = cache[hash];
    if (entry) {
      // Cache hit - instant result
      cacheResults.push({
        reagent_name: seq.name,
        sequence_hash: hash,
        result: entry.flag ? "flagged" : "clear",
        reason: `${entry.reason} [cached]`,
        category: entry.category,
        sequence: seq.sequence,
        sequence_length: seq.sequence.length,
      });
    } else {
      // Cache miss - needs real HMM scan
      cacheMisses.push(seq);
    }
  }

  // Silent cache lookup - no debug output

  // 2. RAILWAY HMM SCAN for cache misses only
  let hmmscanResults: SequenceFinding[] = [];
  if (cacheMisses.length > 0 && COMMEC_SERVICE_URL) {
    // console.log(`[HMM SCAN] Starting Railway HMM scan for ${cacheMisses.length} sequences...`);
    // console.log(`[HMM SCAN] Railway URL: ${COMMEC_SERVICE_URL}`);
    try {
      hmmscanResults = await callCommecService(cacheMisses);
      // console.log(`[HMM SCAN] ✅ Railway HMM scan completed for ${cacheMisses.length} sequences`);

    } catch (e) {
      console.error("[HMM SCAN] ❌ Railway HMM scan failed, trying local subprocess:", e);

      // 3. Local subprocess fallback for HMM scan
      if (COMMEC_BIN && COMMEC_DB) {
        try {
          hmmscanResults = await runCommec(cacheMisses);
          // console.log(`Local HMM scan completed for ${cacheMisses.length} sequences`);
        } catch (e2) {
          console.error("Local HMM scan failed, marking as unknown:", e2);
          hmmscanResults = cacheMisses.map(s => ({
            reagent_name: s.name,
            sequence_hash: seqHash(s.sequence),
            result: "unknown" as const,
            reason: "HMM scan failed - sequence not in cache and scan service unavailable",
            sequence: s.sequence,
            sequence_length: s.sequence.length,
          }));
        }
      } else {
        hmmscanResults = cacheMisses.map(s => ({
          reagent_name: s.name,
          sequence_hash: seqHash(s.sequence),
          result: "unknown" as const,
          reason: "HMM scan unavailable - sequence not in cache and no scan service configured",
          sequence: s.sequence,
          sequence_length: s.sequence.length,
        }));
      }
    }
  } else if (cacheMisses.length > 0) {
    // No Railway service configured, try local subprocess
    if (COMMEC_BIN && COMMEC_DB) {
      try {
        hmmscanResults = await runCommec(cacheMisses);
      } catch (e) {
        console.error("Local HMM scan failed:", e);
        hmmscanResults = cacheMisses.map(s => ({
          reagent_name: s.name,
          sequence_hash: seqHash(s.sequence),
          result: "unknown" as const,
          reason: "Local HMM scan failed",
          sequence: s.sequence,
          sequence_length: s.sequence.length,
        }));
      }
    } else {
      hmmscanResults = cacheMisses.map(s => ({
        reagent_name: s.name,
        sequence_hash: seqHash(s.sequence),
        result: "unknown" as const,
        reason: "No HMM scan configured - sequence not in cache",
        sequence: s.sequence,
        sequence_length: s.sequence.length,
      }));
    }
  }

  return [...findings, ...cacheResults, ...hmmscanResults];
}

export function sequenceScore(findings: SequenceFinding[]): number {
  return sequenceDimension(findings).score;
}

export function sequenceDimension(findings: SequenceFinding[]): DimensionScore {
  const flagged = findings.filter(f => f.result === "flagged");
  const unknown = findings.filter(f => f.result === "unknown");
  const placeholders = unknown.filter(f => f.reason?.toLowerCase().includes("placeholder"));

  let score: RiskScore;
  if (flagged.length > 0) score = 4;
  else if (placeholders.length > 0) score = 3;
  else if (unknown.length > 0) score = 1;
  else if (findings.length > 0) score = 0;
  else score = 0;

  let reasoning: string;
  if (flagged.length > 0) {
    const allHits = flagged.flatMap(f => f.hits ?? []);
    if (allHits.length > 0) {
      const orgs = [...new Set(allHits.map(h => h.organism).filter(Boolean))];
      const cats = [...new Set(allHits.map(h => h.category).filter(Boolean))];
      const top = allHits[0];
      reasoning = `IBBIS biorisk HMM flagged ${flagged.length} sequence(s). Top match: ${top.hmm} (e=${top.evalue}, ${top.score.toFixed(1)} bits, ${top.organism || "unknown organism"}). Categories: ${cats.join(", ") || "regulated"}. Organisms: ${orgs.join("; ") || "unknown"}.`;
    } else {
      reasoning = `IBBIS biorisk HMM flagged ${flagged.length} sequence(s): ${flagged.map(f => f.reagent_name).join(", ")}.`;
    }
  } else if (placeholders.length > 0) {
    reasoning = `${placeholders.length} placeholder sequence(s) detected — real sequences must be submitted to IBBIS before execution. Treat as high-risk until screened.`;
  } else if (unknown.length > 0) {
    const lens = unknown.map(f => f.sequence_length ? `${f.sequence_length} nt` : "unknown length");
    reasoning = `${unknown.length} sequence(s) too short for HMM screening (${lens.join(", ")} — threshold 42 nt). No biorisk assessment possible.`;
  } else if (findings.length > 0) {
    reasoning = `All ${findings.length} sequence(s) screened against IBBIS biorisk HMM (2414 profiles) — no matches found.`;
  } else {
    reasoning = "No sequences present in this protocol.";
  }

  const taxonomyMatches = [...new Set(findings.flatMap(f => f.hits ?? []).map(h => h.category).filter(Boolean))];
  const triggeredSteps = flagged.map(f => f.reagent_name);

  return {
    dimension: "sequence",
    score,
    reasoning,
    triggered_steps: triggeredSteps,
    retrieved_precedents: [],
    taxonomy_matches: taxonomyMatches,
  };
}
