import type { DimensionScore, SequenceFinding, RiskReport, RiskScore } from "./types";

export type StepAnnotationResult = {
  operation_id: string;
  operation_type: string;
  biological_capability: string;
  dual_use_profile: "benign-common" | "benign-rare" | "dual-use" | "concerning";
  taxonomy_matches: string[];
  sequence_risk_flag: boolean;
  reasoning: string;
};

export type StreamEvent =
  | { type: "format_detected"; format: string; protocol_id: string; title?: string; operation_count: number }
  | { type: "step_annotating"; operation_id: string; operation_type: string; step_index: number; total_steps: number }
  | { type: "step_annotated"; annotation: StepAnnotationResult }
  | { type: "decomposing" }
  | { type: "decomposed"; inferred_objective: string; composition_analysis: string; minimum_adversarial_intent: string; capability_gap: string }
  | { type: "dimension_scoring"; dimension: string }
  | { type: "dimension_scored"; score: DimensionScore }
  | { type: "sequence_screening"; count: number }
  | { type: "sequence_debug"; message: string; cache_hits: number; cache_misses: number }
  | { type: "sequence_checked"; findings: SequenceFinding[] }
  | { type: "critiquing" }
  | { type: "critique_done"; quality_score: number; concerns: string[]; improvements: string[] }
  | { type: "complete"; report: RiskReport }
  | { type: "error"; message: string };
