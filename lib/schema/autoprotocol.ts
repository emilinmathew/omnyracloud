import { createHash } from "node:crypto";
import {
  CanonicalProtocol,
  type CanonicalOpType,
  type Operation,
  type Reagent,
} from "./canonical";

// Autoprotocol spec: https://autoprotocol.org/specification/
//
// We support the ~14 instruction types that cover the bulk of published
// examples. Unknown instructions are preserved with their original op name in
// `notes` and mapped to canonical `other`.

const AP_TO_CANONICAL: Record<string, CanonicalOpType> = {
  provision: "mix",
  transfer: "mix",
  mix: "mix",
  pipette: "mix",
  dispense: "mix",
  thermocycle: "pcr",
  incubate: "incubate",
  spin: "centrifuge",
  seal: "other",
  unseal: "other",
  cover: "other",
  uncover: "other",
  absorbance: "measurement",
  fluorescence: "measurement",
  luminescence: "measurement",
  image: "measurement",
  sangerseq: "sequencing",
  sequence: "sequencing",
};

type ApRef = {
  // Autoprotocol refs can carry a variety of fields; we pull what's useful.
  new?: string;
  type?: string;
  id?: string;
  discard?: boolean;
  store?: Record<string, unknown>;
};

type ApDoc = {
  refs?: Record<string, ApRef>;
  instructions?: Array<Record<string, unknown>>;
  name?: string;
  id?: string;
  description?: string;
};

function hashId(input: string, n = 8): string {
  return createHash("sha256").update(input).digest("hex").slice(0, n);
}

function refsToReagents(refs: Record<string, ApRef> | undefined): Reagent[] {
  if (!refs) return [];
  return Object.entries(refs).map(([name, ref]) => ({
    name,
    category: ref.type ?? ref.new,
  }));
}

function describeInstruction(instr: Record<string, unknown>): string {
  const op = String(instr.op ?? "unknown");
  const keys = Object.keys(instr).filter((k) => k !== "op");
  return `${op}(${keys.join(",")})`;
}

function extractReagentRefs(
  instr: Record<string, unknown>,
  refIndex: Map<string, Reagent>,
): Reagent[] {
  // Best-effort: scan string values for tokens that match ref names.
  const found = new Set<string>();
  const scan = (v: unknown) => {
    if (typeof v === "string") {
      // Autoprotocol well specs look like "refname/0" — take the prefix.
      const head = v.split("/")[0];
      if (refIndex.has(head)) found.add(head);
    } else if (Array.isArray(v)) {
      v.forEach(scan);
    } else if (v && typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(scan);
    }
  };
  scan(instr);
  return Array.from(found).map((n) => refIndex.get(n)!);
}

export function parseAutoprotocol(raw: string): CanonicalProtocol {
  const doc = JSON.parse(raw) as ApDoc;
  const reagents = refsToReagents(doc.refs);
  const refIndex = new Map(reagents.map((r) => [r.name, r]));

  const operations: Operation[] = (doc.instructions ?? []).map((instr, i) => {
    const opName = String(instr.op ?? "other").toLowerCase();
    const canonicalType: CanonicalOpType =
      AP_TO_CANONICAL[opName] ?? "other";
    const inputs = extractReagentRefs(instr, refIndex);
    const { op: _op, ...rest } = instr;
    void _op;
    const parameters: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        parameters[k] = v;
      }
    }
    return {
      id: `op_${i}_${hashId(describeInstruction(instr))}`,
      type: canonicalType,
      inputs,
      parameters,
      notes: canonicalType === "other" ? `autoprotocol.${opName}` : undefined,
    };
  });

  const idSeed =
    doc.id ?? doc.name ?? hashId(raw.slice(0, 512));

  return CanonicalProtocol.parse({
    id: `ap_${idSeed}`,
    title: doc.name,
    description: doc.description,
    source_format: "autoprotocol",
    operations,
    metadata: { autoprotocol_refs: Object.keys(doc.refs ?? {}) },
  });
}
