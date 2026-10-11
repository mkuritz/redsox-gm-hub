#!/usr/bin/env python3
"""GM Hub data fetcher (team set by team.json). MODE=full (default) or MODE=news (news/rumors/transactions/injuries only).
Each source is independent; on failure the previous file is kept. Contracts/calendar/franchise facts are
hand-maintained in data/*_manual.json (no free licensed source)."""
import json, os, re, sys, html, urllib.request, traceback
import xml.etree.ElementTree as ET_
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
from email.utils import parsedate_to_datetime

ET = ZoneInfo("America/New_York")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
MODE = os.environ.get("MODE", "full")
SEASON = int(os.environ.get("SEASON", "2026"))
TEAM = json.load(open(os.path.join(ROOT, "team.json")))
UA = {"User-Agent": f"Mozilla/5.0 ({TEAM['repo']} personal demo; github.com/mkuritz)"}
S = "https://statsapi.mlb.com/api/v1"
BOS = TEAM["id"]
AFFIL = [tuple(a) for a in TEAM["affiliates"]]
# Typical age at level (rough industry rule of thumb used only for an "age vs level" flag)
LEVEL_AGE = {"AAA": 26.5, "AA": 24.5, "High-A": 23.0, "Low-A": 21.5, "Complex (FCL)": 20.0, "DSL": 18.0}


def get(url, timeout=45):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def jget(url):
    return json.loads(get(url))


def now_et():
    return datetime.now(timezone.utc).astimezone(ET).isoformat(timespec="seconds")


def write(name, payload):
    p = os.path.join(DATA, name)
    try:
        old = json.load(open(p))
        if old.get("data") == payload:
            return False
    except Exception:
        pass
    json.dump({"updated": now_et(), "data": payload}, open(p, "w"), indent=1, sort_keys=True)
    return True


def load(name):
    try:
        return json.load(open(os.path.join(DATA, name)))["data"]
    except Exception:
        return None


def num(x):
    try:
        return float(x)
    except Exception:
        return None


# ---------------- MLB statsapi ----------------
def season_stats(team_id, sport_id, group):
    u = f"{S}/stats?stats=season&group={group}&teamId={team_id}&sportId={sport_id}&season={SEASON}&playerPool=ALL&limit=300"
    out = {}
    for sp in jget(u)["stats"][0]["splits"]:
        out[sp["player"]["id"]] = sp["stat"]
    return out


def roster():
    forty = jget(f"{S}/teams/{BOS}/roster?rosterType=40Man&season={SEASON}&hydrate=person")["roster"]
    active = {p["person"]["id"] for p in jget(f"{S}/teams/{BOS}/roster?rosterType=active&season={SEASON}")["roster"]}
    hit, pit = season_stats(BOS, 1, "hitting"), season_stats(BOS, 1, "pitching")
    out = []
    for r in forty:
        p = r["person"]; pid = p["id"]
        out.append({
            "id": pid, "name": p["fullName"], "num": r.get("jerseyNumber") or p.get("primaryNumber"),
            "pos": r["position"]["abbreviation"], "posType": r["position"]["type"],
            "status": r["status"]["description"], "active26": pid in active,
            "age": p.get("currentAge"), "birth": p.get("birthDate"), "bats": (p.get("batSide") or {}).get("code"),
            "throws": (p.get("pitchHand") or {}).get("code"), "debut": p.get("mlbDebutDate"),
            "draftYear": p.get("draftYear"), "height": p.get("height"), "weight": p.get("weight"),
            "country": p.get("birthCountry"),
            "hit": pick(hit.get(pid), ["gamesPlayed", "plateAppearances", "avg", "obp", "slg", "ops", "homeRuns", "rbi", "stolenBases", "strikeOuts", "baseOnBalls", "hits", "doubles", "runs"]),
            "pit": pick(pit.get(pid), ["gamesPlayed", "gamesStarted", "inningsPitched", "era", "whip", "strikeOuts", "baseOnBalls", "wins", "losses", "saves", "holds", "strikeoutsPer9Inn", "walksPer9Inn", "homeRunsPer9", "avg"]),
        })
    return out


def pick(d, keys):
    if not d:
        return None
    return {k: d.get(k) for k in keys if k in d}


def standings():
    out = []
    divn = {}
    for lg in (103, 104):
        for rec in jget(f"{S}/standings?leagueId={lg}&season={SEASON}&hydrate=team,division")["records"]:
            dv = rec["division"]; name = dv.get("nameShort") or dv.get("name")
            teams = []
            for t in rec["teamRecords"]:
                teams.append({"id": t["team"]["id"], "name": t["team"]["name"], "abbr": t["team"].get("abbreviation"),
                              "w": t["wins"], "l": t["losses"], "pct": t["winningPercentage"], "gb": t["gamesBack"],
                              "wcgb": t.get("wildCardGamesBack"), "rs": t.get("runsScored"), "ra": t.get("runsAllowed"),
                              "diff": t.get("runDifferential"), "streak": (t.get("streak") or {}).get("streakCode"),
                              "clinch": t.get("clinchIndicator"),
                              "l10": next((f"{s['wins']}-{s['losses']}" for s in (t.get("records") or {}).get("splitRecords", []) if s["type"] == "lastTen"), None),
                              "home": next((f"{s['wins']}-{s['losses']}" for s in (t.get("records") or {}).get("splitRecords", []) if s["type"] == "home"), None),
                              "away": next((f"{s['wins']}-{s['losses']}" for s in (t.get("records") or {}).get("splitRecords", []) if s["type"] == "away"), None)})
            out.append({"league": "AL" if lg == 103 else "NL", "division": name, "teams": teams})
    return out


def team_stats():
    out = {}
    for g in ("hitting", "pitching"):
        rows = jget(f"{S}/teams/stats?stats=season&group={g}&season={SEASON}&sportIds=1")["stats"][0]["splits"]
        out[g] = [{"id": r["team"]["id"], "name": r["team"]["name"], **{k: r["stat"].get(k) for k in
                  ["runs", "homeRuns", "avg", "obp", "slg", "ops", "stolenBases", "strikeOuts", "era", "whip", "baseOnBalls", "saves", "blownSaves"] if k in r["stat"]}} for r in rows]
    return out


def schedule():
    games = []
    for gt, rng in (("R,F,D,L,W", (f"{SEASON}-03-01", f"{SEASON}-11-05")),):
        j = jget(f"{S}/schedule?sportId=1&teamId={BOS}&startDate={rng[0]}&endDate={rng[1]}&gameType={gt}")
        for d in j["dates"]:
            for g in d["games"]:
                a, h = g["teams"]["away"], g["teams"]["home"]
                home = h["team"]["id"] == BOS
                me, op = (h, a) if home else (a, h)
                games.append({"date": d["date"], "type": g["gameType"], "home": home, "opp": op["team"]["name"],
                              "rs": me.get("score"), "ra": op.get("score"), "status": g["status"]["detailedState"],
                              "win": me.get("isWinner")})
    post = []
    j = jget(f"{S}/schedule?sportId=1&startDate={SEASON}-09-28&endDate={SEASON}-11-05&gameType=F,D,L,W")
    for d in j["dates"]:
        for g in d["games"]:
            post.append({"date": d["date"], "type": g["gameType"], "series": g.get("seriesDescription"),
                         "away": g["teams"]["away"]["team"]["name"], "home": g["teams"]["home"]["team"]["name"],
                         "as": g["teams"]["away"].get("score"), "hs": g["teams"]["home"].get("score"),
                         "status": g["status"]["detailedState"]})
    nxt = jget(f"{S}/schedule?sportId=1&teamId={BOS}&season={SEASON + 1}&gameType=S,R")
    nd = [{"date": d["date"], "type": d["games"][0]["gameType"]} for d in nxt["dates"]]
    first_s = next((x["date"] for x in nd if x["type"] == "S"), None)
    first_r = next((x["date"] for x in nd if x["type"] == "R"), None)
    return {"games": games, "postseason": post, "next": {"season": SEASON + 1, "firstSpring": first_s, "openingDay": first_r, "games": len(nd)}}


def transactions():
    end = date.today(); start = end - timedelta(days=120)
    j = jget(f"{S}/transactions?teamId={BOS}&startDate={start}&endDate={end}")
    out = [{"date": t.get("date"), "type": t.get("typeDesc"), "desc": t.get("description"),
            "player": (t.get("person") or {}).get("fullName")} for t in j.get("transactions", [])]
    out.sort(key=lambda x: x["date"] or "", reverse=True)
    return out[:250]


def farm():
    levels = []
    for lvl, sid, tid, nm in AFFIL:
        try:
            h, p = season_stats(tid, sid, "hitting"), season_stats(tid, sid, "pitching")
            ro = jget(f"{S}/teams/{tid}/roster?rosterType=fullSeason&season={SEASON}&hydrate=person")["roster"]
        except Exception as e:
            print("farm fail", nm, e); continue
        players = []
        for r in ro:
            pp = r["person"]; pid = pp["id"]
            players.append({"id": pid, "name": pp["fullName"], "pos": r["position"]["abbreviation"], "posType": r["position"]["type"],
                            "age": pp.get("currentAge"), "bats": (pp.get("batSide") or {}).get("code"),
                            "throws": (pp.get("pitchHand") or {}).get("code"), "draftYear": pp.get("draftYear"),
                            "status": (r.get("status") or {}).get("description"),
                            "hit": pick(h.get(pid), ["gamesPlayed", "plateAppearances", "avg", "obp", "slg", "ops", "homeRuns", "stolenBases", "strikeOuts", "baseOnBalls", "rbi"]),
                            "pit": pick(p.get(pid), ["gamesPlayed", "gamesStarted", "inningsPitched", "era", "whip", "strikeOuts", "baseOnBalls", "strikeoutsPer9Inn", "walksPer9Inn", "saves"])})
        levels.append({"level": lvl, "sportId": sid, "teamId": tid, "team": nm, "typicalAge": LEVEL_AGE.get(lvl), "players": players})
    return levels


def draft():
    out = []
    for yr in (SEASON, SEASON - 1, SEASON - 2):
        try:
            rounds = jget(f"{S}/draft/{yr}?teamId={BOS}")["drafts"]["rounds"]
        except Exception as e:
            print("draft fail", yr, e); continue
        for rd in rounds:
            for pk in rd["picks"]:
                person = pk.get("person") or {}
                out.append({"year": yr, "round": pk.get("pickRound"), "pick": pk.get("pickNumber"),
                            "name": person.get("fullName"), "id": person.get("id"),
                            "pos": (person.get("primaryPosition") or {}).get("abbreviation") or (pk.get("position") or {}).get("abbreviation"),
                            "school": (pk.get("school") or {}).get("name"), "class": (pk.get("school") or {}).get("schoolClass"),
                            "bonus": pk.get("signingBonus"), "slot": pk.get("pickValue"), "rank": pk.get("rank"),
                            "blurb": (pk.get("blurb") or "")[:400]})
    return out


# ---------------- news / rumors ----------------
def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s or "")).replace("\xa0", " ").strip()


def rss(url, source, kind):
    root = ET_.fromstring(get(url))
    items = []
    for it in root.iter("item"):
        t = strip(it.findtext("title")); l = (it.findtext("link") or "").strip()
        d = it.findtext("pubDate"); desc = strip(it.findtext("description"))
        try:
            iso = parsedate_to_datetime(d).astimezone(ET).isoformat(timespec="minutes")
        except Exception:
            iso = None
        items.append({"title": t, "url": l, "date": iso, "summary": re.sub(r"\s+", " ", desc)[:320], "source": source, "kind": kind})
    return items


def espn_news():
    j = jget(f"https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news?team={TEAM['espn']}&limit=40")
    out = []
    for a in j.get("articles", []):
        out.append({"title": a.get("headline"), "url": ((a.get("links") or {}).get("web") or {}).get("href"),
                    "date": a.get("published"), "summary": (a.get("description") or "")[:320], "source": "ESPN", "kind": "news"})
    return out


def espn_injuries():
    j = jget("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries")
    out = []
    for t in j.get("injuries", []):
        if TEAM["short"] not in (t.get("displayName") or ""):
            continue
        for i in t.get("injuries", []):
            out.append({"name": (i.get("athlete") or {}).get("displayName"), "status": i.get("status"),
                        "date": i.get("date"), "detail": i.get("shortComment") or i.get("longComment"),
                        "type": ((i.get("details") or {}).get("type"))})
    return out


def tag_players(items, names):
    keys = {}
    lasts = {}
    for n in names:
        lasts.setdefault(n.split()[-1], []).append(n)
    for n in names:
        last = n.split()[-1]
        alt = (r"|" + re.escape(last)) if (len(last) > 5 and len(lasts[last]) == 1 and n in MLB_NAMES) else ""
        keys[n] = re.compile(r"\b(" + re.escape(n) + alt + r")\b")
    for it in items:
        txt = (it.get("title") or "") + " " + (it.get("summary") or "")
        it["players"] = [n for n, rx in keys.items() if rx.search(txt)][:6]
        low = txt.lower()
        it["tags"] = [t for t, words in {"trade": ["trade", "deal for", "acquire"], "free agency": ["free agent", "free agency", "sign"],
                      "extension": ["extension"], "injury": ["injur", "surgery", "il "], "prospect": ["prospect", "minor league", "draft"],
                      "front office": ["front office", "manager", "coach"] + [w.lower() for w in TEAM.get("foWords", [])], "cba": ["cba", "lockout", "collective bargaining"]}.items()
                      if any(w in low for w in words)]
    return items


MLB_NAMES = set()


def news_and_rumors(names):
    news, rumors, srcs = [], [], []
    for fn, label in ((lambda: espn_news(), f"ESPN {TEAM['short']} news API"),
                      (lambda: rss(f"https://www.mlb.com/{TEAM['mlbcom']}/feeds/news/rss.xml", "MLB.com", "news"), f"MLB.com {TEAM['short']} RSS")):
        try:
            x = fn(); news += x; srcs.append({"name": label, "ok": True, "n": len(x)})
        except Exception as e:
            srcs.append({"name": label, "ok": False, "err": str(e)[:120]})
    try:
        x = rss(f"https://www.mlbtraderumors.com/{TEAM['mlbtr']}/feed", "MLB Trade Rumors", "rumor")
        rumors += x; srcs.append({"name": f"MLB Trade Rumors - {TEAM['short']} RSS", "ok": True, "n": len(x)})
    except Exception as e:
        srcs.append({"name": f"MLB Trade Rumors - {TEAM['short']} RSS", "ok": False, "err": str(e)[:120]})
    def relevant(it):
        if it["source"] != "ESPN":
            return True
        t = (it.get("title") or "") + " " + (it.get("summary") or "")
        return TEAM["short"] in t or TEAM["city"] in t or any(n in t for n in MLB_NAMES)
    news = [x for x in news if relevant(x)]
    seen, nn = set(), []
    for it in sorted(news, key=lambda x: x.get("date") or "", reverse=True):
        k = (it["title"] or "").lower()[:70]
        if k in seen:
            continue
        seen.add(k); nn.append(it)
    return tag_players(nn[:80], names), tag_players(rumors, names), srcs


def main():
    os.makedirs(DATA, exist_ok=True)
    meta = load("meta.json") or {}
    status = {}
    jobs = []
    if MODE == "full":
        jobs += [("roster.json", roster), ("standings.json", standings), ("team_stats.json", team_stats),
                 ("schedule.json", schedule), ("farm.json", farm), ("draft.json", draft)]
    jobs += [("transactions.json", transactions), ("injuries.json", espn_injuries)]
    for name, fn in jobs:
        try:
            changed = write(name, fn()); status[name] = "updated" if changed else "unchanged"
        except Exception as e:
            traceback.print_exc(); status[name] = f"FAILED (kept previous): {str(e)[:100]}"
    names = [p["name"] for p in (load("roster.json") or [])]
    MLB_NAMES.update(names)
    for lv in (load("farm.json") or [])[:4]:
        names += [p["name"] for p in lv["players"]]
    try:
        n, r, srcs = news_and_rumors(sorted(set(names)))
        status["news.json"] = "updated" if write("news.json", {"items": n, "sources": srcs}) else "unchanged"
        status["rumors.json"] = "updated" if write("rumors.json", {"items": r, "sources": srcs}) else "unchanged"
    except Exception as e:
        traceback.print_exc(); status["news.json"] = f"FAILED: {e}"
    status.update(main_v2())
    meta = {"lastRun": now_et(), "mode": MODE, "status": status,
            "lastFull": now_et() if MODE == "full" else (meta or {}).get("lastFull")}
    json.dump({"updated": now_et(), "data": meta}, open(os.path.join(DATA, "meta.json"), "w"), indent=1)
    print(json.dumps(status, indent=1))




# ================= v2 additions =================
def apollo(url):
    h = get(url).decode("utf-8", "ignore")
    i = h.find("ROOT_QUERY")
    s = h.rfind("&quot;payload&quot;", 0, i)
    seg = html.unescape(h[s:s + 3000000])
    j = seg.find('{"ROOT_QUERY"')
    d = 0
    for k, ch in enumerate(seg[j:]):
        if ch == "{": d += 1
        elif ch == "}":
            d -= 1
            if d == 0: break
    return json.loads(seg[j:j + k + 1])


def pipeline_list(url):
    o = apollo(url); rq = o["ROOT_QUERY"]
    key = next(k for k in rq if k.startswith("getPlayerRankingsFromSelection"))
    out = []
    for e in rq[key]:
        pe = e.get("playerEntity") or {}
        ref = (pe.get("player") or {}).get("__ref") or ""
        person = o.get(ref, {})
        pid = int(ref.split(":")[1]) if ":" in ref else None
        bio = " ".join(b.get("contentText", "") for b in (pe.get("prospectBio") or [])[:1])
        grades = re.search(r"Scouting grades:</strong>(.*?)</p>", bio)
        tm = o.get(((person.get("activeRosterMLB") or person.get("activeRoster") or {}) or {}).get("__ref") or "", {})
        team = tm.get("parentOrgName") or tm.get("name")
        lvl = {11: "AAA", 12: "AA", 13: "High-A", 14: "Low-A", 16: "Rookie", 1: "MLB"}.get(int(((tm.get("sport") or {}).get("__ref") or "Sport:0").split(":")[1]))
        out.append({"rank": e.get("rank"), "id": pid, "name": ((person.get("useName") or "") + " " + (person.get("useLastName") or "")).strip(),
                    "age": person.get("currentAge"), "country": person.get("birthCountry"), "level": lvl, "affiliate": tm.get("name"),
                    "pos": pe.get("position"), "eta": pe.get("eta"),
                    "grades": strip(grades.group(1)) if grades else None, "team": team})
    return {"slug": key, "players": out}


def prospects():
    yr = SEASON
    res = {"source": "MLB Pipeline (MLB.com)", "fetched": now_et()}
    t30 = pipeline_list(f"https://www.mlb.com/milb/prospects/{TEAM['mlbcom']}")
    t100 = pipeline_list("https://www.mlb.com/milb/prospects/top100")
    # team for top-100 via the table rows (team name column) as fallback
    rows = {}
    h = get("https://www.mlb.com/milb/prospects/top100").decode("utf-8", "ignore")
    res["team30"] = t30["players"]; res["top100"] = t100["players"]
    res["team30_url"] = f"https://www.mlb.com/milb/prospects/{TEAM['mlbcom']}"; res["top100_url"] = "https://www.mlb.com/milb/prospects/top100"
    res["slugs"] = [t30["slug"], t100["slug"]]
    return res


def all_mlb_stats():
    out = {}
    for g in ("hitting", "pitching"):
        sp = jget(f"{S}/stats?stats=season&group={g}&season={SEASON}&sportId=1&playerPool=ALL&limit=5000")["stats"][0]["splits"]
        for r in sp:
            pid = r["player"]["id"]
            e = out.setdefault(pid, {"id": pid, "name": r["player"]["fullName"], "pos": (r.get("position") or {}).get("abbreviation"), "teams": []})
            if r.get("team"):
                e["teams"].append(r["team"]["name"])
            if not r.get("team") or g not in e:
                e[g] = {k: r["stat"].get(k) for k in ["age", "gamesPlayed", "plateAppearances", "avg", "obp", "slg", "ops", "homeRuns", "stolenBases",
                                                     "gamesStarted", "inningsPitched", "era", "whip", "strikeoutsPer9Inn", "walksPer9Inn", "saves", "holds"] if k in r["stat"]}
            e["age"] = r["stat"].get("age", e.get("age"))
            if g == "hitting" and e.get("pos") == "P" and (r.get("position") or {}).get("abbreviation") != "P":
                e["pos"] = r["position"]["abbreviation"]
    return out


def nkey(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", s.replace(" jr", "").replace(" sr", ""))


FA_URL = "https://www.mlbtraderumors.com/2025/08/2026-27-mlb-free-agents.html"


def free_agents(stats):
    h = get(FA_URL).decode("utf-8", "ignore")
    i = h.find("entry-content"); seg = h[i:]
    j = seg.find("</article"); seg = seg[:j] if j > 0 else seg
    t = html.unescape(re.sub(r"<br ?/?>", "\n", seg)); t = re.sub(r"</(p|li|h\d)>", "\n", t); t = re.sub(r"<[^>]+>", "", t)
    upd = re.search(r"Updated ([\d-]+)", t)
    section, out = None, {}
    by = {}
    for e in stats.values():
        by.setdefault(nkey(e["name"]), e)
    for line in [x.strip() for x in t.split("\n") if x.strip()]:
        m = re.match(r"^(.+?) \((\d\d)\)\s*(?:[–-]\s*(.+))?$", line)
        if m and section:
            nm = m.group(1).strip(); k = nkey(nm)
            e = out.setdefault(k, {"name": nm, "age2027": int(m.group(2)), "sections": [], "option": m.group(3)})
            if section not in e["sections"]:
                e["sections"].append(section)
            if m.group(3) and not e.get("option"):
                e["option"] = m.group(3)
            st = by.get(k)
            if st:
                e["id"] = st["id"]; e["team"] = (st["teams"] or [None])[-1]; e["hit"] = st.get("hitting"); e["pit"] = st.get("pitching")
        elif len(line) < 40 and not re.search(r"\d", line):
            section = line
    return {"source": "MLB Trade Rumors 2026-27 MLB Free Agents", "url": FA_URL, "list_updated": upd.group(1) if upd else None, "players": list(out.values())}


def trade_market(stats, fa, standings_):
    rum = []
    for u in ("https://www.mlbtraderumors.com/feed", "https://www.mlbtraderumors.com/feed?paged=2", "https://www.mlbtraderumors.com/feed?paged=3"):
        try:
            rum += rss(u, "MLB Trade Rumors", "rumor")
        except Exception as e:
            print("mlbtr feed", e)
    seen = set(); rum = [x for x in rum if not (x["url"] in seen or seen.add(x["url"]))]
    team_rec = {}
    for d in standings_ or []:
        for t in d["teams"]:
            team_rec[t["name"]] = t
    fa_keys = {nkey(p["name"]) for p in fa.get("players", [])}
    names = {nkey(e["name"]): e for e in stats.values()}
    cands = []
    for e in stats.values():
        team = (e["teams"] or [None])[-1]
        if not team or team == TEAM["name"] or nkey(e["name"]) in fa_keys:
            continue
        tr = team_rec.get(team) or {}
        h, p = e.get("hitting") or {}, e.get("pitching") or {}
        ok = False
        if e.get("pos") != "P" and (h.get("plateAppearances") or 0) >= 300 and num(h.get("ops")) and num(h.get("ops")) >= .760: ok = True
        if e.get("pos") == "P" and p:
            ip = num(p.get("inningsPitched")) or 0; era = num(p.get("era")) or 9
            if (p.get("gamesStarted") or 0) >= 15 and ip >= 100 and era <= 3.90: ok = True
            if (p.get("gamesStarted") or 0) < 5 and ip >= 40 and era <= 3.00: ok = True
        if not ok:
            continue
        mentions = [r for r in rum if e["name"] in (r["title"] + " " + r["summary"])]
        cands.append({"id": e["id"], "name": e["name"], "pos": e.get("pos"), "age": e.get("age"), "team": team,
                      "teamW": tr.get("w"), "teamL": tr.get("l"), "teamPct": tr.get("pct"), "clinch": tr.get("clinch"),
                      "hit": h or None, "pit": p or None,
                      "rumors": [{"title": r["title"], "url": r["url"], "date": r["date"]} for r in mentions[:3]]})
    tagged = tag_players(rum, sorted({e["name"] for e in stats.values()}))
    return {"candidates": cands, "feed": tagged, "teams": [{"name": k, "w": v["w"], "l": v["l"], "pct": v["pct"], "clinch": v.get("clinch")} for k, v in team_rec.items()]}


def _intl_tx():
    try:
        j = jget(f"{S}/transactions?teamId={BOS}&startDate={SEASON}-01-15&endDate={date.today()}")
        return [{"date": t["date"], "desc": t["description"], "id": (t.get("person") or {}).get("id"), "name": (t.get("person") or {}).get("fullName")}
                for t in j["transactions"] if t.get("typeDesc") == "Signed as Free Agent" and "minor league contract" in t.get("description", "") and t["date"] <= f"{SEASON}-06-30"]
    except Exception as e:
        print("intl tx", e); return []


def international():
    cfg = TEAM.get("intl") or {}
    tx = _intl_tx()
    if cfg.get("type") == "soxprospects":
        url = cfg["url"]
        h = get(url).decode("utf-8", "ignore")
        rows = []
        for r in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S):
            c = [re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", "", x))).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
            if len(c) >= 5 and re.search(r"-\d{4}$", c[4] or ""):
                b = re.sub(r"[^\d]", "", c[3]) if "$" in c[3] else None
                rows.append({"name": c[0].strip('"'), "pos": c[1], "country": c[2], "bonus": int(b) if b else None, "bonus_text": c[3], "month": c[4], "period": int(c[4][-4:])})
        txt = re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", " ", h)))
        def money(lbl):
            m = re.search(lbl + r":?\s*\$([\d,]+)", txt)
            return int(m.group(1).replace(",", "")) if m else None
        dr = re.search(r"Date Range:\s*([A-Za-z]+ \d+, \d{4} to [A-Za-z]+ \d+, \d{4})", txt)
        pool = {"amount": money("Bonus Pool"), "spent": money("Bonus Pool Spent"), "available": money("Bonus Pool Available"),
                "period": dr.group(1) if dr else None, "source": "SoxProspects.com"}
        src = {"name": "SoxProspects.com International Signings", "url": url}
    else:
        # No free per-player bonus source for this club: list official MLB transactions (names/dates only), bonus blank.
        rows = []
        for t in tx:
            pid = t.get("id"); info = {}
            try:
                info = jget(f"{S}/people/{pid}")["people"][0] if pid else {}
            except Exception:
                pass
            if (info.get("birthCountry") or "USA") == "USA":
                continue
            rows.append({"name": t["name"], "pos": (info.get("primaryPosition") or {}).get("abbreviation"), "country": info.get("birthCountry"),
                         "bonus": None, "bonus_text": "not public in a free source", "month": t["date"], "period": SEASON, "age": info.get("currentAge")})
        pool = {"amount": cfg.get("pool"), "spent": None, "available": None, "period": "January 15, 2026 to December 15, 2026", "source": "Baseball America / AP (pool allotment)"}
        src = {"name": "MLB Stats API transactions (non-US-born players signed to minor league deals since Jan 15)", "url": f"{S}/transactions?teamId={BOS}"}
    pool["corroboration"] = cfg.get("corroboration", [])
    pool["note"] = cfg.get("note")
    return {"source": src["name"], "url": src["url"], "pool": pool, "signings": rows, "mlb_tx": tx}


def main_v2():
    if MODE != "full":
        return {}
    st = {}
    try:
        st["prospects.json"] = "updated" if write("prospects.json", prospects()) else "unchanged"
    except Exception as e:
        traceback.print_exc(); st["prospects.json"] = f"FAILED (kept previous): {str(e)[:100]}"
    try:
        stats = all_mlb_stats()
    except Exception as e:
        traceback.print_exc(); stats = None; st["league stats"] = f"FAILED: {e}"
    fa = None
    if stats:
        try:
            fa = free_agents(stats); st["free_agents.json"] = "updated" if write("free_agents.json", fa) else "unchanged"
        except Exception as e:
            traceback.print_exc(); st["free_agents.json"] = f"FAILED (kept previous): {str(e)[:100]}"
        try:
            st["trade_market.json"] = "updated" if write("trade_market.json", trade_market(stats, fa or load("free_agents.json") or {}, load("standings.json"))) else "unchanged"
        except Exception as e:
            traceback.print_exc(); st["trade_market.json"] = f"FAILED (kept previous): {str(e)[:100]}"
    try:
        st["international.json"] = "updated" if write("international.json", international()) else "unchanged"
    except Exception as e:
        traceback.print_exc(); st["international.json"] = f"FAILED (kept previous): {str(e)[:100]}"
    return st


if __name__ == "__main__":
    main()
