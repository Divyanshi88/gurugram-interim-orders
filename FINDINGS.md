# Findings from the 2026-09-30 collection run

Written alongside `HANDOVER.md`, not folded into it — fold in whatever you agree with.

## Run result

251 attempted (entry 50, then 185-434), **250 collected**, 1 missed.
All 250 verified as real PDFs (`%PDF` magic), 0 corrupt.

Missing: **entry 50 only** - and it is not retrievable (see below).

Took two passes: the first collected 240 before the session timed out at
entry 424; a second pass on a fresh captcha recovered 425-434.

## New gotcha: the eCourts session times out (~20 minutes)

`HANDOVER.md` lists three gotchas. There is a fourth, and it is what cost us
entries 425-434.

After ~19 minutes the session dies and `?p=home/display_pdf` starts returning
**HTTP 200** with:

    {"errormsg":"<br/> <strong>Oops!</strong> Session timeout..!!!<br/>..."}

This is *not* the HTTP 405 rate limit, so the script's `blocked >= 3` bailout
never fires. It just silently fails every remaining order, three retries each,
and reports `finished`.

Two consequences:

1. **The 10-12 minute estimate is optimistic once anything fails.** Each failed
   order costs ~13.5s in backoff (2.5 + 4.5 + 6.5). Eleven failures stretched a
   ~11 min run to 20.6 min - straight into the timeout. Failures are
   self-amplifying: the more you miss, the likelier you are to miss the rest.

2. **Worth detecting explicitly.** Treat an `errormsg` containing
   "Session timeout" like the 405 case: stop immediately and report, rather
   than burning the rest of the queue against a dead session.

Recovery is cheap: reload, redo the captcha, re-run. `localStorage` resume means
only the genuinely missing entries are re-fetched.

## The big one: 434 entries are NOT 434 orders

The 250 entries we collected resolve to **13 distinct documents**:

| order_id | date       | bytes   | entries | range   |
|----------|------------|--------:|--------:|---------|
| ORDER-01 | 2026-03-18 | 115,289 |      12 | 185-196 |
| ORDER-02 | 2026-03-18 | 115,343 |      46 | 197-242 |
| ORDER-03 | 2026-03-18 | 114,444 |      23 | 243-265 |
| ORDER-04 | 2026-04-17 |  31,948 |     115 | 266-380 |
| ORDER-05 | 2026-04-17 | 100,888 |       1 | 381     |
| ORDER-06 | 2026-06-04 |  61,822 |      46 | 382-427 |
| ORDER-07 | 2026-07-10 |  48,848 |       1 | 428     |
| ORDER-08 | 2026-07-29 |  47,017 |       1 | 429     |
| ORDER-09 | 2026-08-19 | 109,237 |       1 | 430     |
| ORDER-10 | 2026-08-25 | 127,567 |       1 | 431     |
| ORDER-11 | 2026-08-31 |  51,234 |       1 | 432     |
| ORDER-12 | 2026-09-07 |  51,821 |       1 | 433     |
| ORDER-13 | 2026-09-08 |  93,891 |       1 | 434     |

Perfectly contiguous, non-overlapping blocks summing to exactly 250. The
`filename` argument in each row's `displayPdf(...)` is genuinely unique, so
these are 240 distinct requests that return 6 distinct documents - not a
caching artefact.

**The court lists one entry per defendant an order concerns.** That is what the
186 respondents are doing in this table.

**But only up to June 2026.** Orders from 2026-07-10 onward (ORDER-07 through
ORDER-13, entries 428-434) appear exactly **once each**. The court changed its
publishing practice partway through the case. Do not assume the
one-row-per-defendant rule holds everywhere - it demonstrably stops at
entry 427.

This directly affects the pending summarisation task. Summarising "434 orders"
is really summarising **~10-12 orders** (if the ratio holds across entries
1-184). And the entry -> document mapping *is* the defendant mapping, so half
of "which of the 186 defendants it concerns" falls out of the data for free.

See `entry_to_order_map.csv` - one row per entry, with `order_id`, `doc_md5`
and size.

**Next step, before writing any summaries:** hash the officemate's 183 PDFs
(entries 1-184) with the same method and merge into the map. That gives the
complete entry -> order partition for all 434, and the true distinct-order
count for the case.

## Entry 50

Failed on a *fresh* session at minute 0, while entries 185-190 around it
succeeded. So it is not the timeout and not rate limiting. `HANDOVER.md`
pre-seeds `1-49,51-184` - a contiguous range with 50 deliberately carved out -
which means it failed for the previous collector too. Retried on a fresh session, and the court
answered definitively:

    {"errormsg":"File Is Not Uploaded..!!!"}

The PDF was never uploaded to eCourts. **Entry 50 is not retrievable by anyone.**
Treat the case set as 433 obtainable entries, not 434.

## Files

| File | What |
|---|---|
| `orders/` | 250 PDFs, `NNN_YYYY-MM-DD.pdf` |
| `entry_to_order_map.csv` | entry -> distinct-document mapping |
| `.work/scraper_run.js` | the variant actually used (batched flush) |
| `.work/collect.sh` | unzip + integrity + coverage reconcile |
| `.work/receiver.py` | unused - see below |

### Why the scraper was modified

`SCRAPER.js` marks an entry done in `localStorage` the moment it is fetched, but
only writes files at `saveZip()`, which runs once at the end. A tab crash at
order 200 leaves localStorage claiming 200 collected and zero PDFs on disk -
and resume then skips them permanently. `.work/scraper_run.js` flushes a zip
every 40 successes and only writes localStorage *after* that zip is on disk.
Everything touching eCourts is byte-for-byte the original: PACE 1600, rotating
headers off `ajaxCall`, single-use `app_token` chain, 3-try retry, 405 bailout.

`.work/receiver.py` was an attempt to have the browser POST PDFs straight to
disk. It does not work from the Claude browser pane - that pane is sandboxed
away from localhost, and even a `no-cors` request to `127.0.0.1` fails. Kept
only in case someone runs this from a normal Chrome, where it would work.

---

# Summarisation pass (same day)

The `Summary` column is filled. All 150 orders were read in full - every PDF in
this corpus has a real text layer, so no OCR was needed (1.15M characters).

| File | What |
|---|---|
| `Gurugram_Order_Index_Combined.xlsx` | sheet `Order index` = all 434 entries with summary; sheet `Orders` = the 150 orders |
| `orders_summary.csv` | one row per order: date, pages, entries, what it decided, who it concerns |
| `.work/text/` | extracted text, one file per order |
| `.work/summaries.json` | the summaries as data |

## One more duplicate, found by text rather than hash

`2023-05-22_1` and `2023-05-22_2` are the **same** approver order for Shashank
Shekhar Singh Rathore (A-185). The second is a PDF in which the order's pages
are repeated, so the bytes differ and the MD5 dedupe missed it. A shingle-based
comparison over all 150 orders found this and **only** this pair - no other
same-content duplicates exist, within a date or across dates.

So the corpus is **149 distinct decisions** across 119 hearing dates.

## What the case actually is

SFIO complaint under the Companies Act 2013 against Adarsh Buildestate Ltd and
186 others - 112 companies (A-1 to A-112) and 75 individuals. Cognizance taken
3 June 2019 by a 73-page order; all A-1 to A-187 summoned for offences under
ss.447, 147 and 448 of the Companies Act 2013, s.58A of the 1956 Act, and
ss.120B, 417, 418, 420 IPC.

**Seven years on, the case is still at the stage of securing appearance.** The
orders are overwhelmingly procedural: roll-calls of 187 accused, remands,
production warrants that jails repeatedly ignore, bail and anticipatory bail,
travel permissions, and proclamations.

Recurring threads worth knowing before reading anything:

- **Ten accused turned approver** (A-150, 158, 159, 161, 179, 182, 183, 184,
  185, 186) on High Court bail conditions; statements recorded 2022-2023.
  A-160 Shiv Raj Sharma was added on 18.03.2026. By the order of 03.09.2024 a
  pardoned accused ceases to be an accused and becomes a prosecution witness.
- **Proclaimed persons/offenders:** A-137 Shinder Pal Singh declared a
  proclaimed person 03.05.2024; A-135 Sidharth Chauhan declared a **Proclaimed
  Offender** 17.04.2026 after defying a Supreme Court surrender deadline.
  Proclamation under BNSS s.84 issued against A-113 Mukesh Modi and A-114 Rahul
  Virendra Modi on 25.08.2026, executed at Sirohi, Rajasthan on 07.09.2026.
- **Deceased:** A-155 Mahender Kumar Tak, A-175 Vijay Jhindal, A-187 Mahesh
  Kumar Tak - proceedings abated (recorded 02.07.2022).
- **The Supreme Court has now ordered the charges framed** - order dated
  14.07.2026 in Review Petition (Crl.) No.378 of 2025, with the trial court to
  report by 03.11.2026. The High Court had already directed on 22.12.2025 that
  the trial be separated for accused whose presence is unsecured. This is the
  live issue as at the last order collected (08.09.2026).

## Two data cautions

1. **The portal's date is not always the order's date.** Entries filed under
   18.09.2019 carry order text dated 11.07.2019. Grouping here follows the
   portal date, since that is what the index and the court's own listing use.
2. **Entries 141 and 164 have no PDF** in anything supplied - not in either zip,
   not in `ecourts-resolved.json`. Separate from entry 50, which the court
   never uploaded. So 431 of 434 entries have a document.
