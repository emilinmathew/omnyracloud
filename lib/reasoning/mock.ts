import type { CanonicalProtocol } from "@/lib/schema/canonical";
import type { StreamEvent } from "@/lib/stream-types";
import type { RiskScore, DimensionScore, SequenceFinding } from "@/lib/types";
import { sequenceDimension } from "@/lib/sequence/check";

const CONCERNING_REAGENTS: [string, string[]][] = [
  ["h5n1",            ["enhanced_transmissibility"]],
  ["h7n9",            ["enhanced_transmissibility"]],
  ["h1n1 1918",       ["enhanced_transmissibility", "select_agent_synthesis"]],
  ["sars",            ["enhanced_transmissibility"]],
  ["mers",            ["enhanced_transmissibility"]],
  ["nipah",           ["enhanced_transmissibility"]],
  ["ebola",           ["enhanced_transmissibility"]],
  ["variola",         ["select_agent_synthesis"]],
  ["smallpox",        ["select_agent_synthesis"]],
  ["poliovirus",      ["select_agent_synthesis"]],
  ["horsepox",        ["select_agent_synthesis"]],
  ["gibson assembly", ["select_agent_synthesis", "sequence_screening_evasion"]],
  ["reverse genetics",["select_agent_synthesis"]],
  ["infectious clone",["select_agent_synthesis"]],
  ["ricin",           ["toxin_production"]],
  ["ricinus",         ["toxin_production"]],
  ["abrin",           ["toxin_production"]],
  ["botulinum",       ["toxin_production"]],
  ["bont",            ["toxin_production"]],
  ["clostridium botulinum", ["toxin_production"]],
  ["ndm-1",           ["resistance_immune_evasion"]],
  ["kpc",             ["resistance_immune_evasion"]],
  ["carbapenem",      ["resistance_immune_evasion"]],
  ["il-4",            ["resistance_immune_evasion"]],
  ["mousepox",        ["resistance_immune_evasion"]],
  ["vaccinia",        ["resistance_immune_evasion"]],
  ["ferret",          ["enhanced_transmissibility"]],
  ["aerosolization",  ["delivery_system_construction"]],
  ["nebulizer",       ["delivery_system_construction"]],
  ["collison",        ["delivery_system_construction"]],
];

const CONCERNING_OPS = ["passage", "serial_passage", "inoculation", "infection", "synthesis", "assembly", "aerosolization"];

const DUAL_USE_REAGENTS = ["lentiviral vector", "aav", "crispr", "cas9", "guide rna", "sgrna"];

const DIMENSION_REASONING: Record<string, [string, string]> = {
  capability:   ["No significant biological capability indicated by keyword analysis.", "Flagged reagents suggest a potentially dangerous biological capability is being enabled."],
  reagent:      ["All detected reagents are consistent with standard research use.", "One or more reagents matched concern keywords associated with select agents, controlled toxins, or dual-use biology."],
  composition:  ["Steps appear additive with no emergent dangerous capability detected.", "The combination of flagged operations and reagents together suggests emergent capability beyond individual steps."],
  intent:       ["Workflow is overwhelmingly consistent with routine research.", "Concerning interpretation is more parsimonious than benign interpretation given this specific reagent-operation combination."],
  sequence:     ["No sequences present, or no sequences matched cache.", "Placeholder sequence tokens detected — real sequences require offline Common Mechanism review."],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function norm(s: string) { return s.toLowerCase().replace(/[_\-]/g, " "); }

function clamp(n: number): RiskScore {
  return Math.max(0, Math.min(5, Math.round(n))) as RiskScore;
}

export async function mockStream(
  protocol: CanonicalProtocol,
  send: (e: StreamEvent) => void,
  precomputedFindings?: SequenceFinding[]
): Promise<void> {
  const started = Date.now();
  const flaggedReagents: string[] = [];
  const flaggedOps: string[] = [];
  const taxonomy = new Set<string>();

  // Stage 1 — per-step annotation with delays.
  for (let i = 0; i < protocol.operations.length; i++) {
    const op = protocol.operations[i];
    send({ type: "step_annotating", operation_id: op.id, operation_type: op.type, step_index: i, total_steps: protocol.operations.length });
    await sleep(180 + Math.random() * 120);

    const opNorm = norm(op.type + " " + (op.notes ?? ""));
    const isConcerningOp = CONCERNING_OPS.some(k => opNorm.includes(k));
    if (isConcerningOp) flaggedOps.push(op.id);

    const stepFlagged: string[] = [];
    const stepTaxonomy = new Set<string>();
    for (const r of op.inputs) {
      const rNorm = norm(r.name + " " + (r.source_organism ?? "") + " " + (r.category ?? ""));
      for (const [keyword, cats] of CONCERNING_REAGENTS) {
        if (rNorm.includes(keyword)) {
          flaggedReagents.push(r.name);
          stepFlagged.push(r.name);
          cats.forEach(c => { taxonomy.add(c); stepTaxonomy.add(c); });
        }
      }
    }

    const isDualUse = op.inputs.some(r => DUAL_USE_REAGENTS.some(k => norm(r.name).includes(k)));
    const profile = stepFlagged.length > 0 ? "concerning"
      : isConcerningOp ? "dual-use"
      : isDualUse ? "dual-use"
      : "benign-common";

    send({
      type: "step_annotated",
      annotation: {
        operation_id: op.id,
        operation_type: op.type,
        biological_capability: profile === "concerning"
          ? `Enables ${[...stepTaxonomy][0]?.replace(/_/g, " ") ?? "potentially dangerous"} capability`
          : isConcerningOp ? `Standard ${op.type} with dual-use potential`
          : `Routine ${op.type}`,
        dual_use_profile: profile,
        taxonomy_matches: [...stepTaxonomy],
        sequence_risk_flag: op.inputs.some(r => !!r.sequence),
        reasoning: profile === "concerning"
          ? `[MOCK] Reagent "${stepFlagged[0]}" matches ${[...stepTaxonomy].join(", ")} concern indicators.`
          : `[MOCK] No concern keywords detected in this step.`,
      },
    });
  }

  const uniqueFlagged = [...new Set(flaggedReagents)];
  const concernLevel = uniqueFlagged.length * 1.2 + flaggedOps.length * 0.6;
  const baseScore = clamp(Math.min(concernLevel, 5));
  const taxonomyList = [...taxonomy];

  // Use pre-computed real findings if provided (route already sent the event),
  // otherwise fall back to mock findings (legacy path when called standalone).
  const seqFindings: SequenceFinding[] = precomputedFindings ?? (() => {
    const findings: SequenceFinding[] = [];
    for (const op of protocol.operations) {
      for (const r of op.inputs) {
        if (!r.sequence) continue;
        const isPlaceholder = /^\[.+\]$/.test(r.sequence.trim());
        findings.push({
          reagent_name: r.name,
          sequence_hash: "mock_" + r.name.slice(0, 8).replace(/\s/g, "_"),
          result: "unknown",
          reason: isPlaceholder ? "Placeholder token — real sequence requires offline Common Mechanism review." : "[MOCK] Not in precomputed cache.",
        });
      }
    }
    return findings;
  })();
  if (!precomputedFindings) {
    send({ type: "sequence_checked", findings: seqFindings });
  }
  await sleep(100);

  // Stage 2 — decomposition.
  send({ type: "decomposing" });
  await sleep(400 + Math.random() * 200);
  send({
    type: "decomposed",
    inferred_objective: baseScore >= 4
      ? `[MOCK] Workflow appears to pursue ${taxonomyList[0]?.replace(/_/g, " ") ?? "a potentially dangerous"} objective. Enable real screening for LLM-based analysis.`
      : `[MOCK] ${protocol.description?.slice(0, 200) ?? "Standard research workflow. Enable real screening for detailed objective analysis."}`,
    composition_analysis: flaggedOps.length >= 2 && uniqueFlagged.length >= 1
      ? `[MOCK] ${flaggedOps.length} flagged operation(s) combined with ${uniqueFlagged.length} concerning reagent(s) — composition may create emergent capability.`
      : "[MOCK] No multi-step composition risk detected by keyword scan.",
    minimum_adversarial_intent: baseScore >= 4
      ? `[MOCK] Keyword pattern is consistent with ${taxonomyList[0]?.replace(/_/g, " ") ?? "a recognized threat category"}.`
      : "[MOCK] None apparent from keyword scan.",
    capability_gap: baseScore >= 4
      ? "[MOCK] Protocol appears close to a recognized threat scenario. Enable real screening for precise gap analysis."
      : "[MOCK] No obvious capability gap detected.",
  });

  // Stage 3 — dimension scoring, all 5 fire in parallel.
  const dims = ["capability", "reagent", "composition", "intent", "sequence"] as const;
  const scores: Record<string, number> = {
    capability: baseScore,
    reagent: clamp(uniqueFlagged.length > 0 ? Math.max(baseScore, 2) : 0),
    composition: clamp(flaggedOps.length > 1 && uniqueFlagged.length > 0 ? baseScore : Math.max(0, baseScore - 1)),
    intent: clamp(baseScore > 3 ? baseScore - 1 : Math.max(0, baseScore - 2)),
    sequence: 0, // overridden by IBBIS-derived dimension below
  };

  // Emit all scoring events at once — all 5 panels activate simultaneously.
  for (const dim of dims) {
    send({ type: "dimension_scoring", dimension: dim });
  }

  const seqDim = sequenceDimension(seqFindings);

  const dimensions: DimensionScore[] = [];
  // Resolve in parallel with staggered delays to simulate concurrent LLM calls.
  await Promise.all(dims.map(async (dim) => {
    await sleep(350 + Math.random() * 400);
    let d: DimensionScore;
    if (dim === "sequence") {
      d = seqDim;
    } else {
      const score = clamp(scores[dim]);
      const [benignReasoning, concernReasoning] = DIMENSION_REASONING[dim];
      d = {
        dimension: dim,
        score,
        reasoning: score >= 2 ? `[MOCK] ${concernReasoning}` : `[MOCK] ${benignReasoning}`,
        triggered_steps: score >= 2 ? flaggedOps.slice(0, 3) : [],
        retrieved_precedents: score >= 3 ? [
          { chunk_id: "fouchier_2012_science", title: "Fouchier et al. 2012: Airborne transmission of influenza H5N1 in ferrets", source: "Science 336(6088)", snippet: "Airborne transmission of H5N1 in ferrets via targeted mutations and serial passage." },
          { chunk_id: "nsabb_durc_policy", title: "NSABB DURC Policy Framework", source: "NIH Office of Science Policy", snippet: "Dual-use research of concern criteria and review requirements for select agents." },
        ] : [],
        taxonomy_matches: score >= 2 ? taxonomyList : [],
      };
    }
    dimensions.push(d);
    send({ type: "dimension_scored", score: d });
  }));

  // Stage 5 — critique.
  send({ type: "critiquing" });
  await sleep(300);
  const mockConcerns = baseScore >= 4
    ? [
        "Keyword-based scoring may underestimate sequence-level risk — real sequences not present for hash lookup.",
        "Composition risk relies on co-occurrence of flagged terms; actual emergent capability requires LLM-grounded reasoning.",
        "Intent dimension score is conservative without full-text submitter context.",
      ]
    : baseScore >= 2
    ? [
        "Low-signal protocol — keyword scan found minimal indicators but LLM annotation may surface latent dual-use steps.",
        "Reagent dimension may miss novel or obfuscated agent names not in the keyword list.",
      ]
    : ["No concerns flagged by keyword scan. Enable real screening to confirm with LLM-grounded analysis."];
  const mockImprovements = [
    "Add ANTHROPIC_API_KEY to run retrieval-augmented dimension scoring against literature corpus.",
    "Submit any sequence fields to Common Mechanism for offline hash verification.",
    baseScore >= 3 ? "Flag for expert review before cloud lab execution." : "No immediate action required.",
  ];
  send({
    type: "critique_done",
    quality_score: baseScore >= 4 ? 2 : baseScore >= 2 ? 1 : 0,
    concerns: mockConcerns,
    improvements: mockImprovements,
  });

  const aggregate = clamp(Math.max(...dimensions.map(d => d.score)));
  send({
    type: "complete",
    report: {
      protocol_id: protocol.id,
      aggregate_risk: aggregate,
      dimensions,
      inferred_objective: baseScore >= 4
        ? `[MOCK] Workflow appears to pursue ${taxonomyList[0]?.replace(/_/g, " ") ?? "a potentially dangerous"} objective.`
        : `[MOCK] ${protocol.description?.slice(0, 200) ?? "Standard research workflow."}`,
      composition_analysis: flaggedOps.length >= 2 && uniqueFlagged.length >= 1
        ? `[MOCK] Composition may create emergent capability from flagged steps + reagents.`
        : "[MOCK] No composition risk from keyword scan.",
      minimum_adversarial_intent: baseScore >= 4
        ? `[MOCK] Consistent with ${taxonomyList[0]?.replace(/_/g, " ") ?? "a concern category"}.`
        : "[MOCK] None apparent.",
      capability_gap: baseScore >= 4 ? "[MOCK] Close to recognized threat scenario." : "[MOCK] No gap concern.",
      sequence_findings: seqFindings,
      critique: {
        quality_score: 0,
        concerns: ["[MOCK MODE] Keyword-based estimates only."],
        improvements: ["Add ANTHROPIC_API_KEY for real screening."],
      },
      processing_time_ms: Date.now() - started,
      source_format: protocol.source_format,
    },
  });
}
