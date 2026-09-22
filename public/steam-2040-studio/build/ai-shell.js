/* =====================================================================
   STEAM-AI SHELL (inserted inside the container IIFE, so it shares rpc,
   switchApp, waitReady, selectTool, openDock, submit, addMsg, esc ...)

   Seven workspaces over one map: Overview, Explore, Diagnose, Scenarios
   (incl. Compare + Stress tests), Forecast, Briefings, Data & Models.
   Every value carries a provenance label; every finding a rule, a file
   and a record; every chat answer the typed tool calls behind it.
   ===================================================================== */
var AIS=(function(){
"use strict";
var NS="steamai.";
function lsGet(k,d){ try{ var v=localStorage.getItem(NS+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } }
function lsSet(k,v){ try{ localStorage.setItem(NS+k,JSON.stringify(v)); return true; }catch(e){ return false; } }
var S={ level:lsGet("level","dir"), theme:lsGet("theme","dark"), diag:null, ws:null, tab:{}, fsev:null, ffam:null,
  selId:null, selLinks:null, target:null, fc:null, fcParams:lsGet("fc",{year:2035, rate:2.0, span:1.0, th:1.0}), cmp:null, noise:true,
  stress:null, prog:null, running:null, brief:lsGet("brief",{q:"",rec:"",reviewer:"",blocks:[],issued:null}), audit:lsGet("audit",[]),
  disp:lsGet("disp",{}), llm:lsGet("llm",{provider:"off", model:"claude-opus-5", url:"http://localhost:11434", omodel:"llama3.1"}), toolRes:[], inv:null,
  card:null, prepared:false, lastReview:lsGet("lastReview",null), snapCache:{} };
var $=function(id){ return document.getElementById(id); };
function h(s){ return esc(s==null?"":String(s)); }
function fmt(n,d){ if(n==null||n==="") return "n/a"; n=+n; if(!isFinite(n)) return "n/a"; var a=Math.abs(n);
  if(d!=null) return n.toLocaleString(undefined,{maximumFractionDigits:d, minimumFractionDigits:d});
  return a>=1e6?(n/1e6).toFixed(2)+"M":a>=1e4?Math.round(n/1e3)+"k":a>=1e3?(n/1e3).toFixed(1)+"k":a>=100?Math.round(n).toString():a>=10?n.toFixed(1):n.toFixed(2); }
function sgn(n,d){ return (n>0?"+":"")+fmt(n,d); }
function pct(a,b){ return b?((a-b)/Math.abs(b)*100):0; }
function audit(kind,msg){ S.audit.unshift({t:new Date().toISOString(),kind:kind,msg:String(msg).slice(0,300)}); if(S.audit.length>500) S.audit.length=500; lsSet("audit",S.audit); }
function toast(m){ var t=$("toastAI"); t.textContent=m; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(function(){ t.classList.remove("show"); },3200); }
function ai(cmd,args,ms){ var o=Object.assign({cmd:"ai."+cmd, timeoutMs:ms||60000},args||{}); return rpc("assign",o); }
function sevChip(s){ var ic={Critical:"▲",High:"◆",Medium:"●",Info:"○"}[s]||"○"; return '<span class="sev '+s+'"><i>'+ic+'</i>'+s+'</span>'; }
var PROV={"Checked on file":"p-file","Engine output":"p-engine","STEAM output (imported)":"p-steam","STEAM output":"p-steam","Surrogate estimate":"p-sur","Illustrative":"p-ill","Screening estimate":"p-scr"};
function prov(p){ var k=Object.keys(PROV).filter(function(x){ return String(p).indexOf(x)===0; })[0]; return '<span class="prov '+(PROV[k]||"p-ill")+'" title="Provenance">'+h(p)+'</span>'; }
function noDash(s){ return String(s==null?"":s).replace(/\s—\s/g,", ").replace(/—/g,"n/a").replace(/–/g,"-"); }
var ENGINE_TIP="In-app equilibrium assignment of the STEAM 2040 OD on the STEAM 2040 network. Not a STEAM run.";

/* ---------------- icons ---------------- */
var ICON={
 ov:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
 net:'<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
 zones:'<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M12 2.5V12l8.5 5M12 12l-8.5 5"/>',
 projects:'<path d="M4 20 10 4h4l6 16"/><path d="M12 8v2M12 13v2M12 18v1"/>',
 diag:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',
 demand:'<path d="M4 20h16"/><path d="M7 16v-4M12 16V6M17 16v-7"/>',
 assign:'<path d="M4 18c5 0 5-12 10-12h6"/><path d="M17 3l3 3-3 3"/><circle cx="4" cy="18" r="1.6"/>',
 display:'<circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/><path d="M12 20.5c-1.5 0-2-1.5-1-2.5s2.5-.5 3.5-1.5"/>',
 rec:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5"/>',
 scn:'<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
 cmp:'<path d="M12 3v18"/><rect x="3" y="6" width="6" height="12" rx="1.5"/><rect x="15" y="6" width="6" height="12" rx="1.5"/>',
 stress:'<path d="M13 2 4.5 14H11l-1 8 8.5-12H12z"/>',
 metro:'<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M8 20l2-4M16 20l-2-4"/><circle cx="9.5" cy="13" r=".6"/><circle cx="14.5" cy="13" r=".6"/>',
 fc:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
 brief:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
 data:'<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
 ana:'<path d="M4 20V11M10 20V5M16 20v-7M21 20H3"/>',
 insights:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
 cop:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
 dl:'<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>', pin:'<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
 play:'<path d="M7 4l13 8-13 8z"/>'
};
function svg(k,cls){ return '<svg viewBox="0 0 24 24" class="'+(cls||"")+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICON[k]||"")+'</svg>'; }

/* ---------------- workspace registry ---------------- */
var WS={
 ov:{t:"Overview", d:"Run readiness, the issues that matter and what changed since the last review."},
 diag:{t:"Diagnose", d:"Every finding has a rule, a file and a record behind it. Tap one to fly the map there.", tabs:[["list","Findings"],["lib","Check library"],["rep","Reports"]]},
 cmp:{t:"Compare", d:"Base against scenario. Differences inside the numerical tolerance are screened out by default."},
 stress:{t:"Stress tests", d:"Growth, closure, charging and spike tests run through the assignment engine against a common base."},
 fc:{t:"Forecast", d:"Emerging congestion 2026 to 2050 from a growth-response surrogate trained on engine runs.", tabs:[["hot","Hotspots"],["vs","AI vs engine"],["csi","Severity index"],["card","Model card"]]},
 brief:{t:"Briefings", d:"Pin findings, hotspots and comparisons into a decision brief. Every block keeps its evidence.", tabs:[["story","Brief"],["reports","Reports"]]},
 data:{t:"Data & Models", d:"What is loaded, how every metric is defined, which models run and what is still open.", tabs:[["inv","Inventory"],["metrics","Metrics"],["models","Models"],["assume","Assumptions"],["api","Integrations"],["audit","Audit"],["gloss","Glossary"],["llm","Copilot LLM"]]}
};

/* ---------------- shell chrome ---------------- */
function applyTheme(){ document.documentElement.setAttribute("data-theme",S.theme); var b=$("themeBtn"); if(b) b.innerHTML=svg(S.theme==="dark"?"sun":"moon"); lsSet("theme",S.theme); }
function applyLevel(){ document.body.classList.toggle("lvl-dir",S.level==="dir"); document.body.classList.toggle("lvl-mod",S.level==="mod");
  document.querySelectorAll("#lvlSeg button").forEach(function(b){ b.classList.toggle("on",b.dataset.l===S.level); }); lsSet("level",S.level); }
function initChrome(){
  document.querySelectorAll("#rail .ic[data-i]").forEach(function(e){ e.innerHTML=svg(e.dataset.i); });
  var rc=document.querySelector("#railCop .ic"); if(rc) rc.innerHTML=svg("cop");
  $("themeBtn").addEventListener("click",function(){ S.theme=S.theme==="dark"?"light":"dark"; applyTheme(); });
  $("helpBtn").innerHTML=svg("help"); $("helpBtn").addEventListener("click",tour);
  document.querySelectorAll("#lvlSeg button").forEach(function(b){ b.addEventListener("click",function(){ S.level=b.dataset.l; applyLevel(); audit("ui","reading level "+S.level); }); });
  $("hpill").addEventListener("click",function(){ selectTool("ov"); });
  $("wsClose").innerHTML=svg("x"); $("wsClose").addEventListener("click",function(){ clearTool(); });
  $("insClose").innerHTML=svg("x"); $("insClose").addEventListener("click",closeInspector);
  $("aimodalX").innerHTML=svg("x"); $("aimodalX").addEventListener("click",function(){ $("aimodal").classList.remove("show"); });
  $("aimodal").addEventListener("click",function(e){ if(e.target.id==="aimodal") $("aimodal").classList.remove("show"); });
  sheet($("wsPanel"),$("wsHandle")); sheet($("inspector"),$("insHandle"));
  applyTheme(); applyLevel();
  // clicks on tool chips inside the copilot log
  log.addEventListener("click",function(e){ var c=e.target.closest&&e.target.closest(".toolchip"); if(c){ e.preventDefault(); showToolResult(+c.dataset.tr); return; }
    var s=e.target.closest&&e.target.closest("[data-aiact]"); if(s){ e.preventDefault(); aiAction(s.dataset.aiact, s.dataset.arg); } });
  document.addEventListener("keydown",function(e){ if(e.key==="Escape"){ if($("aimodal").classList.contains("show")) $("aimodal").classList.remove("show"); else if($("inspector").classList.contains("show")) closeInspector(); } });
}
/* bottom sheet: tap handle cycles peek → half → full */
function sheet(el,handle){ if(!handle) return; var y0=null;
  handle.addEventListener("click",function(){ if(el.classList.contains("full")){ el.classList.remove("full"); el.classList.add("peek"); } else if(el.classList.contains("peek")){ el.classList.remove("peek"); } else el.classList.add("full"); });
  handle.addEventListener("touchstart",function(e){ y0=e.touches[0].clientY; },{passive:true});
  handle.addEventListener("touchend",function(e){ if(y0==null) return; var dy=e.changedTouches[0].clientY-y0; y0=null;
    if(dy<-30){ if(el.classList.contains("peek")) el.classList.remove("peek"); else el.classList.add("full"); }
    else if(dy>30){ if(el.classList.contains("full")) el.classList.remove("full"); else el.classList.add("peek"); } }); }
function setCtx(){
  var d=S.diag, c=d&&d.ctx||{};
  var run=c.volSource==="imported"?("STEAM output · "+(c.import&&c.import.name||"imported")):"STEAM 2040 Reference";
  $("cxRun").textContent=run;
  $("cxCmp").textContent=S.cmp&&S.cmp.ok?(S.stress?S.stress.label:"In-app scenario"):"None";
  $("cxYear").textContent=S.ws==="fc"&&S.fc&&S.fc.ok?String(S.fc.year):"2040";
  $("cxPer").textContent=c.period||"AM peak";
  var rt=S.ws==="fc"&&S.fc&&S.fc.ok?S.fc.provenance:(c.volSource==="imported"?"STEAM output (imported)":c.hasVol?"Engine output":"Checked on file");
  $("cxType").innerHTML=prov(rt);
  if(d){ var sc=d.health.score; $("hpillTxt").innerHTML=sc+' <small>readiness</small>'; $("hpillRing").innerHTML=ring(sc,24,3);
    var b=document.querySelector('.ritem[data-tool="diag"] .bdg'); if(b){ var n=d.counts.Critical+d.counts.High; b.textContent=n; b.classList.toggle("show",n>0); } }
}
function ring(score,sz,w){ var r=(sz-w)/2, c=2*Math.PI*r, col=score>=80?"var(--good)":score>=60?"var(--med)":score>=40?"var(--high)":"var(--crit)";
  return '<svg viewBox="0 0 '+sz+' '+sz+'" width="'+sz+'" height="'+sz+'" aria-hidden="true"><circle cx="'+sz/2+'" cy="'+sz/2+'" r="'+r+'" fill="none" stroke="var(--line)" stroke-width="'+w+'"/><circle cx="'+sz/2+'" cy="'+sz/2+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round" stroke-dasharray="'+(c*score/100)+' '+c+'" transform="rotate(-90 '+sz/2+' '+sz/2+')"/></svg>'; }

/* ---------------- workspace panel ---------------- */
function openWS(id){
  S.ws=id; var w=WS[id]; var p=$("wsPanel");
  $("wsTitle").textContent=w.t; $("wsDesc").textContent=w.d;
  var tabs=$("wsTabs"); tabs.innerHTML="";
  if(w.tabs){ if(!S.tab[id]) S.tab[id]=w.tabs[0][0];
    w.tabs.forEach(function(t){ var b=document.createElement("button"); b.textContent=t[1]; b.className=S.tab[id]===t[0]?"on":""; b.setAttribute("role","tab");
      b.addEventListener("click",function(){ S.tab[id]=t[0]; openWS(id); }); tabs.appendChild(b); }); }
  p.classList.add("show"); p.classList.remove("peek"); closeInspector();
  document.getElementById("stepBar").classList.remove("show");
  if(id!=="fc") ai("fcoff");
  render(); setCtx(); audit("ui","open "+w.t);
}
function hideWS(){ S.ws=null; $("wsPanel").classList.remove("show"); closeInspector(); ai("clear",{markers:true}); ai("pick",{on:false}); ai("fcoff"); }
function body(html){ $("wsBody").innerHTML=html; }
function render(){
  var id=S.ws; if(!id) return;
  try{
    if(id==="ov") rOverview(); else if(id==="diag") rDiagnose(); else if(id==="cmp") rCompare(); else if(id==="stress") rStress();
    else if(id==="fc") rForecast(); else if(id==="brief") rBrief(); else if(id==="data") rData();
  }catch(e){ body('<div class="warnbox">Could not render this workspace: '+h(e.message)+'</div>'); }
  var pick=(id==="diag"||id==="ov"||id==="fc"||id==="stress"||id==="cmp"); ai("pick",{on:pick});
}
function on(sel,ev,fn){ document.querySelectorAll(sel).forEach(function(e){ e.addEventListener(ev,function(x){ fn(e,x); }); }); }

/* ---------------- boot / diagnostics ---------------- */
var _diagBusy=null;
function luCSV(){ try{ var t=document.getElementById("src-viewer").textContent; var m=t.match(/EMBED_LU_B64\s*=\s*"([A-Za-z0-9+\/=]+)"/); if(!m) return null;
  var bin=atob(m[1]); var u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return new TextDecoder().decode(u); }catch(e){ return null; } }
async function prepare(){
  if(S.prepared) return true;
  await waitReady("assign",30000);
  var r=await ai("prepare",{},120000);
  if(!S.luSent){ var csv=luCSV(); if(csv){ var x=await ai("setlu",{csv:csv},60000); S.luSent=!!(x&&x.ok); } }
  S.prepared=!!(r&&r.ok); return S.prepared;
}
function runDiagnose(){
  if(_diagBusy) return _diagBusy;
  _diagBusy=(async function(){
    S.diagStatus="running"; if(S.ws==="ov"||S.ws==="diag") render();
    await prepare();
    var d=await ai("diagnose",{},180000);
    _diagBusy=null;
    if(!d||!d.ok){ S.diagStatus="failed: "+((d&&d.err)||"no reply"); render(); return null; }
    // what changed since the last review
    var keys=d.findings.map(function(f){ return f.check+"|"+f.title.replace(/[\d.,]+/g,"#"); });
    var prev=S.lastReview; d.changes=prev?{added:keys.filter(function(k){return prev.keys.indexOf(k)<0;}).length, resolved:prev.keys.filter(function(k){return keys.indexOf(k)<0;}).length, since:prev.at}:null;
    S.lastReview={at:d.ranAt, keys:keys}; lsSet("lastReview",S.lastReview);
    lsSet("lastSummary",{at:d.ranAt, score:d.health.score, counts:d.counts, top:d.findings.slice(0,5).map(function(f){ return {sev:f.severity, title:f.title, exec:f.exec}; })});
    S.diag=d; S.diagStatus="ok"; audit("run","diagnostics: "+d.findings.length+" findings, readiness "+d.health.score);
    setCtx(); showMarkers(); render(); return d;
  })();
  return _diagBusy;
}
function showMarkers(){ if(!S.diag||!(S.ws==="ov"||S.ws==="diag")) return;
  var mk=S.diag.findings.filter(function(f){ return f.location&&f.location.x!=null&&(f.severity!=="Info"); }).slice(0,40).map(function(f,i){ return {x:f.location.x,y:f.location.y,sev:f.severity,label:f.id,sel:f.id===S.selId,ph:i*0.13}; });
  ai("markers",{markers:mk}); }

/* ================= OVERVIEW ================= */
function rOverview(){
  var d=S.diag, o="";
  if(!d){ var ls=lsGet("lastSummary",null);
    o+='<div class="card"><div class="row"><div class="spin" style="width:18px;height:18px;border-width:2px"></div><div class="grow small">'+(S.diagStatus&&S.diagStatus.indexOf("failed")===0?h(S.diagStatus):"Reading the STEAM 2040 network, land use and OD, then running the check library…")+'</div></div></div>';
    if(ls) o+='<div class="sec"><h3>Last review (cached offline) <span class="r mute2 small">'+h(new Date(ls.at).toLocaleString())+'</span></h3><div class="card small">Readiness '+ls.score+' · '+ls.counts.Critical+' critical · '+ls.counts.High+' high</div>'+ls.top.map(function(f){ return '<div class="fnd"><div class="row">'+sevChip(f.sev)+'</div><div class="t">'+h(f.title)+'</div><div class="x">'+h(f.exec)+'</div></div>'; }).join("")+'</div>';
    body(o); return; }
  var c=d.counts, hs=d.health, top=d.findings.filter(function(f){ return f.severity!=="Info" && (S.disp[f.id]||{}).st!=="rejected"; }).slice(0,5);
  o+='<div class="card"><div class="dial">'+ring(hs.score,92,9)+'<div class="grow"><div class="big">'+hs.score+'<span class="mute2" style="font-size:14px;font-weight:600"> / 100</span></div><div class="small muted">Run readiness · '+h(hs.coverage)+'</div>'+
     '<div class="small" style="margin-top:4px">'+readinessSentence(d)+'</div></div></div>'+
     '<div class="mod tiny mute2" style="margin-top:8px">'+h(hs.formula)+'</div></div>';
  o+='<div class="sevrow">'+["Critical","High","Medium","Info"].map(function(s){ return '<button class="sevc" data-sev="'+s+'">'+sevChip(s)+'<b>'+c[s]+'</b></button>'; }).join("")+'</div>';
  o+='<div class="sec"><h3>Top issues <span class="r"><button class="btn sm" id="ovAll">All findings</button></span></h3>'+(top.length?top.map(fCard).join(""):'<div class="okbox">No critical, high or medium findings.</div>')+'</div>';
  if(d.changes) o+='<div class="sec"><h3>Since the last review</h3><div class="card small">'+d.changes.added+' new · '+d.changes.resolved+' resolved <span class="mute2">(compared with '+h(new Date(d.changes.since).toLocaleString())+')</span></div></div>';
  o+='<div class="sec"><h3>Network KPIs '+(d.ctx.hasVol?prov(d.ctx.volSource==="imported"?"STEAM output (imported)":"Engine output"):"")+'</h3><div id="ovKpi">'+(d.ctx.hasVol?'<div class="small muted">Loading…</div>':runPrompt())+'</div></div>';
  o+='<div class="sec"><h3>Active studies</h3><div class="card small">'+
     (S.stress?'Stress test: <b>'+h(S.stress.label)+'</b><br>':'')+(S.fc&&S.fc.ok?'Forecast '+S.fc.year+': '+S.fc.total+' emerging hotspots<br>':'')+
     'Briefing blocks: '+S.brief.blocks.length+(S.brief.issued?' · issued '+h(new Date(S.brief.issued.at).toLocaleDateString()):'')+'</div></div>';
  o+='<div class="row w"><button class="btn pri" id="ovReview">'+svg("diag")+'Review run</button><button class="btn" id="ovFc">'+svg("fc")+'Forecast</button><button class="btn" id="ovBrief">'+svg("brief")+'Briefing</button></div>';
  body(o);
  on(".sevc","click",function(e){ S.fsev=e.dataset.sev; selectTool("diag"); });
  on("#ovAll","click",function(){ selectTool("diag"); }); on("#ovReview","click",function(){ selectTool("diag"); });
  on("#ovFc","click",function(){ selectTool("fc"); }); on("#ovBrief","click",function(){ selectTool("brief"); });
  bindFCards(); bindRunPrompt();
  if(d.ctx.hasVol) kpiTiles("ovKpi");
}
function readinessSentence(d){ var c=d.counts;
  if(c.Critical) return c.Critical+" critical issue"+(c.Critical>1?"s":"")+" should be fixed before results are used.";
  if(c.High) return "No critical issues. "+c.High+" high-priority item"+(c.High>1?"s":"")+" to review.";
  return "No critical or high issues found by the checks that ran."; }
function runPrompt(){ return '<div class="empty">No assigned volumes yet, so output checks (over-capacity corridors, speeds, convergence) have not run.<div class="row w" style="margin-top:8px"><button class="btn pri" id="rpRun">'+svg("play")+'Run reference assignment</button><label class="btn" style="cursor:pointer">'+svg("dl")+'Import STEAM loaded network<input type="file" id="rpImp" accept=".csv,.txt" hidden></label></div><div class="tiny mute2" style="margin-top:6px">Reference run: Frank-Wolfe equilibrium, AM peak, 500 sampled origins (demand-scaled), about 2 minutes. Import accepts a CSV with A, B and a volume column (V_1, VOLUME, V ...).</div></div>'; }
function bindRunPrompt(){ on("#rpRun","click",function(b){ b.disabled=true; b.textContent="Running…"; referenceRun(); });
  on("#rpImp","change",function(i){ var f=i.files[0]; if(f) importFile(f); }); }
async function referenceRun(){
  await prepare(); switchApp("assign");
  await rpc("assign",{cmd:"set",id:"methodSel",value:"fw"}); await rpc("assign",{cmd:"set",id:"sampleSel",value:"500"});
  await rpc("assign",{cmd:"click",id:"runBtn"}); S.running={label:"Reference assignment", pct:0}; toast("Reference assignment started (Frank-Wolfe, 500 origins, about 2 minutes)"); audit("run","reference assignment started");
  var t0=Date.now(); var iv=setInterval(async function(){ var st=await ai("status",{},5000); if(st&&st.hasVol&&!st.running){ clearInterval(iv); S.running=null; toast("Assignment finished. Re-running the checks."); runDiagnose(); } if(Date.now()-t0>1800000) clearInterval(iv); },2000);
}
function importFile(f){ var rd=new FileReader(); rd.onload=async function(){ await prepare(); var r=await ai("import",{text:rd.result, name:f.name},120000);
  if(!r||!r.ok){ toast("Import failed: "+(r&&r.err||"")); return; } toast("Imported "+r.info.matched.toLocaleString()+" link volumes ("+r.info.unmatched+" unmatched)"); audit("data","imported "+f.name+" col "+r.info.col); runDiagnose(); }; rd.readAsText(f); }
async function kpiTiles(el){
  var inv=await ai("csi",{},30000); var d=S.diag; var st=await ai("status");
  var q=await ai("query",{q:{limit:1}}); var e=$(el); if(!e) return;
  var o='<div class="kpis">';
  if(inv&&inv.ok){ o+='<div class="kpi"><b>'+inv.emirate+'</b><span>Congestion severity index (emirate)</span></div><div class="kpi"><b>'+fmt(inv.over)+'</b><span>Links over capacity</span></div>'; }
  var g=d.ctx.gap; o+='<div class="kpi"><b>'+(g!=null?(g*100).toFixed(2)+'%':'n/a')+'</b><span>Relative gap</span></div>';
  o+='</div>'; e.innerHTML=o+'<div class="tiny mute2" style="margin-top:6px" title="'+h(ENGINE_TIP)+'">'+(d.ctx.volSource==="imported"?"Volumes imported from a STEAM loaded network.":"Volumes from the in-app assignment ("+h(d.ctx.period)+").")+'</div>';
}

/* ================= DIAGNOSE ================= */
function fCard(f){ var dp=S.disp[f.id]||{};
  return '<button class="fnd'+(f.id===S.selId?' sel':'')+(dp.st?' st-'+dp.st:'')+'" data-fid="'+f.id+'"><div class="row w">'+sevChip(f.severity)+'<span class="mute2 small">'+h(f.id)+' · '+h(f.check)+'</span><span class="grow"></span>'+prov(f.provenance)+'</div>'+
    '<div class="t">'+h(f.title)+'</div><div class="x dir">'+h(f.exec)+'</div><div class="x mod">'+h(f.rule)+'</div>'+
    (dp.st?'<div class="meta">'+h(dp.st)+(dp.owner?' · '+h(dp.owner):'')+(dp.why?' · '+h(dp.why):'')+'</div>':'')+'</button>'; }
function bindFCards(){ on(".fnd[data-fid]","click",function(e){ selectFinding(e.dataset.fid); }); }
function rDiagnose(){
  var d=S.diag, tab=S.tab.diag;
  if(!d){ body('<div class="card small">'+(S.diagStatus==="running"?"Running checks…":"Checks have not run yet.")+'</div><button class="btn pri" id="dgRun">Run checks</button>'); on("#dgRun","click",function(){ runDiagnose(); }); return; }
  if(tab==="lib") return rLibrary();
  if(tab==="rep") return rReports("diag");
  var fams=[]; d.findings.forEach(function(f){ var fam=(d.library.filter(function(c){return c.id===f.check;})[0]||{}).family; if(fam&&fams.indexOf(fam)<0) fams.push(fam); });
  var list=d.findings.filter(function(f){ if(S.fsev&&f.severity!==S.fsev) return false; if(S.ffam){ var fam=(d.library.filter(function(c){return c.id===f.check;})[0]||{}).family; if(fam!==S.ffam) return false; } return true; });
  var o='<div class="row w"><span class="small muted grow">'+list.length+' of '+d.findings.length+' findings · readiness '+d.health.score+'</span><button class="btn sm" id="dgRe">Re-run checks</button></div>';
  o+='<div class="tabsm">'+["Critical","High","Medium","Info"].map(function(s){ return '<button class="chip'+(S.fsev===s?' on':'')+'" data-fs="'+s+'">'+s+' '+d.counts[s]+'</button>'; }).join("")+'</div>';
  o+='<div class="tabsm">'+fams.map(function(f){ return '<button class="chip'+(S.ffam===f?' on':'')+'" data-ff="'+h(f)+'">'+h(f)+'</button>'; }).join("")+'</div>';
  o+=list.map(fCard).join("")||'<div class="empty">No findings match the filter.</div>';
  if(!d.ctx.hasVol) o+='<div class="sec"><h3>Output checks</h3>'+runPrompt()+'</div>';
  body(o); bindFCards(); bindRunPrompt();
  on("#dgRe","click",function(){ S.diag=null; runDiagnose(); });
  on("[data-fs]","click",function(e){ S.fsev=S.fsev===e.dataset.fs?null:e.dataset.fs; render(); });
  on("[data-ff]","click",function(e){ S.ffam=S.ffam===e.dataset.ff?null:e.dataset.ff; render(); });
}
function rLibrary(){
  var d=S.diag, o='<div class="small muted">'+h(d.health.coverage)+'. Checks that did not run say which input they need.</div><table class="t"><tr><th>Check</th><th>Status</th><th class="n">Hits</th></tr>';
  d.library.forEach(function(c){ var st=c.status==="ran"?'<span style="color:var(--good)">Ran</span>':c.status==="on_compare"?'<span class="muted">On compare</span>':'<span style="color:var(--high)">Not run</span>';
    o+='<tr><td><b>'+h(c.id)+'</b> '+h(c.name)+'<div class="tiny mute2">'+h(c.family)+' · needs '+h(c.needs)+(c.why?' · <span style="color:var(--high)">'+h(c.why)+'</span>':'')+'</div></td><td>'+st+'</td><td class="n">'+(c.n==null?"":c.n.toLocaleString())+'</td></tr>'; });
  body(o+'</table>');
}
async function selectFinding(id){
  S.selId=id; var f=S.diag&&S.diag.findings.filter(function(x){return x.id===id;})[0]; if(!f) return;
  document.querySelectorAll(".fnd").forEach(function(e){ e.classList.toggle("sel",e.dataset.fid===id); });
  switchApp("assign");
  var loc=await ai("finding",{id:id}); S.selLinks=loc&&loc.links||[];
  S.target={kind:"finding", label:f.id+" "+f.title, links:S.selLinks, bbox:loc&&loc.bbox};
  var zones=loc&&loc.zones||[];
  if(loc&&(loc.links&&loc.links.length||zones.length||loc.x!=null)) await ai("focus",{links:S.selLinks.slice(0,3000), zones:zones.slice(0,500), bbox:loc.bbox, x:loc.x, y:loc.y, color:"#36B7B4"});
  showMarkers(); openInspector(f.title, findingHTML(f)); bindFinding(f); audit("finding","opened "+f.id+" "+f.title);
}
function findingHTML(f){
  var dp=S.disp[f.id]||{};
  var o='<div class="row w">'+sevChip(f.severity)+prov(f.provenance)+'<span class="mute2 small">'+h(f.id)+' · '+h(f.check)+'</span></div>';
  o+='<div class="sec"><h3>In one line</h3><div style="font-size:13.5px;line-height:1.45">'+h(f.exec)+'</div></div>';
  o+='<div class="sec dir"><h3>What to do</h3><div class="small">'+h(f.action)+'</div><div class="tiny mute2">Expected effect: '+h(f.expected_effect)+'</div></div>';
  o+='<div class="sec mod"><h3>Evidence</h3><dl class="ev">'+(f.evidence||[]).map(function(e){ return '<dt>'+h(e[0])+'</dt><dd>'+h(e[1])+'</dd>'; }).join("")+'</dl></div>';
  o+='<div class="sec mod"><h3>Trace</h3><dl class="ev"><dt>Rule</dt><dd>'+h(f.rule)+'</dd><dt>Source file</dt><dd>'+h(f.source_file)+'</dd><dt>Record</dt><dd>'+h(f.source_rows)+'</dd><dt>Likely cause</dt><dd>'+h(f.likely_cause)+'</dd><dt>Suggested action</dt><dd>'+h(f.action)+'</dd><dt>Expected effect</dt><dd>'+h(f.expected_effect)+'</dd><dt>Method</dt><dd>'+h(f.effect_method)+'</dd><dt>Confidence</dt><dd>'+h(f.confidence)+'</dd></dl></div>';
  if(f.solutions){ o+='<div class="sec"><h3>Measures</h3>'+f.solutions.map(function(s,i){
      return '<div class="card small"><div class="row"><b class="grow">'+h(s.measure)+'</b>'+(s.estimate?prov("Screening estimate"):"")+'</div>'+
        (s.estimate?'<div style="margin-top:4px">Saves about <b>'+fmt(s.estimate.dvht)+' veh·h</b> in the period for '+s.estimate.lanekm.toFixed(1)+' lane-km</div>':'')+
        '<div class="tiny mute2" style="margin-top:3px">'+h(s.method)+(s.confidence&&s.confidence!=="—"?' · confidence '+h(s.confidence):'')+'</div>'+
        (s.note?'<div class="tiny" style="margin-top:3px">'+h(s.note)+'</div>':'')+
        (s.engine?'<div class="row" style="margin-top:6px"><button class="btn sm" data-eng="'+i+'">'+svg("play")+'Test in engine</button><span class="tiny mute2">runs +1 lane through the assignment (route choice responds)</span></div>':'')+'</div>'; }).join("")+'</div>'; }
  o+='<div class="sec"><h3>Next</h3><div class="row w"><button class="btn sm" id="fnPin">'+svg("pin")+'Add to briefing</button><button class="btn sm" id="fnStress">'+svg("stress")+'Stress test</button>'+(S.selLinks&&S.selLinks.length?'<button class="btn sm" id="fnHsm">HSM handoff</button>':'')+'</div></div>';
  o+='<div class="sec mod"><h3>Review</h3><div class="row w"><button class="btn sm" data-dp="accepted">Accept</button><button class="btn sm" data-dp="rejected">Reject</button><button class="btn sm" data-dp="assigned">Assign</button>'+(dp.st?'<button class="btn sm" data-dp="">Clear</button>':'')+'</div>'+(dp.st?'<div class="tiny mute2">'+h(dp.st)+(dp.owner?' to '+h(dp.owner):'')+(dp.why?': '+h(dp.why):'')+' · '+h(new Date(dp.at).toLocaleString())+'</div>':'')+'<div class="tiny mute2">Dispositions are stored on this device and feed the modeller-labelled back-test set.</div></div>';
  return o;
}
function bindFinding(f){
  on("#fnPin","click",function(){ pinFinding(f); });
  on("#fnStress","click",function(){ selectTool("stress"); });
  on("#fnHsm","click",function(){ hsmPack(S.target); });
  on("[data-eng]","click",function(b){ b.disabled=true; runStress({type:"capacity", lanes:1}); });
  on("[data-dp]","click",function(b){ var st=b.dataset.dp, rec={st:st, at:new Date().toISOString()};
    if(st==="rejected"){ var why=prompt("Reason for rejecting "+f.id+"?"); if(why==null) return; rec.why=why; }
    if(st==="assigned"){ var who=prompt("Assign "+f.id+" to (name or team)?"); if(!who) return; rec.owner=who; }
    if(!st) delete S.disp[f.id]; else S.disp[f.id]=rec; lsSet("disp",S.disp); audit("review",f.id+" "+(st||"cleared")); openInspector(f.title, findingHTML(f)); bindFinding(f); render(); });
}
function openInspector(title,html){ $("insTitle").textContent=title; $("insBody").innerHTML=html; var e=$("inspector"); e.classList.add("show"); e.classList.remove("peek"); }
function closeInspector(){ $("inspector").classList.remove("show"); }

/* ---------------- link inspector (map pick) ---------------- */
async function openLink(g){
  var p=await ai("link",{g:g}); if(!p||!p.ok) return;
  S.target={kind:"link", label:"Link "+p.A+"-"+p.B, links:[g], bbox:[p.x-800,p.y-800,p.x+800,p.y+800]};
  var o='<div class="row w">'+prov(p.volSource||"Checked on file")+'<span class="mute2 small">'+h(p.cls)+' · '+h(p.district)+'</span></div>';
  if(p.vol!=null) o+='<div class="kpis"><div class="kpi"><b>'+fmt(p.vol)+'</b><span>Volume (veh)</span></div><div class="kpi"><b>'+p.vc.toFixed(2)+'</b><span>V/C</span></div><div class="kpi"><b>'+fmt(p.spd)+'</b><span>Speed km/h</span></div></div>';
  if(p.tol!=null) o+='<div class="small muted">Numerical tolerance on this link: ± '+fmt(p.tol)+' veh</div>';
  o+='<div class="sec"><h3>Attributes '+prov("Checked on file")+'</h3><dl class="ev"><dt>A → B</dt><dd>'+p.A+' → '+p.B+'</dd><dt>LTYPE_2040</dt><dd>'+p.ltype+' ('+h(p.cls)+')</dd><dt>Lanes</dt><dd>'+p.lanes+'</dd><dt>Length stored / geometry</dt><dd>'+p.len+' m / '+p.geomLen+' m</dd><dt>Capacity</dt><dd>'+fmt(p.cap)+' veh/h</dd><dt>Free-flow speed</dt><dd>'+p.ffspd+' km/h</dd>'+(p.delay!=null?'<dt>Delay</dt><dd>'+fmt(p.delay)+' veh·h</dd>':'')+(p.base!=null&&p.scn!=null?'<dt>Base → scenario</dt><dd>'+fmt(p.base)+' → '+fmt(p.scn)+'</dd>':'')+'<dt>Record</dt><dd class="tiny">'+h(p.source)+'</dd></dl></div>';
  if(p.series){ o+='<div class="sec"><h3>AI forecast V/C '+prov("Surrogate estimate")+'</h3>'+seriesChart(p.series,p.steam2040)+'<div class="tiny mute2">Band: growth range. Dot: 2040 engine run of the STEAM 2040 OD (horizon point). Elasticity e = '+p.e+'.</div></div>'; }
  else o+='<div class="tiny mute2">Fit the forecast surrogate (Forecast workspace) to see this link\'s V/C path to 2050 with a range.</div>';
  o+='<div class="row w"><button class="btn sm" id="lkPin">'+svg("pin")+'Add to briefing</button><button class="btn sm" id="lkStress">'+svg("stress")+'Use as stress target</button></div>';
  openInspector("Link "+p.A+" → "+p.B, o);
  on("#lkPin","click",function(){ pinBlock({kind:"link", title:"Link "+p.A+"-"+p.B+" ("+p.cls+", "+p.district+")", sentence:p.vol!=null?(p.cls+" link at V/C "+p.vc.toFixed(2)+" carrying "+fmt(p.vol)+" veh in the period."):"Link attributes.", evidence:[["V/C",p.vc],["Volume",p.vol],["Lanes",p.lanes],["Capacity",p.cap]], action:"Review in context of the corridor.", prov:p.volSource||"Checked on file"}); });
  on("#lkStress","click",function(){ selectTool("stress"); });
}
function seriesChart(s,steam){
  var W=330,H=130,pl=32,pr=8,pt=8,pb=20; var ys=s.map(function(p){return p.y;}), x0=ys[0], x1=ys[ys.length-1];
  var vmax=Math.max(1.2,Math.max.apply(null,s.map(function(p){return p.hi;}))*1.08);
  var X=function(y){ return pl+(y-x0)/(x1-x0)*(W-pl-pr); }, Y=function(v){ return pt+(1-v/vmax)*(H-pt-pb); };
  var band=s.map(function(p){return X(p.y)+","+Y(p.hi);}).join(" ")+" "+s.slice().reverse().map(function(p){return X(p.y)+","+Y(p.lo);}).join(" ");
  var line=s.map(function(p){return X(p.y)+","+Y(p.vc);}).join(" ");
  var o='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="V/C forecast"><line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(1)+'" y2="'+Y(1)+'" stroke="var(--crit)" stroke-dasharray="3 3" stroke-width="1"/>'+
    '<text x="'+(W-pr)+'" y="'+(Y(1)-3)+'" text-anchor="end" font-size="9" fill="var(--dim)">capacity</text>'+
    '<polygon points="'+band+'" fill="var(--accent)" opacity=".18"/><polyline points="'+line+'" fill="none" stroke="var(--accent)" stroke-width="2"/>';
  s.forEach(function(p){ o+='<circle cx="'+X(p.y)+'" cy="'+Y(p.vc)+'" r="3" fill="var(--accent)"><title>'+p.y+': V/C '+p.vc+' (range '+p.lo+' to '+p.hi+')</title></circle><text x="'+X(p.y)+'" y="'+(H-6)+'" text-anchor="middle" font-size="9" fill="var(--dim)">'+p.y+'</text>'; });
  if(steam!=null) o+='<circle cx="'+X(2040)+'" cy="'+Y(steam)+'" r="4.5" fill="none" stroke="var(--txt)" stroke-width="1.6"><title>2040 engine run: V/C '+steam+'</title></circle>';
  [0,0.5,1].forEach(function(v){ o+='<text x="'+(pl-4)+'" y="'+(Y(v)+3)+'" text-anchor="end" font-size="9" fill="var(--dim)">'+v.toFixed(1)+'</text>'; });
  return o+'</svg>'; }

/* ================= COMPARE ================= */
async function loadCompare(){ S.cmp=await ai("compare",{screen:S.noise},60000); setCtx(); if(S.ws==="cmp") rCompare(); }
function rCompare(){
  var c=S.cmp;
  if(!c){ body('<div class="small muted">Reading base and scenario…</div>'); loadCompare(); return; }
  if(!c.ok){ body('<div class="empty">'+h(c.err)+'<div class="row w" style="margin-top:8px"><button class="btn" id="cpScn">'+svg("scn")+'Open Scenario tool</button><button class="btn pri" id="cpStress">'+svg("stress")+'Run a stress test</button></div></div>');
    on("#cpScn","click",function(){ selectTool("scn"); }); on("#cpStress","click",function(){ selectTool("stress"); }); return; }
  var b=c.kpi.base, s=c.kpi.scn;
  var o='<div class="card"><div class="row"><b class="grow">'+(S.stress?h(S.stress.label):"In-app scenario vs base")+'</b>'+prov("Engine output")+'</div><div class="small muted" style="margin-top:4px">'+c.changed.toLocaleString()+' links changed</div></div>';
  o+='<div class="kpis"><div class="kpi"><b class="up">'+c.busier.toLocaleString()+'</b><span>Busier</span></div><div class="kpi"><b class="dn">'+c.quieter.toLocaleString()+'</b><span>Quieter</span></div><div class="kpi"><b>'+(c.assessed?c.inside.toLocaleString():"n/a")+'</b><span>Inside tolerance</span></div></div>';
  o+='<div class="row"><label class="row small" style="cursor:pointer"><input type="checkbox" id="cpNoise" '+(S.noise?"checked":"")+(c.assessed?"":" disabled")+'> Hide changes inside the numerical tolerance</label></div><div class="note mod">'+h(c.tolNote)+'</div>';
  if(!c.assessed) o+='<div class="warnbox small dir">Small differences cannot be judged here because one run is not a converged equilibrium. All changes are shown.</div>';
  o+='<div class="sec"><h3>Network KPIs</h3><table class="t"><tr><th>KPI</th><th class="n">Base</th><th class="n">Scenario</th><th class="n">Change</th></tr>'+
    [["Vehicle-hours (VHT)",b.vht,s.vht],["Vehicle-km (VKT)",b.vmt,s.vmt],["Delay (veh·h)",b.delay,s.delay],["Average speed (km/h)",b.spd,s.spd],["Links over capacity",b.over,s.over]].map(function(r){ var d=r[2]-r[1];
      return '<tr><td>'+r[0]+'</td><td class="n">'+fmt(r[1])+'</td><td class="n">'+fmt(r[2])+'</td><td class="n '+(r[0].indexOf("speed")>0?(d>0?"dn":"up"):(d>0?"up":"dn"))+'">'+sgn(d)+' ('+sgn(pct(r[2],r[1]),1)+'%)</td></tr>'; }).join("")+'</table></div>';
  o+='<div class="sec"><h3>Largest significant changes</h3><table class="t">'+c.top.map(function(r,i){ return '<tr class="click" data-cg="'+r.g+'"><td>'+h(r.name)+'</td><td class="n">'+fmt(r.base)+' → '+fmt(r.scn)+'</td><td class="n '+(r.d>0?"up":"dn")+'">'+sgn(r.d)+'</td></tr>'; }).join("")+'</table></div>';
  if(c.districts&&c.districts.length) o+='<div class="sec"><h3>By district (Δ vehicle-km)</h3><table class="t">'+c.districts.map(function(r){ return '<tr><td>'+h(r.name)+'</td><td class="n">'+r.links+' links</td><td class="n '+(r.dvkt>0?"up":"dn")+'">'+sgn(r.dvkt)+'</td></tr>'; }).join("")+'</table></div>';
  if(c.shifts) o+='<div class="sec"><h3>SCN-01 · Unexplained shifts</h3><div class="card small">'+(c.shifts.n?'<b>'+c.shifts.n+'</b> significant link changes sit more than 5 km from any changed input.':'No significant changes outside the input catchment.')+'<div class="tiny mute2" style="margin-top:4px">'+h(c.shifts.note)+'</div>'+(c.shifts.n?'<button class="btn sm" id="cpShift" style="margin-top:6px">Show on map</button>':'')+'</div></div>';
  o+='<div class="row w"><button class="btn sm" id="cpPin">'+svg("pin")+'Add to briefing</button><button class="btn sm" id="cpRe">Refresh</button></div>';
  body(o);
  on("#cpNoise","change",function(e){ S.noise=e.checked; ai("noise",{on:S.noise}); loadCompare(); });
  on("[data-cg]","click",function(e){ var g=+e.dataset.cg; ai("focus",{links:[g]}); openLink(g); });
  on("#cpShift","click",function(){ ai("focus",{links:c.shifts.links, color:"#F5A524"}); });
  on("#cpRe","click",function(){ S.cmp=null; rCompare(); });
  on("#cpPin","click",function(){ pinBlock({kind:"compare", title:(S.stress?S.stress.label:"Scenario")+" vs base", sentence:"VHT "+sgn(pct(s.vht,b.vht),1)+"%, "+c.busier.toLocaleString()+" links busier and "+c.quieter.toLocaleString()+" quieter beyond the numerical tolerance.", evidence:[["VHT base / scenario",fmt(b.vht)+" / "+fmt(s.vht)],["Links over capacity",b.over+" → "+s.over],["Inside tolerance",c.assessed?c.inside:"not assessed"]], action:"Confirm with a full STEAM run before reporting.", prov:"Engine output"}); });
}

/* ================= STRESS TESTS ================= */
function rStress(){
  var t=S.target, st=S.stress;
  var o='<div class="card small"><div class="row"><b class="grow">Target</b>'+(t?'<span class="mute2">'+(t.links?t.links.length.toLocaleString()+' links':'')+'</span>':'')+'</div><div style="margin-top:4px">'+(t?h(t.label):'None selected. Pick a finding or hotspot, or tap a road on the map.')+'</div></div>';
  o+='<div class="sec"><h3>Network-wide</h3><div class="row w"><button class="btn" data-st="growth" data-p="10">Demand +10%</button><button class="btn" data-st="growth" data-p="20">Population growth +20%</button><button class="btn" data-st="spike" data-p="25">Demand spike +25%</button></div></div>';
  o+='<div class="sec"><h3>On the target</h3><div class="row w"><button class="btn" data-st="closure"'+(t?'':' disabled')+'>Close / failure</button><button class="btn" data-st="capacity"'+(t?'':' disabled')+'>+1 lane</button><button class="btn" data-st="toll"'+(t?'':' disabled')+'>Road-user charge</button><input class="fld" id="stAed" type="number" value="4" min="1" max="50" style="width:64px" title="AED per trip through the target"><span class="small muted">AED</span></div></div>';
  o+='<div class="sec mod"><h3>Engine profile</h3><div class="row w"><select class="fld" id="stMeth"><option value="fw">Frank-Wolfe</option><option value="msa">MSA equilibrium</option><option value="bpr">BPR incremental</option></select><select class="fld" id="stSamp"><option value="250" selected>250 origins</option><option value="500">500 origins</option><option value="1000">1000 origins</option><option value="0">all origins</option></select></div><div class="tiny mute2">Base and test use the same profile and the same sampled origins (demand-scaled), so the pair is comparable.</div></div>';
  if(S.running) o+='<div class="card small"><div class="row"><b class="grow">'+h(S.running.label)+'</b><span>'+Math.round(S.running.pct||0)+'%</span></div><div class="prog" style="margin-top:6px"><i style="width:'+(S.running.pct||0)+'%"></i></div></div>';
  if(st&&st.ok){ var b=st.base, s=st.scn;
    o+='<div class="sec"><h3>Result '+prov("Engine output")+'</h3><div class="card"><b>'+h(st.label)+'</b><div class="kpis" style="margin-top:8px"><div class="kpi"><b class="'+(s.vht>b.vht?"up":"dn")+'">'+sgn(pct(s.vht,b.vht),1)+'%</b><span>Vehicle-hours</span></div><div class="kpi"><b>'+sgn(s.over-b.over,0)+'</b><span>Links over capacity</span></div><div class="kpi"><b>'+sgn(s.spd-b.spd,1)+'</b><span>Avg speed km/h</span></div></div>'+
      '<div class="tiny mute2" style="margin-top:6px">'+h(st.method)+'. '+h(st.note)+'</div></div>'+
      '<div class="row w"><button class="btn sm" id="stCmp">'+svg("cmp")+'Open in Compare</button><button class="btn sm" id="stPin">'+svg("pin")+'Add to briefing</button><button class="btn sm" id="stSpec">Scenario spec</button><button class="btn sm" id="stQueue" title="needs the ITC workstation adapter">Queue full STEAM run</button></div></div>'; }
  if(st&&!st.ok) o+='<div class="warnbox">'+h(st.err||"Stress test failed")+'</div>';
  body(o);
  var m=$("stMeth"), sp=$("stSamp"); if(S.screen){ m.value=S.screen.method; sp.value=S.screen.sample; }
  on("#stMeth,#stSamp","change",function(){ S.screen={method:m.value, sample:sp.value}; ai("setscreen",S.screen); });
  on("[data-st]","click",function(b){ runStress({type:b.dataset.st, pct:+b.dataset.p||undefined, aed:+($("stAed")||{}).value||4, lanes:1}); });
  on("#stCmp","click",function(){ selectTool("cmp"); });
  on("#stPin","click",function(){ var b=st.base, s=st.scn; pinBlock({kind:"stress", title:st.label, sentence:"Under this test, vehicle-hours change by "+sgn(pct(s.vht,b.vht),1)+"% and "+sgn(s.over-b.over,0)+" links move over capacity.", evidence:[["VHT",fmt(b.vht)+" → "+fmt(s.vht)],["Over capacity",b.over+" → "+s.over],["Method",st.method]], action:"Confirm with a full STEAM run.", prov:"Engine output"}); });
  on("#stSpec","click",function(){ showSpec(specFromStress(st)); });
  on("#stQueue","click",function(){ queueSteam(); });
}
async function runStress(o){
  if(S.running){ toast("An engine run is already in progress."); return; }
  if(["closure","capacity","toll"].indexOf(o.type)>=0){ if(!S.target||!S.target.links||!S.target.links.length){ toast("Pick a target first."); return; } o.links=S.target.links; }
  if(S.ws!=="stress") selectTool("stress");
  await prepare(); switchApp("assign");
  S.running={label:"Stress test: "+o.type, pct:0}; S.stress=null; rStress(); audit("run","stress "+o.type+" started");
  var r=await ai("stress",o,3600000); S.running=null;
  S.stress=r&&r.ok?r:{ok:false, err:(r&&r.err)||"no reply"}; if(r&&r.ok){ S.cmp=r.compare; S.justStressed=true; audit("run","stress "+r.label+": VHT "+fmt(r.base.vht)+" → "+fmt(r.scn.vht)); }
  setCtx(); if(S.ws==="stress") rStress(); else render();
}
function specFromStress(st){ return {schema_version:"1.0", scenario_id:"draft-"+Date.now().toString(36), parent_run_id:"steam-2040-reference", status:"draft", year:2040, period_ids:["am_peak"], network_version:"steam-2040", zone_system_version:"steam-2040-3692",
  interventions:[{type:st.spec.type, target_entity_ids:(S.target&&S.target.links||[]).slice(0,50).map(function(g){return "link:"+g;}), parameter:st.spec.type==="toll"?"charge_aed":st.spec.type==="capacity"?"lanes_add":st.spec.type==="closure"?"capacity_factor":"demand_factor", new_value:st.spec.type==="toll"?st.spec.aed:st.spec.type==="capacity"?1:st.spec.type==="closure"?0:1+(st.spec.pct||0)/100, assumption_source:"user-proposed test"}],
  constraints:[], evaluation_method:"engine_screening (in-app assignment); STEAM confirmation pending", evidence_refs:[] }; }
function showSpec(spec){ modal("Scenario specification (draft)", '<div class="small muted">Structured spec in the proposed STEAM-AI scenario contract. It is what a STEAM or HSM job would receive once a connector is configured.</div><pre class="specbox">'+h(JSON.stringify(spec,null,2))+'</pre><button class="btn sm" id="spDl">'+svg("dl")+'Download JSON</button>');
  on("#spDl","click",function(){ download("scenario-spec.json", JSON.stringify(spec,null,2), "application/json"); }); }
function queueSteam(){ modal("Queue full STEAM run", '<div class="warnbox">No STEAM job connector is configured in this deployment. Model runs execute on ITC workstations (Cube / OpenPaths via CubePy); this browser build cannot launch them.</div><div class="small" style="margin-top:8px">Download the scenario spec and hand it to the modeller, or configure the workstation adapter (Data &amp; Models, Integrations) when it is approved.</div>'); audit("job","queue STEAM run requested: connector not configured"); }

/* ================= FORECAST ================= */
async function runForecast(show){
  var p=S.fcParams; lsSet("fc",p);
  var r=await ai("forecast",{year:p.year, rate:p.rate, span:p.span, th:p.th, show:show!==false},60000);
  S.fc=r; setCtx();
  if(r&&r.ok){ ai("markers",{markers:r.hotspots.slice(0,25).map(function(h_,i){ return {x:h_.x,y:h_.y,sev:h_.cat==="High"?"Critical":h_.cat==="Medium"?"High":"Medium",label:"#"+h_.rank,ph:i*.11}; })}); audit("forecast","year "+p.year+" rate "+p.rate+"%: "+r.total+" hotspots"); }
  if(S.ws==="fc") rForecast();
}
async function fitSurrogate(){
  if(S.running){ toast("An engine run is already in progress."); return; }
  await prepare(); switchApp("assign"); S.running={label:"Fitting surrogate (3 engine runs)", pct:0}; rForecast(); audit("model","surrogate fit started");
  var r=await ai("fit",{},3600000); S.running=null;
  if(r&&r.ok){ S.card=r.card; toast("Surrogate fitted. Back-test MAE "+r.card.metrics.mae+" veh vs naive "+r.card.metrics.maeNaive); audit("model","surrogate fitted: MAE "+r.card.metrics.mae+", naive "+r.card.metrics.maeNaive); runForecast(); }
  else { toast("Fit failed: "+(r&&r.err||"no reply")); rForecast(); }
}
function rForecast(){
  var tab=S.tab.fc, p=S.fcParams, f=S.fc;
  var o='<div class="card"><div class="row"><b class="grow">Year <span id="fcYv">'+p.year+'</span></b>'+(f&&f.ok?prov(f.provenance):"")+'</div><input type="range" id="fcY" min="2026" max="2050" step="1" value="'+p.year+'" style="width:100%;margin-top:6px" aria-label="Forecast year">'+
    '<div class="row small mute2"><span>2026</span><span class="grow" style="text-align:center">STEAM horizon 2040</span><span>2050</span></div>'+
    '<div class="row w mod" style="margin-top:6px"><label class="small">Growth <input class="fld" id="fcR" type="number" step="0.1" value="'+p.rate+'" style="width:60px">%/yr</label><label class="small">± <input class="fld" id="fcS" type="number" step="0.1" value="'+p.span+'" style="width:52px"> pp</label><label class="small">V/C ≥ <input class="fld" id="fcT" type="number" step="0.05" value="'+p.th+'" style="width:58px"></label></div></div>';
  if(S.running) o+='<div class="card small"><div class="row"><b class="grow">'+h(S.running.label)+'</b><span>'+Math.round(S.running.pct||0)+'%</span></div><div class="prog" style="margin-top:6px"><i style="width:'+(S.running.pct||0)+'%"></i></div></div>';
  if(!S.card&&!S.running) o+='<div class="warnbox small">No surrogate fitted yet, so the map uses a proportional sketch (volume grows with demand) labelled Illustrative. Fit the surrogate for link-specific responses, a back-test and a model card.<div style="margin-top:6px"><button class="btn sm pri" id="fcFit">'+svg("play")+'Fit surrogate (3 engine runs)</button></div></div>';
  if(tab==="hot"){
    if(!f){ o+='<div class="small muted">Computing…</div>'; body(o); bindFc(); runForecast(); return; }
    if(!f.ok){ o+='<div class="empty">'+h(f.err)+'</div>'+runPrompt(); body(o); bindFc(); bindRunPrompt(); return; }
    o+='<div class="kpis"><div class="kpi"><b>'+f.total+'</b><span>Emerging hotspots</span></div><div class="kpi"><b>'+fmt(f.over)+'</b><span>Links over capacity</span></div><div class="kpi"><b>'+f.csi+'</b><span>Severity index</span></div></div>';
    o+='<div class="note">'+h(f.horizonNote)+' '+h(f.assumption)+'</div>';
    o+='<div class="sec"><h3>Ranked hotspots <span class="r mute2 small">risk = scenario-range category, not a probability</span></h3>'+f.hotspots.slice(0,20).map(function(x){
      return '<button class="fnd" data-hs="'+x.rank+'"><div class="row w"><b>#'+x.rank+'</b>'+sevChip(x.cat==="High"?"Critical":x.cat==="Medium"?"High":"Medium").replace(/(Critical|High|Medium)<\/span>$/,x.cat+' risk</span>')+'<span class="grow"></span>'+(x.flag.indexOf("earlier")===0?'<span class="prov p-scr">earlier than STEAM</span>':x.flag.indexOf("beyond")===0?'<span class="prov p-ill">beyond horizon</span>':'<span class="prov p-engine">in 2040 run</span>')+'</div>'+
        '<div class="t">'+h(x.name)+'</div><div class="x">'+(x.byNow?'Over V/C '+p.th+' already by 2026 on this growth path. ':x.onset?'Crosses V/C '+p.th+' around <b>'+Math.round(x.onset)+'</b>. ':'')+'V/C '+x.vcY+' in '+f.year+' (range '+x.vcLo+' to '+x.vcHi+') over '+x.km+' km.'+(x.implausible?' <span style="color:var(--high)">V/C above 3 is implausible: check the model before quoting.</span>':'')+'</div></button>'; }).join("")+'</div>';
  } else if(tab==="vs"){ o+='<div id="fcVs" class="small muted">Loading…</div>'; }
  else if(tab==="csi"){ o+='<div id="fcCsi" class="small muted">Loading…</div>'; }
  else if(tab==="card"){ o+=cardHTML(S.card); }
  body(o); bindFc();
  if(tab==="vs") loadVs(); if(tab==="csi") loadCsi();
}
function bindFc(){
  var t=null; on("#fcY","input",function(e){ S.fcParams.year=+e.value; $("fcYv").textContent=e.value; clearTimeout(t); t=setTimeout(function(){ runForecast(); },250); });
  on("#fcR,#fcS,#fcT","change",function(){ S.fcParams.rate=+$("fcR").value; S.fcParams.span=+$("fcS").value; S.fcParams.th=+$("fcT").value; runForecast(); });
  on("#fcFit","click",function(){ fitSurrogate(); });
  on("[data-hs]","click",function(e){ var x=S.fc.hotspots.filter(function(q){return q.rank===+e.dataset.hs;})[0]; if(x) openHotspot(x); });
}
function openHotspot(x){
  S.target={kind:"hotspot", label:"Hotspot #"+x.rank+" "+x.name, links:x.links, bbox:x.bbox};
  ai("focus",{links:x.links, bbox:x.bbox, color:"#F5A524"});
  var mx=Math.max.apply(null,x.drivers.map(function(d){return Math.abs(d[1]);}).concat([0.1]));
  var o='<div class="row w">'+prov(S.fc.provenance)+'<span class="prov p-scr">'+h(x.flag)+'</span></div>';
  o+='<div style="font-size:13.5px;line-height:1.45">'+h(x.name)+(x.byNow?' is already over capacity by 2026 on this growth path.':x.onset?' is expected to cross capacity around '+Math.round(x.onset)+'.':' is near capacity.')+' Risk category: <b>'+x.cat+'</b>.'+(x.implausible?' V/C above 3 is not physically possible, so treat this as a model problem first.':'')+'</div>';
  o+='<div class="kpis"><div class="kpi"><b>'+x.vcY+'</b><span>V/C in '+S.fc.year+'</span></div><div class="kpi"><b>'+x.vc1+'</b><span>V/C 2040 run</span></div><div class="kpi"><b>'+x.km+'</b><span>km affected</span></div></div>';
  o+='<div class="sec"><h3>Drivers <span class="r mute2 small">additive, log V/C vs class median</span></h3>'+x.drivers.map(function(d){ var w=Math.min(50,Math.abs(d[1])/mx*50);
    return '<div class="drv"><span>'+h(d[0])+'</span><span class="z"><i style="'+(d[1]>=0?'left:50%;width:'+w+'%;background:var(--crit)':'right:50%;width:'+w+'%;background:var(--good)')+'"></i></span><span class="n small">'+(d[1]>0?"+":"")+d[1]+'</span></div>'; }).join("")+
    '<div class="tiny mute2">An exact decomposition of the surrogate formula, not a causal attribution.</div></div>';
  o+='<div class="row w"><button class="btn sm" id="hsPin">'+svg("pin")+'Add to briefing</button><button class="btn sm" id="hsSt">'+svg("stress")+'Stress test</button><button class="btn sm" id="hsHsm">HSM handoff</button><button class="btn sm" id="hsLk">Peak link</button></div>';
  openInspector("Hotspot #"+x.rank, o);
  on("#hsPin","click",function(){ pinHotspot(x); }); on("#hsSt","click",function(){ selectTool("stress"); });
  on("#hsHsm","click",function(){ hsmPack(S.target); }); on("#hsLk","click",function(){ openLink(x.peak); });
}
async function loadVs(){ var r=await ai("aivs"); var e=$("fcVs"); if(!e) return;
  if(!r||!r.ok){ e.innerHTML='<div class="empty">'+h(r&&r.err||"")+' The comparison needs the surrogate: it predicts the 2040 horizon from the f = 0.85 training run and is checked against the engine run of the STEAM 2040 OD.</div>'; return; }
  var c=r.card;
  e.innerHTML='<div class="'+(c.beatsNaive?"okbox":"warnbox")+'">Held-out back-test: surrogate MAE <b>'+c.metrics.mae+'</b> veh vs naive proportional scaling <b>'+c.metrics.maeNaive+'</b>. '+(c.beatsNaive?"The surrogate beats the naive baseline.":"The surrogate does <b>not</b> beat the naive baseline; use it with care.")+' GEH &lt; 5 on '+c.metrics.geh5+'% of links.</div>'+
    '<div class="sec"><h3>Largest disagreements at the 2040 horizon</h3><table class="t"><tr><th>Link</th><th class="n">Engine</th><th class="n">AI</th><th>Likely reason</th></tr>'+r.rows.map(function(x){ return '<tr class="click" data-vg="'+x.g+'"><td>'+h(x.name)+'<div class="tiny mute2">V/C '+x.vc+'</div></td><td class="n">'+fmt(x.engine)+'</td><td class="n">'+fmt(x.ai)+'</td><td class="small">'+h(x.reason)+'</td></tr>'; }).join("")+'</table>'+
    '<div class="tiny mute2">Engine = in-app assignment of the STEAM 2040 OD, standing in for the STEAM horizon run until STEAM loaded networks are imported.</div></div>';
  on("[data-vg]","click",function(t){ var g=+t.dataset.vg; ai("focus",{links:[g]}); openLink(g); }); }
async function loadCsi(){ var r=await ai("csi"); var e=$("fcCsi"); if(!e) return;
  if(!r||!r.ok){ e.innerHTML='<div class="empty">'+h(r&&r.err||"No volumes")+'</div>'; return; }
  e.innerHTML='<div class="kpis"><div class="kpi"><b>'+r.emirate+'</b><span>Emirate CSI</span></div><div class="kpi"><b>'+fmt(r.over)+'</b><span>Links over capacity</span></div></div><div class="note">'+h(r.formula)+'</div>'+
    '<div class="sec"><h3>By district</h3><table class="t"><tr><th>District</th><th class="n">CSI</th><th class="n">VKT</th><th class="n">Over cap.</th></tr>'+r.districts.slice(0,25).map(function(x){ return '<tr><td>'+h(x.name)+'<div class="bar" style="margin-top:3px"><i style="width:'+x.csi+'%"></i></div></td><td class="n">'+x.csi+'</td><td class="n">'+fmt(x.vkt)+'</td><td class="n">'+x.over+'</td></tr>'; }).join("")+'</table></div>'+
    '<div class="sec"><h3>By road class</h3><table class="t">'+r.classes.map(function(x){ return '<tr><td>'+h(x.name)+'</td><td class="n">'+x.csi+'</td><td class="n">'+x.over+' over</td></tr>'; }).join("")+'</table></div>'; }
function cardHTML(c){ if(!c) return '<div class="empty">No surrogate fitted yet.</div>';
  return '<div class="card"><b>'+h(c.name)+'</b><dl class="ev" style="margin-top:8px"><dt>Target</dt><dd>'+h(c.target)+'</dd><dt>Formula</dt><dd>'+h(c.formula)+'</dd><dt>Training data</dt><dd>'+h(c.training)+'</dd><dt>Validation</dt><dd>'+h(c.validation)+'</dd><dt>MAE / naive MAE</dt><dd>'+c.metrics.mae+' / '+c.metrics.maeNaive+' veh</dd><dt>RMSE / bias</dt><dd>'+c.metrics.rmse+' / '+c.metrics.bias+' veh</dd><dt>GEH &lt; 5</dt><dd>'+c.metrics.geh5+'% of '+c.metrics.links.toLocaleString()+' links</dd><dt>Beats naive</dt><dd>'+(c.beatsNaive?"Yes":"No")+'</dd><dt>Valid domain</dt><dd>'+h(c.domain)+'</dd><dt>Known failure cases</dt><dd>'+c.failure.map(h).join("<br>")+'</dd><dt>Last fitted</dt><dd>'+h(new Date(c.fittedAt).toLocaleString())+'</dd></dl></div>'; }

/* ================= BRIEFINGS ================= */
function saveBrief(){ if(!lsSet("brief",S.brief)){ var lite=JSON.parse(JSON.stringify(S.brief)); lite.blocks.forEach(function(b){ delete b.img; }); lsSet("brief",lite); toast("Saved without map images (device storage full)."); } }
async function snap(){ var r=await ai("snapshot",{},20000); return r&&r.ok?r.png:null; }
async function pinBlock(b){
  if(S.brief.issued){ toast("This brief is issued. Start a new brief to add blocks."); return; }
  b.img=await snap(); b.at=new Date().toISOString(); b.id="B"+Date.now().toString(36);
  S.brief.blocks.push(b); saveBrief(); audit("brief","pinned "+b.title); toast("Added to briefing ("+S.brief.blocks.length+" blocks)");
}
function pinFinding(f){ pinBlock({kind:"finding", ref:f.id, title:f.title, sentence:f.exec, evidence:(f.evidence||[]).slice(0,6), action:f.action, prov:f.provenance, rule:f.rule, source:f.source_file+" · "+f.source_rows, sev:f.severity}); }
function pinHotspot(x){ pinBlock({kind:"hotspot", title:"Hotspot #"+x.rank+": "+x.name, sentence:x.name+(x.onset?" is expected to reach capacity around "+Math.round(x.onset):" is near capacity")+" ("+x.cat.toLowerCase()+" risk under the growth range).", evidence:[["V/C "+S.fc.year,x.vcY+" (range "+x.vcLo+" to "+x.vcHi+")"],["V/C 2040 run",x.vc1],["Length",x.km+" km"],["Flag",x.flag]], action:"Test measures in Stress tests; confirm with STEAM.", prov:S.fc.provenance}); }
function rBrief(){
  if(S.tab.brief==="reports") return rReports("brief");
  var B=S.brief, iss=!!B.issued;
  var o='<div class="card"><div class="row"><b class="grow">Decision brief</b>'+(iss?'<span class="prov p-file">Issued '+h(new Date(B.issued.at).toLocaleDateString())+' · '+h(B.issued.by)+'</span>':'<span class="prov p-ill">Working draft</span>')+'</div>'+
    '<label class="small muted" style="display:block;margin-top:8px">Decision or question</label><textarea class="fld" id="brQ" '+(iss?"disabled":"")+'>'+h(B.q)+'</textarea>'+
    '<label class="small muted" style="display:block;margin-top:6px">Recommended next step</label><textarea class="fld" id="brR" '+(iss?"disabled":"")+'>'+h(B.rec)+'</textarea>'+
    '<label class="small muted" style="display:block;margin-top:6px">Responsible reviewer</label><input class="fld" id="brV" style="width:100%" '+(iss?"disabled":"")+' value="'+h(B.reviewer)+'"></div>';
  o+='<div class="sec"><h3>Blocks <span class="r mute2 small">'+B.blocks.length+'</span></h3>';
  if(!B.blocks.length) o+='<div class="empty">Pin findings, hotspots, stress tests or links with “Add to briefing”. Each block keeps a map view, one sentence, its evidence and a recommended action.</div>';
  B.blocks.forEach(function(b,i){ o+='<div class="story">'+(b.img?'<img alt="Map view for '+h(b.title)+'" src="'+b.img+'">':'')+'<div class="b"><div class="row w">'+(b.sev?sevChip(b.sev):'')+prov(b.prov||"Illustrative")+'<span class="grow"></span>'+(iss?'':'<button class="btn sm" data-mv="'+i+'" data-d="-1" aria-label="Move up">↑</button><button class="btn sm" data-mv="'+i+'" data-d="1" aria-label="Move down">↓</button><button class="btn sm" data-rm="'+i+'" aria-label="Remove">✕</button>')+'</div>'+
      '<div class="s" '+(iss?'':'contenteditable="true"')+' data-ed="'+i+'" data-k="title">'+h(b.title)+'</div><div class="small" '+(iss?'':'contenteditable="true"')+' data-ed="'+i+'" data-k="sentence">'+h(b.sentence)+'</div>'+
      '<dl class="ev mod">'+(b.evidence||[]).map(function(e){ return '<dt>'+h(e[0])+'</dt><dd>'+h(e[1])+'</dd>'; }).join("")+'</dl><div class="small"><b>Action:</b> <span '+(iss?'':'contenteditable="true"')+' data-ed="'+i+'" data-k="action">'+h(b.action)+'</span></div>'+(b.source?'<div class="tiny mute2 mod">'+h(b.source)+'</div>':'')+'</div></div>'; });
  o+='</div><div class="row w"><button class="btn pri" id="brDocx">'+svg("dl")+'Brief (DOCX)</button><button class="btn" id="brPdf">Print / PDF</button><button class="btn" id="brJson">Story feed (JSON)</button>'+(iss?'<button class="btn" id="brNew">New brief</button>':'<button class="btn" id="brIssue">Issue snapshot</button>')+'</div>';
  body(o);
  if(!iss){ on("#brQ","input",function(e){ B.q=e.value; saveBrief(); }); on("#brR","input",function(e){ B.rec=e.value; saveBrief(); }); on("#brV","input",function(e){ B.reviewer=e.value; saveBrief(); }); }
  on("[data-ed]","blur",function(e){ B.blocks[+e.dataset.ed][e.dataset.k]=e.textContent; saveBrief(); });
  on("[data-mv]","click",function(e){ var i=+e.dataset.mv, j=i+(+e.dataset.d); if(j<0||j>=B.blocks.length) return; var t=B.blocks[i]; B.blocks[i]=B.blocks[j]; B.blocks[j]=t; saveBrief(); rBrief(); });
  on("[data-rm]","click",function(e){ B.blocks.splice(+e.dataset.rm,1); saveBrief(); rBrief(); });
  on("#brDocx","click",function(){ briefDocx(); }); on("#brPdf","click",function(){ printHTML(briefHTML()); });
  on("#brJson","click",function(){ download("steam-ai-story.json", JSON.stringify(storyFeed(),null,2), "application/json"); });
  on("#brIssue","click",function(){ var who=B.reviewer||prompt("Reviewer issuing this brief?"); if(!who) return; B.reviewer=who; B.issued={at:new Date().toISOString(), by:who, readiness:S.diag?S.diag.health.score:null}; saveBrief(); audit("brief","issued by "+who); rBrief(); });
  on("#brNew","click",function(){ if(!confirm("Start a new brief? The issued one is downloaded first.")) return; download("steam-ai-brief-issued.json", JSON.stringify(S.brief,null,2), "application/json"); S.brief={q:"",rec:"",reviewer:"",blocks:[],issued:null}; saveBrief(); rBrief(); });
}
function storyFeed(){ return {schema:"steam-ai.story/v1", generated:new Date().toISOString(), issued:S.brief.issued, question:S.brief.q, recommendation:S.brief.rec, reviewer:S.brief.reviewer, crs:"EPSG:32640",
  blocks:S.brief.blocks.map(function(b){ return {kind:b.kind, ref:b.ref, title:b.title, sentence:b.sentence, evidence:b.evidence, action:b.action, provenance:b.prov, source:b.source, created:b.at}; })}; }

/* ================= REPORTS ================= */
function rReports(from){
  var o='<div class="sec"><h3>Diagnostic report</h3><div class="card small">Run context, readiness and coverage, severity-ranked findings with evidence and trace, measures and an action list, with a map of the top finding.<div class="row w" style="margin-top:8px"><button class="btn pri" id="rpD">'+svg("dl")+'DOCX</button><button class="btn" id="rpDp">Print / PDF</button></div></div></div>';
  o+='<div class="sec"><h3>MMR and MFR drafts</h3><div class="warnbox small">The ITC MMR and MFR Word templates have not been supplied, so these drafts use a demonstration structure. Every generated paragraph is marked DRAFT and carries a visible source reference. Swap in the ITC template when it arrives.</div>'+
    '<div class="row w"><button class="btn" id="rpM">'+svg("dl")+'MMR draft (DOCX)</button><button class="btn" id="rpF">'+svg("dl")+'MFR draft (DOCX)</button></div></div>';
  o+='<div class="sec"><h3>Feeds</h3><div class="row w"><button class="btn sm" id="rpJ">Findings + KPIs (JSON)</button><button class="btn sm" id="rpG">Findings (GeoJSON)</button>'+(S.fc&&S.fc.ok?'<button class="btn sm" id="rpH">Hotspots (GeoJSON)</button>':'')+'</div><div class="tiny mute2">Versioned (steam-ai/v1) and in UTM 40N (EPSG:32640), shaped for Birdseye, FUSION or Llumen ingestion. Their interfaces are not verified in this build.</div></div>';
  body(o);
  on("#rpD","click",function(){ diagDocx(); }); on("#rpDp","click",function(){ printHTML(diagHTML()); });
  on("#rpM","click",function(){ mmrDocx(); }); on("#rpF","click",function(){ mfrDocx(); });
  on("#rpJ","click",function(){ download("steam-ai-findings.json", JSON.stringify(findingsFeed(),null,2), "application/json"); });
  on("#rpG","click",function(){ download("steam-ai-findings.geojson", JSON.stringify(geoFindings(),null,1), "application/geo+json"); });
  on("#rpH","click",function(){ download("steam-ai-hotspots.geojson", JSON.stringify(geoHotspots(),null,1), "application/geo+json"); });
}
function findingsFeed(){ var d=S.diag; return {schema:"steam-ai.findings/v1", generated:new Date().toISOString(), run:{id:"steam-2040-reference", source:d?d.ctx.volSource:null, period:d?d.ctx.period:null}, readiness:d?d.health:null, counts:d?d.counts:null, library:d?d.library:null,
  findings:d?d.findings.map(function(f){ var o=Object.assign({},f); o.disposition=S.disp[f.id]||null; return o; }):[]}; }
function geoFindings(){ var d=S.diag||{findings:[]}; return {type:"FeatureCollection", crs:{type:"name",properties:{name:"urn:ogc:def:crs:EPSG::32640"}}, features:d.findings.filter(function(f){return f.location&&f.location.x!=null;}).map(function(f){ return {type:"Feature", geometry:{type:"Point",coordinates:[Math.round(f.location.x),Math.round(f.location.y)]}, properties:{id:f.id, check:f.check, severity:f.severity, title:f.title, executive_line:f.exec, provenance:f.provenance, rule:f.rule, source_file:f.source_file, source_rows:f.source_rows}}; })}; }
function geoHotspots(){ var f=S.fc; return {type:"FeatureCollection", crs:{type:"name",properties:{name:"urn:ogc:def:crs:EPSG::32640"}}, meta:{year:f.year, assumption:f.assumption, provenance:f.provenance}, features:f.hotspots.map(function(x){ return {type:"Feature", geometry:{type:"Point",coordinates:[Math.round(x.x),Math.round(x.y)]}, properties:{rank:x.rank, name:x.name, risk:x.cat, onset_year:x.onset, vc_year:x.vcY, vc_low:x.vcLo, vc_high:x.vcHi, flag:x.flag, km:x.km}}; })}; }

/* ---------------- DOCX writer (store-only ZIP, WordprocessingML) ---------------- */
var CRC=(function(){ var t=new Uint32Array(256); for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function crc32(u){ var c=0xFFFFFFFF; for(var i=0;i<u.length;i++) c=CRC[(c^u[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function zip(files){ var enc=new TextEncoder(), parts=[], cen=[], off=0, dt=new Date(), DOSD=((dt.getFullYear()-1980)<<9)|((dt.getMonth()+1)<<5)|dt.getDate();
  files.forEach(function(f){ var name=enc.encode(f.name), data=typeof f.data==="string"?enc.encode(f.data):f.data, crc=crc32(data);
    var lh=new DataView(new ArrayBuffer(30)); lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true); lh.setUint16(12,DOSD,true); lh.setUint32(14,crc,true); lh.setUint32(18,data.length,true); lh.setUint32(22,data.length,true); lh.setUint16(26,name.length,true);
    parts.push(new Uint8Array(lh.buffer),name,data);
    var ch=new DataView(new ArrayBuffer(46)); ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true); ch.setUint16(14,DOSD,true); ch.setUint32(16,crc,true); ch.setUint32(20,data.length,true); ch.setUint32(24,data.length,true); ch.setUint16(28,name.length,true); ch.setUint32(42,off,true);
    cen.push(new Uint8Array(ch.buffer),name); off+=30+name.length+data.length; });
  var cs=cen.reduce(function(a,b){return a+b.length;},0); var end=new DataView(new ArrayBuffer(22)); end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true); end.setUint32(12,cs,true); end.setUint32(16,off,true);
  return new Blob(parts.concat(cen,[new Uint8Array(end.buffer)]),{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}); }
function xe(s){ return noDash(s).replace(/[&<>"]/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,""); }
function Doc(title){ this.title=title; this.x=[]; this.media=[]; }
Doc.prototype.p=function(t,o){ o=o||{}; var rp=(o.b?'<w:b/>':'')+(o.i?'<w:i/>':'')+(o.color?'<w:color w:val="'+o.color+'"/>':'')+(o.sz?'<w:sz w:val="'+o.sz+'"/>':''); this.x.push('<w:p>'+(o.style?'<w:pPr><w:pStyle w:val="'+o.style+'"/></w:pPr>':'')+'<w:r>'+(rp?'<w:rPr>'+rp+'</w:rPr>':'')+'<w:t xml:space="preserve">'+xe(t)+'</w:t></w:r></w:p>'); return this; };
Doc.prototype.runs=function(rs,style){ this.x.push('<w:p>'+(style?'<w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>':'')+rs.map(function(r){ var rp=(r.b?'<w:b/>':'')+(r.i?'<w:i/>':'')+(r.color?'<w:color w:val="'+r.color+'"/>':'')+(r.sz?'<w:sz w:val="'+r.sz+'"/>':''); return '<w:r>'+(rp?'<w:rPr>'+rp+'</w:rPr>':'')+'<w:t xml:space="preserve">'+xe(r.t)+'</w:t></w:r>'; }).join("")+'</w:p>'); return this; };
Doc.prototype.h=function(t,l){ return this.p(t,{style:"Heading"+(l||1)}); };
Doc.prototype.bullet=function(t){ return this.p("• "+t); };
Doc.prototype.draft=function(t,ref){ return this.runs([{t:"DRAFT  ",b:true,color:"B86E00",sz:16},{t:t},{t:"  ["+ref+"]",color:"6B788B",sz:16}]); };
Doc.prototype.table=function(rows,head){ var w='<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>'+["top","left","bottom","right","insideH","insideV"].map(function(k){ return '<w:'+k+' w:val="single" w:sz="4" w:color="C8D0DA"/>'; }).join("")+'</w:tblBorders></w:tblPr>';
  var all=head?[head].concat(rows):rows; all.forEach(function(r,ri){ w+='<w:tr>'+r.map(function(c){ return '<w:tc><w:p><w:r>'+(head&&ri===0?'<w:rPr><w:b/></w:rPr>':'')+'<w:t xml:space="preserve">'+xe(c)+'</w:t></w:r></w:p></w:tc>'; }).join("")+'</w:tr>'; });
  this.x.push(w+'</w:tbl>'); this.p(""); return this; };
Doc.prototype.img=function(dataUrl,wpx,hpx){ if(!dataUrl) return this; var b=atob(dataUrl.split(",")[1]), u=new Uint8Array(b.length); for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i);
  var n=this.media.length+1; this.media.push(u); var maxW=6.3*914400, cxE=Math.min(maxW,wpx*9525), cyE=Math.round(cxE*hpx/wpx);
  this.x.push('<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cxE+'" cy="'+cyE+'"/><wp:docPr id="'+n+'" name="Map '+n+'"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="'+n+'" name="map'+n+'.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImg'+n+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cxE+'" cy="'+cyE+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'); return this; };
Doc.prototype.pb=function(){ this.x.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); return this; };
Doc.prototype.blob=function(){
  var doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>'+this.x.join("")+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
  var st='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'+
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'+
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:color w:val="0B1220"/><w:sz w:val="40"/></w:rPr></w:style>'+
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F8F8C"/><w:sz w:val="30"/></w:rPr></w:style>'+
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="0B1220"/><w:sz w:val="24"/></w:rPr></w:style>'+
    '<w:style w:type="paragraph" w:styleId="Small"><w:name w:val="Small"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="4B5A6F"/><w:sz w:val="16"/></w:rPr></w:style>'+
    '<w:style w:type="table" w:styleId="Grid"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
  var rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+this.media.map(function(_,i){ return '<Relationship Id="rImg'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/map'+(i+1)+'.png"/>'; }).join("")+'</Relationships>';
  var files=[{name:"[Content_Types].xml", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'},
    {name:"_rels/.rels", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'},
    {name:"docProps/core.xml", data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xe(this.title)+'</dc:title><dc:creator>STEAM-AI Brain</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+new Date().toISOString().slice(0,19)+'Z</dcterms:created></cp:coreProperties>'},
    {name:"word/document.xml", data:doc},{name:"word/styles.xml", data:st},{name:"word/_rels/document.xml.rels", data:rels}];
  this.media.forEach(function(u,i){ files.push({name:"word/media/map"+(i+1)+".png", data:u}); });
  return zip(files); };
function download(name,data,type){ var b=data instanceof Blob?data:new Blob([data],{type:type||"text/plain"}); var a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1500); audit("export",name); }
function docControl(d,title){ d.p(title,{style:"Title"}); d.table([["Project","STEAM Major Model Update v4 (ITC/T/PSA/1170/25), Task 15"],["Document",title],["Status","DRAFT generated by STEAM-AI Brain. Not reviewed."],["Generated",new Date().toLocaleString()],["Run","STEAM 2040 Reference ("+(S.diag?(S.diag.ctx.volSource==="imported"?"imported STEAM volumes":"in-app assignment, "+S.diag.ctx.period):"inputs only")+")"],["QA","Prepared by: ____________   Checked by: ____________   Approved by: ____________"]]); }
async function focusSnap(links,bbox){ if(links&&links.length) await ai("focus",{links:links.slice(0,3000), bbox:bbox, fly:true}); await new Promise(function(r){ setTimeout(r,900); }); return snap(); }
async function diagDocx(){
  var d=S.diag; if(!d){ toast("Run the checks first."); return; } toast("Building diagnostic report…");
  var top=d.findings[0], img=null; if(top){ var loc=await ai("finding",{id:top.id}); img=await focusSnap(loc&&loc.links,loc&&loc.bbox); }
  var D=new Doc("STEAM-AI diagnostic report"); docControl(D,"STEAM-AI Diagnostic Report");
  D.h("1. Summary"); D.p(noDash(readinessSentence(d))+" Readiness score "+d.health.score+" / 100 ("+d.health.coverage+").");
  D.table([["Critical",d.counts.Critical],["High",d.counts.High],["Medium",d.counts.Medium],["Info",d.counts.Info]].map(function(r){ return [r[0],String(r[1])]; }),["Severity","Findings"]);
  D.p(d.health.formula,{style:"Small"});
  if(img){ D.h("2. Top finding on the map",1); D.img(img,1400,Math.round(1400*0.6)); D.p("Figure 1. "+top.id+" "+top.title+". Source: "+top.source_file+".",{style:"Small"}); }
  D.h("3. Findings by severity");
  d.findings.forEach(function(f){ D.h(f.id+"  ["+f.severity+"]  "+f.title,2); D.p(f.exec); D.table((f.evidence||[]).map(function(e){ return [String(e[0]),String(e[1])]; }),["Evidence","Value"]);
    D.table([["Rule",f.rule],["Source file",f.source_file],["Record",f.source_rows],["Likely cause",f.likely_cause],["Suggested action",f.action],["Expected effect",f.expected_effect],["Method",f.effect_method],["Confidence",f.confidence],["Provenance",f.provenance],["Review",(S.disp[f.id]||{}).st||"open"]]);
    if(f.solutions) D.table(f.solutions.map(function(s){ return [s.measure, s.estimate?("about "+fmt(s.estimate.dvht)+" veh·h saved, "+s.estimate.lanekm.toFixed(1)+" lane-km"):"not estimated", s.method]; }),["Measure","Estimate","Method"]); });
  D.h("4. Action list"); D.table(d.findings.filter(function(f){ return f.severity==="Critical"||f.severity==="High"; }).map(function(f,i){ return [String(i+1),f.id,f.action,(S.disp[f.id]||{}).owner||"unassigned"]; }),["#","Finding","Action","Owner"]);
  D.h("5. Check coverage"); D.table(d.library.map(function(c){ return [c.id,c.name,c.status==="ran"?"Ran":c.status==="on_compare"?"On compare":"Not run",c.why||""]; }),["Check","Name","Status","Input needed"]);
  download("STEAM-AI_Diagnostic_Report.docx", D.blob());
}
function mmrDocx(){
  var d=S.diag; if(!d){ toast("Run the checks first."); return; }
  var D=new Doc("MMR draft"); docControl(D,"MMR Draft (demonstration template)");
  D.p("The ITC MMR template was not supplied. Section headings below are a demonstration structure; replace them with the ITC template headings.",{i:true,color:"B86E00"});
  D.h("1. Model run"); D.draft("This draft covers the STEAM 2040 reference run: "+(S.inv?S.inv.links.toLocaleString()+" road links, "+S.inv.nodes.toLocaleString()+" nodes and "+S.inv.zones.toLocaleString()+" zones":"the 2040 network")+".","S1 network inventory");
  var od=d.findings.filter(function(f){return f.check==="OD-01";})[0]; if(od) D.draft(od.title+".","S2 "+od.id);
  var lu=d.findings.filter(function(f){return f.check==="LU-03";})[0]; if(lu) D.draft(lu.title+".","S3 "+lu.id);
  D.h("2. Run quality"); D.draft("Readiness is "+d.health.score+" out of 100. "+readinessSentence(d),"S4 readiness");
  var cv=d.findings.filter(function(f){return f.check==="OUT-05";})[0]; if(cv) D.draft(cv.exec,"S5 "+cv.id);
  D.table(d.findings.filter(function(f){return f.severity!=="Info";}).slice(0,15).map(function(f){ return [f.id,f.severity,f.title]; }),["Ref","Severity","Finding"]);
  D.h("3. Network performance");
  var cors=d.findings.filter(function(f){return f.check==="OUT-01";}); if(cors.length){ D.draft(cors.length+" over-capacity corridors were found. The largest delay is on the "+cors[0].title.split(":")[0]+".","S6 "+cors[0].id); }
  else D.draft("No output checks ran because no assigned volumes are loaded.","S6 check library");
  D.h("Sources"); D.table([["S1","Network inventory (Data & Models)"],["S2","OD-01 matrix check"],["S3","LU-03 control totals"],["S4","Readiness formula"],["S5","OUT-05 convergence"],["S6","OUT-01 corridors"]],["Ref","Evidence"]);
  download("STEAM-AI_MMR_Draft.docx", D.blob());
}
async function mfrDocx(){
  var f=S.fc; if(!f||!f.ok){ toast("Open Forecast first."); return; }
  var img=null; if(f.hotspots[0]) img=await focusSnap(f.hotspots[0].links,f.hotspots[0].bbox);
  var D=new Doc("MFR draft"); docControl(D,"MFR Draft (demonstration template)");
  D.p("The ITC MFR template was not supplied. Section headings below are a demonstration structure.",{i:true,color:"B86E00"});
  D.h("1. Forecast basis"); D.draft(f.assumption,"S1 forecast assumptions"); D.draft(f.horizonNote,"S1");
  D.draft("Values are "+f.provenance.toLowerCase()+"s. "+(S.card?("The surrogate back-test MAE is "+S.card.metrics.mae+" vehicles against "+S.card.metrics.maeNaive+" for naive scaling."):"No surrogate is fitted, so the values are an illustrative proportional sketch."),"S2 model card");
  D.h("2. Emerging congestion "+f.year); D.draft(f.total+" corridors are expected to cross V/C "+S.fcParams.th+" by "+f.year+" under the growth range. The emirate severity index is "+f.csi+".","S3 hotspot ranking");
  if(img){ D.img(img,1400,Math.round(1400*0.6)); D.p("Figure 1. Hotspot #1: "+f.hotspots[0].name+".",{style:"Small"}); }
  D.table(f.hotspots.slice(0,15).map(function(x){ return [String(x.rank),x.name,x.cat,x.onset?String(Math.round(x.onset)):"n/a",x.vcY+" ("+x.vcLo+" to "+x.vcHi+")",x.flag]; }),["#","Corridor","Risk","Onset","V/C "+f.year,"Flag"]);
  D.h("3. Limits"); (S.card?S.card.failure:["No surrogate fitted"]).forEach(function(x){ D.bullet(x); });
  D.h("Sources"); D.table([["S1","Forecast assumptions (Forecast workspace)"],["S2","Surrogate model card"],["S3","Hotspot ranking, "+f.year]],["Ref","Evidence"]);
  download("STEAM-AI_MFR_Draft_"+f.year+".docx", D.blob());
}
function briefDocx(){ var B=S.brief; var D=new Doc("Decision brief"); docControl(D,"Decision Brief");
  D.h("1. Decision or question"); D.p(B.q||"Not stated.");
  D.h("2. Baseline and evidence reliability"); D.p(S.diag?("Run readiness "+S.diag.health.score+" / 100, "+S.diag.health.coverage+". "+readinessSentence(S.diag)):"Checks not run.");
  D.h("3. Findings and options");
  B.blocks.forEach(function(b,i){ D.h((i+1)+". "+b.title,2); if(b.img) D.img(b.img,1400,Math.round(1400*0.6)); D.p(b.sentence); if(b.evidence&&b.evidence.length) D.table(b.evidence.map(function(e){ return [String(e[0]),String(e[1])]; })); D.runs([{t:"Action: ",b:true},{t:b.action||""}]); D.p("Provenance: "+(b.prov||"")+(b.source?". Source: "+b.source:""),{style:"Small"}); });
  D.h("4. Uncertainty and outstanding validation"); D.p("Engine outputs are an in-app assignment of the STEAM 2040 OD, not STEAM runs. Surrogate and sketch forecasts carry scenario ranges, not calibrated probabilities. Confirm preferred options with a full STEAM run (and HSM where queues matter).");
  D.h("5. Recommended next step"); D.p(B.rec||"Not stated."); D.p("Responsible reviewer: "+(B.reviewer||"not assigned")+(B.issued?". Issued "+new Date(B.issued.at).toLocaleString()+" by "+B.issued.by:". Working draft."));
  download("STEAM-AI_Decision_Brief.docx", D.blob()); }
function diagHTML(){ var d=S.diag; if(!d) return "<p>No diagnostics.</p>";
  return '<h1>STEAM-AI Diagnostic Report</h1><p class="m">DRAFT · '+h(new Date().toLocaleString())+' · readiness '+d.health.score+'/100 · '+h(d.health.coverage)+'</p><p>'+h(readinessSentence(d))+'</p>'+
    d.findings.map(function(f){ return '<h2>'+h(f.id)+' ['+f.severity+'] '+h(f.title)+'</h2><p>'+h(f.exec)+'</p><table>'+(f.evidence||[]).map(function(e){ return '<tr><td>'+h(e[0])+'</td><td>'+h(e[1])+'</td></tr>'; }).join("")+'<tr><td>Rule</td><td>'+h(f.rule)+'</td></tr><tr><td>Source</td><td>'+h(f.source_file)+' · '+h(f.source_rows)+'</td></tr><tr><td>Action</td><td>'+h(f.action)+'</td></tr></table>'; }).join(""); }
function briefHTML(){ var B=S.brief; return '<h1>Decision brief</h1><p class="m">'+(B.issued?"Issued "+h(new Date(B.issued.at).toLocaleString())+" by "+h(B.issued.by):"Working draft")+'</p><h2>Decision or question</h2><p>'+h(B.q)+'</p>'+B.blocks.map(function(b){ return '<h2>'+h(b.title)+'</h2>'+(b.img?'<img src="'+b.img+'">':'')+'<p>'+h(b.sentence)+'</p><p><b>Action:</b> '+h(b.action)+'</p><p class="m">'+h(b.prov||"")+(b.source?' · '+h(b.source):'')+'</p>'; }).join("")+'<h2>Recommended next step</h2><p>'+h(B.rec)+'</p><p class="m">Reviewer: '+h(B.reviewer)+'</p>'; }
function printHTML(inner){ var w=window.open("","_blank"); if(!w){ toast("Allow pop-ups to print."); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>STEAM-AI</title><style>body{font:12px/1.5 system-ui,sans-serif;color:#0B1220;margin:24px;font-variant-numeric:tabular-nums}h1{font-size:22px;color:#1F8F8C}h2{font-size:14px;margin-top:18px;page-break-after:avoid}table{border-collapse:collapse;width:100%;margin:6px 0}td{border:1px solid #D6DDE6;padding:4px 6px;vertical-align:top}img{max-width:100%;border:1px solid #D6DDE6}.m{color:#4B5A6F;font-size:11px}</style></head><body>'+inner+'<script>setTimeout(function(){print();},400)<\/script></body></html>'); w.document.close(); audit("export","print/PDF"); }

/* ---------------- HSM handoff ---------------- */
async function hsmPack(t){ if(!t||!t.bbox){ toast("Select a corridor or hotspot first."); return; }
  var r=await ai("hsm",{bbox:t.bbox},60000); if(!r||!r.ok){ toast("HSM export failed"); return; }
  modal("HSM handoff pack (draft)", '<div class="small">Study area around <b>'+h(t.label)+'</b>: '+r.zones+' zones, '+r.links.toLocaleString()+' links, '+r.odCells.toLocaleString()+' internal OD cells.</div><div class="warnbox small" style="margin-top:8px">'+h(r.note)+'</div><div class="row w" style="margin-top:8px">'+Object.keys(r.files).map(function(k){ return '<button class="btn sm" data-hf="'+k+'">'+svg("dl")+h(k)+'</button>'; }).join("")+'<button class="btn sm" id="hfMeta">study.json</button></div>');
  on("[data-hf]","click",function(b){ download("hsm_"+b.dataset.hf, r.files[b.dataset.hf], "text/csv"); });
  on("#hfMeta","click",function(){ download("hsm_study.json", JSON.stringify({schema:"steam-ai.hsm-study/v1", label:t.label, bbox_utm40n:r.bbox, source_scenario:"steam-2040-reference", period:S.diag?S.diag.ctx.period:null, demand_classes:["car (single class, 24h matrix)"], warmup_min:null, seeds:null, replications:null, note:r.note},null,2),"application/json"); });
  audit("export","HSM pack "+t.label); }

/* ================= DATA & MODELS ================= */
function rData(){
  var tab=S.tab.data, o="";
  if(tab==="inv"){ o='<div id="dInv" class="small muted">Loading…</div>'; body(o); loadInv(); return; }
  if(tab==="metrics"){ o='<table class="t"><tr><th>Metric</th><th>Definition</th><th>Unit / grain</th></tr>'+METRICS.map(function(m){ return '<tr><td><b>'+h(m[0])+'</b></td><td class="small">'+h(m[1])+'</td><td class="small">'+h(m[2])+'</td></tr>'; }).join("")+'</table>'; }
  else if(tab==="models"){ o='<div class="sec"><h3>Growth-response surrogate '+prov("Surrogate estimate")+'</h3>'+cardHTML(S.card)+'</div>'+
    '<div class="sec"><h3>Proportional sketch '+prov("Illustrative")+'</h3><div class="card small">v(f) = v(1) · f. Used for forecasts until the surrogate is fitted. No validation; labelled Illustrative everywhere it appears.</div></div>'+
    '<div class="sec"><h3>Numerical tolerance (noise band) '+prov("Engine output")+'</h3><div class="card small">tolerance = max(10 veh, 2 × |change between the last two equilibrium iterations|) per link; combined across two runs as √(t₁² + t₂²). Not assessed for free-flow or BPR incremental runs. A stability screen, not a statistical significance test.</div></div>'+
    '<div class="sec"><h3>Screening estimate for measures '+prov("Screening estimate")+'</h3><div class="card small">Fixed-volume BPR travel-time change on the affected links. Ignores rerouting and induced demand; “Test in engine” re-assigns with route choice.</div></div>'+
    '<div class="sec"><h3>Graph forecasting model</h3><div class="card small mute2">Not built. Warehouse time series (traffic counts, AVM speeds) are not connected, so no operational short-term model can be trained or back-tested yet. Baselines first (seasonal naive, gradient-boosted trees) when data arrives.</div></div>'; }
  else if(tab==="assume"){ o='<div class="sec"><h3>Open items</h3>'+OPEN.map(function(x){ return '<div class="card small"><b>'+h(x[0])+'</b><div class="muted" style="margin-top:3px">'+h(x[1])+'</div></div>'; }).join("")+'</div><div class="sec"><h3>Assumptions in use</h3>'+ASSUME.map(function(x){ return '<div class="note">'+h(x)+'</div>'; }).join("")+'</div>'; }
  else if(tab==="api"){ o='<div class="sec"><h3>Feeds available now</h3><div class="row w"><button class="btn sm" id="apJ">findings/v1 JSON</button><button class="btn sm" id="apG">findings GeoJSON</button><button class="btn sm" id="apS">story/v1 JSON</button></div><div class="tiny mute2">UTM 40N (EPSG:32640). Generated in the browser; no data leaves the device.</div></div>'+
    '<div class="sec"><h3>Interfaces</h3><table class="t"><tr><th>System</th><th>Status</th><th>What STEAM-AI provides</th></tr>'+INTEG.map(function(x){ return '<tr><td><b>'+h(x[0])+'</b></td><td class="small">'+h(x[1])+'</td><td class="small">'+h(x[2])+'</td></tr>'; }).join("")+'</table></div>'+
    '<div class="sec"><h3>Planned REST API (server deployment)</h3><div class="card small mono" style="font-size:11px;line-height:1.7">GET /api/v1/runs · GET /api/v1/runs/{id}/findings · GET /api/v1/runs/{id}/kpis · GET /api/v1/forecasts/{id}/hotspots · GET /api/v1/layers/{name} · POST /api/v1/scenarios · POST /api/v1/jobs · GET /api/v1/reports/{id}</div><div class="tiny mute2">Planned, not deployed in this static build. Token auth with Viewer, Planner, Modeller, Reviewer and Admin roles on the ITC server profile.</div></div>';
  }
  else if(tab==="audit"){ o='<div class="row"><span class="small muted grow">'+S.audit.length+' events on this device</span><button class="btn sm" id="auDl">Export</button></div><table class="t"><tr><th>Time</th><th>Kind</th><th>Event</th></tr>'+S.audit.slice(0,150).map(function(a){ return '<tr><td class="small">'+h(new Date(a.t).toLocaleString())+'</td><td class="small">'+h(a.kind)+'</td><td class="small">'+h(a.msg)+'</td></tr>'; }).join("")+'</table>'; }
  else if(tab==="gloss"){ o='<div class="row"><button class="btn sm" id="glTour">'+svg("help")+'Guided tour</button></div><dl class="ev">'+GLOSS.map(function(g){ return '<dt><b>'+h(g[0])+'</b></dt><dd class="small">'+h(g[1])+'</dd>'; }).join("")+'</dl>'; }
  else if(tab==="llm"){ var L=S.llm;
    o='<div class="card small">The Copilot always answers through typed tools. With the LLM off, a deterministic planner handles questions; it never invents numbers. Turning an LLM on sends only aggregated tool results (never raw files) to the provider you choose.</div>'+
      '<div class="sec"><h3>Provider</h3><select class="fld" id="llP"><option value="off">Off (deterministic planner)</option><option value="anthropic">Anthropic API (hosted)</option><option value="ollama">Ollama (local)</option></select></div>'+
      '<div class="sec" id="llA"><h3>Anthropic</h3><input class="fld" id="llK" type="password" placeholder="API key (stored on this device only)" value="'+h(L.key||"")+'" style="width:100%"><input class="fld" id="llM" value="'+h(L.model||"claude-opus-5")+'" style="width:100%;margin-top:6px"><div class="tiny mute2">Direct browser access to the API. Use only where ITC policy allows hosted models.</div></div>'+
      '<div class="sec" id="llO"><h3>Ollama</h3><input class="fld" id="llU" value="'+h(L.url||"http://localhost:11434")+'" style="width:100%"><input class="fld" id="llOM" value="'+h(L.omodel||"llama3.1")+'" style="width:100%;margin-top:6px"></div>'+
      '<button class="btn pri" id="llSave">Save</button>'; }
  body(o);
  on("#apJ","click",function(){ download("steam-ai-findings.json", JSON.stringify(findingsFeed(),null,2), "application/json"); });
  on("#apG","click",function(){ download("steam-ai-findings.geojson", JSON.stringify(geoFindings(),null,1), "application/geo+json"); });
  on("#apS","click",function(){ download("steam-ai-story.json", JSON.stringify(storyFeed(),null,2), "application/json"); });
  on("#auDl","click",function(){ download("steam-ai-audit.json", JSON.stringify(S.audit,null,2), "application/json"); });
  on("#glTour","click",tour);
  if(tab==="llm"){ var P=$("llP"); P.value=S.llm.provider; var vis=function(){ $("llA").style.display=P.value==="anthropic"?"":"none"; $("llO").style.display=P.value==="ollama"?"":"none"; }; vis(); P.addEventListener("change",vis);
    on("#llSave","click",function(){ S.llm={provider:P.value, key:$("llK").value.trim(), model:$("llM").value.trim()||"claude-opus-5", url:$("llU").value.trim(), omodel:$("llOM").value.trim()}; lsSet("llm",S.llm); toast("Copilot LLM: "+S.llm.provider); audit("config","LLM provider "+S.llm.provider); }); }
}
async function loadInv(){ var r=await ai("inventory",{},60000); S.inv=r; var e=$("dInv"); if(!e) return; if(!r||!r.ok){ e.textContent="Inventory unavailable."; return; }
  e.outerHTML='<div class="sec"><h3>Run catalogue</h3><div class="card small"><b>STEAM 2040 Reference</b> '+prov("Checked on file")+'<dl class="ev" style="margin-top:6px"><dt>Network</dt><dd>'+r.links.toLocaleString()+' links · '+r.nodes.toLocaleString()+' nodes</dd><dt>Zones</dt><dd>'+r.zones.toLocaleString()+' ('+r.zonesAttached.toLocaleString()+' attached)</dd><dt>OD</dt><dd>'+(r.od?r.od.cells.toLocaleString()+' cells · '+r.od.trips.toLocaleString()+' trips/day':'not decoded')+'</dd><dt>Land use</dt><dd>'+(r.lu?r.lu.rows.toLocaleString()+' rows × '+r.lu.cols+' columns':'not loaded')+'</dd><dt>CRS</dt><dd>'+h(r.crs)+'</dd><dt>Volumes</dt><dd>'+(r.hasVol?(r.volSource==="imported"?"imported STEAM loaded network":"in-app assignment ("+h(r.method||"")+")"):"none yet")+'</dd></dl></div>'+
    '<label class="btn" style="cursor:pointer;margin-top:8px">'+svg("dl")+'Import STEAM loaded network (A, B, volume CSV)<input type="file" id="invImp" accept=".csv,.txt" hidden></label><div class="tiny mute2">Opened on this device only; nothing is uploaded.</div></div>'+
    '<div class="sec"><h3>Network by class</h3><table class="t"><tr><th>Class</th><th class="n">Links</th><th class="n">km</th><th class="n">Lane-km</th></tr>'+r.byClass.map(function(c){ return '<tr><td>'+h(c.cls)+'</td><td class="n">'+c.links.toLocaleString()+'</td><td class="n">'+c.km.toLocaleString()+'</td><td class="n">'+c.lanekm.toLocaleString()+'</td></tr>'; }).join("")+'</table></div>'+
    '<div class="sec"><h3>Parameter register</h3><table class="t"><tr><th>Class</th><th class="n">Cap. veh/h/lane</th><th class="n">FF km/h</th></tr>'+Object.keys(r.params.cap).map(function(k){ var ch=r.params.cap[k]!==r.paramsDefault.cap[k]||r.params.spd[k]!==r.paramsDefault.spd[k]; return '<tr'+(ch?' style="color:var(--high)"':'')+'><td>'+k+'</td><td class="n">'+r.params.cap[k]+'</td><td class="n">'+r.params.spd[k]+'</td></tr>'; }).join("")+'</table><div class="tiny mute2">BPR α '+r.params.alpha+', β '+r.params.beta+'. Working defaults until calibrated STEAM v4 values replace them.</div></div>';
  on("#invImp","change",function(i){ var f=i.files[0]; if(f) importFile(f); }); }
var METRICS=[["V/C","assigned volume ÷ (lanes × class capacity) for the period","ratio · link · period"],["VHT","Σ volume × congested time","veh·h · network/area · period"],["VKT","Σ volume × length","veh·km · network/area · period"],["Delay","VHT − Σ volume × free-flow time","veh·h · period"],["Average speed","VKT ÷ VHT","km/h · network"],["Congestion severity index (CSI)","100 · clamp((V/C − 0.8)/0.6, 0, 1), VKT-weighted over the area","0-100 · link, corridor, district, emirate"],["Relative gap","(TSTT − SPTT) ÷ SPTT at the final iteration","% · run"],["Numerical tolerance","max(10, 2 × |change between the last two iterations|); combined √(t₁² + t₂²)","veh · link"],["GEH","√(2 (M − C)² ÷ (M + C)); used only for hourly volume comparisons","· link"],["Readiness score","100 − Σ checks min(Σ weights, 2 × top weight); weights 25/10/3/0","0-100 · run"],["Surrogate MAE","mean |predicted − engine| on the held-out f = 1.0 run","veh · link"],["Risk category","High if capacity is crossed by the year under low growth, Medium under central, Low under high","category · corridor"]];
var OPEN=[["Deployment","ITC VM OS, CPU, RAM, GPU and outbound internet policy not confirmed. This build is a static web app that runs fully in the browser; a server profile (FastAPI, job queue) follows once the VM is confirmed."],["LLM access","Local (Ollama) vs Anthropic API not approved. Default: off. Deterministic planner covers common questions."],["Sample STEAM runs","Two complete run folders (base and scenario) with loaded networks, skims and print files not supplied. The engine run of the STEAM 2040 OD stands in; import a loaded network CSV to diagnose real STEAM outputs."],["Warehouse access","No read-only credentials or extracts. Count validation (OUT-08), speed validation and short-term forecasting are Not run."],["Report templates","ITC MMR and MFR Word templates not supplied. Drafts use a demonstration structure."],["Birdseye, FUSION, HSM, Llumen","Interfaces not documented. Feeds are exported as versioned JSON / GeoJSON; no endpoint URLs are assumed."],["DUNE","Role unknown until the team receives a copy. Not designed against."],["PT inputs","Line files and PT assignment outputs not in this build. PT checks are Not run."]];
var ASSUME=["Network, land use and OD are the STEAM 2040 files embedded in this build (152,879 links; 3,692 zones; 2,225,004 OD cells).","Capacities and free-flow speeds are the working defaults (freeway 2000/100 … junction 600/30) until calibrated STEAM v4 values arrive.","Control totals for checks: population 5.93M, daily trips 12.73M (2040 brief).","AM peak = 24-hour matrix ÷ 10 (the Assignment app's period factor).","Forecast demand path: (1 + r)^(year − 2040) around the STEAM 2040 OD, r = 2.0%/yr ± 1 pp by default. Placeholder until the approved land-use pipeline is loaded.","Before 2040 the 2040 network is assumed in place (2030/2035 STEAM runs not loaded).","Sampled-origin runs scale demand so totals are preserved; paired runs use the same sample."];
var INTEG=[["STEAM (Cube / OpenPaths)","Import of loaded-network CSV works now. Job launch needs the ITC workstation adapter (not configured).","Diagnostics on imported outputs; scenario specs for STEAM jobs"],["ITC Data Warehouse","Not connected","Read-only views for counts and speeds (planned)"],["Birdseye","Planned interface, not verified","findings/v1, hotspots GeoJSON, story/v1"],["STEAM+ FUSION","Planned interface, not verified","KPIs, findings and forecast layers"],["Llumen","Planned interface, not verified","story/v1 narrative blocks (map view, sentence, evidence, action)"],["HSM (Aimsun)","Draft handoff pack","Study area, links, internal OD, boundary totals"],["DUNE","Unknown","Not designed against"]];
var GLOSS=[["Readiness score","How ready a run is for use, from the checks that ran. Not a measure of forecast accuracy."],["Checked on file","A value read directly from the model files (network, land use, OD)."],["Engine output","A value from the in-app assignment of the STEAM 2040 OD. Close to, but not the same as, a STEAM run."],["STEAM output","A value imported from a STEAM loaded network."],["Surrogate estimate","A fast AI approximation trained on engine runs, with a back-test and a model card."],["Screening estimate","A quick calculation for ranking options (fixed volumes, BPR). Confirm with the engine or STEAM."],["Illustrative","A placeholder calculation with no validation. Do not quote."],["V/C","Volume divided by capacity. Above 1 means more demand than the road can carry in the period."],["Numerical tolerance","How much a link volume can move from convergence noise alone. Changes smaller than this are not meaningful."],["Hotspot","A corridor expected to cross capacity by the chosen year under the growth range."],["Risk category","High, Medium or Low depending on whether capacity is crossed under low, central or high growth. Not a probability."],["Director / Modeller","Two reading levels: one sentence without jargon, or the evidence, rule, file, record and method."],["HSM","Hybrid Simulation Model (Aimsun). Used where queues and junction interaction matter."]];

/* ================= GUIDED TOUR ================= */
var TOUR=[["#rail","Workspaces","Overview, Explore, Diagnose, Scenarios, Forecast, Briefings and Data & Models. The map stays in the middle."],["#ctxbar","Context","Which run, comparator, year, period and result type the screen is showing."],["#lvlSeg","Reading level","Director shows one plain sentence per insight. Modeller adds evidence, rule, file, record and method."],["#hpill","Readiness","The run's readiness score from the check library. Tap it for the Overview."],["#copBtn","Copilot","Ask in plain English. Every answer shows the typed tool calls behind it; tap a chip to see the table."]];
function tour(){ var i=0, el=$("tour"); el.classList.add("show");
  function step(){ if(i>=TOUR.length){ el.classList.remove("show"); lsSet("toured",true); return; } var t=TOUR[i], a=document.querySelector(t[0]); var r=a?a.getBoundingClientRect():{left:80,top:80,bottom:120,width:10};
    var x=Math.min(window.innerWidth-340,Math.max(12,r.left)), y=Math.min(window.innerHeight-160,r.bottom+10);
    if(t[0]==="#rail"){ x=r.right+10; y=90; }
    el.innerHTML='<div class="bx" style="left:'+x+'px;top:'+y+'px"><b>'+(i+1)+'/'+TOUR.length+' · '+h(t[1])+'</b>'+h(t[2])+'<div class="row" style="margin-top:10px"><button class="btn sm" id="tSkip">Skip</button><span class="grow"></span><button class="btn sm pri" id="tNext">'+(i===TOUR.length-1?"Done":"Next")+'</button></div></div>';
    $("tNext").onclick=function(){ i++; step(); }; $("tSkip").onclick=function(){ i=TOUR.length; step(); }; }
  step(); }

/* ================= MODAL / TOOL RESULTS ================= */
function modal(title,html){ $("aimodalT").textContent=title; $("aimodalB").innerHTML=html; $("aimodal").classList.add("show"); }
function showToolResult(i){ var r=S.toolRes[i]; if(!r) return;
  var rows=r.rows||[], cols=rows.length?Object.keys(rows[0]):[];
  modal(r.call, '<div class="small muted">Arguments: <code>'+h(JSON.stringify(r.args))+'</code> · '+h(r.when)+'</div>'+(rows.length?'<table class="t" style="margin-top:8px"><tr>'+cols.map(function(c){ return '<th>'+h(c)+'</th>'; }).join("")+'</tr>'+rows.slice(0,300).map(function(x){ return '<tr>'+cols.map(function(c){ var v=x[c]; return '<td class="small">'+h(typeof v==="object"?JSON.stringify(v):v)+'</td>'; }).join("")+'</tr>'; }).join("")+'</table>':'<pre class="specbox">'+h(JSON.stringify(r.raw,null,2).slice(0,20000))+'</pre>')+
    '<div class="row" style="margin-top:8px"><button class="btn sm" id="trDl">'+svg("dl")+'CSV</button></div>');
  on("#trDl","click",function(){ var csv=[cols.join(",")].concat(rows.map(function(x){ return cols.map(function(c){ var v=x[c]; v=typeof v==="object"?JSON.stringify(v):String(v==null?"":v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(","); })).join("\n"); download(r.name+".csv",csv,"text/csv"); }); }
function chip(name,args,rows,raw){ var i=S.toolRes.length; S.toolRes.push({name:name, call:name+"("+Object.keys(args||{}).map(function(k){ return k+"="+JSON.stringify(args[k]); }).join(", ")+")", args:args||{}, rows:rows, raw:raw, when:new Date().toLocaleTimeString()});
  return '<button class="toolchip" data-tr="'+i+'" title="Open the table behind this answer">⚙ '+h(S.toolRes[i].call)+'</button>'; }
function chips(list){ return '<div class="toolchips">'+list.join("")+'</div>'; }

/* ================= TYPED TOOLS ================= */
var TOOLS_AI={
  get_findings:{d:"List diagnostic findings for the current run, most severe first.", p:{severity:{type:"string",enum:["Critical","High","Medium","Info"]}, check:{type:"string"}, limit:{type:"integer"}},
    run:async function(a){ var d=S.diag||await runDiagnose(); if(!d) return {err:"diagnostics unavailable"}; var l=d.findings.filter(function(f){ return (!a.severity||f.severity===a.severity)&&(!a.check||f.check===a.check); }).slice(0,a.limit||10);
      return {rows:l.map(function(f){ return {id:f.id, severity:f.severity, check:f.check, title:f.title, provenance:f.provenance, source:f.source_rows}; }), summary:{readiness:d.health.score, coverage:d.health.coverage, counts:d.counts, findings:l.map(function(f){ return {id:f.id,severity:f.severity,title:f.title,exec:f.exec}; })}}; }},
  explain_finding:{d:"Full evidence, rule, source record, cause, action and method for one finding.", p:{id:{type:"string"}}, req:["id"],
    run:async function(a){ var d=S.diag||await runDiagnose(); var f=d&&d.findings.filter(function(x){ return x.id.toLowerCase()===String(a.id).toLowerCase(); })[0]; if(!f) return {err:"no finding "+a.id};
      return {rows:(f.evidence||[]).map(function(e){ return {evidence:e[0], value:e[1]}; }), summary:{id:f.id, title:f.title, exec:f.exec, rule:f.rule, source_file:f.source_file, source_rows:f.source_rows, likely_cause:f.likely_cause, action:f.action, expected_effect:f.expected_effect, method:f.effect_method, confidence:f.confidence}}; }},
  query_links:{d:"Query road links by class, V/C range, district and sort order.", p:{cls:{type:"string",enum:["fwy","ramp","art","coll","rural","local","junc"]}, vc_min:{type:"number"}, vc_max:{type:"number"}, district:{type:"string"}, sort:{type:"string",enum:["vc","vol","delay"]}, limit:{type:"integer"}},
    run:async function(a){ await prepare(); var r=await ai("query",{q:{cls:a.cls, vcMin:a.vc_min, vcMax:a.vc_max, district:a.district, sort:a.sort, limit:a.limit||20}}); if(!r||!r.ok) return {err:"query failed"}; if(r.links&&r.links.length) ai("focus",{links:r.links.slice(0,2000), color:"#F5A524"});
      return {rows:r.rows, summary:{total:r.total, has_volumes:r.hasVol, top:r.rows.slice(0,10)}}; }},
  zone_detail:{d:"Land use and OD totals for one zone.", p:{zone:{type:"integer"}}, req:["zone"],
    run:async function(a){ await prepare(); var r=await ai("zone",{id:a.zone}); if(!r||!r.ok) return {err:r&&r.err||"zone lookup failed"}; ai("focus",{x:r.x,y:r.y}); var rows=[]; if(r.lu) Object.keys(r.lu).forEach(function(k){ rows.push({field:k, value:r.lu[k]}); }); if(r.od) Object.keys(r.od).forEach(function(k){ rows.push({field:k, value:r.od[k]}); }); return {rows:rows, summary:r}; }},
  district_summary:{d:"Population, trips and congestion severity by district.", p:{},
    run:async function(){ await prepare(); var r=await ai("districts"); if(!r||!r.ok) return {err:r&&r.err}; return {rows:r.rows, summary:{districts:r.rows.slice(0,12)}}; }},
  severity_index:{d:"Congestion severity index for the emirate, districts and road classes.", p:{},
    run:async function(){ var r=await ai("csi"); if(!r||!r.ok) return {err:r&&r.err||"no volumes"}; return {rows:r.districts, summary:{emirate:r.emirate, over:r.over, formula:r.formula, top:r.districts.slice(0,8)}}; }},
  compare_scenarios:{d:"Compare the current base and scenario with the numerical tolerance applied.", p:{},
    run:async function(){ var r=await ai("compare",{screen:S.noise}); S.cmp=r; if(!r||!r.ok) return {err:r&&r.err}; return {rows:r.top, summary:{busier:r.busier, quieter:r.quieter, inside_tolerance:r.inside, assessed:r.assessed, vht_base:Math.round(r.kpi.base.vht), vht_scn:Math.round(r.kpi.scn.vht), unexplained:r.shifts&&r.shifts.n}}; }},
  forecast_hotspots:{d:"Rank emerging congestion hotspots for a year (2026-2050).", p:{year:{type:"integer"}, growth_rate:{type:"number"}}, req:["year"],
    run:async function(a){ await prepare(); S.fcParams.year=Math.max(2026,Math.min(2050,a.year|0)); if(a.growth_rate!=null) S.fcParams.rate=a.growth_rate; await runForecast(true); var f=S.fc; if(!f||!f.ok) return {err:f&&f.err};
      return {rows:f.hotspots.map(function(x){ return {rank:x.rank, corridor:x.name, risk:x.cat, onset:x.onset, vc_year:x.vcY, vc_range:x.vcLo+"-"+x.vcHi, flag:x.flag, km:x.km}; }), summary:{year:f.year, total:f.total, provenance:f.provenance, assumption:f.assumption, top:f.hotspots.slice(0,5).map(function(x){ return {rank:x.rank,name:x.name,risk:x.cat,onset:x.onset,vc:x.vcY}; })}}; }},
  build_scenario_spec:{d:"Turn a what-if request into a structured scenario spec (not executed).", p:{type:{type:"string",enum:["growth","spike","closure","capacity","toll"]}, pct:{type:"number"}, aed:{type:"number"}},
    run:async function(a){ var spec=specFromStress({spec:{type:a.type, pct:a.pct, aed:a.aed}}); return {rows:[{field:"type",value:a.type},{field:"target",value:S.target?S.target.label:"network-wide"},{field:"value",value:a.pct||a.aed||""}], summary:spec}; }},
  run_stress_test:{d:"Run a stress test through the assignment engine (takes minutes).", p:{type:{type:"string",enum:["growth","spike","closure","capacity","toll"]}, pct:{type:"number"}, aed:{type:"number"}}, req:["type"],
    run:async function(a){ await runStress({type:a.type, pct:a.pct, aed:a.aed, lanes:1}); var s=S.stress; if(!s||!s.ok) return {err:s&&s.err}; return {rows:[{kpi:"VHT",base:Math.round(s.base.vht),test:Math.round(s.scn.vht)},{kpi:"over capacity",base:s.base.over,test:s.scn.over},{kpi:"avg speed",base:+s.base.spd.toFixed(1),test:+s.scn.spd.toFixed(1)}], summary:{label:s.label, method:s.method, vht_change_pct:+pct(s.scn.vht,s.base.vht).toFixed(2), over_change:s.scn.over-s.base.over, note:s.note}}; }},
  queue_steam_run:{d:"Queue a full STEAM run for the current scenario.", p:{}, run:async function(){ return {err:"No STEAM job connector is configured in this deployment (runs execute on ITC workstations)."}; }},
  draft_section:{d:"Draft report commentary (marked DRAFT) for health, forecast or compare from current values.", p:{section:{type:"string",enum:["health","forecast","compare"]}}, req:["section"],
    run:async function(a){ var t=draftText(a.section); return t?{rows:[{section:a.section, text:t}], summary:{draft:t}}:{err:"no values available for "+a.section}; }},
  network_inventory:{d:"Counts of links, nodes, zones, OD cells and land-use rows loaded.", p:{},
    run:async function(){ await prepare(); var r=await ai("inventory"); S.inv=r; return {rows:r.byClass, summary:{links:r.links, nodes:r.nodes, zones:r.zones, od:r.od, lu:r.lu, crs:r.crs}}; }}
};
function draftText(sec){
  if(sec==="health"&&S.diag){ var d=S.diag; return noDash("DRAFT. Readiness is "+d.health.score+" out of 100 ("+d.health.coverage+"). "+readinessSentence(d)+(d.findings[0]?" The top item is "+d.findings[0].title+".":"")); }
  if(sec==="forecast"&&S.fc&&S.fc.ok){ var f=S.fc; return noDash("DRAFT. By "+f.year+", "+f.total+" corridors are expected to cross capacity under the growth range. "+(f.hotspots[0]?"The earliest is the "+f.hotspots[0].name+(f.hotspots[0].onset?", around "+Math.round(f.hotspots[0].onset):"")+". ":"")+"Values are "+f.provenance.toLowerCase()+"s."); }
  if(sec==="compare"&&S.cmp&&S.cmp.ok){ var c=S.cmp; return noDash("DRAFT. Vehicle-hours change by "+sgn(pct(c.kpi.scn.vht,c.kpi.base.vht),1)+"%. "+c.busier+" links are busier and "+c.quieter+" quieter beyond the numerical tolerance"+(c.assessed?"; "+c.inside+" changes sit inside it.":". Tolerance was not assessed.")); }
  return null; }

/* ---------------- deterministic planner ---------------- */
var CLSW={freeway:"fwy",freeways:"fwy",motorway:"fwy",ramp:"ramp",ramps:"ramp",arterial:"art",arterials:"art",collector:"coll",collectors:"coll",local:"local",rural:"rural",junction:"junc"};
function plan(text){ var t=" "+text.toLowerCase()+" ", m;
  if((m=t.match(/\b(f-\d{1,3})\b/))&&/explain|why|detail|what|show|tell/.test(t)) return [["explain_finding",{id:m[1].toUpperCase().replace(/F-(\d+)/,function(_,n){ return "F-"+String(+n).padStart(3,"0"); })}]];
  if(/queue|full steam run|launch steam|run steam/.test(t)) return [["queue_steam_run",{}]];
  if(/\bdraft\b|write (the |a )?(commentary|summary|section|paragraph)/.test(t)) return [["draft_section",{section:/forecast|hotspot/.test(t)?"forecast":/compar|scenario/.test(t)?"compare":"health"}]];
  if(/what if|what happens|stress|\bclose\b|closure|toll|charg|add (a |one )?lane|widen|demand (grows|increase|up)|population (grows|increase|\+)|spike|grows by|\+\s?\d+ ?%/.test(t)){
    var type=/close|closure|failure|shut/.test(t)?"closure":/toll|charg|pricing/.test(t)?"toll":/lane|widen|capacity/.test(t)?"capacity":/spike|event|surge/.test(t)?"spike":"growth";
    var p=(t.match(/(\d+(?:\.\d+)?)\s?%/)||[])[1], aed=(t.match(/(?:aed|dhs?)\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?(?:aed|dirham)/)||[]);
    return [["build_scenario_spec",{type:type, pct:p?+p:undefined, aed:aed[1]?+aed[1]:aed[2]?+aed[2]:undefined}]]; }
  if(/forecast|hotspot|emerging|by 20\d\d|in 20\d\d|future congestion|will .*congest/.test(t)){ var y=(t.match(/\b(20[2-5]\d)\b/)||[])[1]; var g=(t.match(/(\d+(?:\.\d+)?)\s?%\s?(?:a|per) ?year|growth (?:of )?(\d+(?:\.\d+)?)/)||[]); return [["forecast_hotspots",{year:y?+y:S.fcParams.year, growth_rate:g[1]?+g[1]:g[2]?+g[2]:undefined}]]; }
  if(/compar|difference|busier|quieter|scenario vs|vs base|noise band|tolerance/.test(t)) return [["compare_scenarios",{}]];
  if((m=t.match(/\bzone\s+(\d{1,5})\b/))) return [["zone_detail",{zone:+m[1]}]];
  if(/severity index|\bcsi\b|most congested district|congestion by district/.test(t)) return [["severity_index",{}]];
  if(/district/.test(t)) return [["district_summary",{}]];
  if(/(links?|roads?|freeways?|arterials?|ramps?|collectors?).*(v\/?c|over capacity|congested|busiest|highest|volume)|over capacity|v\/c (above|over|>)/.test(t)){
    var cls=null; Object.keys(CLSW).forEach(function(k){ if(t.indexOf(" "+k+" ")>=0||t.indexOf(" "+k+"s ")>=0) cls=CLSW[k]; });
    var th=(t.match(/(?:above|over|>|greater than|more than)\s?(\d+(?:\.\d+)?)/)||[])[1]; var dm=(t.match(/\bin ([a-z][a-z .'-]{2,30}?)(?: district)?[?.!]?\s*$/)||[])[1];
    return [["query_links",{cls:cls||undefined, vc_min:th?+th:(/over capacity|congested/.test(t)?1:undefined), sort:/busiest|volume/.test(t)?"vol":"vc", district:dm&&!/network|model|abu dhabi|the map/.test(dm)?dm.trim():undefined, limit:20}]]; }
  if(/health|readiness|what'?s wrong|top issues|findings|diagnos|problems|issues|critical|errors? in (the )?run|run quality|check the run|review (the )?run/.test(t)){ var sv=/critical/.test(t)?"Critical":/\bhigh\b/.test(t)?"High":undefined; return [["get_findings",{severity:sv, limit:8}]]; }
  if(/inventory|how many (links|zones|nodes)|network size|what data|what is loaded/.test(t)) return [["network_inventory",{}]];
  return null; }
function renderAnswer(name,args,res){
  if(res.err) return '<div>'+h(res.err)+'</div><div class="lim">The data loaded here cannot answer this.</div>';
  var s=res.summary||{};
  switch(name){
    case "get_findings": return 'Readiness is <b>'+s.readiness+'</b> ('+h(s.coverage)+'): '+s.counts.Critical+' critical, '+s.counts.High+' high, '+s.counts.Medium+' medium.<ul>'+s.findings.map(function(f){ return '<li><a href="#" data-aiact="finding" data-arg="'+f.id+'">'+h(f.id)+'</a> ['+f.severity+'] '+h(S.level==="dir"?f.exec:f.title)+'</li>'; }).join("")+'</ul>';
    case "explain_finding": return '<b>'+h(s.id)+' · '+h(s.title)+'</b><br>'+h(s.exec)+'<table><tr><td>Rule</td><td>'+h(s.rule)+'</td></tr><tr><td>Record</td><td>'+h(s.source_file)+' · '+h(s.source_rows)+'</td></tr><tr><td>Likely cause</td><td>'+h(s.likely_cause)+'</td></tr><tr><td>Action</td><td>'+h(s.action)+'</td></tr><tr><td>Method</td><td>'+h(s.method)+' · confidence '+h(s.confidence)+'</td></tr></table><a href="#" data-aiact="finding" data-arg="'+h(s.id)+'">Open on the map</a>';
    case "query_links": return s.total? (s.total.toLocaleString()+' links match'+(s.has_volumes?'':' (no volumes yet, so V/C filters are empty)')+'. Highlighted on the map. Top:<table><tr><th>Link</th><th>Class</th><th>V/C</th><th>Vol</th></tr>'+s.top.map(function(r){ return '<tr><td><a href="#" data-aiact="link" data-arg="'+r.g+'">'+r.A+'-'+r.B+'</a></td><td>'+h(r.cls)+'</td><td>'+(r.vc!=null?r.vc:"n/a")+'</td><td>'+(r.vol!=null?fmt(r.vol):"n/a")+'</td></tr>'; }).join("")+'</table>') : 'No links match those filters.'+(s.has_volumes?'':' No volumes are loaded yet; run an assignment first.');
    case "zone_detail": return 'Zone <b>'+s.id+'</b>'+(s.district?' in '+h(s.district):'')+(s.lu?': population '+fmt(s.lu.POP_TOT)+', workers '+fmt(s.lu.WORKER)+', GFA '+fmt(s.lu.GFA_TOTAL)+' m²':'')+(s.od?'. Trips/day: '+fmt(s.od.productions)+' out, '+fmt(s.od.attractions)+' in, '+fmt(s.od.intrazonal)+' intrazonal.':'.')+'<div class="lim">'+h(s.source)+'</div>';
    case "district_summary": return 'Districts by population:<table><tr><th>District</th><th>Pop.</th><th>Trips/day</th><th>CSI</th></tr>'+s.districts.map(function(r){ return '<tr><td>'+h(r.name)+'</td><td>'+fmt(r.pop)+'</td><td>'+fmt(r.trips)+'</td><td>'+(r.csi!=null?r.csi:"n/a")+'</td></tr>'; }).join("")+'</table>';
    case "severity_index": return 'Emirate congestion severity index <b>'+s.emirate+'</b>, '+fmt(s.over)+' links over capacity. Most severe districts:<table>'+s.top.map(function(r){ return '<tr><td>'+h(r.name)+'</td><td>'+r.csi+'</td></tr>'; }).join("")+'</table><div class="lim">'+h(s.formula)+'</div>';
    case "compare_scenarios": return 'Vehicle-hours '+fmt(s.vht_base)+' → '+fmt(s.vht_scn)+' ('+sgn(pct(s.vht_scn,s.vht_base),1)+'%). <b>'+s.busier+'</b> links busier, <b>'+s.quieter+'</b> quieter'+(s.assessed?', '+s.inside_tolerance+' inside the numerical tolerance (hidden).':'. Tolerance not assessed (non-equilibrium run).')+(s.unexplained?' '+s.unexplained+' significant changes sit outside the input catchment.':'');
    case "forecast_hotspots": return 'By <b>'+s.year+'</b>: '+s.total+' emerging hotspots ('+prov(s.provenance)+').<ul>'+s.top.map(function(x){ return '<li>#'+x.rank+' '+h(x.name)+': '+x.risk+' risk'+(x.onset?', capacity around '+Math.round(x.onset):'')+', V/C '+x.vc+'</li>'; }).join("")+'</ul><div class="lim">'+h(s.assumption)+'</div>';
    case "build_scenario_spec": var iv=s.interventions[0]; return 'Here is the scenario I would run. Check it, then confirm.<pre class="specbox">'+h(JSON.stringify({type:iv.type, targets:iv.target_entity_ids.length?(iv.target_entity_ids.length+" links"+(S.target&&S.target.links&&S.target.links.length>50?" (of "+S.target.links.length+")":"")):"network-wide", parameter:iv.parameter, new_value:iv.new_value, evaluation:s.evaluation_method},null,1))+'</pre><button class="btn sm pri" data-aiact="runspec" data-arg="'+h(JSON.stringify({type:args.type,pct:args.pct,aed:args.aed}))+'">Run in engine</button> <span class="lim">Target: '+h(S.target?S.target.label:"network-wide")+'</span>';
    case "run_stress_test": return h(s.label)+': vehicle-hours '+sgn(s.vht_change_pct,2)+'%, '+sgn(s.over_change,0)+' links over capacity. '+h(s.method)+'. <span class="lim">'+h(s.note)+'</span>';
    case "draft_section": return '<div class="specbox" style="font-family:inherit">'+h(s.draft)+'</div>';
    case "network_inventory": return h(s.links.toLocaleString())+' links, '+s.nodes.toLocaleString()+' nodes, '+s.zones.toLocaleString()+' zones'+(s.od?', '+s.od.cells.toLocaleString()+' OD cells ('+s.od.trips.toLocaleString()+' trips/day)':'')+(s.lu?', land use '+s.lu.rows+' rows':'')+'. CRS '+h(s.crs)+'.';
  }
  return h(JSON.stringify(s).slice(0,400)); }
async function route(text){
  if(S.llm.provider!=="off"){ try{ var r=await llmAnswer(text); if(r) return r; }catch(e){ audit("chat","LLM failed: "+e.message+"; deterministic fallback"); } }
  var p=plan(text); if(!p) return null;
  var html="", cs=[];
  for(var i=0;i<p.length;i++){ var name=p[i][0], args=p[i][1]; Object.keys(args).forEach(function(k){ if(args[k]===undefined) delete args[k]; });
    var res; try{ res=await TOOLS_AI[name].run(args); }catch(e){ res={err:String(e.message||e)}; }
    html+=renderAnswer(name,args,res); cs.push(chip(name,args,res.rows||[],res.summary||res)); }
  audit("chat",text+" → "+p.map(function(x){return x[0];}).join(", "));
  return {html:html+chips(cs), chips:followChips(p[0][0])}; }
function followChips(n){ return {get_findings:["Explain F-001","Links over capacity","Hotspots in 2035"], query_links:["What if we add a lane here?","Severity index by district","Top issues"], forecast_hotspots:["Hotspots in 2045","What if demand grows 10%?","Draft the forecast commentary"], compare_scenarios:["Draft the compare commentary","Top issues"]}[n]||["Top issues","Hotspots in 2035","Links over capacity"]; }
async function aiAction(k,arg){
  if(k==="finding"){ if(S.ws!=="diag") selectTool("diag"); selectFinding(arg); }
  else if(k==="link"){ ai("focus",{links:[+arg]}); openLink(+arg); }
  else if(k==="runspec"){ var a=JSON.parse(arg); addMsg("cop","Running <b>"+h(a.type)+"</b> through the engine. Progress shows in Stress tests."); var r=await TOOLS_AI.run_stress_test.run(a); var m=addMsg("cop", renderAnswer("run_stress_test",a,r)+chips([chip("run_stress_test",a,r.rows||[],r.summary||r)])); addChips(m,["Compare scenarios","Draft the compare commentary"]); }
}

/* ---------------- LLM adapter (Anthropic / Ollama) ---------------- */
function toolSchemas(){ return Object.keys(TOOLS_AI).map(function(k){ var t=TOOLS_AI[k]; return {name:k, description:t.d, input_schema:{type:"object", properties:t.p, required:t.req||[]}}; }); }
var SYS="You are the STEAM-AI copilot for Abu Dhabi's STEAM strategic transport model. Answer only from tool results; never state a number that no tool returned. If the tools cannot answer, say so plainly. Use short sentences and plain professional English, no em dashes. Name the provenance of values (Checked on file, Engine output, Surrogate estimate, Illustrative). The user's reading level is ";
async function llmAnswer(text){
  var L=S.llm, calls=[], msgs=[{role:"user", content:text}], out="";
  for(var round=0;round<6;round++){
    var res;
    if(L.provider==="anthropic"){
      if(!L.key) throw new Error("no API key");
      var r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST", headers:{"content-type":"application/json","x-api-key":L.key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:L.model||"claude-opus-5", max_tokens:16000, system:SYS+(S.level==="dir"?"Director: one or two plain sentences.":"Modeller: include evidence and method."), tools:toolSchemas(), messages:msgs})});
      if(!r.ok) throw new Error("API "+r.status); res=await r.json();
      if(res.stop_reason==="refusal") return {html:"The model declined this request."+chips(calls)};
      msgs.push({role:"assistant", content:res.content});
      var uses=res.content.filter(function(b){ return b.type==="tool_use"; });
      res.content.filter(function(b){ return b.type==="text"; }).forEach(function(b){ out+=b.text; });
      if(!uses.length||res.stop_reason!=="tool_use") break;
      var results=[];
      for(var i=0;i<uses.length;i++){ var u=uses[i], tr=await runTool(u.name,u.input||{}); calls.push(chip(u.name,u.input||{},tr.rows||[],tr.summary||tr)); results.push({type:"tool_result", tool_use_id:u.id, content:JSON.stringify(tr.err?{error:tr.err}:tr.summary).slice(0,12000), is_error:!!tr.err}); }
      msgs.push({role:"user", content:results}); out="";
    } else if(L.provider==="ollama"){
      var r2=await fetch((L.url||"http://localhost:11434").replace(/\/$/,"")+"/api/chat",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({model:L.omodel||"llama3.1", stream:false, messages:[{role:"system",content:SYS+(S.level==="dir"?"Director.":"Modeller.")}].concat(msgs), tools:toolSchemas().map(function(t){ return {type:"function", function:{name:t.name, description:t.description, parameters:t.input_schema}}; })})});
      if(!r2.ok) throw new Error("Ollama "+r2.status); res=await r2.json(); var msg=res.message||{}; msgs.push(msg);
      if(!msg.tool_calls||!msg.tool_calls.length){ out=msg.content||""; break; }
      for(var j=0;j<msg.tool_calls.length;j++){ var fcall=msg.tool_calls[j].function, args=typeof fcall.arguments==="string"?JSON.parse(fcall.arguments):fcall.arguments||{}; var tr2=await runTool(fcall.name,args); calls.push(chip(fcall.name,args,tr2.rows||[],tr2.summary||tr2)); msgs.push({role:"tool", content:JSON.stringify(tr2.err?{error:tr2.err}:tr2.summary).slice(0,12000)}); }
    } else return null;
  }
  audit("chat","LLM "+L.provider+": "+text);
  return {html:h(noDash(out)).replace(/\n/g,"<br>")+(calls.length?chips(calls):'<div class="lim">No tool was called, so this answer contains no model numbers.</div>'), chips:["Top issues","Hotspots in 2035"]}; }
async function runTool(name,args){ var t=TOOLS_AI[name]; if(!t) return {err:"unknown tool "+name}; try{ return await t.run(args); }catch(e){ return {err:String(e.message||e)}; } }

/* ---------------- events from the engine ---------------- */
window.addEventListener("message",function(ev){ var m=ev.data; if(!m||m.steam!==1||!m.resp||!m.event) return;
  if(m.event==="aiprog"){ if(S.running){ S.running.pct=m.pct; S.running.label=m.label||S.running.label; var bar=document.querySelector("#wsBody .prog>i"); if(bar) bar.style.width=(m.pct||0)+"%"; } }
  else if(m.event==="aipick"){ if(S.ws) openLink(m.g); }
  else if(m.event==="airun"){ if(S.diag&&!S.running&&!_diagBusy&&m.sig&&S._sig&&m.sig!==S._sig){ if(!S.justStressed){ S.cmp=null; S.stress=null; } S.justStressed=false; runDiagnose(); } S._sig=m.sig; }
});

/* ---------------- service worker (installable, offline) ---------------- */
function pwa(){ try{ var base=location.pathname; if(/\.html?$/.test(base)) base=base.replace(/[^\/]*$/,""); else if(!/\/$/.test(base)) base+="/";
  var ml=document.querySelector('link[rel="manifest"]'); if(ml) ml.href=base+"manifest.webmanifest";
  if("serviceWorker" in navigator && location.protocol!=="file:") navigator.serviceWorker.register(base+"sw.js",{scope:base}).catch(function(){}); }catch(e){} }

async function boot(){
  initChrome(); pwa();
  selectTool("ov");
  await waitReady("assign",30000);
  runDiagnose();
  if(!lsGet("toured",false) && window.innerWidth>820) setTimeout(tour,2500);
}
return {boot:boot, open:openWS, hide:hideWS, route:route, render:render, S:S, runDiagnose:runDiagnose, ai:ai};
})();
