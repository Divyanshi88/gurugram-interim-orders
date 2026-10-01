"""Faithfulness check for search_eval/plain/*.json: every number and every capitalised
name in a description must occur in that order's text (same standard as the index)."""
import json, re, glob, os
E = os.path.dirname(os.path.abspath(__file__))
docs = {d["sl"]: d for d in json.load(open(os.path.join(E, "docs.json")))}
plain = {int(k): v for k, v in json.load(open(os.path.join(E, "..", "data", "plain_descriptions.json")))["descriptions"].items()}
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
COMMON = set("""The A An In On At And But Or If So For Of To By With From As He She His Her They Their It Its
This That These Those Court SFIO High Supreme Judge Accused Also After Before When While Since Both Each
No Not Only Then There Here Who What Rs Mr Ms Dr Sh Shri Smt Order Orders Case Hearing Police Jail Bank
January February March April May June July August September October November December Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec
Gurugram India Indian COVID Covid Hon Act Companies CrPC Section Sections One Two Three Four Five Six Seven Eight Nine Ten
Monday Tuesday Wednesday Thursday Friday Saturday Sunday Arguments Application Applications Bail Prosecution""".split())
issues = []
for sl, desc in sorted(plain.items()):
    t = re.sub(r"\s+", " ", docs[sl]["text"]); tn = norm(t)
    tdig = re.sub(r"\D", "", t)
    for num in re.findall(r"\d[\d,.]*\d|\d", desc):
        n = re.sub(r"\D", "", num)
        if len(n) >= 2 and n not in tdig and n.lstrip("0") not in tdig:
            issues.append((sl, "number", num))
    for name in re.findall(r"\b[A-Z][a-zA-Z]{2,}\b", desc):
        if name not in COMMON and norm(name) not in tn:
            issues.append((sl, "name", name))
print(f"descriptions: {len(plain)} | unverified tokens: {len(issues)}")
for i in issues: print("  ", i)
