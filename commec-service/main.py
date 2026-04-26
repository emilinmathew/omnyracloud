"""
Commec biorisk screening microservice — uses pyhmmer directly.
No commec CLI, no blast. Only the biorisk HMM database is required.

POST /screen  {"sequences": [{"name": str, "sequence": str}]}
Returns:      {"findings": [...]}
"""

import os
import csv
import hashlib
from pathlib import Path
from typing import Any

import pyhmmer
from Bio.Seq import Seq
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

COMMEC_DB = Path(os.environ.get("COMMEC_DB", "/commec-dbs/commec-dbs"))
BIORISK_DIR = COMMEC_DB / "biorisk"
HMM_INDEX   = BIORISK_DIR / "biorisk.hmm.h3i"   # needed to open pressed DB
ANNOTATIONS_CSV = BIORISK_DIR / "biorisk_annotations.csv"

# E-value threshold - balanced for memory usage vs sensitivity
EVALUE_THRESHOLD = 1e-3

app = FastAPI(title="commec-biorisk", version="1.0.0")

# ---------------------------------------------------------------------------
# Load annotations once at startup
# ---------------------------------------------------------------------------

_annotations: dict[str, dict[str, str]] = {}

def _load_annotations() -> dict[str, dict[str, str]]:
    if not ANNOTATIONS_CSV.exists():
        return {}
    with open(ANNOTATIONS_CSV, newline="") as f:
        reader = csv.DictReader(f)
        return {row.get("profile_name", row.get("name", "")): dict(row) for row in reader}

@app.on_event("startup")
def startup() -> None:
    global _annotations
    _annotations = _load_annotations()


# ---------------------------------------------------------------------------
# 6-frame translation helpers
# ---------------------------------------------------------------------------

def _six_frames(dna: str) -> list[tuple[str, str]]:
    """Return [(frame_label, protein_str), ...] for all 6 reading frames."""
    seq = Seq(dna.upper().replace(" ", "").replace("\n", ""))
    rc  = seq.reverse_complement()
    frames = []
    for i in range(3):
        frames.append((f"+{i+1}", str(seq[i:].translate())))
        frames.append((f"-{i+1}", str(rc[i:].translate())))
    return frames


# ---------------------------------------------------------------------------
# HMM screening
# ---------------------------------------------------------------------------

def _screen_one(name: str, dna: str) -> dict[str, Any]:
    """Run biorisk HMM search on one sequence. Returns result dict."""
    h = hashlib.sha256(dna.upper().replace(" ", "").encode()).hexdigest()

    if len(dna) < 42:
        return dict(reagent_name=name, sequence_hash=h, result="unknown",
                    reason="Sequence too short for HMM screening (<42 nt).",
                    sequence_length=len(dna))

    if len(dna) > 5000:
        return dict(reagent_name=name, sequence_hash=h, result="unknown",
                    reason="Sequence too long for HMM screening (>5000 nt). Use local commec for large sequences.",
                    sequence_length=len(dna))

    frames = _six_frames(dna)

    alphabet  = pyhmmer.easel.Alphabet.amino()
    sequences = []
    for label, prot in frames:
        if len(prot) < 10:
            continue
        try:
            seq = pyhmmer.easel.TextSequence(
                name=f"{name}_{label}".encode(), sequence=prot
            ).digitize(alphabet)
            sequences.append(seq)
        except Exception:
            continue

    if not sequences:
        return dict(reagent_name=name, sequence_hash=h, result="unknown",
                    reason="No translatable reading frames found.",
                    sequence_length=len(dna))

    hits_found: list[dict] = []

    try:
        with pyhmmer.plan7.HMMFile(str(BIORISK_DIR / "biorisk.hmm")) as hmm_file:
            for hits in pyhmmer.hmmsearch(hmm_file, sequences, E=EVALUE_THRESHOLD, cpus=1):
                for hit in hits:
                    if not hit.included:
                        continue
                    hmm_name = hit.name
                    ann = _annotations.get(hmm_name, {})
                    hits_found.append({
                        "hmm": hmm_name,
                        "organism": ann.get("organism", ""),
                        "category": ann.get("category", ""),
                        "evalue": f"{hit.evalue:.2e}",
                        "score": round(float(hit.score), 2),
                        "bias": round(float(hit.bias), 2),
                    })
    except FileNotFoundError:
        return dict(reagent_name=name, sequence_hash=h, result="unknown",
                    reason="Biorisk HMM database not found on server.",
                    sequence_length=len(dna))
    except Exception as e:
        return dict(reagent_name=name, sequence_hash=h, result="unknown",
                    reason=f"HMM search failed: {str(e)[:100]}",
                    sequence_length=len(dna))

    if hits_found:
        categories = ", ".join({h["category"] for h in hits_found if h["category"]})
        organisms  = ", ".join({h["organism"]  for h in hits_found if h["organism"]})
        return dict(
            reagent_name=name, sequence_hash=h, result="flagged",
            reason=f"Biorisk HMM hit: {organisms or 'unknown organism'} — {categories or 'regulated sequence'}",
            category=categories or None,
            sequence_length=len(dna),
            hits=hits_found,
        )

    return dict(reagent_name=name, sequence_hash=h, result="clear",
                reason="No biorisk HMM matches found.",
                sequence_length=len(dna))


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

class SequenceIn(BaseModel):
    name: str
    sequence: str

class ScreenRequest(BaseModel):
    sequences: list[SequenceIn]

class HmmHit(BaseModel):
    hmm: str
    organism: str
    category: str
    evalue: str
    score: float
    bias: float

class SequenceFinding(BaseModel):
    reagent_name: str
    sequence_hash: str
    result: str
    reason: str
    sequence_length: int | None = None
    category: str | None = None
    hits: list[HmmHit] = []

class ScreenResponse(BaseModel):
    findings: list[SequenceFinding]


@app.get("/health")
def health() -> dict[str, Any]:
    hmm_ok = (BIORISK_DIR / "biorisk.hmm").exists()
    return {"status": "ok" if hmm_ok else "degraded", "hmm_db": str(BIORISK_DIR), "db_ready": hmm_ok}

@app.get("/debug")
def debug() -> dict[str, Any]:
    import subprocess
    try:
        tree = subprocess.check_output(["find", "/commec-dbs", "-type", "f"], text=True, timeout=5)
    except Exception as e:
        tree = str(e)
    return {"commec_db_env": str(COMMEC_DB), "biorisk_dir": str(BIORISK_DIR), "files": tree}


@app.post("/screen", response_model=ScreenResponse)
def screen(req: ScreenRequest) -> ScreenResponse:
    if not req.sequences:
        return ScreenResponse(findings=[])
    findings = [SequenceFinding(**_screen_one(s.name, s.sequence)) for s in req.sequences]
    return ScreenResponse(findings=findings)
