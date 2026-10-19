/* Sports Labs display-text neutralizer (legal/liability wording). Display only:
   rewrites visible text nodes + title/alt/placeholder/aria-label. Never touches data, hrefs, values or code.
   Picks/Recommended -> Highlighted; sportsbook/exchange names -> generic labels; adds responsible-gaming footer. */
(function(){
if(window.__slNeutral)return;window.__slNeutral=1;
var DRAFT=/\b(draft|round|overall|lottery|first[- ]round|second[- ]round|\d+(st|nd|rd|th)[- ]round|top[- ]\d+|No\.\s*\d+)\s+picks?\b/i;
var GMHUB=/^(cubs|orioles|redsox|eagles)\./.test(location.hostname);
var BOOKS=[["DraftKings Sportsbook","DraftKings"],["FanDuel Sportsbook","FanDuel"],["BetMGM"],["Caesars Sportsbook","Caesars"],["Fanatics Sportsbook","Fanatics"],["ESPN BET","ESPN Bet","ESPNBet"],["theScore Bet"],["bet365"],["BetRivers"],["Hard Rock Bet","Hard Rock"],["PointsBet"],["Fliff"],["Bovada"],["BetOnline"],["Unibet"],["WynnBET"],["Borgata"],["PrizePicks"],["Underdog Fantasy"],["SuperDraft"],["Sleeper Picks"]];
var EXCH=["Kalshi","Polymarket","Novig","ProphetX","Sporttrade","Betfair","Crypto.com"];
var ABBR={DK:"DraftKings",FD:"FanDuel",MGM:"BetMGM",CZR:"Caesars",PIN:"Pinnacle"};
var map={},n=0,xm={},xn=0;
function lab(name){if(!(name in map))map[name]="Book "+String.fromCharCode(65+(n++%26));return map[name]}
function xlab(name){if(!(name in xm))xm[name]="Exchange "+String.fromCharCode(65+(xn++%26));return xm[name]}
function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
var RB=[];BOOKS.forEach(function(g){g.forEach(function(a){RB.push([new RegExp("\\b"+esc(a)+"(?:'s)?\\b","gi"),g[g.length>1?1:0]])})});
var RX=EXCH.map(function(x){return[new RegExp("\\b"+esc(x)+"\\b","gi"),x]});
function cap(m,r){return m[0]===m[0].toUpperCase()&&m[0]!==m[0].toLowerCase()?r[0].toUpperCase()+r.slice(1):r}
var WORD=[
 [/\bLocks? of the (Day|Week|Night)\b/gi,"Top Highlight of the $1"],[/\bbest bets?\b/gi,function(m){return cap(m,/s$/i.test(m)?"top highlights":"top highlight")}],
 [/\bmust[- ]bets?\b/gi,function(m){return cap(m,"highlighted")}],[/\bguaranteed\b/gi,function(m){return cap(m,"estimated")}],[/\bguarantee\b/gi,function(m){return cap(m,"estimate")}],
 [/\b(hammer|smash) (it|this|that|play)\b/gi,function(m){return cap(m,"highlighted play")}],[/\bsure thing\b/gi,"model view"],[/\bcan'?t[- ]miss\b/gi,"highlighted"],
 [/\bbet this\b/gi,function(m){return cap(m,"highlighted")}],[/\bbet it\b/gi,function(m){return cap(m,"highlighted")}],
 [/\bRECOMMENDED\b/g,"HIGHLIGHTED"],[/\bRecommended\b/g,"Highlighted"],[/\brecommended\b/g,"highlighted"],
 [/\bRECOMMENDATIONS?\b/g,function(m){return /S$/.test(m)?"HIGHLIGHTS":"HIGHLIGHT"}],[/\b[Rr]ecommendations?\b/g,function(m){return cap(m,/s$/.test(m)?"highlights":"highlight")}],
 [/\b[Rr]ecommend(s|ing)?\b/g,function(m,s){return cap(m,s=="s"?"highlights":s?"highlighting":"highlight")}]
];
var PICK=[[/\bTOP PICKS\b/g,"TOP HIGHLIGHTS"],[/\bPICKS\b/g,"HIGHLIGHTS"],[/\bPICK\b(?!'EM|’EM)/g,"HIGHLIGHT"],
 [/\b([Pp])icks\b/g,function(m,p){return p=="P"?"Highlights":"highlights"}],
 [/\b([Pp])ick\b(?!['’]em|\s+(up|your|a|an|one|any|from|which|who|out|the best|between|and choose|it)\b|-up)/g,function(m,p){return p=="P"?"Highlight":"highlight"}]];
function fix(s){
 if(!s||!/[A-Za-z]/.test(s))return s;var o=s;
 RB.forEach(function(r){s=s.replace(r[0],function(){return lab(r[1])})});
 s=s.replace(/\bPinnacle(?:'s)?\b/gi,"sharp book");RX.forEach(function(r){s=s.replace(r[0],function(){return xlab(r[1])})});
 s=s.replace(/\b(DK|FD|MGM|CZR)\b/g,function(m){return lab(ABBR[m])}).replace(/\bvs\.? PIN\b/g,"vs sharp book");
 s=s.replace(/\bsharp book fair\b/gi,"sharp-book fair");
 WORD.forEach(function(r){s=s.replace(r[0],r[1])});
 if(!GMHUB&&!DRAFT.test(s))PICK.forEach(function(r){s=s.replace(r[0],r[1])});
 s=s.replace(/^(\s*)sharp book/,"$1Sharp book");
 return s===o?o:s}
var SKIP={SCRIPT:1,STYLE:1,TEXTAREA:1,INPUT:1,CODE:1,PRE:1,NOSCRIPT:1,SELECT:0};
function walk(root){
 if(root.nodeType===3){var p=root.parentNode;if(p&&!SKIP[p.nodeName]&&!(p.closest&&p.closest("[data-sl-raw]"))){var v=fix(root.nodeValue);if(v!==root.nodeValue)root.nodeValue=v}return}
 if(root.nodeType!==1||SKIP[root.nodeName])return;
 ["title","alt","placeholder","aria-label"].forEach(function(a){var v=root.getAttribute&&root.getAttribute(a);if(v){var f=fix(v);if(f!==v)root.setAttribute(a,f)}});
 if(root.nodeName==="IMG"&&/draftkings|fanduel|betmgm|caesars|fanatics|pinnacle|novig|kalshi|polymarket|bet365|betrivers|espnbet|hardrock/i.test((root.getAttribute("src")||"")+(root.getAttribute("alt")||"")))root.style.display="none";
 for(var c=root.firstChild;c;c=c.nextSibling)walk(c)}
function foot(){
 if(!document.body||document.getElementById("sl-rg"))return;
 var t=document.body.innerText||"";if(/1-800-GAMBLER/i.test(t)&&/entertainment/i.test(t))return;
 var d=document.createElement("div");d.id="sl-rg";d.setAttribute("data-sl-raw","");
 d.style.cssText="max-width:1100px;margin:24px auto 12px;padding:10px 14px;font:12px/1.5 system-ui,sans-serif;color:#8b94a7;text-align:center;border-top:1px solid rgba(139,148,167,.25)";
 d.textContent="For informational and entertainment purposes only. Not betting advice; no outcome is guaranteed. 21+ only, where legal. Please gamble responsibly. Gambling problem? Call 1-800-GAMBLER.";
 document.body.appendChild(d)}
function run(){document.title=fix(document.title);walk(document.body);if(window.SL_RG_FOOTER!==false)foot();
 new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==="characterData")walk(m.target);else m.addedNodes.forEach(walk)})}).observe(document.body,{childList:true,subtree:true,characterData:true})}
window.slNeutralText=fix;
if(document.body)run();else document.addEventListener("DOMContentLoaded",run);
})();
