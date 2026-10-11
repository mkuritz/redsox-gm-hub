#!/usr/bin/env python3
"""Red Sox GM Hub data fetcher. MODE=full (default) or MODE=news (news/rumors/transactions/injuries only).
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
UA = {"User-Agent": "Mozilla/5.0 (redsox-gm-hub personal demo; github.com/mkuritz)"}
S = "https://statsapi.mlb.com/api/v1"
BOS = 111
AFFIL = [  # (level, sportId, teamId, name)
    ("AAA", 11, 533, "Worcester Red Sox"), ("AA", 12, 546, "Portland Sea Dogs"),
    ("High-A", 13, 428, "Greenville Drive"), ("Low-A", 14, 414, "Salem RidgeYaks"),
    ("Complex (FCL)", 16, 471, "FCL Red Sox"), ("DSL", 16, 626, "DSL Red Sox Blue"), ("DSL", 16, 627, "DSL Red Sox Red")]
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
    j = jget("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news?team=bos&limit=40")
    out = []
    for a in j.get("articles", []):
        out.append({"title": a.get("headline"), "url": ((a.get("links") or {}).get("web") or {}).get("href"),
                    "date": a.get("published"), "summary": (a.get("description") or "")[:320], "source": "ESPN", "kind": "news"})
    return out


def espn_injuries():
    j = jget("https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries")
    out = []
    for t in j.get("injuries", []):
        if "Red Sox" not in (t.get("displayName") or ""):
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
                      "front office": ["breslow", "front office", "manager", "coach", "cora"], "cba": ["cba", "lockout", "collective bargaining"]}.items()
                      if any(w in low for w in words)]
    return items


MLB_NAMES = set()


def news_and_rumors(names):
    news, rumors, srcs = [], [], []
    for fn, label in ((lambda: espn_news(), "ESPN Red Sox news API"),
                      (lambda: rss("https://www.mlb.com/redsox/feeds/news/rss.xml", "MLB.com", "news"), "MLB.com Red Sox RSS")):
        try:
            x = fn(); news += x; srcs.append({"name": label, "ok": True, "n": len(x)})
        except Exception as e:
            srcs.append({"name": label, "ok": False, "err": str(e)[:120]})
    try:
        x = rss("https://www.mlbtraderumors.com/boston-red-sox/feed", "MLB Trade Rumors", "rumor")
        rumors += x; srcs.append({"name": "MLB Trade Rumors - Red Sox RSS", "ok": True, "n": len(x)})
    except Exception as e:
        srcs.append({"name": "MLB Trade Rumors - Red Sox RSS", "ok": False, "err": str(e)[:120]})
    def relevant(it):
        if it["source"] != "ESPN":
            return True
        t = (it.get("title") or "") + " " + (it.get("summary") or "")
        return "Red Sox" in t or "Boston" in t or any(n in t for n in MLB_NAMES)
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
    meta = {"lastRun": now_et(), "mode": MODE, "status": status,
            "lastFull": now_et() if MODE == "full" else (meta or {}).get("lastFull")}
    json.dump({"updated": now_et(), "data": meta}, open(os.path.join(DATA, "meta.json"), "w"), indent=1)
    print(json.dumps(status, indent=1))


if __name__ == "__main__":
    main()
