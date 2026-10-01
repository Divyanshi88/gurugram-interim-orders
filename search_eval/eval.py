"""Retrieval bake-off on the real corpus: current filter vs BM25 vs embeddings vs hybrid."""
import json, re, math, sys, os, pickle
from collections import Counter, defaultdict
import numpy as np

E = os.path.dirname(os.path.abspath(__file__))
docs = json.load(open(f"{E}/docs.json"))
queries = json.load(open(f"{E}/queries.json"))
SL = [d["sl"] for d in docs]

# ---------- text normalisation ----------
def norm_acc(t):
    # A-149 / A 149 / A149 / accused No.149 / accused 149 -> a149
    t = re.sub(r"\bA\s*-\s*(\d{1,3})\b", r" a\1 ", t)
    t = re.sub(r"\bA(\d{1,3})\b", r" a\1 ", t)
    t = re.sub(r"\baccused\s*(?:no\.?\s*)?(\d{1,3})\b", r" accused a\1 ", t, flags=re.I)
    return t

STOP = set("""a an the of to and or in on at for by with from is was were be been as that this
these those it its he she his her they them their which who whom shall may has have had not no
are am i we you sh smt shri dated vide said into than then also any all such upon""".split())

def stem(w):
    for s in ("ings", "ing", "ied", "ies", "ed", "es", "s", "ly"):
        if len(w) > len(s) + 3 and w.endswith(s):
            return w[: -len(s)]
    return w

def toks(t):
    t = norm_acc(t).lower()
    return [stem(w) for w in re.findall(r"[a-z0-9]+", t) if w not in STOP and len(w) > 1]

# ---------- chunking ----------
def chunks_of(d, size=120, step=90):
    words = re.sub(r"\s+", " ", d["text"]).split(" ")
    out = []
    for i in range(0, max(1, len(words) - 30), step):
        out.append(" ".join(words[i:i + size]))
    return out

def card(d):
    return f"Order dated {d['date']}. Judge {d['judge']}. {d['defendants']}. {d['summary']} {d['contentions'] or ''}"

CH, CH_DOC = [], []
for j, d in enumerate(docs):
    for c in chunks_of(d):
        CH.append(c); CH_DOC.append(j)
    CH.append(card(d)); CH_DOC.append(j)          # curated index text as one more chunk
CH_DOC = np.array(CH_DOC)

# ---------- BM25 (chunk level, max-pooled to order) ----------
class BM25:
    def __init__(self, texts, k1=1.2, b=0.75):
        self.tt = [toks(t) for t in texts]
        self.N = len(texts); self.avg = sum(map(len, self.tt)) / self.N
        self.df = Counter(w for t in self.tt for w in set(t))
        self.tf = [Counter(t) for t in self.tt]
        self.k1, self.b = k1, b
        self.vocab = sorted(self.df)
    def idf(self, w):
        n = self.df.get(w, 0); return math.log(1 + (self.N - n + .5) / (n + .5))
    def score(self, qt):
        s = np.zeros(self.N)
        for w in set(qt):
            if w not in self.df: continue
            idf = self.idf(w)
            for i, tf in enumerate(self.tf):
                f = tf.get(w)
                if f: s[i] += idf * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * len(self.tt[i]) / self.avg))
        return s

def edit1(a, b):
    if abs(len(a) - len(b)) > 1: return False
    if len(a) == len(b): return sum(x != y for x, y in zip(a, b)) <= 1
    if len(a) > len(b): a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]: i += 1
    return a[i:] == b[i + 1:]

bm = BM25(CH)
def fuzzy_expand(qt):
    out = []
    for w in qt:
        out.append(w)
        if w not in bm.df and len(w) >= 5 and not w.isdigit():
            out += [v for v in bm.vocab if v[0] == w[0] and edit1(w, v)][:3]
    return out

def pool(chunk_scores):
    s = np.full(len(docs), -1e9)
    np.maximum.at(s, CH_DOC, chunk_scores)
    return s

def rank_bm25(q, fuzzy=False):
    qt = toks(q); qt = fuzzy_expand(qt) if fuzzy else qt
    return pool(bm.score(qt))

# ---------- current site filter (baseline) ----------
def rank_current(q):
    ql = q.lower().strip()
    s = np.zeros(len(docs))
    for j, d in enumerate(docs):
        hay = f"{d['sl']} {d['date']} {d['judge']} {d['defendants']} {d['summary']} {d['contentions']}".lower()
        s[j] = 1 if ql in hay else -1e9
    return s - np.arange(len(docs)) * 1e-6     # table order among matches

# ---------- dates in queries ----------
MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
def date_window(q):
    ql = q.lower()
    y = re.findall(r"\b(20[12]\d)\b", ql)
    if not y: return None
    y = int(y[0]); lo, hi = (y, 1), (y, 12)
    m = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b", ql)
    if m: mm = MONTHS[m.group(1)]; lo, hi = (y, max(1, mm - 1)), (y, min(12, mm + 1))
    elif re.search(r"\b(early|start|beginning)\b", ql): hi = (y, 5)
    elif re.search(r"\b(mid|middle)\b", ql): lo, hi = (y, 4), (y, 9)
    elif re.search(r"\b(late|end)\b", ql): lo = (y, 8)
    if re.search(r"\b(around|about|circa|roughly)\b", ql): lo, hi = (y - 1, 7), (y + 1, 6)
    return lo, hi
def date_boost(q):
    w = date_window(q)
    b = np.zeros(len(docs))
    if not w: return b
    for j, d in enumerate(docs):
        ym = (int(d["date"][:4]), int(d["date"][5:7]))
        if w[0] <= ym <= w[1]: b[j] = 1
    return b

# ---------- embeddings ----------
MODELS = {
    "minilm": ("sentence-transformers/all-MiniLM-L6-v2", ""),
    "bge-small": ("BAAI/bge-small-en-v1.5", "Represent this sentence for searching relevant passages: "),
    "arctic-xs": ("snowflake/snowflake-arctic-embed-xs", "Represent this sentence for searching relevant passages: "),
}
def embedder(name):
    from fastembed import TextEmbedding
    mid, qp = MODELS[name]
    cache = f"{E}/emb_{name}.npy"
    m = TextEmbedding(mid)
    if os.path.exists(cache): C = np.load(cache)
    else:
        C = np.array(list(m.embed(CH, batch_size=64))); np.save(cache, C)
    C = C / np.linalg.norm(C, axis=1, keepdims=True)
    def rank(qs):
        Q = np.array(list(m.embed([qp + q for q in qs]))); Q /= np.linalg.norm(Q, axis=1, keepdims=True)
        return [pool(C @ qv) for qv in Q]
    return rank

def rrf(*score_lists, k=60, weights=None):
    out = np.zeros(len(docs))
    for i, s in enumerate(score_lists):
        r = np.empty(len(docs)); r[np.argsort(-s)] = np.arange(1, len(docs) + 1)
        out += (weights[i] if weights else 1) / (k + r)
    return out

# ---------- metrics ----------
def metrics(score, gold):
    order = [SL[j] for j in np.argsort(-score) if score[j] > -1e8]
    g = set(gold)
    first = next((i + 1 for i, s in enumerate(order) if s in g), None)
    return dict(r1=first == 1, r5=bool(first and first <= 5), r10=bool(first and first <= 10),
                mrr=1 / first if first else 0, rank=first)

if __name__ == "__main__":
    qs = [q["query"] for q in queries]
    runs = {}
    runs["current site filter"] = [rank_current(q) for q in qs]
    runs["BM25"] = [rank_bm25(q) for q in qs]
    runs["BM25 + fuzzy"] = [rank_bm25(q, True) for q in qs]
    for name in MODELS:
        runs[f"emb {name}"] = embedder(name)(qs)
    for name in MODELS:
        runs[f"hybrid fuzzyBM25+{name}"] = [rrf(a, b) for a, b in zip(runs["BM25 + fuzzy"], runs[f"emb {name}"])]
    for name in MODELS:
        runs[f"hybrid+{name} +date"] = [s + 0.02 * date_boost(q) for s, q in zip(runs[f"hybrid fuzzyBM25+{name}"], qs)]
    runs["BM25 + fuzzy +date"] = [rrf(s) + 0.02 * date_boost(q) for s, q in zip(runs["BM25 + fuzzy"], qs)]
    pickle.dump(runs, open(f"{E}/runs.pkl", "wb"))

    kinds = ["quote", "paraphrase", "vague", "name", "number", "concept"]
    res = {}
    for rn, scores in runs.items():
        per = defaultdict(list)
        for q, s in zip(queries, scores):
            m = metrics(s, q["gold"]); per[q["kind"]].append(m); per["ALL"].append(m)
            if not q.get("weak"): per["ALL (excl weak)"].append(m)
        res[rn] = {k: {x: float(np.mean([m[x] for m in v])) for x in ("r1", "r5", "r10", "mrr")} for k, v in per.items()}
    json.dump(res, open(f"{E}/results.json", "w"), indent=1)
    cols = kinds + ["ALL", "ALL (excl weak)"]
    print(f"{'Recall@5':34}" + "".join(f"{c[:10]:>11}" for c in cols))
    for rn, r in res.items():
        print(f"{rn:34}" + "".join(f"{r[c]['r5']*100:10.0f}%" for c in cols))
    print(f"\n{'Recall@1 / MRR (ALL)':34}")
    for rn, r in res.items():
        print(f"{rn:34} R@1 {r['ALL']['r1']*100:4.0f}%  R@10 {r['ALL']['r10']*100:4.0f}%  MRR {r['ALL']['mrr']:.3f}")
