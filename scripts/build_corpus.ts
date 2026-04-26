#!/usr/bin/env tsx
// Load .env.local so API keys are available when run directly with tsx
(process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.(".env.local");

/**
 * Build the retrieval corpus:
 * 1. Read all .md files from data/corpus_raw/
 * 2. Chunk each file to ~500 tokens (rough: ~2000 chars) with 50-token overlap
 * 3. Embed each chunk with OpenAI text-embedding-3-small
 * 4. Write lib/retrieval/corpus.json
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import OpenAI from "openai";

const CORPUS_RAW_DIR = join(process.cwd(), "data", "corpus_raw");
const OUTPUT_PATH = join(process.cwd(), "lib", "retrieval", "corpus.json");
const CHUNK_CHARS = 2000;
const OVERLAP_CHARS = 200;
const EMBED_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 20;

type Chunk = {
  id: string;
  title: string;
  source: string;
  text: string;
  embedding: number[];
};

function parseFrontmatter(content: string): { title: string; source: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { title: "Unknown", source: "Unknown", body: content };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length) meta[key.trim()] = rest.join(":").trim().replace(/^"|"$/g, "");
  }
  return {
    title: meta.title ?? "Unknown",
    source: meta.source ?? "Unknown",
    body: match[2].trim(),
  };
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

function chunkId(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

async function embedBatch(texts: string[], openai: OpenAI): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
  });
  res.data.sort((a, b) => a.index - b.index);
  return res.data.map((d) => d.embedding);
}

async function main() {
  const openai = new OpenAI();

  const files = readdirSync(CORPUS_RAW_DIR).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} corpus_raw files`);

  const rawChunks: Array<{ id: string; title: string; source: string; text: string }> = [];

  for (const file of files) {
    const content = readFileSync(join(CORPUS_RAW_DIR, file), "utf-8");
    const { title, source, body } = parseFrontmatter(content);
    const textChunks = chunkText(body, CHUNK_CHARS, OVERLAP_CHARS);
    for (let i = 0; i < textChunks.length; i++) {
      const text = textChunks[i];
      rawChunks.push({
        id: chunkId(text),
        title: textChunks.length > 1 ? `${title} (part ${i + 1})` : title,
        source,
        text,
      });
    }
  }

  console.log(`Total chunks: ${rawChunks.length}`);

  // Embed in batches.
  const corpus: Chunk[] = [];
  for (let i = 0; i < rawChunks.length; i += BATCH_SIZE) {
    const batch = rawChunks.slice(i, i + BATCH_SIZE);
    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(rawChunks.length / BATCH_SIZE)}...`);
    const embeddings = await embedBatch(batch.map((c) => c.text), openai);
    for (let j = 0; j < batch.length; j++) {
      corpus.push({ ...batch[j], embedding: embeddings[j] });
    }
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(corpus, null, 2));
  console.log(`Wrote ${corpus.length} chunks to ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
