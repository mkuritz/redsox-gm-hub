"""Free automated contract cross-checks (no Spotrac; no Cot's scraping).
Writes data/contract_checks.json:
  - transactions: MLB Stats API contract-relevant events (last 400 days) -> Strategy Planner flags rows needing a manual update
  - cots: one polite reachability probe of Cot's Baseball Contracts. Cot's sits behind a bot challenge, so it is used
    as a reference link only (never parsed).
  - arbitration: refreshes data/arbitration.json from MLB Trade Rumors if this hub's fetch_data.py does not already do so.
"""
import os, sys, json, re, traceback, urllib.request
from datetime import date, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_data as fd

COTS = "https://legacy.baseballprospectus.com/compensation/cots/"
KEYS = re.compile(r"extension|extend|exercised|declined|club option|player option|mutual option|opt(ed)? out|contract (renewal|renewed)|buyout|non-tender|avoid(ed)? arbitration|agreed", re.I)
TYPES = {"SFA", "SGN", "TR", "REL", "DFA", "CLW", "RET"}


def transactions():
    end = date.today(); start = end - timedelta(days=400)
    j = fd.jget(f"{fd.S}/transactions?teamId={fd.BOS}&startDate={start}&endDate={end}")
    out = []
    for t in j.get("transactions", []):
        d = t.get("description") or ""; code = t.get("typeCode")
        kw = bool(KEYS.search(d))
        if not kw and (code not in TYPES or "minor league" in d.lower()):
            continue
        if code == "DFA" and "elected free agency" not in d.lower() and not kw:
            continue  # "Designated for assignment" share code with elected FA in some feeds
        p = t.get("person") or {}
        out.append({"date": t.get("date"), "code": code, "type": t.get("typeDesc"), "desc": d, "player": p.get("fullName"), "pid": p.get("id"), "keyword": kw})
    out.sort(key=lambda x: x["date"] or "", reverse=True)
    return out


def cots_probe():
    st = {"url": COTS, "use": "reference link only", "checked": fd.now_et()}
    try:
        with urllib.request.urlopen(urllib.request.Request(COTS, headers=fd.UA), timeout=20) as r:
            h = r.read(20000).decode("utf-8", "ignore"); st["http"] = r.status
        st["bot_wall"] = bool(re.search(r"not a bot|anubis|captcha|cf-chl|challenge", h, re.I))
    except Exception as e:
        st["http"] = getattr(e, "code", None); st["error"] = str(e)[:120]; st["bot_wall"] = None
    st["note"] = ("Cot's (Baseball Prospectus) is behind an anti-bot challenge and its robots.txt is not served to automated "
                  "clients, so the hub does not fetch or parse it. Use it manually as a cross-reference.")
    return st


import html
ARB_URL = f"https://www.mlbtraderumors.com/{fd.SEASON}/10/projected-arbitration-salaries-for-{fd.SEASON + 1}.html"


def arbitration():
    h = fd.get(ARB_URL).decode("utf-8", "ignore")
    i = h.find("entry-content"); seg = h[i:]
    seg = seg[:seg.find("</article")] if "</article" in seg else seg
    t = html.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<(br|/p|/li|/h\d)[^>]*>", "\n", seg)))
    teams, cur = {}, None
    for line in [l.strip() for l in t.split("\n") if l.strip()]:
        m = re.match(r"^([A-Z][A-Za-z\. ]+?) \((\d+)\)$", line)
        if m:
            cur = m.group(1); teams[cur] = []; continue
        m = re.match(r"^(.+?) \((\d\.\d{3})\): \$([\d\.]+)(MM|K)(.*)$", line)
        if m and cur:
            amt = float(m.group(3)) * (1e6 if m.group(4) == "MM" else 1e3)
            teams[cur].append({"name": m.group(1).strip(), "service": m.group(2), "proj": int(round(amt)), "note": m.group(5).strip(" ()") or None})
    if not teams:
        raise ValueError("no arbitration table parsed")
    return {"source": "MLB Trade Rumors / Matt Swartz arbitration projections", "url": ARB_URL, "teams": teams}


def main():
    st = {}
    if not hasattr(fd, "arbitration") and fd.MODE == "full":
        try:
            st["arbitration.json"] = "updated" if fd.write("arbitration.json", arbitration()) else "unchanged"
        except Exception as e:
            traceback.print_exc(); st["arbitration.json"] = f"FAILED (kept previous): {str(e)[:100]}"
    try:
        tx = transactions()
    except Exception as e:
        traceback.print_exc(); st["contract_checks.json"] = f"FAILED (kept previous): {str(e)[:100]}"; print(st); return
    prev = fd.load("contract_checks.json") if os.path.exists(os.path.join(fd.DATA, "contract_checks.json")) else None
    cots = cots_probe() if fd.MODE == "full" or not prev else (prev or {}).get("cots")
    payload = {"source": "MLB Stats API transactions (statsapi.mlb.com)", "window_days": 400, "transactions": tx, "cots": cots,
               "arbitration_source": "MLB Trade Rumors / Matt Swartz projections (data/arbitration.json)"}
    st["contract_checks.json"] = "updated" if fd.write("contract_checks.json", payload) else "unchanged"
    print(json.dumps(st, indent=1))


if __name__ == "__main__":
    main()
