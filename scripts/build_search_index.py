"""Build site/data/search.json: the full text of every order, cut into overlapping
chunks, plus the synonym groups. The browser builds its BM25 index from this at load.

Run from the repo root:  python3 scripts/build_search_index.py
Reads ../.work/final_rows.json and ../.work/text/<key>.txt (the extracted order text).
Chunking must stay identical to the evaluation (120 words, step 90) or the measured
retrieval quality no longer applies.
"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "..", ".work")
SITE = os.path.join(ROOT, "site")

rows = json.load(open(os.path.join(WORK, "final_rows.json")))
site = json.load(open(os.path.join(SITE, "data", "orders.json")))
kept = [r for r in rows if r["key"] != "2023-05-22_2"]          # content duplicate, not published
assert len(kept) == len(site) == 149
for r, o in zip(kept, site):
    assert r["date"] == o["date"] and r["decision"] == o["summary"], (r["key"], o["sl"])

def chunks_of(text, size=120, step=90):
    words = re.sub(r"\s+", " ", text).split(" ")
    return [" ".join(words[i:i + size]) for i in range(0, max(1, len(words) - 30), step)]

out = []
for r, o in zip(kept, site):
    text = open(os.path.join(WORK, "text", r["key"] + ".txt"), encoding="utf-8").read()
    out.append({"sl": o["sl"], "chunks": chunks_of(text)})

syn = json.load(open(os.path.join(ROOT, "scripts", "synonyms.json")))["groups"]
# plain-English search descriptions (data/plain_descriptions.json); see that file's _note
plain = json.load(open(os.path.join(ROOT, "data", "plain_descriptions.json"), encoding="utf-8"))["descriptions"]
assert sorted(map(int, plain)) == [o["sl"] for o in site]
path = os.path.join(SITE, "data", "search.json")
json.dump({"v": 2, "orders": out, "synonyms": syn, "plain": plain}, open(path, "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
n = sum(len(o["chunks"]) for o in out)
print(f"wrote {path}: {len(out)} orders, {n} chunks, {os.path.getsize(path)/1e6:.2f} MB")
