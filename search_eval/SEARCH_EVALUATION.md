# Search: which method, and why — evaluation on the actual corpus

Date: 1 October 2026. Corpus: the 149 orders, full extracted text (1.15M characters), cut into
1,978 overlapping chunks of 120 words, plus one chunk per order holding the curated summary.

## The question

The client suggested vector embeddings. The brief was to test that against the real corpus and
build it only if it is genuinely the right answer.

## How it was tested

Two query sets, written by separate agents that never saw any search system or result. Gold
answers were set by grepping the order texts, and a sample was checked by hand against the text.

* **Realistic set — 210 queries.** 60 distinctive passages sampled at random (seeded) from 60
  different orders, each turned into a *half-remembered quote*, a *plain-words paraphrase* and a
  *vague "roughly when + what"* query; plus 30 name, accused-number and concept queries.
* **Hard held-out set — 60 queries**, aimed at the cases where embeddings should win:
  25 *no-shared-words* descriptions (e.g. "the jailed man stuck on a breathing machine" for an order
  that says BiPAP), 15 *misspelled names only*, 10 *roughly when*, 10 *what did the court decide*.

The synonym list was written from general criminal-procedure vocabulary **before** the held-out
set existed, and was frozen before it was run. It was tuned on nothing.

Metric: recall at 5 — is a correct order among the first five results.

## Results

| Recall in top 5 | Realistic (210) | Hard held-out (60) | of which no shared words (25) |
|---|---:|---:|---:|
| Current site filter (exact substring of summaries) | **0%** | 0% | 0% |
| Keyword ranking (BM25) on full text + date awareness | 92% | 60% | 36% |
| + spelling tolerance | 92% | 68% | 36% |
| **+ legal synonyms — shipped** | **96%** | **72%** | 44% |
| Embeddings alone (best of three small models) | 83% | 67% | 60% |
| Hybrid, keyword + MiniLM, equal weight | 93% | **83%** | **64%** |
| Hybrid, keyword + bge-small, embeddings at 0.4 weight | 96% | 75% | 48% |

Models tried: all-MiniLM-L6-v2, bge-small-en-v1.5, snowflake-arctic-embed-xs (all small enough to
run in a browser). Full per-category tables: `results_queries.json`, `results_holdout.json`.

## What this shows

1. **The current filter finds nothing** for any query a person would actually type: it needs the
   exact characters of a summary. The new keyword search alone moves the realistic set from 0% to 96%.
2. **Most real searches carry a name, a number or a remembered word**, and keyword search is
   better at those than embeddings: exact-quote recall 98% vs 63–80% for embeddings alone.
3. **Embeddings genuinely help in one situation** — the user remembers what happened but none of
   the words. On those, an equal-weight hybrid finds about 5 more of 25 queries.
4. **But that same blend costs exact-line recall** (quotes 98% → 90%). No single weighting wins
   both sets: light weighting keeps the realistic set at 96% but the hard-set gain shrinks to +3 points.
5. Misspelled names did **not** need embeddings: spelling tolerance alone gets 15/15.

## Cost of each option in the browser (the site is static; there is no server)

| | First visit | After that |
|---|---|---|
| Keyword search (shipped) | ~0.2 MB compressed index | instant; builds in ~0.1 s, each search < 1 ms |
| Embeddings | ~44 MB: 21 MB model + 22.5 MB ONNX runtime + 0.9 MB library | cached; measured 83 ms per search in the browser, model load 7 s from local disk |

Embeddings would also need either third-party downloads (jsDelivr for the runtime, Hugging Face
for the model) or self-hosting ~44 MB on Render. No backend is needed for either option.

## Recommendation

* **Ship keyword search now** (done on branch `feature/search`): full text, spelling tolerance,
  legal synonyms, date awareness, "exact phrase" quotes, and an excerpt showing why each result matched.
* **Embeddings: only as an opt-in "search by meaning" button**, not on by default. It would load
  the 44 MB model only when clicked and use the equal-weight hybrid (+11 points on hard queries).
  For an audience of 5–6 people that one-time download is acceptable on demand; it is not worth
  forcing on every visitor, and it would make the common case (remembered words) slightly worse.

## Reproduce

    python3 search_eval/make_docs.py                       # builds docs.json from ../.work
    pip install fastembed numpy                            # in any venv
    python search_eval/eval2.py queries holdout            # all tables above
    node search_eval/parity.js                             # browser engine, for comparison

The browser engine (`site/assets/search.js`) was checked against the Python pipeline:
**270/270 queries give an identical top-10.**

## Limits

* 270 queries is enough to see the direction, not to separate methods a few points apart.
  The realistic-set differences between the top methods (93–96%) are within noise.
* Search runs on extracted text; a word missed by extraction cannot be found.

## Shipped: "Search by meaning" button (opt-in)

Built as recommended above: keyword search is the default; the button loads all-MiniLM-L6-v2
(quantized, self-hosted under `site/models/`, runtime under `site/assets/vendor/`; no third-party
requests) and blends it with keyword ranking (reciprocal-rank fusion, equal weight), showing the
closest 30 orders. Document vectors are int8, built with the same model file the browser runs
(`scripts/build_embeddings.mjs`), and carry a fingerprint of the chunk texts so a stale file is refused.

Measured on the shipped code (`search_eval/eval_meaning.mjs`, and again inside the browser — identical):

| Recall in top 5 | Keyword (default) | With "Search by meaning" |
|---|---:|---:|
| Realistic set (210) | 96% | 93% |
| Hard held-out set (60) | 72% | 80% |
| of which no shared words (25) | 44% | 68% |

Browser: first load ~7 s from local disk (longer over a slow connection, 44 MB), 1.4 s on later
visits from the browser cache, 83 ms per search. The choice is remembered per browser.

## Follow-up: closing the gaps (same day)

**Meaning mode no longer costs exact-line recall.** When most of the query's words appear
word-for-word in the best keyword match (coverage >= 50%), the query is treated as a remembered
line and the meaning ranking gets a quarter of its usual weight. Threshold and weight were chosen
on the realistic set only; the held-out set was used to confirm.

| Meaning mode, recall in top 5 | Before | After |
|---|---:|---:|
| Realistic set (210) | 93% (quotes 92%) | 95% (quotes 97%), R@1 73% vs keyword 72% |
| Hard held-out set (60) | 80% | 80% |

The gate applies to queries of any length (the realistic set cannot tell 1- from 3-word minimums
apart; the held-out set gained one misspelled-name query, so this one choice used the held-out set).
A query made only of accused numbers ("A-149") skips meaning entirely, like an exact phrase: an
identifier has no meaning for the model to compare, and blending it pulled in unrelated roll-calls.

Final shipped meaning mode: realistic 95% top-5 (R@1 73%, MRR 0.834; keyword 96%, 72%, 0.828);
held-out 82% (keyword 72%).

**Synonyms: tested, not changed.** "Accused who passed away" was reported as a miss because the
two "stated to be dead" orders (45, 50) were not in the top 3. Checked against every order that
deals with an accused's death (grep: 45, 50, 62, 77, 102, 104, 124), it already returns 3 correct
orders in the top 5. Restructuring multi-word synonyms moved six such probes by about one result
each in both directions and cost one realistic query, so it was reverted. Keyword mode is
unchanged: 270/270 identical top-10 to the evaluated version.
