/* Strategy Planner — Sports Labs. "Your organization, all in one place."
   Shared across Eagles (NFL cap) and MLB hubs (CBT). Sourced data comes from the hub's own data/ files;
   everything you type is stored in localStorage and tagged "You". */
(() => {
const CFG = window.PLANNER; const NFL = CFG.kind === 'nfl';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fm = (v, d = 1) => v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + '$' + Math.abs(v).toFixed(d) + 'M';
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
const uid = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const SRC = '<span class="tag v" title="Sourced from the hub data feed">Sourced</span>';
const YOU = '<span class="tag d" title="Entered by you (stored in this browser)">You</span>';
const EST = '<span class="tag e" title="Assumption / estimate">Est.</span>';

/* ---------- load sourced data ---------- */
const J = async (f) => { try { const r = await fetch('data/' + f + '?v=' + (Date.now() >> 16)); if (!r.ok) return null; const j = await r.json(); return j && j.data !== undefined && (j.updated || j._note) ? j.data : j; } catch (e) { return null; } };
const B = {}; // base model
async function load() {
  if (NFL) {
    const cap = await J('cap_manual.json'); const ros = (await J('roster.json')) || [];
    B.years = cap.YEARS; B.limit = Object.fromEntries(B.years.map((y) => [y, cap.LEAGUE_CAP[y]])); B.limitLabel = 'Salary cap';
    B.limitNote = 'NFL cap: 2026 official (NFL.com); 2027+ Spotrac projections (snapshot in cap_manual.json).';
    B.contracts = cap.CONTRACTS.map((c) => ({ id: c.id, name: c.name, pos: c.pos, age: c.age, hits: Object.fromEntries(B.years.map((y) => [y, +(c.hits[y] || 0)])), src: 'sourced' }));
    const listed = (y) => B.contracts.reduce((a, c) => a + c.hits[y], 0);
    B.other = Object.fromEntries(B.years.map((y) => [y, Math.max(0, (cap.SPOTRAC_COMMITTED[y] || 0) - listed(y))])); B.otherLabel = 'Other committed (Spotrac total − listed core)';
    B.cutInfo = Object.fromEntries((cap.CUT_CANDIDATES || []).map((c) => [norm(c.name), c]));
    B.roster = ros.map((p) => ({ name: p.name, pos: grpNFL(p.pos), age: p.age, inj: p.injury, src: 'sourced' }));
    B.targets = { QB: 3, RB: 3, WR: 6, TE: 3, OT: 4, IOL: 5, DL: 6, EDGE: 4, LB: 5, CB: 6, S: 4, K: 1, P: 1, LS: 1 };
    B.coaches = null; B.asOf = 'cap snapshot 2026-10-07 · roster ' + 'ESPN';
  } else {
    const T = window.TEAM; const cm = await J('contracts_manual.json'); const ros = (await J('roster.json')) || []; const arb = await J('arbitration.json'); const co = await J('coaches.json');
    B.years = [2026, 2027, 2028, 2029, 2030]; const th = cm.cbt.thresholds.map((x) => x / 1e6);
    B.limit = Object.fromEntries(B.years.map((y) => [y, th[0]])); B.tiers = th; B.limitLabel = 'CBT threshold (tier 1)';
    B.limitNote = `CBT 2026 thresholds ${th.map((x) => '$' + x + 'M').join(' / ')} (sourced). 2027+ unknown until a new CBA — held flat (estimate).`;
    B.contracts = cm.contracts.filter((c) => c.aav_cbt && c.ends).map((c) => ({ id: 'c_' + norm(c.name).replace(/ /g, '_'), name: c.name, pos: posOf(ros, c.name), hits: Object.fromEntries(B.years.map((y) => [y, y <= c.ends ? c.aav_cbt / 1e6 : 0])), src: 'sourced', note: c.options || '' }));
    const listed26 = B.contracts.reduce((a, c) => a + c.hits[2026], 0);
    B.other = Object.fromEntries(B.years.map((y) => [y, y === 2026 ? Math.max(0, cm.team_payroll.cbt_payroll / 1e6 - listed26) : 0])); B.otherLabel = '2026: rest of CBT payroll (MLBTR total − listed); 2027+: not in free sources';
    B.arb = ((arb && arb.teams && arb.teams[T.name]) || []).map((a) => ({ id: 'arb_' + norm(a.name).replace(/ /g, '_'), name: a.name, pos: posOf(ros, a.name), hits: Object.fromEntries(B.years.map((y) => [y, y === 2027 ? a.proj / 1e6 : 0])), src: 'est', note: 'MLBTR 2027 arbitration projection' }));
    B.contracts = B.contracts.concat(B.arb);
    B.roster = ros.filter((p) => !/60/.test(p.status || '')).map((p) => ({ name: p.name, pos: grpMLB(p), age: p.age, src: 'sourced' }));
    B.targets = { C: 2, '1B': 1, '2B': 1, SS: 1, '3B': 1, OF: 4, UT: 1, SP: 5, RP: 8 };
    B.coaches = co; B.asOf = `payroll MLBTR ${cm.team_payroll.as_of}`;
  }
}
function grpNFL(p) { return ({ G: 'IOL', C: 'IOL', DT: 'DL', DE: 'EDGE', PK: 'K' })[p] || p; }
function grpMLB(p) { if (p.posType === 'Pitcher' || p.pos === 'P') return p.pit && (p.pit.gamesStarted || 0) >= 5 ? 'SP' : 'RP'; if (['LF', 'CF', 'RF', 'OF'].includes(p.pos)) return 'OF'; if (['C', '1B', '2B', 'SS', '3B'].includes(p.pos)) return p.pos; return 'UT'; }
function posOf(ros, name) { const p = ros.find((r) => norm(r.name) === norm(name)); return p ? grpMLB(p) : ''; }

/* ---------- state ---------- */
const KEY = CFG.lsPrefix + 'planner:v1';
const blank = () => ({ moves: [], goals: [], window: { from: B.years[0], to: B.years[0] + 2, label: '' }, staff: [], dev: [], culture: [], checkins: [], scenarios: [], ui: { tab: 'payroll', cmp: [] } });
let S;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const loadS = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.moves) return { ...blank(), ...s, ui: { ...blank().ui, ...(s.ui || {}) } }; } catch (e) {} return blank(); };

/* ---------- engine ---------- */
// move kinds: release, trade (out, retain% MLB / dead NFL), sign (in), extend (replace hits)
function apply(moves) {
  const con = B.contracts.map((c) => ({ ...c, hits: { ...c.hits } })); const ros = B.roster.map((p) => ({ ...p })); const dead = Object.fromEntries(B.years.map((y) => [y, 0]));
  moves.forEach((m) => {
    if (m.kind === 'sign') { con.push({ id: m.id, name: m.name, pos: m.pos, hits: Object.fromEntries(B.years.map((y) => [y, y >= m.from && y < m.from + m.years ? +m.amt : 0])), src: 'you' }); ros.push({ name: m.name, pos: m.pos, src: 'you' }); return; }
    const c = con.find((x) => x.id === m.target); const nm = c ? c.name : m.name;
    if (m.kind === 'extend' && c) { B.years.forEach((y) => { if (y >= m.from) c.hits[y] = y < m.from + m.years ? +m.amt : 0; }); c.src = 'you'; return; }
    if (m.kind === 'release' || m.kind === 'trade') {
      const i = ros.findIndex((r) => norm(r.name) === norm(nm)); if (i >= 0) ros.splice(i, 1);
      if (!c) return;
      B.years.forEach((y) => { if (y < m.from) return; const h = c.hits[y];
        if (NFL) { c.hits[y] = 0; } else if (m.kind === 'trade') { c.hits[y] = h * (+m.retain || 0) / 100; } /* MLB release: owed salary stays on CBT */ });
      if (NFL) { dead[m.from] += +m.dead || 0; if (m.dead2) dead[m.from + 1] = (dead[m.from + 1] || 0) + +m.dead2; }
    }
  });
  const tot = Object.fromEntries(B.years.map((y) => [y, con.reduce((a, c) => a + (c.hits[y] || 0), 0) + B.other[y] + (dead[y] || 0)]));
  const counts = {}; ros.forEach((r) => { counts[r.pos] = (counts[r.pos] || 0) + 1; });
  const needs = Object.entries(B.targets).map(([p, t]) => ({ pos: p, have: counts[p] || 0, target: t, gap: t - (counts[p] || 0) })).sort((a, b) => b.gap - a.gap);
  return { con, ros, dead, tot, room: Object.fromEntries(B.years.map((y) => [y, B.limit[y] - tot[y]])), counts, needs };
}

/* ---------- chart ---------- */
function chart(res, base) {
  const W = 720, H = 280, mL = 52, mB = 30, mT = 20; const ys = B.years; const max = Math.max(...ys.map((y) => Math.max(res.tot[y], base ? base.tot[y] : 0, B.limit[y]))) * 1.1;
  const y = (v) => mT + (H - mT - mB) * (1 - v / max); const bw = (W - mL - 10) / ys.length;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Payroll by year">`;
  for (let i = 0; i <= 4; i++) { const v = max / 4 * i; s += `<g class="grid"><line x1="${mL}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}"/><text x="${mL - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text></g>`; }
  ys.forEach((yr, i) => { const x = mL + bw * i + bw * 0.15, w = bw * 0.32;
    if (base) s += `<rect class="bar" x="${x}" y="${y(base.tot[yr])}" width="${w}" height="${y(0) - y(base.tot[yr])}" fill="var(--silver)" opacity=".45"><title>${yr} before: ${fm(base.tot[yr])}</title></rect>`;
    const after = res.tot[yr]; s += `<rect class="bar" x="${x + (base ? w + 3 : w / 2)}" y="${y(after)}" width="${w}" height="${y(0) - y(after)}" fill="${after > B.limit[yr] ? 'var(--neg)' : 'var(--brand-2)'}"><title>${yr}${base ? ' after' : ''}: ${fm(after)}</title></rect>`;
    s += `<line x1="${x - 6}" x2="${x + 2 * w + 10}" y1="${y(B.limit[yr])}" y2="${y(B.limit[yr])}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 3"/>`;
    s += `<text class="label" x="${x + w}" y="${H - 10}" text-anchor="middle">${yr}</text>`; });
  return s + '</svg>' + `<div class="legend">${base ? '<span><i style="background:var(--silver);opacity:.5"></i>Before</span>' : ''}<span><i style="background:var(--brand-2)"></i>${base ? 'After' : 'Projected'}</span><span><i style="background:var(--neg)"></i>Over ${esc(B.limitLabel)}</span><span><i style="background:var(--accent)"></i>${esc(B.limitLabel)}</span></div>`;
}

/* ---------- views ---------- */
const card = (t, sub, body, extra = '') => `<div class="card"><div class="card-head"><h2>${t}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}${extra}</div>${body}</div>`;
const yearOpts = (v) => B.years.map((y) => `<option ${+v === y ? 'selected' : ''}>${y}</option>`).join('');
const srcTag = (s) => s === 'you' ? YOU : s === 'est' ? EST : SRC;
const moveTxt = (m) => { const c = B.contracts.find((x) => x.id === m.target); const n = c ? c.name : m.name;
  return m.kind === 'sign' ? `Sign/acquire <b>${esc(n)}</b> (${esc(m.pos)}) ${fm(+m.amt)}/yr × ${m.years} from ${m.from}` : m.kind === 'extend' ? `Extend <b>${esc(n)}</b> ${fm(+m.amt)}/yr × ${m.years} from ${m.from}` : m.kind === 'trade' ? `Trade <b>${esc(n)}</b> from ${m.from}${NFL ? ` · dead ${fm(+m.dead || 0)}` : ` · ${m.retain || 0}% retained`}` : `Release <b>${esc(n)}</b> from ${m.from}${NFL ? ` · dead ${fm(+m.dead || 0)}${m.dead2 ? ' + ' + fm(+m.dead2) + ' next yr' : ''}` : ' · salary still owed (stays on CBT)'}`; };

const V = {
  payroll() {
    const base = apply([]); const r = apply(S.moves);
    return `<div class="grid kpis" style="margin-bottom:14px">${B.years.map((y) => `<div class="stat"><div class="stat-label">${y} room</div><div class="stat-value ${r.room[y] < 0 ? 'neg' : 'pos'}">${fm(r.room[y])}</div><div class="stat-sub">${fm(r.tot[y])} vs ${fm(B.limit[y], 0)}</div></div>`).join('')}</div>
    ${card('Multi-year ' + (NFL ? 'cap' : 'payroll / CBT') + ' plan', `${B.years[0]}–${B.years[B.years.length - 1]} · current plan (${S.moves.length} moves)`, chart(r, S.moves.length ? base : null) + `<p class="small muted">${esc(B.limitNote)}</p>`)}
    <div style="margin-top:14px">${card('Contracts in the plan', 'Toggle moves in the Simulator · add your own contract below', `<div class="table-wrap"><table class="tight"><thead><tr><th>Player</th><th>Pos</th>${B.years.map((y) => `<th class="num">${y}</th>`).join('')}<th>Data</th></tr></thead><tbody>${r.con.filter((c) => B.years.some((y) => c.hits[y])).map((c) => `<tr><td><b>${esc(c.name)}</b>${c.note ? `<div class="small muted">${esc(c.note).slice(0, 90)}</div>` : ''}</td><td>${esc(c.pos)}</td>${B.years.map((y) => `<td class="num">${c.hits[y] ? fm(c.hits[y]) : '<span class="muted">—</span>'}</td>`).join('')}<td>${srcTag(c.src)}</td></tr>`).join('')}<tr><td>${esc(B.otherLabel)}</td><td></td>${B.years.map((y) => `<td class="num">${B.other[y] ? fm(B.other[y]) : '<span class="muted">n/a</span>'}</td>`).join('')}<td>${SRC}</td></tr>${NFL ? `<tr><td>Dead money from your moves</td><td></td>${B.years.map((y) => `<td class="num">${r.dead[y] ? fm(r.dead[y]) : '—'}</td>`).join('')}<td>${YOU}</td></tr>` : ''}</tbody><tfoot><tr><td><b>Total</b></td><td></td>${B.years.map((y) => `<td class="num"><b>${fm(r.tot[y])}</b></td>`).join('')}<td></td></tr></tfoot></table></div>`)}</div>
    <div style="margin-top:14px">${card('Add a contract or extension', 'Typed by you — tagged "You"', addForm())}</div>`;
  },
  sim() {
    const base = apply([]); const r = apply(S.moves);
    const needRow = (n, b) => `<tr><td><b>${n.pos}</b></td><td class="num">${b.have}</td><td class="num">${n.have}</td><td class="num">${n.target}</td><td>${n.gap > 0 ? `<span class="tag crit">Need ${n.gap}</span>` : n.gap < 0 ? `<span class="tag">+${-n.gap} surplus</span>` : '<span class="tag hi">Set</span>'}</td></tr>`;
    return `<div class="grid sidebar-right"><div class="stack">
      ${card('Make a move', 'Trade · sign · release · extend — ripples into payroll, depth and needs', moveForm())}
      ${card('Moves in this plan', `${S.moves.length}`, S.moves.length ? S.moves.map((m, i) => `<div class="wire-row"><span class="tag">${m.kind}</span><span>${moveTxt(m)} ${YOU}</span><button class="btn sm ghost" data-a="delMove" data-i="${i}">✕</button></div>`).join('') : '<div class="empty small">No moves yet</div>')}
      ${card('Before vs after', NFL ? 'Cap hit + other commitments + your dead money' : 'CBT payroll', chart(r, base) + `<div class="table-wrap"><table class="tight"><thead><tr><th></th>${B.years.map((y) => `<th class="num">${y}</th>`).join('')}</tr></thead><tbody><tr><td>Before</td>${B.years.map((y) => `<td class="num">${fm(base.tot[y])}</td>`).join('')}</tr><tr><td>After</td>${B.years.map((y) => `<td class="num">${fm(r.tot[y])}</td>`).join('')}</tr><tr><td>Δ room</td>${B.years.map((y) => { const d = r.room[y] - base.room[y]; return `<td class="num ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${d ? (d > 0 ? '+' : '') + fm(d) : '—'}</td>`; }).join('')}</tr></tbody></table></div>`)}
    </div><div class="stack">
      ${card('Depth & roster needs', `Roster ${base.ros.length} → ${r.ros.length} · targets are planning defaults (Est.)`, `<div class="table-wrap"><table class="tight"><thead><tr><th>Pos</th><th class="num">Before</th><th class="num">After</th><th class="num">Target</th><th>Status</th></tr></thead><tbody>${r.needs.map((n) => needRow(n, base.needs.find((x) => x.pos === n.pos))).join('')}</tbody></table></div>`)}
      ${card('Depth chart after moves', '', Object.keys(B.targets).map((p) => `<div class="wire-row"><span class="tag">${p}</span><span class="small">${r.ros.filter((x) => x.pos === p).map((x) => esc(x.name) + (x.src === 'you' ? ' ' + YOU : '')).join(', ') || '<span class="muted">—</span>'}</span><span></span></div>`).join(''))}
    </div></div>`;
  },
  goals() {
    const cols = [['season', 'This season'], ['multi', 'Multi-year'], ['milestone', 'Milestones']];
    const w = S.window;
    return `${card('Contention window', 'Your read of when to push chips in', `<div class="row"><label class="small">From <select data-f="wFrom">${yearOpts(w.from)}</select></label><label class="small">To <select data-f="wTo">${yearOpts(w.to)}</select></label><input data-f="wLabel" placeholder="e.g. Build around the 2027 core" value="${esc(w.label)}" style="flex:1;min-width:200px"> ${YOU}</div>
      <div class="row" style="margin-top:12px;gap:4px">${B.years.map((y) => { const on = y >= w.from && y <= w.to; const rm = apply(S.moves).room[y]; return `<div class="stat" style="flex:1;min-width:90px;${on ? 'border-color:var(--accent);background:rgba(var(--accent-rgb),.12)' : ''}"><div class="stat-label">${y}</div><div class="stat-value" style="font-size:15px">${on ? 'Window' : '—'}</div><div class="stat-sub">room ${fm(rm, 0)}</div></div>`; }).join('')}</div>`)}
    <div class="card" style="margin:14px 0"><div class="card-head"><h2>Add objective / milestone</h2>${YOU}</div><div class="row"><select id="gCol">${cols.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input id="gText" placeholder="Objective" style="flex:1;min-width:200px"><select id="gYear">${yearOpts(B.years[0])}</select><input id="gOwner" placeholder="Owner" style="width:120px"><button class="btn sm primary" data-a="addGoal">Add</button></div></div>
    <div class="tier-grid">${cols.map(([k, l]) => `<div class="card tier-col"><h3>${l} <span class="muted small">${S.goals.filter((g) => g.col === k).length}</span></h3>${S.goals.filter((g) => g.col === k).sort((a, b) => a.year - b.year).map((g) => `<div class="wire-row"><span class="tag ${g.status === 'Done' ? 'hi' : g.status === 'At risk' ? 'crit' : 'med'}">${g.year}</span><span><b>${esc(g.text)}</b><div class="small muted">${esc(g.owner || '')}</div><select data-g="${g.id}" data-f="gStatus">${['Planned', 'In progress', 'At risk', 'Done'].map((s) => `<option ${g.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></span><button class="btn sm ghost" data-a="delGoal" data-id="${g.id}">✕</button></div>`).join('') || '<div class="small muted">Nothing yet</div>'}</div>`).join('')}</div>`;
  },
  people() {
    const co = B.coaches;
    const list = (key, fields, ph) => `<div class="row" style="margin-bottom:8px">${fields.map((f, i) => `<input id="${key}_${f}" placeholder="${ph[i]}" style="flex:1;min-width:120px">`).join('')}<button class="btn sm primary" data-a="addP" data-k="${key}" data-f="${fields.join(',')}">Add</button></div>${S[key].slice().reverse().map((x) => `<div class="wire-row"><span class="tag">${esc(x[fields[0]])}</span><span>${fields.slice(1).map((f) => esc(x[f])).join(' · ')} <span class="small muted">${esc(x.at ? x.at.slice(0, 10) : '')}</span> ${YOU}</span><button class="btn sm ghost" data-a="delP" data-k="${key}" data-id="${x.id}">✕</button></div>`).join('') || '<div class="small muted">Nothing logged yet</div>'}`;
    const tagCounts = {}; S.culture.forEach((c) => { tagCounts[c.tag] = (tagCounts[c.tag] || 0) + 1; });
    return `<div class="grid two"><div class="stack">
      ${card('Coaching staff', co ? `${esc(co.source)} · ${esc(co.updated)}` : 'No free sourced feed for this club — add staff below', co ? `<div class="table-wrap"><table class="tight"><tbody>${co.staff.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td class="small">${esc(s.role)}</td><td class="num">${esc(s.num || '')}</td><td>${SRC}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Not sourced</div>')}
      ${card('Staff you track', 'Front office, scouts, support staff', list('staff', ['role', 'name', 'note'], ['Role', 'Name', 'Note']))}
      ${card('Player development notes', 'Plans, focus areas, progress', list('dev', ['player', 'focus', 'note'], ['Player', 'Focus area', 'Note']))}
    </div><div class="stack">
      ${card('Leadership & culture tags', Object.entries(tagCounts).map(([t, n]) => `${esc(t)} ×${n}`).join(' · ') || 'e.g. Leader, Mentor, Clubhouse glue, Work ethic', list('culture', ['tag', 'person', 'note'], ['Tag', 'Person', 'Why']))}
      ${card('Check-in log', 'Staff & player 1:1s', list('checkins', ['person', 'mood', 'note'], ['Person', 'Pulse (e.g. Good / Watch)', 'Notes']))}
      ${card('Your data', 'All entries in this section are yours and live only in this browser', `<div class="row"><button class="btn sm" data-a="export">Export all planner data (JSON)</button><button class="btn sm" data-a="import">Import</button></div>`)}
    </div></div>`;
  },
  scen() {
    const pick = S.ui.cmp; const cols = [{ name: 'Current plan', moves: S.moves }].concat(S.scenarios.filter((x) => pick.includes(x.id)));
    const rs = cols.map((c) => ({ c, r: apply(c.moves) }));
    return `<div class="grid sidebar-right"><div class="stack">
      ${card('Side-by-side', 'Tick saved scenarios to compare against the current plan', `<div class="table-wrap"><table><thead><tr><th>Metric</th>${rs.map(({ c }) => `<th class="num">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${B.years.map((y) => `<tr><td>${y} ${NFL ? 'cap' : 'CBT'} room</td>${rs.map(({ r }) => `<td class="num ${r.room[y] < 0 ? 'neg' : 'pos'}">${fm(r.room[y])}</td>`).join('')}</tr>`).join('')}<tr><td>Moves</td>${rs.map(({ c }) => `<td class="num">${c.moves.length}</td>`).join('')}</tr><tr><td>Open needs</td>${rs.map(({ r }) => `<td class="num">${r.needs.filter((n) => n.gap > 0).map((n) => n.pos).join(', ') || '—'}</td>`).join('')}</tr><tr><td>Roster size</td>${rs.map(({ r }) => `<td class="num">${r.ros.length}</td>`).join('')}</tr></tbody></table></div>`)}
    </div><div class="stack">
      ${card('Saved scenarios', `${S.scenarios.length}`, `<div class="row" style="margin-bottom:10px"><input id="scName" placeholder="Scenario name" style="flex:1"><button class="btn sm primary" data-a="saveScen">Save current</button></div>${S.scenarios.map((x) => `<div class="scenario-card"><label class="check"><input type="checkbox" data-a="cmp" data-id="${x.id}" ${pick.includes(x.id) ? 'checked' : ''}><span><span class="nm">${esc(x.name)}</span><div class="dt">${x.moves.length} moves · ${esc(x.at.slice(0, 10))}</div></span></label><div class="acts"><button class="btn sm" data-a="loadScen" data-id="${x.id}">Load</button><button class="btn sm danger" data-a="delScen" data-id="${x.id}">✕</button></div></div>`).join('') || '<div class="empty small">None saved yet</div>'}`)}
    </div></div>`;
  },
};
function addForm() { return `<div class="row"><input id="aName" placeholder="Player" style="min-width:140px"><input id="aPos" placeholder="Pos (${Object.keys(B.targets).slice(0, 4).join('/')}…)" style="width:110px"><input id="aAmt" type="number" step="0.1" placeholder="$M / yr" style="width:90px"><select id="aFrom">${yearOpts(B.years[1])}</select><input id="aYears" type="number" min="1" max="5" value="2" style="width:60px" aria-label="Years"><button class="btn sm primary" data-a="addSign">Add</button></div>`; }
function moveForm() {
  const opts = B.contracts.map((c) => `<option value="${c.id}">${esc(c.name)} (${esc(c.pos)})</option>`).join('') + B.roster.filter((p) => !B.contracts.some((c) => norm(c.name) === norm(p.name))).map((p) => `<option value="r:${esc(p.name)}">${esc(p.name)} (${esc(p.pos)}) — no listed contract</option>`).join('');
  return `<div class="stack" style="gap:10px"><div class="seg">${['trade', 'release', 'extend', 'sign'].map((k) => `<button data-a="mk" data-k="${k}" aria-pressed="${(S.ui.mk || 'trade') === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    ${(S.ui.mk || 'trade') === 'sign' ? addForm() : `<div class="row"><select id="mT" style="flex:1;min-width:200px">${opts}</select><label class="small">from <select id="mFrom">${yearOpts(B.years[1])}</select></label>
    ${S.ui.mk === 'extend' ? `<input id="mAmt" type="number" step="0.1" placeholder="$M / yr" style="width:90px"><input id="mYears" type="number" min="1" max="5" value="3" style="width:60px">` : NFL ? `<input id="mDead" type="number" step="0.1" placeholder="Dead $M" style="width:90px"><input id="mDead2" type="number" step="0.1" placeholder="Next-yr dead" style="width:100px">` : (S.ui.mk || 'trade') === 'trade' ? `<input id="mRet" type="number" min="0" max="90" placeholder="% retained" style="width:100px">` : ''}
    <button class="btn sm primary" data-a="addMove">Add move</button></div>
    <p class="small muted" style="margin:0">${NFL ? 'Dead money depends on bonus proration and June 1 timing — enter it (Cut Simulator / Spotrac).' : 'MLB: a released player\'s guaranteed salary stays on the CBT payroll; trading removes it except any cash you retain.'} Figures you type are tagged "You".</p>`}</div>`;
}

/* ---------- shell ---------- */
const TABS = [['payroll', NFL ? 'Cap Scenarios' : 'Payroll / CBT Scenarios'], ['sim', 'Move Simulator'], ['goals', 'Goals & Roadmap'], ['people', 'People & Culture'], ['scen', 'Saved & Compare']];
function render() {
  $('#nav').innerHTML = `<div class="nav-label">Strategy Planner</div>` + TABS.map(([k, l]) => `<button class="nav-btn" data-a="tab" data-k="${k}" ${S.ui.tab === k ? 'aria-current="page"' : ''}><span>${l}</span></button>`).join('') + `<div class="nav-label">Hub</div><a class="nav-btn" href="./" style="text-decoration:none"><span>← Back to ${esc(CFG.hubName)}</span></a>`;
  $('#pageTitle').textContent = TABS.find((t) => t[0] === S.ui.tab)[1];
  $('#main').innerHTML = `<p class="section-sub" style="margin-bottom:14px"><b>Strategy Planner</b> — your organization, all in one place. ${SRC} = from the hub's data feeds (${esc(B.asOf)}) · ${YOU} = typed by you, saved in this browser · ${EST} = estimate.</p>` + V[S.ui.tab]();
}
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function toast(t) { const d = document.createElement('div'); d.className = 'toast ok'; d.textContent = t; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 2500); }
function commit(msg) { save(); render(); if (msg) toast(msg); }
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a;
  if (a === 'tab') { S.ui.tab = el.dataset.k; document.body.classList.remove('sidebar-open'); return commit(); }
  if (a === 'mk') { S.ui.mk = el.dataset.k; return commit(); }
  if (a === 'menu') return document.body.classList.toggle('sidebar-open');
  if (a === 'addMove') { const t = val('mT'); const k = S.ui.mk || 'trade'; const m = { id: uid(), kind: k, from: +val('mFrom') };
    if (t.startsWith('r:')) m.name = t.slice(2); else m.target = t;
    if (k === 'extend') { if (!m.target) return toast('Extensions need a listed contract'); m.amt = +val('mAmt'); m.years = +val('mYears') || 1; if (!m.amt) return toast('Enter $M per year'); }
    if (NFL && k !== 'extend') { m.dead = +val('mDead') || 0; m.dead2 = +val('mDead2') || 0; }
    if (!NFL && k === 'trade') m.retain = +val('mRet') || 0;
    S.moves.push(m); return commit('Move added'); }
  if (a === 'addSign') { const n = val('aName'), amt = +val('aAmt'); if (!n || !amt) return toast('Enter player and $M / yr'); S.moves.push({ id: uid(), kind: 'sign', name: n, pos: (val('aPos') || '?').toUpperCase(), amt, from: +val('aFrom'), years: +val('aYears') || 1 }); return commit('Added to plan'); }
  if (a === 'delMove') { S.moves.splice(+el.dataset.i, 1); return commit(); }
  if (a === 'addGoal') { const t = val('gText'); if (!t) return; S.goals.push({ id: uid(), col: val('gCol'), text: t, year: +val('gYear'), owner: val('gOwner'), status: 'Planned' }); return commit('Objective added'); }
  if (a === 'delGoal') { S.goals = S.goals.filter((g) => g.id !== el.dataset.id); return commit(); }
  if (a === 'addP') { const k = el.dataset.k, fs = el.dataset.f.split(','); const o = { id: uid(), at: new Date().toISOString() }; fs.forEach((f) => { o[f] = val(k + '_' + f); }); if (!o[fs[0]] && !o[fs[1]]) return; S[k].push(o); return commit('Logged'); }
  if (a === 'delP') { S[el.dataset.k] = S[el.dataset.k].filter((x) => x.id !== el.dataset.id); return commit(); }
  if (a === 'saveScen') { const n = val('scName') || `Scenario ${S.scenarios.length + 1}`; S.scenarios.push({ id: uid(), name: n, at: new Date().toISOString(), moves: JSON.parse(JSON.stringify(S.moves)) }); return commit(`Saved “${n}”`); }
  if (a === 'loadScen') { const x = S.scenarios.find((s) => s.id === el.dataset.id); S.moves = JSON.parse(JSON.stringify(x.moves)); return commit(`Loaded “${x.name}”`); }
  if (a === 'delScen') { S.scenarios = S.scenarios.filter((s) => s.id !== el.dataset.id); S.ui.cmp = S.ui.cmp.filter((i) => i !== el.dataset.id); return commit(); }
  if (a === 'cmp') { const id = el.dataset.id; S.ui.cmp = el.checked ? [...new Set([...S.ui.cmp, id])] : S.ui.cmp.filter((i) => i !== id); return commit(); }
  if (a === 'export') { const b = new Blob([JSON.stringify({ app: CFG.lsPrefix + 'planner', exported: new Date().toISOString(), state: { ...S, ui: undefined } }, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = CFG.lsPrefix + 'strategy-planner.json'; l.click(); return toast('Exported'); }
  if (a === 'import') return $('#file').click();
});
document.addEventListener('change', (e) => { const el = e.target; const f = el.dataset.f;
  if (f === 'wFrom') S.window.from = +el.value; else if (f === 'wTo') S.window.to = +el.value; else if (f === 'wLabel') S.window.label = el.value; else if (f === 'gStatus') { const g = S.goals.find((x) => x.id === el.dataset.g); if (g) g.status = el.value; } else return;
  commit(); });
async function init() {
  await load(); S = loadS(); render();
  $('#file').addEventListener('change', (e) => { const fl = e.target.files[0]; if (!fl) return; const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(r.result); if (!o.state || o.app !== CFG.lsPrefix + 'planner') throw 0; S = { ...blank(), ...o.state, ui: S.ui }; commit('Imported'); } catch (x) { toast('Not a planner export for this hub'); } }; r.readAsText(fl); e.target.value = ''; });
  window.PLAN = { apply: () => apply(S.moves), S: () => S, B };
}
init();
})();
