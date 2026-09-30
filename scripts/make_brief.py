import json, csv
from collections import Counter, defaultdict
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, KeepTogether, HRFlowable)

# ---------- live numbers ----------
man  = list(csv.DictReader(open(".work/manifest.csv")))
rows = json.load(open(".work/final_rows.json"))
plan = json.load(open(".work/orders_plan.json"))
bd = defaultdict(list)
for o in plan: bd[o["date"]].append(o)
key2plan = {}
for d, os_ in bd.items():
    for i, o in enumerate(os_, 1): key2plan["%s_%d" % (d, i)] = o

DUP = "2023-05-22_2"
N_ENTRIES   = len(man)
N_WITH_DOC  = len([r for r in man if r["source"] != "MISSING"])
MISSING     = sorted(int(r["entry"]) for r in man if r["source"] == "MISSING")
DATES_ALL   = len({r["date"] for r in man})
DATES_DOC   = len({r["date"] for r in rows})
NO_DOC_DATE = sorted({r["date"] for r in man} - {r["date"] for r in rows})
N_GROUPS    = len(rows)
N_UNIQUE    = N_GROUPS - 1
N_CONTEST   = len([r for r in rows if r["has_contentions"] and r["key"] != DUP])
N_QUIET     = N_GROUPS - len([r for r in rows if r["has_contentions"]])
TOTAL_PAGES = sum(r["pages"] for r in rows)

def mech(r):
    o = key2plan[r["key"]]
    if len(o["parts"]) > 1: return "MERGED"
    if len(r["entries"]) == 1: return "AS-IS"
    return "DEDUPED"
mc = Counter(mech(r) for r in rows)
ded = [r for r in rows if mech(r) == "DEDUPED"]
mer = [r for r in rows if mech(r) == "MERGED"]
REMOVED_DUP = sum(len(r["entries"]) for r in ded) - len(ded)
REMOVED_MER = sum(len(r["entries"]) for r in mer) - len(mer)

# ---------- styles ----------
NAVY = colors.HexColor("#1F3864"); SLATE = colors.HexColor("#44546A")
RULE = colors.HexColor("#B4C6E7"); BAND = colors.HexColor("#EEF3FA")
ss = getSampleStyleSheet()
def S(n, **kw):
    base = dict(name=n, fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=colors.HexColor("#22272E"))
    base.update(kw); return ParagraphStyle(**base)
TITLE = S("t", fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=NAVY, spaceAfter=2)
SUB   = S("s", fontSize=10, leading=14, textColor=SLATE, spaceAfter=1)
H1    = S("h1", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=NAVY, spaceBefore=13, spaceAfter=5)
BODY  = S("b", spaceAfter=5)
SMALL = S("sm", fontSize=8.3, leading=11.5, textColor=SLATE)
NOTE  = S("n", fontSize=9, leading=12.5, textColor=colors.HexColor("#7A4B00"))
MONO  = S("m", fontName="Courier", fontSize=9, leading=12.6)

doc = SimpleDocTemplate("Gurugram_Orders_Briefing.pdf", pagesize=A4,
                        leftMargin=19*mm, rightMargin=19*mm, topMargin=16*mm, bottomMargin=16*mm,
                        title="Gurugram Interim Orders - Dataset Briefing",
                        author="Case data team")
W = doc.width
st = []

def rule(): return HRFlowable(width="100%", thickness=0.8, color=RULE, spaceBefore=3, spaceAfter=7)

st += [Paragraph("Gurugram Interim Orders &mdash; Dataset Briefing", TITLE),
       Paragraph("SFIO vs Adarsh Buildestate Ltd &amp; 186 others &nbsp;|&nbsp; CNR HRGR010070222019 &nbsp;|&nbsp; COMA/5/2019", SUB),
       Paragraph("District &amp; Sessions Court, Gurugram &mdash; Court 26 (ASJ) &nbsp;|&nbsp; orders dated 18 May 2019 to 8 September 2026", SUB),
       rule()]

# headline band
hd = [["%d" % DATES_ALL, "%d" % N_UNIQUE, "%d" % N_CONTEST, "%d" % N_ENTRIES],
      ["hearing dates", "unique orders", "contested orders", "portal entries"]]
t = Table(hd, colWidths=[W/4.0]*4)
t.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1), BAND),
    ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"), ("FONTSIZE",(0,0),(-1,0),21),
    ("TEXTCOLOR",(0,0),(-1,0), NAVY), ("FONTSIZE",(0,1),(-1,1),8.4),
    ("TEXTCOLOR",(0,1),(-1,1), SLATE), ("ALIGN",(0,0),(-1,-1),"CENTER"),
    ("TOPPADDING",(0,0),(-1,0),9), ("BOTTOMPADDING",(0,1),(-1,1),9),
    ("LINEAFTER",(0,0),(-2,-1),0.6,colors.white)]))
st += [t, Spacer(1, 4),
       Paragraph("Every figure below is derived from the collected documents and is reproducible from the "
                 "accompanying CSV. Nothing is estimated.", SMALL), Spacer(1, 2)]

# ---- A ----
st += [Paragraph("A. &nbsp;Hearing dates &mdash; how many times the court sat", H1),
       Paragraph("The index records <b>%d</b> distinct hearing dates between 18 May 2019 and 8 September 2026. "
                 "Documents exist for <b>%d</b> of them." % (DATES_ALL, DATES_DOC), BODY),
       Paragraph("The gap is <b>%s</b>. That date is represented by a single portal entry (164), and no PDF for it "
                 "exists in any source supplied. So the court sat on %d recorded occasions; we hold papers for %d."
                 % (NO_DOC_DATE[0], DATES_ALL, DATES_DOC), BODY)]

# ---- B ----
st += [Paragraph("B. &nbsp;Unique orders &mdash; how many orders were actually passed", H1),
       Paragraph("<b>%d unique orders.</b> The grouping produces %d order-records; one of them "
                 "(22 May 2023) is the same approver order published twice, the second copy having its pages "
                 "repeated inside the PDF. It is byte-different but word-for-word identical, so it was caught by "
                 "text comparison rather than by checksum." % (N_UNIQUE, N_GROUPS), BODY),
       Paragraph("<b>Caveat on the true figure.</b> Entries 141 and 164 have no document anywhere. Entry 141 falls "
                 "on 30 May 2023, where three sibling entries are already collected, so it may simply duplicate an "
                 "order we hold. Entry 164 is the sole entry on its date and is therefore almost certainly a further "
                 "order we do not hold. The honest range is <b>149 to 151, with 149 confirmed</b>.", NOTE)]

# ---- C ----
st += [Paragraph("C. &nbsp;Contested orders", H1),
       Paragraph("<b>%d of the %d</b> unique orders record an actual contention &mdash; an argument advanced by the "
                 "defence, a reply by the prosecution, or reasoning given by the court." % (N_CONTEST, N_UNIQUE), BODY),
       Paragraph("The remaining <b>%d</b> are composite roll-calls, remands and adjournments in which nothing was "
                 "argued. These are marked as such in the index rather than padded with invented narrative. The "
                 "workbook carries a dedicated <i>Contested orders</i> sheet holding only the %d."
                 % (N_QUIET, N_CONTEST), BODY)]

# ---- D ----
st += [Paragraph("D. &nbsp;Why %d portal entries become %d orders" % (N_ENTRIES, N_UNIQUE), H1),
       Paragraph("The workbook's first sheet has 435 rows &mdash; one header plus <b>%d entries</b>. The court "
                 "publishes one table row per defendant an order concerns, and sometimes splits a single order "
                 "across several one-page PDFs. Three mechanisms account for the whole collapse." % N_ENTRIES, BODY)]

mt = [["Mechanism", "What it means", "Orders"],
      ["AS-IS",   "the entry was already one whole order",              str(mc["AS-IS"])],
      ["DEDUPED", "byte-identical copies collapsed to one",             str(mc["DEDUPED"])],
      ["MERGED",  "single pages of one order joined back together",     str(mc["MERGED"])]]
t = Table(mt, colWidths=[W*0.17, W*0.65, W*0.18])
t.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0), NAVY), ("TEXTCOLOR",(0,0),(-1,0), colors.white),
    ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"), ("FONTNAME",(0,1),(0,-1),"Helvetica-Bold"),
    ("FONTSIZE",(0,0),(-1,-1),9), ("ALIGN",(2,0),(2,-1),"CENTER"),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, BAND]),
    ("GRID",(0,0),(-1,-1),0.4, RULE), ("TOPPADDING",(0,0),(-1,-1),5),
    ("BOTTOMPADDING",(0,0),(-1,-1),5), ("LEFTPADDING",(0,0),(-1,-1),7)]))
st += [t, Spacer(1, 8)]

calc = ("%3d  entries holding a document<br/>"
        "-%3d  identical copies removed &nbsp;(across %d orders)<br/>"
        "-%3d  split pages absorbed &nbsp;(across %d order)<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;&mdash;&mdash;&mdash;<br/>"
        "%3d  order-records<br/>"
        "&nbsp;&nbsp;-1  content duplicate (22 May 2023)<br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;&mdash;&mdash;&mdash;<br/>"
        "<b>%3d  unique orders</b>") % (N_WITH_DOC, REMOVED_DUP, len(ded), REMOVED_MER, len(mer), N_GROUPS, N_UNIQUE)
t = Table([[Paragraph(calc, MONO)]], colWidths=[W])
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1), BAND), ("BOX",(0,0),(-1,-1),0.6, RULE),
                       ("LEFTPADDING",(0,0),(-1,-1),12), ("TOPPADDING",(0,0),(-1,-1),8),
                       ("BOTTOMPADDING",(0,0),(-1,-1),8)]))
st += [t, Spacer(1, 4),
       Paragraph("The three entries without a document &mdash; 50, 141 and 164 &mdash; bring the total back to %d."
                 % N_ENTRIES, SMALL)]

# worked examples
st += [Paragraph("Worked examples", H1)]
ex = [["Portal entries", "Becomes", "Mechanism"],
      ["266 &ndash; 380", "one order of 17 Apr 2026", "115 byte-identical copies collapsed"],
      ["172 &ndash; 265", "one order of 18 Mar 2026", "5 single pages merged into one 5-page order"],
      ["382 &ndash; 427", "one order of 4 Jun 2026",  "46 byte-identical copies collapsed"]]
ex = [[Paragraph(c, S("x", fontSize=9, leading=12, fontName="Helvetica-Bold" if i==0 else "Helvetica",
                      textColor=colors.white if i==0 else colors.HexColor("#22272E"))) for c in r]
      for i, r in enumerate(ex)]
t = Table(ex, colWidths=[W*0.22, W*0.30, W*0.48])
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0), NAVY),
                       ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, BAND]),
                       ("GRID",(0,0),(-1,-1),0.4, RULE), ("TOPPADDING",(0,0),(-1,-1),5),
                       ("BOTTOMPADDING",(0,0),(-1,-1),5), ("LEFTPADDING",(0,0),(-1,-1),7)]))
st += [t, Spacer(1, 3),
       Paragraph("A per-order audit trail for all %d records is in <b>reconciliation_434_to_149.csv</b>." % N_GROUPS, SMALL)]

# gaps
st += [Paragraph("Known gaps", H1)]
gp = [["Entry", "Date", "Status"],
      ["50",  "18 Jan 2021", "Never uploaded by the court. eCourts returns “File Is Not Uploaded”. Not retrievable by anyone."],
      ["141", "30 May 2023", "Absent from both archives and the resolver file. Three sibling entries on this date are held."],
      ["164", "22 Jul 2025", "Absent. Sole entry on its date, so this date has no document at all."]]
gp = [[Paragraph(c, S("g", fontSize=8.8, leading=11.8, fontName="Helvetica-Bold" if i==0 else "Helvetica",
                      textColor=colors.white if i==0 else colors.HexColor("#22272E"))) for c in r]
      for i, r in enumerate(gp)]
t = Table(gp, colWidths=[W*0.09, W*0.16, W*0.75])
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0), NAVY),
                       ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, BAND]),
                       ("GRID",(0,0),(-1,-1),0.4, RULE), ("VALIGN",(0,0),(-1,-1),"TOP"),
                       ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
                       ("LEFTPADDING",(0,0),(-1,-1),7)]))
st += [t, Spacer(1, 4),
       Paragraph("One further data caution: the portal's listing date is not always the date on the order. Entries "
                 "filed under 18 September 2019 carry order text dated 11 July 2019. Grouping follows the portal "
                 "date, because that is what the court's own index uses.", NOTE)]

# deliverables
st += [Paragraph("What is in the set", H1)]
dl = [["File", "Contents"],
      ["combined/", "%d PDFs, one per hearing date, bookmarked; %d pages in total" % (DATES_DOC, TOTAL_PAGES)],
      ["Gurugram_Order_Index_Combined.xlsx", "Order index (all %d entries) &middot; Orders (the %d records) &middot; Contested orders (the %d)" % (N_ENTRIES, N_GROUPS, N_CONTEST)],
      ["orders_summary.csv", "one row per order: scope, contentions, decision"],
      ["reconciliation_434_to_149.csv", "the audit trail behind the table above"],
      ["orders/", "the %d source PDFs as downloaded" % len([r for r in man if r['source']=='scraped'])]]
dl = [[Paragraph(c, S("d", fontSize=8.8, leading=11.8,
                      fontName="Helvetica-Bold" if i==0 else ("Courier" if j==0 else "Helvetica"),
                      textColor=colors.white if i==0 else colors.HexColor("#22272E")))
       for j, c in enumerate(r)] for i, r in enumerate(dl)]
t = Table(dl, colWidths=[W*0.36, W*0.64])
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0), NAVY),
                       ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, BAND]),
                       ("GRID",(0,0),(-1,-1),0.4, RULE), ("VALIGN",(0,0),(-1,-1),"TOP"),
                       ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
                       ("LEFTPADDING",(0,0),(-1,-1),7)]))
st += [t]

# verification
st += [Paragraph("How these figures were checked", H1),
       Paragraph("Every accused number, statutory section, case citation, date and money figure asserted in the "
                 "index was grepped back against the text of the order it was attributed to. All 877 accused "
                 "attributions resolve &mdash; 756 stated as a number, 121 by the person's name. Of 342 citations "
                 "checked, one was wrong: a reference to section 212(6) of the Companies Act in the order of "
                 "15 September 2021 belonged to a similar order a week later. It has been corrected.", BODY),
       Paragraph("<b>What this check does not establish.</b> It verifies that every fact cited sits in the document "
                 "it is attributed to. It cannot verify that an argument has been characterised fairly &mdash; that "
                 "is editorial judgment. Before this informs advice or a filing, the %d contested orders should be "
                 "read against the PDFs by someone qualified. The other %d assert nothing beyond “no contentions "
                 "recorded”." % (N_CONTEST, N_QUIET), NOTE)]

def foot(c, d):
    c.saveState(); c.setFont("Helvetica", 7.6); c.setFillColor(SLATE)
    c.drawString(19*mm, 10*mm, "Gurugram Interim Orders - Dataset Briefing | CNR HRGR010070222019")
    c.drawRightString(A4[0]-19*mm, 10*mm, "Page %d" % c.getPageNumber())
    c.setStrokeColor(RULE); c.setLineWidth(0.5); c.line(19*mm, 13*mm, A4[0]-19*mm, 13*mm)
    c.restoreState()

doc.build(st, onFirstPage=foot, onLaterPages=foot)
print("built Gurugram_Orders_Briefing.pdf")
print("  dates %d | unique orders %d | contested %d | entries %d" % (DATES_ALL, N_UNIQUE, N_CONTEST, N_ENTRIES))
