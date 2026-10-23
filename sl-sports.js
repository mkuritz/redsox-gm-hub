/* Sports Labs sport switcher: the ONE list of sport names, order and links.
   Identical copy in every app repo. Edit here, then copy to all repos (see nav-connect README).
   API (window.SLS):
     SLS.sports        [{k,icon,short,name,url,bl}]  order = NFL, CFB, NBA, CBB, NHL, MLB, Soccer
     SLS.tools         [{icon,name,url}]
     SLS.cur           sport key of the current hub (or null)
     SLS.betlab(k)     Bet Lab URL for that sport's tab
     SLS.top(curUrl)   [[short,url,key]] for SLTOP top bars
     SLS.mount(el,{mode:'list'|'menu', tools:true, before:node})  renders the switcher inside an EXISTING nav.
   No new colors: everything inherits the host app's text color / font; only spacing is set here. */
(function(){
if(window.SLS)return;
var H=function(h){return 'https://'+h+'.sportslabshq.com/'},BL=H('betlab');
var S=[
 {k:'nfl',icon:'🏈',short:'NFL',name:'NFL Hub',host:'nfllab',bl:'nfl'},
 {k:'cfb',icon:'🏈',short:'CFB',name:'CFB Hub',host:'cfblab',bl:'cfb'},
 {k:'nba',icon:'🏀',short:'NBA',name:'NBA in Bet Lab',host:null,bl:'nba'},
 {k:'cbb',icon:'🏀',short:'CBB',name:'CBB Hub',host:'cbblab',bl:'ncaamb'},
 {k:'nhl',icon:'🏒',short:'NHL',name:'NHL Lab',host:'nhllab',bl:'nhl'},
 {k:'mlb',icon:'⚾',short:'MLB',name:'MLB Lab',host:'mlblab',bl:'mlb'},
 {k:'soccer',icon:'⚽',short:'Soccer',name:'Soccer Hub',host:'soccerlab',bl:'soccer'}];
function betlab(k){var s=S.filter(function(x){return x.k===k||x.bl===k})[0];return BL+'#sport='+(s?s.bl:k)}
S.forEach(function(s){s.url=s.host?H(s.host):betlab(s.k);s.blurl=betlab(s.k)});
var T=[{icon:'💎',name:'Bet Lab',url:BL},{icon:'⚡',name:'Arb Lab',url:H('arblab')},{icon:'🎯',name:'Fantasy Frontier',url:H('fantasyfrontier')},{icon:'🏆',name:'Fantasy Front Office',url:H('frontoffice')},{icon:'🧢',name:'GM Hubs',url:'https://sportslabshq.com/gm-hub.html'},{icon:'🧭',name:'SportsLabs HQ',url:H('hq')},{icon:'🏠',name:'Sports Labs home',url:'https://sportslabshq.com/'}];
var hn=location.hostname,sub=(hn.match(/betlab|nfllab|cfblab|cbblab|nhllab|mlblab|soccerlab/)||[hn.split('.')[0]])[0],q=new URLSearchParams(location.search);
var cur=(S.filter(function(s){return s.host===sub})[0]||{}).k||null;
if(q.get('sls'))cur=q.get('sls'); /* local/preview testing: ?sls=nfl */
var onBL=sub==='betlab'||q.get('slsbl')==='1';
function blCur(){var m=location.hash.match(/[#&]sport=(\w+)/);return m?m[1]:null}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var css=':where(.sls-list) a{display:block;padding:6px 10px;border-radius:8px;color:inherit;text-decoration:none;font-weight:600}:where(.sls-list) a:hover{background:rgba(127,127,127,.15)}:where(.sls-list) h4.sls-h{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.65}.sls{font:inherit;color:inherit}.sls h4.sls-h{margin:16px 8px 6px}.sls-row{display:flex;align-items:center;gap:4px}.sls-row>a.sls-hub{flex:1 1 auto;min-width:0}.sls-row>a.sls-bl{flex:0 0 auto;font-size:11px!important;font-weight:600;opacity:.75;padding:6px 8px!important;white-space:nowrap}.sls-row>a.sls-bl:hover{opacity:1}.sls a[aria-current]{font-weight:800}'+
 '.sls-dd{position:relative;display:inline-block}.sls-dd>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border-radius:8px;font-weight:600;min-height:36px;box-sizing:border-box}.sls-dd>summary::-webkit-details-marker{display:none}.sls-dd>summary:after{content:"▾";font-size:.8em;opacity:.7}.sls-dd[open]>summary:after{content:"▴"}'+
 '.sls-pan{position:absolute;z-index:1000;top:calc(100% + 6px);right:0;min-width:250px;max-width:calc(100vw - 16px);max-height:min(75vh,560px);overflow:auto;padding:8px;border-radius:12px;border:1px solid rgba(127,127,127,.35);box-shadow:0 12px 32px rgba(0,0,0,.35);text-align:left}.sls-pan .sls-cap{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin:8px 8px 4px}.sls-pan a{display:block;padding:8px 10px;border-radius:8px;color:inherit;text-decoration:none;font-weight:600;line-height:1.3}.sls-pan a:hover,.sls-pan a:focus-visible{background:rgba(127,127,127,.18)}.sls-pan .sls-row>a.sls-bl{border:1px solid rgba(127,127,127,.35)}'+
 '@media (max-width:640px){.sls-pan{position:fixed;left:8px;right:8px;min-width:0;max-width:none}}.sls-lift{z-index:2147483000}.sls-ico{display:none}@media (max-width:640px){.sls-compact>summary{padding:6px 8px}.sls-compact .sls-ico{display:inline}.sls-compact .sls-lbl{display:none}}.sls-lbl{display:inline-block;max-width:9.5em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}@media (max-width:640px){.sls-lbl{max-width:7em}}'+'.slsb{display:flex!important;flex-wrap:nowrap!important;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;scroll-snap-type:x proximity;padding:6px 8px;margin:0;box-sizing:border-box;width:100%;font:inherit;position:relative;z-index:5}.slsb::-webkit-scrollbar{display:none}.slsb a{flex:0 0 auto;scroll-snap-align:center;padding:6px 12px;border-radius:999px;border:1px solid rgba(127,127,127,.35);color:inherit;text-decoration:none;font-weight:700;font-size:13px;white-space:nowrap;line-height:1.2}.slsb a:hover{background:rgba(127,127,127,.15)}.slsb a[aria-current]{background:var(--acc,var(--accent,var(--brand,var(--primary,rgba(127,127,127,.35)))));border-color:transparent;color:var(--accent-ink,inherit)}';
function style(){if(document.getElementById('sls-css'))return;var st=document.createElement('style');st.id='sls-css';st.textContent=css;document.head.appendChild(st)}
function rows(o){var bc=onBL?blCur():null;return S.map(function(s){var here=(s.k===cur)||(onBL&&!s.host&&bc===s.bl);
  var hub='<a class="sls-hub" href="'+s.url+'"'+(here?' aria-current="page"':'')+' data-sls="'+s.k+'">'+s.icon+' '+esc(s.name)+'</a>';
  var bl=s.host?'<a class="sls-bl" href="'+(onBL?'./index.html#sport='+s.bl:s.blurl)+'" data-slsbl="'+s.bl+'" title="'+esc(s.short)+' in Bet Lab" aria-label="'+esc(s.short)+' in Bet Lab">Bet Lab</a>':'';
  return '<div class="sls-row">'+hub+bl+'</div>'}).join('')}
function tools(){return T.filter(function(t){return !(onBL&&t.name==='Bet Lab')&&!((cur||onBL)&&t.name==='GM Hubs')&&t.url.indexOf('//'+location.hostname+'/')<0}).map(function(t){return '<a href="'+t.url+'">'+t.icon+' '+esc(t.name)+'</a>'}).join('')}
function curName(){if(onBL){var bc=blCur(),x=S.filter(function(t){return !t.host&&t.bl===bc})[0];return x?x.name:'Bet Lab'}var c=S.filter(function(t){return t.k===cur})[0];return c?c.name:null}
function mount(el,o){o=o||{};if(o.mode==='menu'&&!o.label&&(cur||onBL))o.label=curName();if(!el)return null;style();var w=document.createElement(o.mode==='menu'?'details':'div');w.className='sls sls-'+(o.mode||'list');w._o=o;
 if(o.mode==='menu'){w.className+=' sls-dd';if(o.compact)w.className+=' sls-compact';w.innerHTML='<summary aria-label="Switch sport" title="Sports"><span class="sls-ico" aria-hidden="true">🏆</span><span class="sls-lbl">'+esc(o.label||'Sports')+'</span></summary><div class="sls-pan" role="menu"><div class="sls-cap">Sports</div>'+rows(o)+(o.tools===false?'':'<div class="sls-cap">More from Sports Labs</div>'+tools())+'</div>';
  var bg=o.bg;if(!bg){var n=el;while(n&&n.nodeType===1){var c=getComputedStyle(n).backgroundColor;var al=(c.match(/rgba\([^)]*,\s*([\d.]+)\)/)||[])[1];if(c&&c!=='transparent'&&(al===undefined||+al>=.95)){bg=c;break}n=n.parentElement}}w.querySelector('.sls-pan').style.background=bg||'#fff';
  var pan=w.querySelector('.sls-pan');
  /* phones: lift the panel to <body> so a header with overflow/backdrop-filter can't clip it */
  w.addEventListener('toggle',function(){if(w.open&&innerWidth<=640){var r=w.querySelector('summary').getBoundingClientRect();pan.style.top=Math.round(r.bottom+6)+'px';pan.style.maxHeight=(innerHeight-r.bottom-20)+'px';pan.classList.add('sls-lift');document.body.appendChild(pan)}else if(!w.open&&pan.parentNode!==w){pan.classList.remove('sls-lift');pan.style.top='';pan.style.maxHeight='';w.appendChild(pan)}});
  pan.addEventListener('click',function(e){if(e.target.closest('a'))setTimeout(function(){w.open=false},0)});
  document.addEventListener('click',function(e){if(w.open&&!w.contains(e.target)&&!pan.contains(e.target))w.open=false});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&w.open){w.open=false;w.querySelector('summary').focus()}});
  w.addEventListener('click',function(e){if(e.target.closest('a'))w.open=false});
 }else{var hd=function(t){return o.hclass?'<div class="'+o.hclass+'">'+esc(t)+'</div>':'<h4 class="sls-h">'+esc(t)+'</h4>'};w.innerHTML=hd(o.label||'Sports')+rows(o)+(o.tools===false?'':hd('More from Sports Labs')+tools())}
 if(onBL)addEventListener('hashchange',function(){var lb=w.querySelector('.sls-lbl');if(lb&&o.mode==='menu')lb.textContent=curName();var r=w.querySelector(o.mode==='menu'?'.sls-pan':'div,h4');w.querySelectorAll('.sls-row').forEach(function(x){x.remove()});var tmp=document.createElement('div');tmp.innerHTML=rows(o);var cap=w.querySelector(o.mode==='menu'?'.sls-cap':(o.hclass?'.'+o.hclass.split(' ')[0]:'h4.sls-h'));var ref=cap.nextSibling;Array.prototype.slice.call(tmp.children).forEach(function(n){cap.parentNode.insertBefore(n,ref)})});
 if(o.onPick)w.addEventListener('click',function(e){if(e.target.closest('a'))o.onPick(e)});
 if(o.before)el.insertBefore(w,o.before);else el.appendChild(w);return w}

/* data-auto: mount into a known existing nav shell (Arb Lab / Fantasy Frontier / GM Hub app shell, Red Sox side nav) */
function auto(sel){var tries=0;(function go(){if(document.querySelector('.sls'))return;
 if(sel){var t=document.querySelector(sel);if(t){mount(t,{mode:'menu',before:t.firstChild});return}}
 var ha=document.querySelector('header.header .header-actions'),rs=document.querySelector('aside#side #slabs');
 if(ha){mount(ha,{mode:'menu',compact:true,before:ha.firstChild});return}
 if(rs){mount(rs.parentNode,{mode:'list',before:rs});return}
 if(tries++<40)setTimeout(go,150)})()}
var me=document.currentScript;if(me&&me.hasAttribute('data-auto')){var sel=me.getAttribute('data-auto');var run=function(){auto(sel)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
 /* apps that re-render their header after load: put the switcher back if it was wiped (first 30s) */
 var mo=new MutationObserver(function(){if(!document.querySelector('.sls')&&!run._t){run._t=setTimeout(function(){run._t=0;auto(sel)},50)}});addEventListener('load',function(){mo.observe(document.body,{childList:true,subtree:true});setTimeout(function(){mo.disconnect()},30000)})}

/* horizontal sport bar (sports hubs + Bet Lab only): flip through every sport and back */
function barHTML(){var bc=null;if(onBL){bc=blCur();if(!bc){var t=document.querySelector('button.on[data-s]');bc=t?t.getAttribute('data-s'):null}}return S.map(function(s){var here=(s.k===cur)||(onBL&&bc===s.bl);var u=(onBL&&!s.host)?'./index.html#sport='+s.bl:s.url;return '<a href="'+u+'" data-sls="'+s.k+'"'+(here?' aria-current="page"':'')+'>'+s.icon+' '+esc(s.short)+'</a>'}).join('')}
function ensureBar(){if(!(cur||onBL)||!document.body)return;if(document.querySelector('#v2bar .sp')){var o=document.getElementById('slsb');if(o)o.remove();ensureBar.own=1;return}if(ensureBar.own)return;var b=document.getElementById('slsb');
 if(!b){style();b=document.createElement('nav');b.id='slsb';b.className='slsb';b.setAttribute('aria-label','Sports');document.body.insertBefore(b,document.body.firstChild)}
 var h=barHTML();if(b._h!==h){b._h=h;b.innerHTML=h;var a=b.querySelector('[aria-current]');if(a)b.scrollLeft=a.offsetLeft-(b.clientWidth-a.offsetWidth)/2}}
if(cur||onBL){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureBar);else ensureBar();
 addEventListener('hashchange',ensureBar);if(onBL)document.addEventListener('click',function(e){if(e.target.closest('button[data-s]'))setTimeout(ensureBar,60)});addEventListener('load',ensureBar);
 new MutationObserver(function(){if((!document.getElementById('slsb')||(!ensureBar.own&&document.querySelector('#v2bar .sp')))&&!ensureBar._t)ensureBar._t=setTimeout(function(){ensureBar._t=0;ensureBar()},50)}).observe(document.documentElement,{childList:true,subtree:true})}
window.SLS={sports:S,tools:T,cur:cur,betlab:betlab,mount:mount,bar:ensureBar,
 top:function(){return S.map(function(s){return [s.short,s.k===cur?'index.html':s.url,s.k]})}};
})();
