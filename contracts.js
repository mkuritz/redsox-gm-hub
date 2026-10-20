/* Contract editor + "Contracts needing review" for MLB Strategy Planner (Cap Center).
   Hand-kept rows live in data/contracts_manual.json. Your edits stay in this browser (localStorage) until you
   export them and commit the file. No tokens are ever requested or stored. */
(() => {
const CFG = window.PLANNER; if (CFG.kind === 'nfl') return;
const KEY = CFG.lsPrefix + 'contracts:v1'; const STALE_DAYS = 90; const YRS = [2026, 2027, 2028, 2029, 2030, 2031, 2032];
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const today = () => new Date().toISOString().slice(0, 10);
const days = (d) => d ? Math.floor((Date.now() - Date.parse(d + 'T12:00:00')) / 864e5) : null;
const E = { load() { try { return JSON.parse(localStorage.getItem(KEY)) || { upsert: {}, remove: [] }; } catch (e) { return { upsert: {}, remove: [] }; } } };
let ED = E.load(); const saveE = () => localStorage.setItem(KEY, JSON.stringify(ED));
let BASE = null; // original file
const M = (v) => v == null || v === '' ? '' : (v / 1e6).toFixed(3).replace(/\.?0+$/, '');
const money = (v) => v == null || v === '' ? '—' : '$' + (v / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';

function merged() {
  const rows = BASE.contracts.filter((c) => !ED.remove.includes(norm(c.name))).map((c) => ED.upsert[norm(c.name)] ? { ...ED.upsert[norm(c.name)], _you: true } : { ...c });
  Object.entries(ED.upsert).forEach(([k, r]) => { if (!BASE.contracts.some((c) => norm(c.name) === k)) rows.push({ ...r, _you: true, _new: true }); });
  return rows;
}
function fileOut() { const c = merged().map(({ _you, _new, ...r }) => r); return { ...BASE, updated: today(), contracts: c }; }
function patchOut() { return { _patch_for: 'data/contracts_manual.json', _how: 'upsert rows replace the row with the same name (or are added); remove lists names to delete. Apply with: python scripts/apply_contract_patch.py patch.json', repo: (window.TEAM || {}).repo, generated: today(), upsert: Object.values(ED.upsert), remove: ED.remove }; }

function reviewList(ctx) {
  const B = ctx.B, ck = B.checks || {}; const rows = merged(); const out = [];
  const byName = Object.fromEntries(rows.map((r) => [norm(r.name), r]));
  const onRoster = new Set((B.rosRaw || []).map((p) => norm(p.name)));
  rows.forEach((r) => {
    const age = days(r.accessed);
    if (!r.source || !r.accessed) out.push({ sev: 'hi', who: r.name, why: 'Missing source or date', date: '' });
    else if (age > STALE_DAYS) out.push({ sev: 'mid', who: r.name, why: `Stale — last verified ${r.accessed} (${age} days ago)`, date: r.accessed });
  });
  (ck.transactions || []).forEach((t) => {
    const k = norm(t.player); const r = byName[k];
    if (r && r.accessed && t.date <= r.accessed) return; // row verified after the event
    const listed = !!r, ros = onRoster.has(k);
    if (t.keyword) return out.push({ sev: 'hi', who: t.player || '—', why: 'Contract event in transactions feed', ev: t });
    if (listed && ['TR', 'REL', 'DFA', 'CLW', 'RET'].includes(t.code)) return out.push({ sev: 'hi', who: t.player, why: `Listed contract — ${t.type.toLowerCase()} since last verified`, ev: t });
    if (!listed && t.code === 'SFA' && ros) return out.push({ sev: 'mid', who: t.player, why: 'MLB free-agent signing on 40-man with no hand-kept contract row', ev: t });
    if (!listed && t.code === 'TR' && ros && /acquired|traded/i.test(t.desc)) return out.push({ sev: 'low', who: t.player, why: 'Acquired by trade — add contract if guaranteed beyond minimum', ev: t });
  });
  (B.arbRaw || []).forEach((a) => { if (byName[norm(a.name)]) out.push({ sev: 'low', who: a.name, why: `Has a hand-kept row and an MLBTR arbitration projection (${money(a.proj)}) — confirm which applies for 2027`, date: '' }); });
  const rank = { hi: 0, mid: 1, low: 2 }; return out.sort((a, b) => rank[a.sev] - rank[b.sev] || String((b.ev || {}).date || '').localeCompare(String((a.ev || {}).date || '')));
}

const F = [['name', 'Player', 'text'], ['type', 'Type (FA, Extension, Arb, Pre-arb…)', 'text'], ['years', 'Years', 'number'], ['total', 'Total $M', 'm'], ['aav_cbt', 'CBT value / AAV $M', 'm'], ['signing_bonus', 'Signing bonus $M', 'm'], ['ends', 'Last guaranteed season', 'number'], ['options', 'Options (club/player/mutual, buyouts)', 'text'], ['opt_outs', 'Opt-outs', 'text'], ['notes', 'Notes', 'text'], ['source', 'Source (required), e.g. cap tracker', 'text'], ['accessed', 'Date verified (required)', 'date'], ['source_url', 'Source URL', 'text']];

function form(ctx, r) { r = r || {}; const esc = ctx.esc;
  const inp = ([k, l, t]) => `<label class="small" style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:${t === 'text' ? 180 : 110}px">${l}<input id="ce_${k}" ${t === 'number' ? 'type="number"' : t === 'm' ? 'type="number" step="0.001"' : t === 'date' ? 'type="date"' : ''} value="${esc(t === 'm' ? M(r[k]) : r[k] == null ? '' : r[k])}" ${k === 'source' || k === 'accessed' || k === 'name' ? 'required' : ''}></label>`;
  return `<div class="stack" style="gap:10px"><input type="hidden" id="ce_orig" value="${esc(r.name || '')}">
  <div class="row" style="flex-wrap:wrap;gap:8px">${F.slice(0, 7).map(inp).join('')}</div>
  <div class="small muted">Salary by year ($M, blank = none)</div><div class="row" style="flex-wrap:wrap;gap:8px">${YRS.map((y) => `<label class="small" style="display:flex;flex-direction:column;gap:3px;width:90px">${y}<input id="ce_y${y}" type="number" step="0.001" value="${M(r['y' + y])}"></label>`).join('')}</div>
  <div class="row" style="flex-wrap:wrap;gap:8px">${F.slice(7).map(inp).join('')}</div>
  <div class="row"><button class="btn sm primary" data-a="ceSave">Save row (You)</button>${r.name ? `<button class="btn sm danger" data-a="ceDel" data-n="${esc(r.name)}">Remove from file</button>` : ''}<button class="btn sm ghost" data-a="ceNew">Clear form</button></div></div>`; }

function tag(r, ctx) { const age = days(r.accessed); const stale = age != null && age > STALE_DAYS;
  return `<span class="tag ${r._you ? 'd' : 'v'}" title="${r._you ? 'Edited by you in this browser (not yet committed)' : 'From data/contracts_manual.json'}">${ctx.esc(r.source ? r.source.split(/[;(]/)[0].trim() : 'No source')}, ${ctx.esc(r.accessed || 'no date')}</span>${stale ? ` <span class="tag" style="background:var(--neg);color:#fff" title="Verified more than ${STALE_DAYS} days ago">Stale</span>` : ''}${!r.source || !r.accessed ? ' <span class="tag" style="background:var(--neg);color:#fff">Unsourced</span>' : ''}`; }

window.PLANNER_EXT = {
  tab: ['contracts', 'Contracts / Cap Center'],
  merge(cm) { BASE = JSON.parse(JSON.stringify(cm)); const rows = merged().map((r) => ({ ...r, ends: r.ends || Math.max(0, ...YRS.filter((y) => r['y' + y])) || null })); return rows; },
  view(ctx) { const { card, esc } = ctx; const rows = merged(); const rv = reviewList(ctx); const cur = ctx.S.ui.ce ? rows.find((r) => r.name === ctx.S.ui.ce) : null; const repo = (window.TEAM || {}).repo || ''; const ck = ctx.B.checks || {}; const n = Object.keys(ED.upsert).length + ED.remove.length;
    const sevTag = (s) => `<span class="tag" style="background:${s === 'hi' ? 'var(--neg)' : s === 'mid' ? 'var(--accent)' : 'var(--silver)'};color:${s === 'low' ? '#111' : '#fff'}">${s === 'hi' ? 'Update' : s === 'mid' ? 'Check' : 'Confirm'}</span>`;
    return `<div class="stack">
    ${card('Contracts needing review', `${rv.length} item${rv.length === 1 ? '' : 's'} · auto-checked against official MLB data transactions (${esc((ck.transactions || []).length)} contract-type events, last ${esc(ck.window_days || 400)} days)`, rv.length ? `<div class="table-wrap"><table class="tight" id="reviewTbl"><tbody>${rv.map((x) => `<tr><td>${sevTag(x.sev)}</td><td><b>${esc(x.who)}</b></td><td class="small">${esc(x.why)}${x.ev ? `<div class="muted">${esc(x.ev.date)} · ${esc(x.ev.desc)} <span class="tag v">Sourced</span></div>` : ''}</td><td>${x.who && x.who !== '—' ? `<button class="btn sm" data-a="ceEdit" data-n="${esc(x.who)}">${rows.some((r) => norm(r.name) === norm(x.who)) ? 'Edit' : 'Add'}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Nothing flagged — every row is sourced, recent and consistent with the transactions feed.</div>')}
    <div class="grid sidebar-right"><div class="stack">
    ${card('Hand-kept contracts', `data/contracts_manual.json · ${rows.length} rows · stale after ${STALE_DAYS} days`, `<div class="table-wrap"><table class="tight" id="ceTbl"><thead><tr><th>Player</th><th class="num">Yrs</th><th class="num">Total</th><th class="num">CBT AAV</th>${YRS.slice(0, 5).map((y) => `<th class="num">${y}</th>`).join('')}<th>Options / opt-outs</th><th>Source, date</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${esc(r.name)}</b><div class="small muted">${esc(r.type || '')}</div></td><td class="num">${esc(r.years || '')}</td><td class="num">${money(r.total)}</td><td class="num">${money(r.aav_cbt)}</td>${YRS.slice(0, 5).map((y) => `<td class="num">${money(r['y' + y])}</td>`).join('')}<td class="small">${esc([r.options, r.opt_outs ? 'Opt-out: ' + r.opt_outs : '', r.signing_bonus ? 'Bonus ' + money(r.signing_bonus) : ''].filter(Boolean).join(' · ') || '—')}</td><td class="small">${tag(r, ctx)}</td><td><button class="btn sm" data-a="ceEdit" data-n="${esc(r.name)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`)}
    </div><div class="stack">
    ${card(cur ? 'Edit contract' : 'Add / update contract', 'Source and date are required', form(ctx, cur || (ctx.S.ui.ceNew ? { name: ctx.S.ui.ceNew } : null)))}
    ${card('Commit your changes', n ? `${n} pending change${n === 1 ? '' : 's'} (only in this browser)` : 'No pending changes', `<div class="row" style="flex-wrap:wrap"><button class="btn sm primary" data-a="ceFile" ${n ? '' : 'disabled'}>Download full contracts_manual.json</button><button class="btn sm" data-a="cePatch" ${n ? '' : 'disabled'}>Download JSON patch</button><button class="btn sm" data-a="ceCopy" ${n ? '' : 'disabled'}>Copy full file</button><button class="btn sm ghost" data-a="ceReset" ${n ? '' : 'disabled'}>Discard edits</button></div>
      <ol class="small" style="margin:10px 0 0;padding-left:18px;line-height:1.6"><li>Click <b>Copy full file</b> or <b>Download</b> (or the JSON patch).</li><li>Send the file to your Sports Labs maintainer (or apply the patch with <code>python scripts/apply_contract_patch.py patch.json</code> if you maintain the hub locally).</li><li>After the next data refresh, click <b>Discard edits</b> here.</li></ol>
      <p class="small muted" style="margin:8px 0 0">This page only exports — it never writes to the live site from the browser.</p>`)}
    ${card('Cross-check sources', '', `<div class="small" style="line-height:1.7"><div><b>official MLB data transactions</b> <span class="tag v">Auto</span> — signings, trades, releases, elections of free agency; checked daily.</div><div><b>MLB Trade Rumors arbitration projections</b> <span class="tag v">Auto</span> — ${(ctx.B.arbRaw || []).length} players merged into the 2027 plan as <span class="tag e">Est.</span></div><div><b>Cot's Baseball Contracts</b> <span class="tag">Reference</span> — ${esc((ck.cots || {}).bot_wall ? 'behind an anti-bot challenge, so not fetched' : 'not fetched')}; <a href="${esc((ck.cots || {}).url || 'https://legacy.baseballprospectus.com/compensation/cots/')}" target="_blank" rel="noopener">open Cot's</a>.</div><div><b>cap tracker</b> <span class="tag">Manual</span> — not scraped; verify by hand and cite it, e.g. "cap tracker, ${today()}".</div></div>`)}
    </div></div></div>`; },
  click(a, el, ctx) {
    if (!a.startsWith('ce')) return false; const S = ctx.S;
    if (a === 'ceEdit') { const n = el.dataset.n; const r = merged().find((x) => norm(x.name) === norm(n)); S.ui.ce = r ? r.name : null; S.ui.ceNew = r ? null : n; ctx.commit(); document.getElementById('ce_name')?.scrollIntoView({ block: 'center' }); return true; }
    if (a === 'ceNew') { S.ui.ce = null; S.ui.ceNew = null; ctx.commit(); return true; }
    if (a === 'ceSave') { const v = (k) => (document.getElementById('ce_' + k) || {}).value?.trim() ?? ''; const m = (k) => v(k) === '' ? null : Math.round(+v(k) * 1e6);
      const r = { name: v('name'), type: v('type'), years: v('years') === '' ? null : +v('years'), total: m('total'), aav_cbt: m('aav_cbt') };
      YRS.forEach((y) => { r['y' + y] = m('y' + y); });
      Object.assign(r, { options: v('options'), opt_outs: v('opt_outs'), signing_bonus: m('signing_bonus'), notes: v('notes'), source: v('source'), source_url: v('source_url'), accessed: v('accessed'), ends: v('ends') === '' ? (Math.max(0, ...YRS.filter((y) => r['y' + y])) || null) : +v('ends') });
      if (!r.name) { ctx.toast('Player is required'); return true; }
      if (!r.source || !/^\d{4}-\d{2}-\d{2}$/.test(r.accessed)) { ctx.toast('Source and date (YYYY-MM-DD) are required'); return true; }
      const orig = v('orig'); if (orig && norm(orig) !== norm(r.name)) { delete ED.upsert[norm(orig)]; if (BASE.contracts.some((c) => norm(c.name) === norm(orig))) ED.remove.push(norm(orig)); }
      ED.upsert[norm(r.name)] = r; ED.remove = ED.remove.filter((x) => x !== norm(r.name)); saveE(); S.ui.ce = r.name; S.ui.ceNew = null; ctx.reload('Saved — export to commit'); return true; }
    if (a === 'ceDel') { const k = norm(el.dataset.n); delete ED.upsert[k]; if (BASE.contracts.some((c) => norm(c.name) === k) && !ED.remove.includes(k)) ED.remove.push(k); saveE(); S.ui.ce = null; ctx.reload('Marked for removal'); return true; }
    if (a === 'ceReset') { if (!confirm('Discard all contract edits in this browser?')) return true; ED = { upsert: {}, remove: [] }; saveE(); S.ui.ce = null; ctx.reload('Edits discarded'); return true; }
    const dl = (obj, fn) => { const u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1) + '\n'], { type: 'application/json' })); const l = document.createElement('a'); l.href = u; l.download = fn; l.click(); };
    if (a === 'ceFile') { dl(fileOut(), 'contracts_manual.json'); ctx.toast('Downloaded'); return true; }
    if (a === 'cePatch') { dl(patchOut(), `contracts_patch_${today()}.json`); ctx.toast('Patch downloaded'); return true; }
    if (a === 'ceCopy') { navigator.clipboard.writeText(JSON.stringify(fileOut(), null, 1) + '\n').then(() => ctx.toast('Copied — paste into GitHub editor'), () => ctx.toast('Copy blocked — use Download')); return true; }
    return true; },
  _debug: { merged, reviewList, patchOut, fileOut },
};
})();
