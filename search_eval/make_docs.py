"""Regenerate docs.json (the eval corpus) from ../.work. Run from repo root: python3 search_eval/make_docs.py"""
import json, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); W = os.path.join(R, "..", ".work")
rows = [r for r in json.load(open(os.path.join(W, "final_rows.json"))) if r["key"] != "2023-05-22_2"]
site = json.load(open(os.path.join(R, "site", "data", "orders.json")))
docs = [dict(sl=s["sl"], date=s["date"], key=r["key"], judge=s["judge"], summary=s["summary"],
             contentions=s["contentions"], defendants=s["defendants"], contested=s["contested"],
             text=open(os.path.join(W, "text", r["key"] + ".txt"), encoding="utf-8").read())
        for s, r in zip(site, rows)]
json.dump(docs, open(os.path.join(R, "search_eval", "docs.json"), "w"))
