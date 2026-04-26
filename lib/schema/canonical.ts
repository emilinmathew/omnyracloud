import { z } from "zod";

export const CANONICAL_OP_TYPES = [
  "pcr",
  "ligation",
  "transformation",
  "transfection",
  "passage",
  "infection",
  "inoculation",
  "culture",
  "amplification",
  "synthesis",
  "assembly",
  "purification",
  "sequencing",
  "titration",
  "measurement",
  "mix",
  "incubate",
  "centrifuge",
  "electroporation",
  "assay",
  "other",
] as const;

export type CanonicalOpType = (typeof CANONICAL_OP_TYPES)[number];

export const Reagent = z.object({
  name: z.string(),
  category: z.string().optional(),
  source_organism: z.string().optional(),
  sequence: z.string().optional(),
  concentration: z.string().optional(),
  amount: z.string().optional(),
});
export type Reagent = z.infer<typeof Reagent>;

export const Operation = z.object({
  id: z.string(),
  type: z.string(),
  inputs: z.array(Reagent).default([]),
  outputs: z.array(z.string()).optional(),
  parameters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  target_organism: z.string().optional(),
  cell_line: z.string().optional(),
  notes: z.string().optional(),
});
export type Operation = z.infer<typeof Operation>;

export const SOURCE_FORMATS = [
  "autoprotocol",
  "generic_json",
  "llm_extracted",
  "opentrons_python",
] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export const CanonicalProtocol = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  source_format: z.enum(SOURCE_FORMATS),
  operations: z.array(Operation),
  metadata: z.record(z.unknown()).optional(),
});
export type CanonicalProtocol = z.infer<typeof CanonicalProtocol>;
