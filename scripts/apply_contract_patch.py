"""Apply a Strategy Planner contract patch to data/contracts_manual.json.
Usage: python scripts/apply_contract_patch.py contracts_patch_YYYY-MM-DD.json"""
import json, os, sys, unicodedata, re
from datetime import date
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
P = os.path.join(ROOT, "data", "contracts_manual.json")
key = lambda s: re.sub(r"\s+", " ", re.sub(r"[^a-z ]", "", unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower())).strip()
patch = json.load(open(sys.argv[1])); doc = json.load(open(P))
for r in patch.get("upsert", []):
    if not r.get("source") or not re.match(r"^\d{4}-\d{2}-\d{2}$", r.get("accessed") or ""):
        sys.exit(f"Refusing row without source/date: {r.get('name')}")
rm = set(patch.get("remove", [])) | {key(r["name"]) for r in patch.get("upsert", [])}
up = {key(r["name"]): r for r in patch.get("upsert", [])}
out = []
for c in doc["contracts"]:
    k = key(c["name"])
    if k in up: out.append(up.pop(k))
    elif k not in rm: out.append(c)
out += list(up.values()); doc["contracts"] = out; doc["updated"] = date.today().isoformat()
json.dump(doc, open(P, "w"), indent=1, ensure_ascii=False); open(P, "a").write("\n")
print(f"{len(patch.get('upsert', []))} upserted, {len(patch.get('remove', []))} removed -> {P}")
