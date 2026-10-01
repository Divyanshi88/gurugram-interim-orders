// Build site/data/emb_minilm.bin + emb_minilm.json: one int8 vector per search chunk, made with
// the SAME quantized model file the browser loads (site/models/...), so query and document
// vectors are comparable. Re-run whenever site/data/search.json changes.
//
// Needs @huggingface/transformers@3.8.1 installed where this file is run from:
//   mkdir /tmp/tjs && cd /tmp/tjs && npm i @huggingface/transformers@3.8.1
//   cp <repo>/scripts/build_embeddings.mjs . && node build_embeddings.mjs <repo>
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { env, pipeline } from "@huggingface/transformers";

const REPO = path.resolve(process.argv[2] || "..");
const SITE = path.join(REPO, "site");
const require = createRequire(import.meta.url);
const S = require(path.join(SITE, "assets/search.js"));

env.allowRemoteModels = false;
env.localModelPath = path.join(SITE, "models") + "/";
const MODEL = "Xenova/all-MiniLM-L6-v2";

const orders = JSON.parse(fs.readFileSync(path.join(SITE, "data/orders.json")));
const sd = JSON.parse(fs.readFileSync(path.join(SITE, "data/search.json")));
const eng = S.build(orders, sd);
const texts = eng.chunkTexts();

const embed = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
const dim = 384, E = new Int8Array(texts.length * dim);
const t0 = Date.now();
for (let i = 0; i < texts.length; i += 32) {
  const out = await embed(texts.slice(i, i + 32), { pooling: "mean", normalize: true });
  const v = out.data;
  for (let j = 0; j < v.length; j++) E[i * dim + j] = Math.max(-127, Math.min(127, Math.round(v[j] * 127)));
}
fs.writeFileSync(path.join(SITE, "data/emb_minilm.bin"), Buffer.from(E.buffer));
fs.writeFileSync(path.join(SITE, "data/emb_minilm.json"), JSON.stringify({
  model: MODEL, dtype: "q8", pooling: "mean", dim, n: texts.length, scale: 127, chunkHash: eng.chunkHash()
}));
console.log(`embedded ${texts.length} chunks in ${((Date.now() - t0) / 1000).toFixed(0)}s, hash ${eng.chunkHash()}`);
