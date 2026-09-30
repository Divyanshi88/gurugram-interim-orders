# Gurugram Interim Orders — SFIO vs Adarsh Buildestate Ltd & 186 others

A browsable, downloadable index of every interim order in **CNR HRGR010070222019 / COMA 5 of 2019**,
District & Sessions Court, Gurugram (Court 26), covering **18 May 2019 to 8 September 2026**.

**Live page:** deployed from `render.yaml` as a Render static site (publish directory `site/`).

---

## What this is

The eCourts portal lists **434 interim-order entries** for this case. That is not 434 orders. The court
publishes **one table row per defendant an order concerns**, and occasionally splits a single order across
several one-page PDFs. Resolving both produces **149 unique orders**.

| | |
|---|---:|
| Portal entries listed | 434 |
| Entries with a document | 431 |
| **Unique orders** | **149** |
| Hearing dates | 120 (119 with a document) |
| Orders recording an actual contention | 78 |
| Judges who sat | 14 |
| Total pages | 692 |

## How 434 becomes 149

```
431  entries holding a document
-188  byte-identical copies removed      (across 31 orders)
 -93  split pages merged into one order  (across  1 order)
────
 150  order records
  -1  content duplicate (22 May 2023 published twice)
────
 149  unique orders
```

Three mechanisms:

| Mechanism | Meaning | Orders |
|---|---|---:|
| `AS-IS` | the entry was already one whole order | 118 |
| `DEDUPED` | byte-identical copies collapsed to one | 31 |
| `MERGED` | single pages of one order joined back together | 1 |

Worked examples: entries **266–380** are 115 identical copies of one order; entries **172–265** are five
single pages of one 18 March 2026 order, reassembled here; entries **382–427** are 46 identical copies.

Full per-order audit trail: [`data/reconciliation_434_to_149.csv`](data/reconciliation_434_to_149.csv).

## Known gaps

| Entry | Date | Status |
|---|---|---|
| 50 | 18 Jan 2021 | Never uploaded by the court. eCourts returns *"File Is Not Uploaded"*. Not retrievable. |
| 141 | 30 May 2023 | Absent from the archives supplied. Three sibling entries on this date are held. |
| 164 | 22 Jul 2025 | Absent. Sole entry on its date, so this date has no document at all. |

Because 164 is the only entry on its date, the true order count is **149–151, with 149 confirmed**.

A further caution: **the portal's listing date is not always the date on the order.** Entries filed under
18 September 2019 carry order text dated 11 July 2019. Grouping follows the portal date, because that is
what the court's own index uses.

## Deploying

The repo carries a `render.yaml` blueprint. On Render: **New → Blueprint**, pick this repo, apply.
Nothing to configure — it serves `site/` as a static site and sets caching and `noindex` headers.
Every push to `main` redeploys automatically.

## Repository layout

```
site/                  the published page
  index.html           table of all 149 orders
  assets/              stylesheet and script
  data/orders.json     the table's data
  orders/              149 per-order PDFs, one click to download
data/                  index workbook, CSV exports, intermediate JSON
scripts/               the collection and assembly pipeline
source_pdfs/           the 250 PDFs as downloaded from eCourts (provenance)
FINDINGS.md            notes from collection and assembly
```

## Method

1. **Collection.** Orders fetched from eCourts through the browser console — the site rejects non-browser
   TLS fingerprints and gates PDFs behind a session. Paced at 1600 ms; the session expires at ~19 minutes,
   which returns HTTP 200 with `"Session timeout"` rather than an error, so long runs need a fresh captcha.
2. **Deduplication.** Byte-identical documents collapsed by MD5. One further duplicate — the same order
   published twice with its pages repeated — was caught by word-shingle comparison, not checksum.
3. **Reassembly.** Orders split across single-page PDFs detected by the absence of a closing judge signature
   block on the last page carrying text, then merged in entry order. Continuity was verified by reading
   across the joins.
4. **Judges.** Extracted from the signature block via the court's UID code (e.g. `HR0026` → Ravi Kumar Sondhi).
5. **Summaries.** Written from the full text of every order. All 150 have a real text layer; no OCR was needed.

## Verification

Every accused number, statutory section, case citation, date and money figure asserted in the index was
checked back against the text of the order it is attributed to.

- **877 / 877** accused attributions resolve — 756 stated as a number, 121 by the person's name.
- **342** citations checked; **one** was wrong (a section 212(6) reference belonging to a different order)
  and has been corrected.

**What this does not establish.** It verifies that every fact cited sits in the document it is attributed
to. It does not verify that an argument has been *characterised* fairly — that is editorial judgment, and
has not been reviewed by a lawyer. Before this informs advice or a filing, read the PDFs.

## Source

All documents are public records retrieved from <https://services.ecourts.gov.in/>.
