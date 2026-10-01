// Check the browser engine (site/assets/search.js) ranks exactly like the evaluated Python.
// Run from repo root: node search_eval/parity.js   (then compare with eval2 lexical ranking)
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, ".."), E = __dirname;
const S = require(path.join(R, "site/assets/search.js"));
const orders = JSON.parse(fs.readFileSync(path.join(R, "site/data/orders.json")));
const sd = JSON.parse(fs.readFileSync(path.join(R, "site/data/search.json")));
const eng = S.build(orders, sd), out = {};
for (const f of ["queries", "holdout"])
  for (const q of JSON.parse(fs.readFileSync(path.join(E, f + ".json"))))
    out[f + "/" + q.qid] = eng.search(q.query, 10).results.map(r => r.sl);
fs.writeFileSync(path.join(E, "parity_js.json"), JSON.stringify(out));
console.log("wrote parity_js.json", eng.stats);
