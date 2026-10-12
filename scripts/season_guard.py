"""Season guard: current-season + same-day roster validation (shared across Sports Labs repos).

Rule: anything describing a CURRENT team, role, roster, injury or lineup must come from the
current season (derived from today's date, never hardcoded) and match today's live roster source.
Prior-season data is allowed only for labeled historical uses (baselines, priors, backtests,
shrinkage) and is never checked as a current assignment here.

Writes data/season_guard.json. Emits ::warning / ::error annotations. Exits 1 on conflicts
(workflows run this step with continue-on-error so data still publishes but the run is flagged).
"""
import datetime as dt, glob, json, os, re, sys, unicodedata, urllib.request
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
NOW = dt.datetime.now(ET)
TODAY = NOW.date()

def nfl_season(d=TODAY): return d.year if d.month >= 3 else d.year - 1          # league year starts March
def mlb_season(d=TODAY): return d.year
def nhl_season(d=TODAY):
    y = d.year if d.month >= 7 else d.year - 1                                     # season id flips July 1
    return y * 10000 + y + 1
SEASON = {"nfl": nfl_season(), "mlb": mlb_season(), "nhl": nhl_season()}

def get(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "sports-labs-season-guard"})
        with urllib.request.urlopen(req, timeout=20) as r: return json.load(r)
    except Exception as e:
        print("::warning::season_guard fetch failed %s (%s)" % (url, e)); return None

NICK = {"nate": "nathan", "nick": "nicholas", "greg": "gregory", "tom": "thomas", "hollywood": "marquise", "mike": "michael",
        "matt": "matthew", "chris": "christopher", "josh": "joshua", "jon": "jonathan", "dan": "daniel", "ben": "benjamin",
        "zach": "zachary", "alex": "alexander", "tony": "anthony", "joe": "joseph", "will": "william", "rob": "robert",
        "bob": "robert", "jake": "jacob", "sam": "samuel", "cam": "cameron", "tj": "tj", "dj": "dj"}

def keys(n):
    """All name variants: normalized + first-name nickname/formal swaps."""
    b = norm(n); out = {b}
    w = b.split(" ", 1)
    if len(w) == 2:
        for k, v in NICK.items():
            if w[0] == k: out.add(v + " " + w[1])
            if w[0] == v: out.add(k + " " + w[1])
    return out

def norm(n):
    n = unicodedata.normalize("NFKD", n or "").encode("ascii", "ignore").decode().lower()
    n = re.sub(r"[^a-z ]", "", n.replace("-", " "))
    return " ".join(w for w in n.split() if w not in ("jr", "sr", "ii", "iii", "iv", "v"))

# ---------------- live rosters (fetched fresh every run; no caching) ----------------
_R = {}
ALIAS = {"nfl": {"WAS": "WSH", "JAC": "JAX", "LA": "LAR"}, "nhl": {"NJ": "NJD", "SJ": "SJS", "TB": "TBL", "LA": "LAK", "UTAH": "UTA", "MON": "MTL"}, "mlb": {"AZ": "ARI", "CHW": "CWS", "ATH": "ATH", "OAK": "ATH"}}

def roster(sport, team):
    team = ALIAS[sport].get(team, team)
    key = (sport, team)
    if key in _R: return _R[key]
    out = None
    if sport == "nfl":
        teams = _R.get("nflteams")
        if teams is None:
            d = get("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams") or {}
            teams = {t["team"]["abbreviation"]: t["team"]["id"] for t in d.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", [])}
            _R["nflteams"] = teams
        if team in teams:
            d = get("https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/%s/roster" % teams[team])
            if d:
                yr = (d.get("season") or {}).get("year")
                if yr != SEASON["nfl"]: print("::error::ESPN roster for %s reports season %s, expected %s" % (team, yr, SEASON["nfl"]))
                out = {"season": yr, "ids": set(), "names": set()}
                for g in d.get("athletes", []):
                    for a in g.get("items", []):
                        out["ids"].add(str(a["id"])); out["names"] |= keys(a["displayName"])
                # core team list also carries practice-squad / IR / reserve players the site roster omits
                c = get("https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/%d/teams/%s/athletes?limit=300" % (SEASON["nfl"], teams[team])) or {}
                for it in c.get("items", []):
                    m = re.search(r"athletes/(\d+)", it.get("$ref", ""))
                    if m: out["ids"].add(m.group(1))
    elif sport == "nhl":
        d = get("https://api-web.nhle.com/v1/roster/%s/%s" % (team, SEASON["nhl"]))
        if d:
            out = {"season": SEASON["nhl"], "ids": set(), "names": set()}
            for grp in ("forwards", "defensemen", "goalies"):
                for a in d.get(grp, []):
                    out["ids"].add(str(a["id"])); out["names"] |= keys(a["firstName"]["default"] + " " + a["lastName"]["default"])
    elif sport == "mlb":
        teams = _R.get("mlbteams")
        if teams is None:
            d = get("https://statsapi.mlb.com/api/v1/teams?sportId=1&season=%d" % SEASON["mlb"]) or {}
            teams = {t["abbreviation"]: t["id"] for t in d.get("teams", [])}
            _R["mlbteams"] = teams
        if team in teams:
            out = {"season": SEASON["mlb"], "ids": set(), "names": set()}
            for rt in ("active", "40Man"):
                d = get("https://statsapi.mlb.com/api/v1/teams/%s/roster?rosterType=%s&date=%s" % (teams[team], rt, TODAY)) or {}
                for a in d.get("roster", []):
                    out["ids"].add(str(a["person"]["id"])); out["names"] |= keys(a["person"]["fullName"])
    _R[key] = out
    return out

_SL = None
def sleeper_team(name):
    """Live Sleeper player DB (includes practice squad/reserve): set of current teams for this name."""
    global _SL
    if _SL is None:
        _SL = {}
        for p in (get("https://api.sleeper.app/v1/players/nfl") or {}).values():
            if p.get("team") and p.get("active"):
                for k in keys(p.get("full_name") or ""): _SL.setdefault(k, set()).add(p["team"])
    return set().union(*[_SL.get(k, set()) for k in keys(name)])

def fallback(sport, name, team, pid, native):
    team = ALIAS[sport].get(team, team)
    if sport == "nfl":
        if pid and native:
            d = get("https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/%d/athletes/%s" % (SEASON["nfl"], pid)) or {}
            m = re.search(r"teams/(\d+)", (d.get("team") or {}).get("$ref", ""))
            st = (d.get("status") or {}).get("name") or ""
            if m and st not in ("Free Agent", "Inactive", "Retired") and _R.get("nflteams", {}).get(team) == m.group(1): return "espn athlete (%s)" % ((d.get("status") or {}).get("name") or "listed")
        t = {ALIAS["nfl"].get(x, x) for x in sleeper_team(name)}
        if not (pid and native) and team in t:  # name-only rows (no ESPN id): Sleeper is the live tiebreak
            return "sleeper live (practice squad/reserve)"
    if sport == "nhl":
        import urllib.parse
        for p in get("https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=5&q=" + urllib.parse.quote(name)) or []:
            if p.get("teamAbbrev") == team and (not pid or str(p.get("playerId")) == str(pid) or norm(p.get("name")) == norm(name)):
                return "nhl org (reserve/AHL list)"
    return None

def on_team(sport, name, team, pid=None, native=False):
    """(ok, via) — is this player on this team's live current-season roster (incl. IR/PS/reserve)?"""
    r = roster(sport, team)
    if r is None: return None, "roster unavailable"
    if (native and pid is not None and str(pid) in r["ids"]) or bool(keys(name) & r["names"]): return True, "roster"
    via = fallback(sport, name, team, pid, native)
    return (True, via) if via else (False, None)

# ---------------- checks ----------------
REPORT = {"generated": NOW.isoformat(timespec="seconds"), "seasons": SEASON, "checked": 0,
          "conflicts": [], "unverified": [], "stale": [], "notes": []}

def check_players(sport, src, rows):
    """rows: iterable of (name, team, id_or_None, id_is_native_bool)."""
    seen = set()
    for name, team, pid, native in rows:
        if not name or not team or (name, team) in seen: continue
        seen.add((name, team))
        r = roster(sport, team)
        REPORT["checked"] += 1
        if r is None:
            REPORT["unverified"].append({"src": src, "player": name, "team": team}); continue
        ok = (native and pid is not None and str(pid) in r["ids"]) or bool(keys(name) & r["names"])
        if not ok:
            via = fallback(sport, name, team, pid, native)
            if via:
                REPORT.setdefault("resolved", []).append({"src": src, "player": name, "team": team, "via": via}); continue
            REPORT["conflicts"].append({"src": src, "sport": sport, "player": name, "team": team,
                                        "why": "not on %s live %s roster for %s" % (team, SEASON[sport], TODAY)})

def check_season_field(src, got, sport):
    if got is not None and got != SEASON[sport]:
        REPORT["conflicts"].append({"src": src, "why": "season field %s != current %s" % (got, SEASON[sport])})

def check_fresh(src, stamp, game_today=True):
    """Game-day data must be fetched today (ET)."""
    if not game_today: return
    try:
        s = stamp.replace("Z", "+00:00")
        t = dt.datetime.fromisoformat(s if ("+" in s[10:] or "-" in s[10:]) else s + "+00:00").astimezone(ET)
    except Exception:
        REPORT["stale"].append({"src": src, "why": "no parseable fetch time (%r)" % stamp}); return
    if t.date() != TODAY:
        REPORT["stale"].append({"src": src, "why": "fetched %s, not today %s" % (t.date(), TODAY)})

def ld(p, d=None):
    try: return json.load(open(p))
    except Exception: return d

def et_date(s):
    try: return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(ET).date()
    except Exception: return None

def upcoming(t):  # game is today or later (current picks), not already-settled history
    d = et_date(t or ""); return d is not None and d >= TODAY

# ---------------- per-repo extractors ----------------
def bet_lab():
    for sp in ("nfl", "nhl", "mlb"):
        P = [p for p in ld("data/props_%s.json" % sp, []) if upcoming(p.get("time"))]
        check_players(sp, "props_%s.json" % sp, ((p["player"], p["team"], p.get("aid"), sp == "nfl") for p in P))
        if P: check_fresh("props_%s.json" % sp, max((p.get("upd") or "") for p in P) or "", any(et_date(p["time"]) == TODAY for p in P))

def fantasy_frontier():
    for f in ("slate_mon", "slate_sun"):
        s = ld("data/%s.json" % f)
        if not s or s.get("stale"): continue
        g_today = any(et_date(g.get("time", "")) == TODAY for g in s.get("games", []))
        if not any(upcoming(g.get("time")) for g in s.get("games", [])): continue
        check_fresh(f + ".json", s.get("fetched", ""), g_today)
        check_players("nfl", f + ".json", ((p["name"], p["team"], None, False) for p in s.get("players", []) if p.get("pos") != "DST"))

def nhl_lab():
    m = ld("data/meta.json", {}); check_season_field("meta.json", m.get("season"), "nhl")
    s = ld("data/slate.json", {})
    rows = [r for r in s.get("rows", []) if r.get("date", "") >= str(TODAY)]
    check_players("nhl", "slate.json", ((r["name"], r["team"], r.get("pid"), True) for r in rows))
    g = [x for x in s.get("goalies", []) if x.get("date", "") >= str(TODAY)]
    check_players("nhl", "slate.json:goalies", ((x["goalie"], x["team"], x.get("gid_"), True) for x in g))
    if any(r.get("date") == str(TODAY) for r in rows): check_fresh("meta.json", m.get("updated", ""))

def mlb_lab():
    m = ld("data/meta.json", {}); check_season_field("meta.json", m.get("season"), "mlb")
    h = ld("data/hr_scores.json", {})
    if h.get("date", "") >= str(TODAY):
        check_fresh("hr_scores.json", h.get("generated", ""), h.get("date") == str(TODAY))
        check_players("mlb", "hr_scores.json", ((p["name"], p["team"], p.get("id"), True) for p in h.get("players", [])))
    k = ld("data/k_projections.json", {})
    if isinstance(k, dict) and k.get("date", "") >= str(TODAY):
        rows = k.get("pitchers") or k.get("players") or []
        check_players("mlb", "k_projections.json", ((p.get("name"), p.get("team"), p.get("id"), True) for p in rows if isinstance(p, dict)))
    s = ld("data/slate.json", {})
    if s.get("date", "") >= str(TODAY):
        for gm in s.get("games", []):
            for side in ("home", "away"):
                sp = (gm.get("sp") or {}).get(side)
                if sp:
                    r = roster("mlb", gm[side]); REPORT["checked"] += 1
                    if r and str(int(sp)) not in r["ids"]:
                        REPORT["conflicts"].append({"src": "slate.json:sp", "player": int(sp), "team": gm[side], "why": "probable SP not on today's roster"})

def ffo():
    p = ld("data/players.json", {})
    check_fresh("players.json", p.get("updated", ""))
    rows = [(v["n"], v["t"], v.get("e"), bool(v.get("e"))) for v in (p.get("data") or {}).values() if v.get("t") and v.get("p") in ("QB", "RB", "WR", "TE", "K")]
    check_players("nfl", "players.json", rows)

def eagles():
    r = ld("data/roster.json", {})
    check_players("nfl", "roster.json", ((a["name"], "PHI", a.get("espnId"), True) for a in r.get("data", [])))

def gm_hub():
    t = open("team.js").read() if os.path.exists("team.js") else ""
    ab = (re.search(r'"abbr":\s*"(\w+)"', t) or [None, None])[1]
    r = ld("data/roster.json", {})
    check_players("mlb", "roster.json", ((a["name"], ab, a.get("id"), True) for a in r.get("data", [])))

def arb_lab():
    m = ld("data/meta.json", {}); check_fresh("meta.json", m.get("updated", ""))
    REPORT["notes"].append("arb-lab prices markets only (no rosters); freshness check only")

REPOS = {"bet-lab": bet_lab, "fantasy-frontier": fantasy_frontier, "nhl-lab": nhl_lab, "mlb-lab": mlb_lab,
         "fantasy-front-office": ffo, "eagles-gm-lab-live": eagles, "cubs-gm-hub": gm_hub,
         "orioles-gm-hub": gm_hub, "redsox-gm-hub": gm_hub, "arb-lab": arb_lab}

# ---------------- static scan: hardcoded past seasons in fetch code ----------------
def scan():
    pat = re.compile(r"\b(20[12]\d)(\d{4})?\b")
    for f in glob.glob("scripts/*.py"):
        if f.endswith("season_guard.py"): continue
        for i, line in enumerate(open(f, errors="ignore"), 1):
            if "HISTORICAL" in line or line.lstrip().startswith("#"): continue
            for m in pat.finditer(line):
                y = int(m.group(1))
                if y < SEASON["mlb"] and re.search(r"season|seasons/|year|roster|depth|injur", line, re.I):
                    REPORT["notes"].append("unlabeled prior-season literal %s:%d: %s" % (f, i, line.strip()[:120]))

def main():
    repo = (os.environ.get("GITHUB_REPOSITORY", "") or os.getcwd()).split("/")[-1]
    fn = REPOS.get(repo)
    if not fn: print("season_guard: no extractor for %s" % repo); return 0
    fn(); scan()
    os.makedirs("data", exist_ok=True)
    old = ld("data/season_guard.json", {}) or {}
    if {k: v for k, v in old.items() if k != "generated"} != json.loads(json.dumps({k: v for k, v in REPORT.items() if k != "generated"}, default=str)):
        json.dump(REPORT, open("data/season_guard.json", "w"), indent=1, default=str)  # only rewrite when findings change
    for c in REPORT["conflicts"][:50]: print("::error::season_guard %s" % json.dumps(c))
    for s in REPORT["stale"]: print("::warning::season_guard stale %s" % json.dumps(s))
    for n in REPORT["notes"]: print("::warning::season_guard %s" % n)
    if REPORT["unverified"]: print("::warning::season_guard %d players unverified (roster source unavailable)" % len(REPORT["unverified"]))
    print("season_guard %s: seasons=%s checked=%d conflicts=%d stale=%d unverified=%d" % (
        repo, SEASON, REPORT["checked"], len(REPORT["conflicts"]), len(REPORT["stale"]), len(REPORT["unverified"])))
    return 1 if REPORT["conflicts"] else 0

if __name__ == "__main__": sys.exit(main())
