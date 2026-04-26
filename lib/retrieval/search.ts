import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type CorpusChunk = {
  id: string;
  title: string;
  source: string;
  text: string;
  embedding: number[];
};

let _corpus: CorpusChunk[] | null = null;

function loadCorpus(): CorpusChunk[] {
  if (_corpus) return _corpus;
  const corpusPath = join(process.cwd(), "lib", "retrieval", "corpus.json");
  if (!existsSync(corpusPath)) {
    _corpus = [];
    return _corpus;
  }
  try {
    _corpus = JSON.parse(readFileSync(corpusPath, "utf-8")) as CorpusChunk[];
  } catch {
    _corpus = [];
  }
  return _corpus;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

function cosine(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

// Embed a query string. Called at request time — corpus embeddings are precomputed.
async function embedQuery(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    // Fallback: return zero vector so retrieval gracefully returns no results.
    return new Array(1536).fill(0);
  }
  const { OpenAI } = await import("openai");
  const openai = new OpenAI();
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

// Returns top-k chunks most similar to the query. Used at screening time.
export async function retrieveChunks(
  query: string,
  k = 5
): Promise<Array<{ id: string; title: string; source: string; text: string }>> {
  const corpus = loadCorpus();
  if (corpus.length === 0) return [];

  const queryEmbedding = await embedQuery(query);

  const scored = corpus
    .map((chunk) => ({
      chunk,
      score: cosine(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return scored.map(({ chunk }) => ({
    id: chunk.id,
    title: chunk.title,
    source: chunk.source,
    text: chunk.text,
  }));
}

// Stable chunk ID: SHA-256 of content (first 16 hex chars).
export function chunkId(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
