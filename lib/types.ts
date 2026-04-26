export type DimensionId =
  | "capability"
  | "reagent"
  | "composition"
  | "intent"
  | "sequence";

export type RiskScore = 0 | 1 | 2 | 3 | 4 | 5;

export type Citation = {
  chunk_id: string;
  title: string;
  source: string;
  snippet?: string;
};

export type DimensionScore = {
  dimension: DimensionId;
  score: RiskScore;
  reasoning: string;
  triggered_steps: string[];
  retrieved_precedents: Citation[];
  taxonomy_matches: string[];
};

export type HmmHit = {
  hmm: string;
  organism: string;
  category: string;
  evalue: string;
  score: number;
  bias: number;
};

export type SequenceFinding = {
  reagent_name: string;
  sequence_hash: string;
  result: "flagged" | "clear" | "unknown";
  reason?: string;
  sequence_length?: number;
  category?: string;
  hits?: HmmHit[];
  sequence?: string; // Original sequence for UI display/validation
};

export type RiskReport = {
  protocol_id: string;
  aggregate_risk: RiskScore;
  dimensions: DimensionScore[];
  inferred_objective: string;
  composition_analysis: string;
  minimum_adversarial_intent: string;
  capability_gap: string;
  sequence_findings: SequenceFinding[];
  critique: {
    quality_score: number;
    concerns: string[];
    improvements: string[];
  };
  processing_time_ms: number;
  source_format: string;
};
