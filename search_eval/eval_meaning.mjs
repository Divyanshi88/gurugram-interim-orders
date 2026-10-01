// Measure the SHIPPED engine (site/assets/search.js) in both modes, keyword and
// keyword + meaning, using the same quantized model and int8 vectors the browser uses.
// Run from a dir with @huggingface/transformers@3.8.1 installed:  node eval_meaning.mjs <repo>
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { env, pipeline } from "@huggingface/transformers";

const REPO = path.resolve(process.argv[2] || "..");
const SITE = path.join(REPO, "site"), EV = path.join(REPO, "search_eval");
const S = createRequire(import.meta.url)(path.join(SITE, "assets/search.js"));
env.allowRemoteModels = false;
env.localModelPath = path.join(SITE, "models") + "/";

const orders = JSON.parse(fs.readFileSync(path.join(SITE, "data/orders.json")));
const eng = S.build(orders, JSON.parse(fs.readFileSync(path.join(SITE, "data/search.json"))));
const meta = JSON.parse(fs.readFileSync(path.join(SITE, "data/emb_minilm.json")));
if (meta.chunkHash !== eng.chunkHash()) throw new Error("embeddings do not match search.json");
const E = new Int8Array(fs.readFileSync(path.join(SITE, "data/emb_minilm.bin")).buffer.slice(0));
const embed = await pipeline("feature-extraction", meta.model, { dtype: meta.dtype });

const pct = x => (x * 100).toFixed(0).padStart(4) + "%";
for (const set of ["queries", "holdout", "holdout2"]) {
  const Q = JSON.parse(fs.readFileSync(path.join(EV, set + ".json")));
  const per = {};
  for (const q of Q) {
    const vec = (await embed(q.query, { pooling: "mean", normalize: true })).data;
    for (const [mode, sem] of [["keyword", null], ["meaning", { vec, E }]]) {
      const res = eng.search(q.query, 0, sem).results.map(r => r.sl);
      const first = res.findIndex(sl => q.gold.includes(sl)) + 1;
      for (const k of [q.kind, "ALL"]) {
        const a = ((per[mode] ||= {})[k] ||= { n: 0, r1: 0, r5: 0, mrr: 0 });
        a.n++; a.r1 += first === 1; a.r5 += first >= 1 && first <= 5; a.mrr += first ? 1 / first : 0;
      }
    }
  }
  const kinds = Object.keys(per.keyword);
  console.log(`\n${set}: recall@5 by kind` + kinds.map(k => `  ${k}(${per.keyword[k].n})`).join(""));
  for (const mode of ["keyword", "meaning"])
    console.log(mode.padEnd(8) + kinds.map(k => pct(per[mode][k].r5 / per[mode][k].n)).join("") +
      `   | ALL R@1 ${pct(per[mode].ALL.r1 / per[mode].ALL.n)}  MRR ${(per[mode].ALL.mrr / per[mode].ALL.n).toFixed(3)}`);
}
