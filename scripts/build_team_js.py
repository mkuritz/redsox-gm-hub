#!/usr/bin/env python3
"""Generate team.js (window.TEAM) from team.json so the static page knows its team."""
import json, os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
t = json.load(open(os.path.join(R, "team.json")))
open(os.path.join(R, "team.js"), "w").write("window.TEAM=" + json.dumps(t, ensure_ascii=False) + ";\n")
