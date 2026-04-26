import type { RiskReport } from "@/lib/types";

const TAXONOMY_REFS: Record<string, { label: string; url: string }> = {
  enhanced_transmissibility:   { label: "P3CO Framework review",            url: "https://www.phe.gov/s3/dualuse/Pages/P3COFAQs.aspx" },
  select_agent_synthesis:      { label: "Select Agent Program compliance",  url: "https://www.selectagents.gov/" },
  toxin_production:            { label: "Select Agent toxin regulations",   url: "https://www.selectagents.gov/regulations.html" },
  resistance_immune_evasion:   { label: "NIH DURC policy review",          url: "https://osp.od.nih.gov/biotechnology/dual-use-research-of-concern/" },
  sequence_screening_evasion:  { label: "IGSC screening guidelines",       url: "https://genesynthesisconsortium.org/harmonized-screening-protocol/" },
  delivery_system_construction:{ label: "Biosafety committee escalation",  url: "https://osp.od.nih.gov/biotechnology/institutional-biosafety-committees/" },
};

function deriveSteps(report: RiskReport): Array<{ text: string; url?: string; severity: "high" | "medium" | "low" }> {
  const steps: Array<{ text: string; url?: string; severity: "high" | "medium" | "low" }> = [];
  const allTaxonomy = [...new Set(report.dimensions.flatMap(d => d.taxonomy_matches))];

  if (report.aggregate_risk === 0) {
    steps.push({ text: "No action required — protocol is consistent with standard research.", severity: "low" });
    return steps;
  }

  if (report.aggregate_risk >= 4) {
    steps.push({ text: "Do not execute without biosafety committee review and sign-off.", severity: "high" });
  }

  if (report.aggregate_risk >= 3) {
    steps.push({ text: "Request detailed scientific justification from protocol submitter before proceeding.", severity: "high" });
  }

  for (const tax of allTaxonomy) {
    const ref = TAXONOMY_REFS[tax];
    if (ref) steps.push({ text: ref.label, url: ref.url, severity: report.aggregate_risk >= 4 ? "high" : "medium" });
  }

  const seqUnknown = report.sequence_findings.filter(f => f.result === "unknown");
  if (seqUnknown.length > 0) {
    steps.push({
      text: `Submit ${seqUnknown.length} unverified sequence(s) to Common Mechanism for offline screening.`,
      url: "https://github.com/ibbis-screening/common-mechanism",
      severity: "medium",
    });
  }

  const compDim = report.dimensions.find(d => d.dimension === "composition");
  if (compDim && compDim.score >= 3) {
    steps.push({ text: "Flag for expert biosecurity review — composition risk detected that single-step screening would miss.", severity: "high" });
  }

  const intentDim = report.dimensions.find(d => d.dimension === "intent");
  if (intentDim && intentDim.score >= 3) {
    steps.push({ text: "Cross-reference submitter identity and institutional affiliation before approval.", severity: "medium" });
  }

  if (report.aggregate_risk >= 2 && report.aggregate_risk < 4) {
    steps.push({ text: "Log for periodic audit. Monitor for correlated protocol submissions from same source.", severity: "low" });
  }

  return steps;
}

export default function NextStepsPanel({ report }: { report: RiskReport }) {
  const steps = deriveSteps(report);

  return (
    <div className="pt-6 mt-2">
      <div className="font-serif text-base font-bold text-neutral-900 border-b border-neutral-200 pb-1 mb-3">
        Recommendations
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <span className="shrink-0 font-mono text-xs text-neutral-400 mt-0.5 w-4">{i + 1}.</span>
            <span className={
              step.severity === "high"   ? "font-medium text-red-700" :
              step.severity === "medium" ? "text-orange-700" :
              "text-neutral-600"
            }>
              {step.url ? (
                <a href={step.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {step.text}
                </a>
              ) : step.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
