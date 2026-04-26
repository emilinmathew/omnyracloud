import type { Citation } from "@/lib/types";

const LITERATURE_URLS: Record<string, string> = {
  "54cd2c6692d19ec9": "https://doi.org/10.1126/science.1213862",
  "71c5781dd7ffcb21": "https://doi.org/10.1126/science.1215273",
  "af4eefc35693e458": "https://doi.org/10.1126/science.1072266",
  "80ee267deb8c1935": "https://doi.org/10.1371/journal.pone.0188453",
  "ea7405313cf2d04e": "https://doi.org/10.1126/science.1119392",
  "0dc4b33f004202d0": "https://doi.org/10.1128/JVI.75.3.1205-1210.2001",
  "afc3143364037d13": "https://nap.nationalacademies.org/catalog/10827",
  "ff8b572d6fae4c94": "https://osp.od.nih.gov/biotechnology/dual-use-research-of-concern/",
  "74f29a7ff79397e5": "https://genesynthesisconsortium.org/harmonized-screening-protocol/",
  "582ebb19a06f679f": "https://github.com/ibbis-screening/common-mechanism",
  "1970a95d34074439": "https://securedna.org/",
  "a821c25d69e1a469": "https://www.selectagents.gov/regulations.html",
  "fouchier_2012_science":        "https://doi.org/10.1126/science.1213862",
  "nsabb_durc_policy":            "https://osp.od.nih.gov/biotechnology/dual-use-research-of-concern/",
  "igsc_guidelines":              "https://genesynthesisconsortium.org/harmonized-screening-protocol/",
  "ibbis_common_mechanism":       "https://github.com/ibbis-screening/common-mechanism",
  "carter_securedna_2023":        "https://securedna.org/",
  "hhs_select_agent_regulations": "https://www.selectagents.gov/regulations.html",
};

type Props = { citations: Citation[] };

export default function SourcesPanel({ citations }: Props) {
  if (citations.length === 0) return null;

  const seen = new Set<string>();
  const unique = citations.filter(c => {
    if (seen.has(c.chunk_id)) return false;
    seen.add(c.chunk_id);
    return true;
  });

  return (
    <div className="pt-6 mt-2">
      <div className="font-serif text-base font-bold text-neutral-900 border-b border-neutral-200 pb-1 mb-3">
        References
      </div>
      <ol className="space-y-2.5">
        {unique.map((c, idx) => {
          const url = LITERATURE_URLS[c.chunk_id] ?? LITERATURE_URLS[c.source];
          return (
            <li key={c.chunk_id} className="flex gap-2.5 text-xs text-neutral-600">
              <span className="shrink-0 font-mono text-neutral-400 w-6 text-right">[{idx + 1}]</span>
              <div>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                     className="font-medium text-neutral-800 hover:underline">
                    {c.title}
                  </a>
                ) : (
                  <span className="font-medium text-neutral-800">{c.title}</span>
                )}
                <span className="text-neutral-400 ml-1.5">— {c.source}</span>
                {url && (
                  <span className="block text-neutral-400 font-mono text-xs mt-0.5 truncate">{url}</span>
                )}
                {c.snippet && (
                  <p className="mt-0.5 text-neutral-400 line-clamp-2">{c.snippet}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
