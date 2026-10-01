"""Build the offline, shareable version of the order index.

Output: <out>/Gurugram_Interim_Orders_offline.zip containing exactly
    Gurugram_Interim_Orders.xlsx   the same table as the website, one row per order
    orders/                        the 149 order PDFs, unchanged from site/orders/
Each row's "Open PDF" link is RELATIVE (orders/order_NNN_YYYY-MM-DD.pdf), so it keeps
working wherever the zip is extracted. Built from site/data/orders.json, so the workbook
and the website cannot drift apart.

Run from the repo root:  python3 scripts/build_offline_zip.py [out_dir]   (needs openpyxl)
"""
import json, os, sys, zipfile, hashlib, datetime
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "offline"))
XLSX_NAME = "Gurugram_Interim_Orders.xlsx"
ZIP_NAME = "Gurugram_Interim_Orders_offline.zip"
PDF_DIR = "orders"

orders = json.load(open(os.path.join(SITE, "data", "orders.json"), encoding="utf-8"))
assert len(orders) == 149 and [o["sl"] for o in orders] == list(range(1, 150))
for o in orders:
    assert o["file"].startswith(PDF_DIR + "/") and os.path.isfile(os.path.join(SITE, o["file"])), o["file"]

NAVY, BAND, LINK = "1F3864", "EEF3FA", "0563C1"
thin = Side(style="thin", color="DFE3E9")
wrap_top = Alignment(wrap_text=True, vertical="top")

wb = Workbook()
ws = wb.active
ws.title = "Orders"

# ---- heading block -------------------------------------------------------------------
ws["A1"] = "Gurugram Interim Orders"
ws["A1"].font = Font(bold=True, size=15, color=NAVY)
ws["A2"] = ("SFIO vs Adarsh Buildestate Ltd & 186 others  |  CNR HRGR010070222019  |  COMA/5/2019  |  "
            "District & Sessions Court, Gurugram, Court 26  |  18 May 2019 to 8 September 2026")
ws["A2"].font = Font(size=10, color="5D6775")
ws["A3"] = ("Click “Open PDF” to open an order. The links point to the “orders” folder that sits beside this file: "
            "keep the two together. On Windows, use “Extract All” before opening (links do not work from inside the zip). "
            "Links to files on your computer do not work in Google Sheets or other online viewers.")
ws["A3"].font = Font(size=10, italic=True, color="8A5A00")
ws["A3"].alignment = Alignment(wrap_text=True, vertical="top")
ws.merge_cells("A3:I3")
ws.row_dimensions[3].height = 30

HEAD = 5
cols = [  # header, width, key
    ("No.", 6, "sl"),
    ("Date of order", 13, "date"),
    ("Judge", 20, "judge"),
    ("Order document", 13, "file"),
    ("Pages", 7, "pages"),
    ("Defendants concerned", 34, "defendants"),
    ("Type", 11, "contested"),
    ("Summary", 70, "summary"),
    ("Contentions & court’s observations", 70, "contentions"),
    ("Portal entries", 14, "entries"),
]
for c, (h, w, _) in enumerate(cols, 1):
    cell = ws.cell(row=HEAD, column=c, value=h)
    cell.font = Font(bold=True, color="FFFFFF")
    cell.fill = PatternFill("solid", fgColor=NAVY)
    cell.alignment = Alignment(wrap_text=True, vertical="center")
    ws.column_dimensions[get_column_letter(c)].width = w

for i, o in enumerate(orders):
    r = HEAD + 1 + i
    vals = {
        "sl": o["sl"],
        "date": datetime.date.fromisoformat(o["date"]),
        "judge": o["judge"],
        "file": "Open PDF",
        "pages": o["pages"],
        "defendants": o["defendants"],
        "contested": "contested" if o["contested"] else "procedural",
        "summary": o["summary"],
        "contentions": o["contentions"] or "",
        "entries": o["entries"],
    }
    for c, (_, _, k) in enumerate(cols, 1):
        cell = ws.cell(row=r, column=c, value=vals[k])
        cell.alignment = wrap_top
        cell.border = Border(bottom=thin)
        if i % 2:
            cell.fill = PatternFill("solid", fgColor=BAND)
        if k == "date":
            cell.number_format = "dd mmm yyyy"
        if k == "file":
            cell.hyperlink = o["file"]          # relative: orders/order_NNN_YYYY-MM-DD.pdf
            cell.font = Font(color=LINK, underline="single")
        if k == "sl":
            cell.font = Font(bold=True, color=NAVY)
        if k == "contested" and o["contested"]:
            cell.font = Font(bold=True, color="2F5597")

last = HEAD + len(orders)
ws.freeze_panes = ws.cell(row=HEAD + 1, column=2)
ws.auto_filter.ref = f"A{HEAD}:{get_column_letter(len(cols))}{last}"
ws.print_title_rows = f"{HEAD}:{HEAD}"
ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0
ws.sheet_properties.pageSetUpPr.fitToPage = True

# ---- About sheet ---------------------------------------------------------------------
ab = wb.create_sheet("About")
ab.column_dimensions["A"].width = 26
ab.column_dimensions["B"].width = 100
rows = [
    ("Gurugram Interim Orders — offline copy", None),
    ("Case", "SFIO vs Adarsh Buildestate Ltd & 186 others. CNR HRGR010070222019, CIS COMA/5/2019, "
             "District & Sessions Court Gurugram, Court 26."),
    ("Period", "18 May 2019 to 8 September 2026"),
    ("Orders in this copy", f"{len(orders)} unique orders, {sum(o['pages'] for o in orders)} pages, "
                            f"{len({o['date'] for o in orders})} hearing dates, "
                            f"{sum(1 for o in orders if o['contested'])} contested, "
                            f"{len({o['judge'] for o in orders})} judges."),
    ("Online version", "https://gurugram-interim-orders.onrender.com (adds full-text search of every order)"),
    (None, None),
    ("How the links work", "Each “Open PDF” link opens a file in the “orders” folder next to this workbook. "
                           "Keep this workbook and the “orders” folder in the same place. Moving either one on its "
                           "own breaks the links."),
    ("Windows", "Right-click the zip → Extract All, then open the workbook from the extracted folder. "
                "Opening it straight from inside the zip opens a temporary copy, and the links will not find the PDFs. "
                "Excel may warn that the file could be unsafe before opening a PDF; that is a standard prompt for any link."),
    ("Mac", "Double-click the zip to extract it. Excel for Mac may ask permission to open the PDF the first time."),
    ("Google Sheets / online", "Links to files on your computer do NOT work in Google Sheets, Excel Online or any web "
                               "viewer: those cannot see your local folders. The table still reads fine; open PDFs "
                               "from the “orders” folder by number, or use the online version."),
    (None, None),
    ("How 434 becomes 149", "eCourts lists 434 interim-order entries. The court publishes one row per defendant an "
                            "order concerns, and sometimes splits one order across several single-page PDFs. "
                            "Removing identical copies and rejoining split pages gives the 149 orders here. "
                            "“Portal entries” shows which eCourts entries make up each order."),
    ("Known gaps", "Entry 50 (18 Jan 2021) was never uploaded by the court; eCourts returns “File Is Not Uploaded”. "
                   "Entries 141 and 164 are absent from the archives supplied; entry 164 is the only entry on "
                   "22 Jul 2025, so that date has no document. The true order count is 149–151, with 149 confirmed."),
    ("Dates", "The date shown is the date under which the court’s portal lists the order. It is not always the date "
              "printed on the order (entries listed under 18 Sep 2019 carry order text dated 11 Jul 2019)."),
    ("On the summaries", "Every accused number, section, citation and date in this table was checked back against the "
                         "text of the order it is attributed to. The characterisation of an argument is editorial "
                         "judgment and has not been reviewed by a lawyer. Read the PDF before relying on any entry."),
    ("Type", "“contested” = the order records an actual contention or ruling; “procedural” = roll-call, "
             "attendance, exemption or adjournment only."),
    ("Built", datetime.date.today().strftime("%d %B %Y") + " from the same data as the website."),
]
for i, (k, v) in enumerate(rows, 1):
    if k:
        ab.cell(row=i, column=1, value=k).font = Font(bold=True, color=NAVY, size=15 if i == 1 else 11)
    if v:
        c = ab.cell(row=i, column=2, value=v)
        c.alignment = wrap_top
        if v.startswith("https://"):
            c.hyperlink = v.split(" ")[0]
            c.font = Font(color=LINK, underline="single")
    ab.cell(row=i, column=1).alignment = wrap_top

wb.active = 0

# ---- write workbook + zip -----------------------------------------------------------
os.makedirs(OUT, exist_ok=True)
xlsx_path = os.path.join(OUT, XLSX_NAME)
wb.save(xlsx_path)

zip_path = os.path.join(OUT, ZIP_NAME)
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(xlsx_path, XLSX_NAME)
    z.writestr(zipfile.ZipInfo(PDF_DIR + "/"), "")      # explicit folder entry
    for o in orders:
        # PDFs are already compressed; store them as-is
        z.write(os.path.join(SITE, o["file"]), o["file"], compress_type=zipfile.ZIP_STORED)

md5 = lambda p: hashlib.md5(open(p, "rb").read()).hexdigest()
print(f"wrote {zip_path}: {os.path.getsize(zip_path)/1e6:.1f} MB, "
      f"{len(orders)} PDFs + {XLSX_NAME} ({os.path.getsize(xlsx_path)/1e3:.0f} KB)")
