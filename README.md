# OmnyraCloud

Protocol-level biosecurity screening for cloud lab workflows.

**Apart AI x Biosecurity Hackathon, April 2026**

---

## What this is

Existing biosecurity screening operates at the sequence layer. Cloud laboratories execute full experimental *workflows*, many composed of individually-benign steps that together pursue a concerning objective while bypassing every sequence-level screener. This tool closes that gap.

It ingests structured lab protocols (Autoprotocol, Opentrons Python, generic JSON, or free-text), decomposes them through a multi-stage LLM reasoning pipeline, and produces a `RiskReport` with per-dimension scores, grounded reasoning chains, retrieved literature precedents, and an LLM-as-judge audit.

## Quickstart

```bash
# 1. Clone and install
git clone <repo>
cd protocol-screener
npm install

# 2. Set environment variables
cp .env.example .env.local
# Edit .env.local and add:
#   ANTHROPIC_API_KEY=sk-ant-...
#   OPENAI_API_KEY=sk-...

# 3. (Optional) Build retrieval corpus
npm run build:corpus

# 4. Run dev server
npm run dev
# Open http://localhost:3000
```

Drag-drop a protocol file onto the landing page. The screener detects format automatically (Autoprotocol JSON, canonical JSON, Opentrons `.py`, or plain text — last two use LLM extraction).

## Running evaluation

```bash
npm run eval
# Results written to results/eval_results.json
```

## Generating adversarial variants

```bash
npm run gen:adversarial
# Reads data/protocols/concerning/*.json
# Writes data/protocols/adversarial/*.json
```

## File structure

```
app/                   Next.js App Router pages and API routes
components/            UI components (DropZone, RiskReport, DimensionCard)
lib/
  schema/              Zod schemas, Autoprotocol parser, format detector
  reasoning/           LLM pipeline stages (decompose, dimensions, critique)
  retrieval/           In-memory cosine-sim retrieval over corpus.json
  sequence/            Common Mechanism cache lookup
  extract/             LLM extraction fallback for unknown formats
data/
  taxonomy.json        Six-category threat taxonomy (the spine of the screener)
  protocols/           Example, evaluation, and adversarial protocols
  corpus_raw/          Raw markdown chunks for building the retrieval corpus
scripts/               Corpus builder, eval harness, adversarial generator
results/               Eval output JSON and figures
paper/                 Report source
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude Sonnet 4.6 for all reasoning |
| `OPENAI_API_KEY` | Yes (corpus build) | text-embedding-3-small for retrieval |
| `SELF_CONSISTENCY_N` | No (default 1) | Runs per screen for self-consistency |

## Evaluation protocols

`data/protocols/` contains:
- `benign/` — standard lab workflows expected to score 0–1
- `concerning/` — synthetic evaluation cases (no real sequences; evaluation use only)
- `durc_reconstructions/` — skeletal workflows from published DURC paper methods sections, with sequences replaced by placeholder tokens
- `autoprotocol_real/` — real-world Autoprotocol JSON from public sources
- `adversarial/` — LLM-generated obfuscated variants of concerning protocols

Example protocols in this repo do **not** include real dangerous sequences. Controlled sequences are replaced with placeholder tokens (e.g., `[H5N1_HA_REGION]`).

## License

MIT. See LICENSE.

## Author

Emilin Mathew, Stanford University
