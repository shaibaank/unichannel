// Local text embeddings — no external API, no quota. Primary path uses
// Transformers.js (all-MiniLM-L6-v2, 384-dim). If the model can't load
// (offline/first-run failure), we fall back to a deterministic hashing
// embedding so RAG still works. The method is resolved ONCE per process so
// stored chunk vectors and query vectors always match.

const HASH_DIM = 384;

type Embedder = (text: string) => Promise<number[]>;

let resolved: Embedder | null = null;
let resolving: Promise<Embedder> | null = null;

async function buildTransformersEmbedder(): Promise<Embedder> {
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
  );
  return async (text: string) => {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  };
}

/** Deterministic bag-of-tokens hashing embedding (fallback). */
function hashingEmbedder(): Embedder {
  return async (text: string) => {
    const vec = new Array<number>(HASH_DIM).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (const tok of tokens) {
      let h = 2166136261;
      for (let i = 0; i < tok.length; i++) {
        h ^= tok.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % HASH_DIM;
      vec[idx] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  };
}

async function resolveEmbedder(
  log: (m: string) => void = console.log,
): Promise<Embedder> {
  if (resolved) return resolved;
  if (resolving) return resolving;
  resolving = (async () => {
    try {
      const e = await buildTransformersEmbedder();
      log("[rag] embeddings: Transformers.js (all-MiniLM-L6-v2)");
      resolved = e;
    } catch (err) {
      log(
        `[rag] embeddings: falling back to hashing (${(err as Error).message})`,
      );
      resolved = hashingEmbedder();
    }
    return resolved;
  })();
  return resolving;
}

export async function embed(
  text: string,
  log?: (m: string) => void,
): Promise<number[]> {
  const e = await resolveEmbedder(log);
  return e(text.slice(0, 2000));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
