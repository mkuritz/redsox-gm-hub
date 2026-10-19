/* Sports Labs display-text neutralizer (legal/liability wording). Display only:
   rewrites visible text nodes + title/alt/placeholder/aria-label. Never touches data, hrefs, values or code.
   Picks/Recommended -> Highlighted; sportsbook/exchange names -> generic labels; adds responsible-gaming footer. */
(function(){
if(window.__slNeutral)return;window.__slNeutral=1;
var DRAFT=/\b(draft|round|overall|lottery|first[- ]round|second[- ]round|\d+(st|nd|rd|th)[- ]round|top[- ]\d+|No\.\s*\d+)\s+picks?\b/i;
var GMHUB=/^(cubs|orioles|redsox|eagles)\./.test(location.hostname);
var BOOKS=[["DraftKings Sportsbook","DraftKings"],["FanDuel Sportsbook","FanDuel"],["BetMGM"],["Caesars Sportsbook","Caesars"],["Fanatics Sportsbook","Fanatics"],["ESPNBet","ESPN Bet","ESPN BET"],["theScore Bet"],["bet365"],["BetRivers"],["Hard Rock Bet","Hard Rock"],["PointsBet"],["Fliff"],["Bovada"],["BetOnline"],["Unibet"],["WynnBET"],["Borgata"],["PrizePicks"],["Underdog Fantasy"],["SuperDraft"],["Sleeper Picks"]];
var EXCH=["Kalshi","Polymarket","Novig","ProphetX","Sporttrade","Betfair","Crypto.com"];
var ABBR={DK:"DraftKings",FD:"FanDuel",MGM:"BetMGM",CZR:"Caesars",PIN:"Pinnacle"};
var map={},n=0,xm={},xn=0;
var FIX={"DraftKings": "A", "FanDuel": "B", "BetMGM": "C", "Caesars": "D", "Fanatics": "E", "BetRivers": "F", "ESPN BET": "G", "bet365": "H", "Hard Rock": "I", "PointsBet": "J", "Fliff": "K", "Bovada": "L", "BetOnline": "M", "PrizePicks": "N", "Underdog Fantasy": "O", "theScore Bet": "P", "Unibet": "Q", "WynnBET": "R", "Borgata": "S", "SuperDraft": "T", "Sleeper Picks": "U"},XF={"Kalshi": "A", "Polymarket": "B", "Novig": "C", "ProphetX": "D", "Sporttrade": "E", "Betfair": "F", "Crypto.com": "G"};function lab(name){return "Book "+(FIX[name]||"Z")}
function xlab(name){return "Exchange "+(XF[name]||"Z")}
function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
var RB=[];BOOKS.forEach(function(g){g.forEach(function(a){RB.push([new RegExp("\\b"+esc(a)+"(?:'s)?\\b","gi"),g[g.length-1]])})});
var RX=EXCH.map(function(x){return[new RegExp("\\b"+esc(x)+"\\b","gi"),x]});
function cap(m,r){return m[0]===m[0].toUpperCase()&&m[0]!==m[0].toLowerCase()?r[0].toUpperCase()+r.slice(1):r}
var WORD=[
 [/\bLocks? of the (Day|Week|Night)\b/gi,"Top Highlight of the $1"],[/\bbest bets?\b/gi,function(m){return cap(m,/s$/i.test(m)?"top highlights":"top highlight")}],
 [/\bmust[- ]bets?\b/gi,function(m){return cap(m,"highlighted")}],[/\bguaranteed (profit|wins?|winners?|money|returns?|locks?|plays?)\b/gi,function(m,w){return cap(m,"estimated "+w)}],[/\b(lock|cash) guaranteed\b/gi,"highlighted"],
 [/\b(hammer|smash) (it|this|that|play)\b/gi,function(m){return cap(m,"highlighted play")}],[/\bsure thing\b/gi,"model view"],[/\b(no|never|not) (outcome|result)s? (is|are) estimated\b/gi,"$1 $2 is guaranteed"],[/\bcan'?t[- ]miss\b/gi,"highlighted"],
 [/\bbet this\b/gi,function(m){return cap(m,"highlighted")}],[/\bbet it\b/gi,function(m){return cap(m,"highlighted")}],
 [/\bRECOMMENDED\b/g,"HIGHLIGHTED"],[/\bRecommended\b/g,"Highlighted"],[/\brecommended\b/g,"highlighted"],
 [/\bRECOMMENDATIONS?\b/g,function(m){return /S$/.test(m)?"HIGHLIGHTS":"HIGHLIGHT"}],[/\b[Rr]ecommendations?\b/g,function(m){return cap(m,/s$/.test(m)?"highlights":"highlight")}],
 [/\b[Rr]ecommend(s|ing)?\b/g,function(m,s){return cap(m,s=="s"?"highlights":s?"highlighting":"highlight")}]
];
var PICK=[[/\bTOP PICKS\b/g,"TOP HIGHLIGHTS"],[/\bPICKS\b/g,"HIGHLIGHTS"],[/\bPICK\b(?!'EM|’EM)/g,"HIGHLIGHT"],
 [/\b([Pp])icks\b/g,function(m,p){return p=="P"?"Highlights":"highlights"}],
 [/\b([Pp])ick\b(?!['’]em|\s+(up|your|a|an|one|any|from|which|who|out|the best|between|and choose|it)\b|-up)/g,function(m,p){return p=="P"?"Highlight":"highlight"}]];
var PHR=[["Only our highest-conviction picks, where our proven signals agree and we beat the market price.", "Our highest-rated plays, where multiple model signals agree and the model price differs from the market."], ["Locked before start", "Logged before start"], ["locked before start", "logged before start"], ["locked in before the game", "logged before the game"], ["Sports Labs Recommended · today", "Highlighted today"], ["Sports Labs Recommended", "Highlighted"], ["Sharp Picks", "Highlighted"], ["All In Cousins Show Picks", "Third-party plays (credited)"], ["Sharper picks for bettors", "Sharper research for bettors"], ["recommended lineups", "highlighted lineups"], ["Dominate the book and your fantasy leagues.", "Research tools for bettors and fantasy players."], ["Dominate the book and your fantasy leagues", "Research tools for bettors and fantasy players"], ["Beat the book in DFS and on value bets", "Research DFS slates and value plays"], ["Beat the book.", "Research the number before you play."], ["Beat the book", "Research the number before you play"], ["Find the edge before the market does.", "Compare model estimates with market prices."], ["turn free bets and boosts into locked profit", "estimate the value of free bets and boosts, before fees and execution risk"], ["Locked, fee-adjusted value of an arb", "Estimated fee-adjusted value of an arb (prices can move)"], ["near risk-free value", "estimated value (all betting involves risk)"], ["near risk-free", "lower-variance"], ["risk-free", "lower-variance"], ["Risk-free", "Lower-variance"], ["locked profit", "estimated value"], ["Locked profit", "Estimated value"], ["guaranteed profit", "estimated value"], ["show where the number is wrong", "show where the model and market disagree"], ["built to win your slate", "built to help you research your slate"], ["proven signals", "tested signals"], ["Proof, not promises", "Our tracked record"], ["DraftKings NFL daily fantasy", "NFL daily fantasy (salary-based)"], ["DraftKings NFL DFS projections", "NFL DFS projections"], ["live DraftKings slate", "live DFS slate"], ["DraftKings slate", "today's DFS slate"], ["Kalshi, Polymarket and sportsbook prices", "exchange and book prices"], ["DraftKings lines and public game logs", "book lines and public game logs"], ["Statcast", "Advanced batted-ball"], ["not affiliated with ESPN or any league or team", "not affiliated with any media company, league or team"], ["Save ~58% vs $240/yr", "$100/yr (about $8.33/mo)"], ["Save ~58% vs $240", "About $8.33/mo"], ["Property of Michael Kuritz", "© 2026 Sports Labs"]];
function fix(s){
 if(!s||!/[A-Za-z]/.test(s))return s;var o=s;
 PHR.forEach(function(r){if(s.indexOf(r[0])>-1)s=s.split(r[0]).join(r[1])});s=s.replace(/\b(Recommended|recommended) picks\b/g,function(m){return m[0]=="R"?"Highlighted plays":"highlighted plays"});
 RB.forEach(function(r){s=s.replace(r[0],function(){return lab(r[1])})});
 s=s.replace(/\bPinnacle(?:'s)?\b/gi,"sharp book");RX.forEach(function(r){s=s.replace(r[0],function(){return xlab(r[1])})});
 s=s.replace(/\b(DK|FD|MGM|CZR)\b/g,function(m){return lab(ABBR[m])}).replace(/\bvs\.? PIN\b/g,"vs sharp book");
 s=s.replace(/\bsharp book fair\b/gi,"sharp-book fair");
 WORD.forEach(function(r){s=s.replace(r[0],r[1])});
 if(!GMHUB&&!DRAFT.test(s))PICK.forEach(function(r){s=s.replace(r[0],r[1])});
 s=s.replace(/\b([Hh])ighlighted highlights\b/g,"$1ighlighted plays").replace(/^(\s*)sharp book/,"$1Sharp book");
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
 var d=document.createElement("footer");d.id="sl-rg";d.setAttribute("data-sl-raw","");
 d.style.cssText="max-width:1100px;margin:24px auto 12px;padding:12px 16px;font:12px/1.55 system-ui,sans-serif;color:#8b94a7;text-align:center;border-top:1px solid rgba(139,148,167,.25)";
 var H="https://sportslabshq.com";
 d.innerHTML='<p style="margin:0 0 6px">Sports Labs provides sports data, analytics and entertainment content for informational purposes only. Sports Labs is not a sportsbook, does not accept wagers, and does not offer gambling services. Nothing on this site is betting, financial or investment advice, and no outcome is guaranteed. Highlighted plays, scores and projections are estimates based on public information and may be wrong or out of date. Tracked results are logged before start at the prices then available, graded from official final scores, and not audited by a third party; past performance does not guarantee future results.</p><p style="margin:0 0 6px">Sports Labs is independent and not affiliated with, endorsed by, or sponsored by any league, team, player, book, exchange or fantasy operator; all trademarks belong to their owners. Sports Labs currently receives no compensation from any book or exchange. Sports betting and fantasy contests are legal only in certain jurisdictions; you are responsible for following the laws where you are.</p><p style="margin:0 0 6px"><b>21+ only. Play responsibly.</b> Gambling problem? Call or text <b>1-800-GAMBLER</b> (24/7, free, confidential) or visit ncpgambling.org. NY: 877-8-HOPENY or text HOPENY (467369).</p><p style="margin:0"><a style="color:inherit" href="'+H+'/terms">Terms</a> · <a style="color:inherit" href="'+H+'/privacy.html">Privacy</a> · <a style="color:inherit" href="'+H+'/terms#subscription">Subscription Terms</a> · <a style="color:inherit" href="'+H+'/responsible-gaming">Responsible Gaming</a> · © 2026 Sports Labs</p>';
 document.body.appendChild(d)}
function run(){document.title=fix(document.title);walk(document.body);if(window.SL_RG_FOOTER!==false)foot();
 new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==="characterData")walk(m.target);else m.addedNodes.forEach(walk)})}).observe(document.body,{childList:true,subtree:true,characterData:true})}
window.slNeutralText=fix;
if(document.body)run();else document.addEventListener("DOMContentLoaded",run);
})();
