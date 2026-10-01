"""Round 2: BM25 + synonyms + better fuzzy, vs hybrid, on the original set and the held-out set."""
import json, re, sys, os, pickle
from collections import defaultdict
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval import (docs, SL, CH, CH_DOC, bm, toks, pool, date_boost, embedder, rrf, metrics, rank_bm25, rank_current, E)

SYN = json.load(open(f"{E}/synonyms_as_evaluated.json"))["groups"]
SYN_T = [[toks(p) for p in g] for g in SYN]          # each phrase -> token list

def lev(a, b, cap=2):
    if abs(len(a) - len(b)) > cap: return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) > cap: return cap + 1
        prev = cur
    return prev[-1]

skel = lambda w: w[0] + re.sub(r"[aeiouyh]", "", w[1:])
SKEL = defaultdict(set)
for v in bm.vocab:
    if v.isalpha() and len(v) >= 4: SKEL[skel(v)].add(v)

def fuzzy_terms(w):
    if w in bm.df or w.isdigit() or len(w) < 4: return []
    cap = 2 if len(w) >= 7 else 1
    out = {v for v in bm.vocab if v[0] == w[0] and lev(w, v, cap) <= cap}
    out |= SKEL.get(skel(w), set())
    return sorted(out, key=lambda v: (-bm.df[v], v))[:4]

def expand(q, syn=True, fuzzy=True):
    qt = toks(q); terms = {w: 1.0 for w in qt}
    if fuzzy:
        for w in qt:
            for v in fuzzy_terms(w): terms.setdefault(v, 0.8)
    if syn:
        for g in SYN_T:
            hit = any(p and all(t in qt for t in p) for p in g)
            if hit:
                for p in g:
                    for t in p: terms.setdefault(t, 0.4)
    return terms

def bm25_weighted(terms):
    s = np.zeros(bm.N)
    for w, wt in terms.items():
        if w not in bm.df: continue
        idf = bm.idf(w)
        for i, tf in enumerate(bm.tf):
            f = tf.get(w)
            if f: s[i] += wt * idf * f * (bm.k1 + 1) / (f + bm.k1 * (1 - bm.b + bm.b * len(bm.tt[i]) / bm.avg))
    return pool(s)

def evaluate(qset, name, emb_models=("bge-small", "arctic-xs", "minilm")):
    qs = [q["query"] for q in qset]
    runs = {}
    runs["current site filter"] = [rank_current(q) for q in qs]
    runs["BM25 +date"] = [rrf(rank_bm25(q)) + .02 * date_boost(q) for q in qs]
    runs["BM25 +fuzzy2 +date"] = [rrf(bm25_weighted(expand(q, syn=False))) + .02 * date_boost(q) for q in qs]
    lex = [bm25_weighted(expand(q)) for q in qs]
    runs["BM25 +fuzzy2 +syn +date"] = [rrf(s) + .02 * date_boost(q) for s, q in zip(lex, qs)]
    for m in emb_models:
        em = embedder(m)(qs)
        runs[f"emb {m} only"] = em
        runs[f"hybrid(lex+syn, {m}) +date"] = [rrf(a, b) + .02 * date_boost(q) for a, b, q in zip(lex, em, qs)]
    kinds = sorted({q["kind"] for q in qset})
    res = {}
    for rn, scores in runs.items():
        per = defaultdict(list)
        for q, s in zip(qset, scores):
            m = metrics(s, q["gold"]); per[q["kind"]].append(m); per["ALL"].append(m)
        res[rn] = {k: {x: float(np.mean([m[x] for m in v])) for x in ("r1", "r5", "r10", "mrr")} | {"n": len(v)} for k, v in per.items()}
    pickle.dump(runs, open(f"{E}/runs_{name}.pkl", "wb"))
    json.dump(res, open(f"{E}/results_{name}.json", "w"), indent=1)
    cols = kinds + ["ALL"]
    print(f"\n=== {name}: Recall@5 (n per column: " + ", ".join(f"{c}={res[next(iter(res))][c]['n']}" for c in cols) + ")")
    print(f"{'method':34}" + "".join(f"{c[:10]:>11}" for c in cols) + "    R@1   MRR")
    for rn, r in res.items():
        print(f"{rn:34}" + "".join(f"{r[c]['r5']*100:10.0f}%" for c in cols) + f"  {r['ALL']['r1']*100:4.0f}%  {r['ALL']['mrr']:.3f}")
    return runs, res

if __name__ == "__main__":
    for name in sys.argv[1:]:
        evaluate(json.load(open(f"{E}/{name}.json")), name)
