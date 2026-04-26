FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir \
    pyhmmer \
    biopython \
    fastapi \
    "uvicorn[standard]"

# Cache-bust when db download needs to re-run (increment to invalidate layer cache)
ARG DB_VERSION=2

# Download commec database zip and extract ONLY biorisk.hmm + annotations.
# Skips .h3x index files (~460 MB) — pyhmmer reads .hmm directly.
# Disk budget: ~50 MB (Python) + ~150 MB (packages) + ~433 MB (hmm) = ~633 MB total.
RUN python3 - << 'PYEOF'
import urllib.request, zipfile, os, pathlib, sys

url = "https://github.com/ibbis-bio/commec-databases/releases/download/v1.0.0/commec-dbs.zip"
zip_path = "/tmp/commec-dbs.zip"
out_dir   = pathlib.Path("/commec-dbs/commec-dbs/biorisk")
out_dir.mkdir(parents=True, exist_ok=True)

print("Downloading commec databases…")
urllib.request.urlretrieve(url, zip_path)
print("Listing zip contents…")
with zipfile.ZipFile(zip_path) as zf:
    names = zf.namelist()
    for n in names[:20]:
        print(" ", n)
    print(f"  … ({len(names)} total entries)")

    # Extract any file whose name ends with biorisk.hmm or biorisk_annotations.csv
    extracted = 0
    for name in names:
        base = pathlib.Path(name).name
        if base in ("biorisk.hmm", "biorisk_annotations.csv") and not name.endswith("/"):
            dest = out_dir / base
            dest.write_bytes(zf.read(name))
            print(f"  extracted {name} → {dest} ({dest.stat().st_size // 1_000_000} MB)")
            extracted += 1

os.unlink(zip_path)
if extracted == 0:
    print("ERROR: no biorisk files found in zip!", file=sys.stderr)
    sys.exit(1)
print("Done.")
PYEOF

ENV COMMEC_DB=/commec-dbs/commec-dbs

COPY main.py /app/main.py

EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
