/* =====================================================================
   SCHEMES: programme prioritisation (TFP)
   Spliced into ai-shell.js at the __SCHEMES__ marker, inside the AIS
   closure, so it shares S, ai, h, fmt, svg, on, prov, modal, Doc ...

   Method (from the TFP slides):
     1. code each scheme (roadway, mass transit, policy) once;
     2. run every scheme on its own against the common base and collect
        its KPIs (or import the KPIs from the STEAM batch runs);
     3. run the most likely programme in full, plus variations;
     4. a quick estimation engine for small adjustments to that package,
        checked against the engine every time it is confirmed.
   The board mirrors the programme dashboard: map with numbered schemes,
   five KPIs, and the project table with cost, cash flow and priority.
   ===================================================================== */
var PRI_YEARS=[2025,2026,2027,2028,2029,2030];
var PCOL={P1:"#36B7B4",P2:"#F5A524",P3:"#8C9BB0",NA:"#5B6B82"};
var STYPE={
  widen:{t:"Road widening", g:"Roadway", unit:"AED 15 m per lane-km"},
  newroad:{t:"New road", g:"Roadway", unit:"AED 40 m per lane-km"},
  ops:{t:"Signals & ITS", g:"Roadway", unit:"AED 2.5 m per km (min 10)"},
  transit:{t:"Mass transit", g:"Mass transit", unit:"LRT AED 300 m per km, BRT AED 50 m per km"},
  charge:{t:"Road-user charge", g:"Policy", unit:"AED 120 m set-up + 1 m per km"},
  demand:{t:"Parking / demand mgmt", g:"Policy", unit:"AED 25 m"}
};
var SPD=[["strat","Strategic alignment"],["safety","Safety"],["deliv","Deliverability"],["sust","Sustainability"]];
var PRI_DEF={budget:[300,500,700,800,800,700], reserve:50, annual:600, life:25, disc:7,
  w:{bcr:35, relief:20, strat:15, safety:10, deliv:10, sust:10}};
var P=lsGet("pri",null)||{schemes:[], set:null, pkg:null, variants:[], vlog:[], nextNum:1};
P.set=Object.assign({}, PRI_DEF, P.set||{}); P.set.w=Object.assign({}, PRI_DEF.w, (P.set&&P.set.w)||{});
P.variants=P.variants||[]; P.vlog=P.vlog||[];
var Q={sel:null, edit:null, mode:null, filter:"all", stop:false, est:null, adj:null, last:null};
function fm(n){ n=+n||0; return Math.abs(n)>=10?Math.round(n).toLocaleString():n.toFixed(1); }
function priSave(){ var lite=JSON.parse(JSON.stringify(P)); if(!lsSet("pri",lite)){ lite.schemes.forEach(function(s){ if(s.links&&s.links.length>300) s.links=s.links.slice(0,300); }); lsSet("pri",lite); toast("Saved with trimmed link lists (device storage full)."); } }
function sById(id){ return P.schemes.filter(function(s){ return s.id===id; })[0]; }
function autoCost(s){ var g=s.geo||{}, km=g.km||0;
  switch(s.type){ case "widen": return 15*(g.lanekm||0); case "newroad": return 40*(g.lanekm||0); case "ops": return Math.max(10,2.5*km);
    case "transit": return (s.mode==="brt"?50:300)*km; case "charge": return 120+km; case "demand": return 25; } return 0; }
function costOf(s){ return s.costManual?(+s.cost||0):Math.round(autoCost(s)); }
function cashflow(s){ var c=costOf(s), d=Math.max(1,+s.dur||1), st=+s.start||2025, w=[];
  for(var i=0;i<d;i++) w.push(s.profile==="front"?(d-i):s.profile==="scurve"?Math.sin(Math.PI*(i+0.5)/d):1);
  var sw=w.reduce(function(a,b){ return a+b; },0), out={later:0}; PRI_YEARS.forEach(function(y){ out[y]=0; });
  w.forEach(function(x,i){ var y=st+i, v=c*x/sw; if(out[y]!==undefined) out[y]+=v; else if(y>2030) out.later+=v; else out[PRI_YEARS[0]]+=v; });
  return out; }
function econ(s){ var r=s.res; if(!r) return null; var St=P.set, i=St.disc/100, open=(+s.start||2025)+Math.max(1,+s.dur||1);
  var B=-(r.d.vht)*St.annual*(r.vot||45)/1e6, pvb=0, pvc=0;
  for(var y=open;y<open+St.life;y++) pvb+=B/Math.pow(1+i,y-2025);
  var cf=cashflow(s), c=costOf(s); PRI_YEARS.forEach(function(y){ pvc+=cf[y]/Math.pow(1+i,y-2025); }); if(cf.later) pvc+=cf.later/Math.pow(1+i,2031-2025);
  return {annual:B, pvb:pvb, pvc:pvc, bcr:pvc>0?pvb/pvc:null, cost:c}; }
function scoreAll(){
  var W=P.set.w, run=P.schemes.filter(function(s){ return s.res; }), rel=run.map(function(s){ return -s.res.d.vht; }).sort(function(a,b){ return a-b; });
  P.schemes.forEach(function(s){ var e=econ(s), parts=[], tw=0, sc=0;
    SPD.forEach(function(k){ var v=s.spd&&s.spd[k[0]]!=null?+s.spd[k[0]]:3; parts.push([k[1],(v-1)/4,W[k[0]]]); });
    if(e){ parts.unshift(["Benefit-cost ratio",Math.max(0,Math.min(1,(e.bcr||0)/3)),W.bcr]);
      var x=-s.res.d.vht, rk=0; rel.forEach(function(v){ if(v<=x) rk++; }); parts.unshift(["Congestion relief (rank)",rel.length>1?(rk-1)/(rel.length-1):1,W.relief]); }
    parts.forEach(function(p){ tw+=p[2]; sc+=p[1]*p[2]; });
    s._e=e; s._parts=parts; s._score=tw?Math.round(100*sc/tw):0; s._prov=!e; });
  // priority bands under the budget envelope, best score first
  var used1={}, used2={}; PRI_YEARS.forEach(function(y){ used1[y]=0; used2[y]=0; });
  var order=P.schemes.slice().sort(function(a,b){ return (a._prov-b._prov)||(b._score-a._score); });
  order.forEach(function(s){ s._pri="NA"; s._why=""; if(s._prov) return; var cf=cashflow(s), fits1=true, fits2=true;
    if(noisy(s)){ s._pri="P3"; s._why="No measurable effect (inside run noise)"; return; }
    if(!(s._e&&s._e.bcr>=1)){ s._pri="P3"; s._why="Benefit-cost ratio below 1"; return; }
    PRI_YEARS.forEach(function(y,k){ var b=+P.set.budget[k]||0; if(used1[y]+cf[y]>b+1e-6) fits1=false; if(used1[y]+used2[y]+cf[y]>b*(1+P.set.reserve/100)+1e-6) fits2=false; });
    if(fits1){ s._pri="P1"; PRI_YEARS.forEach(function(y){ used1[y]+=cf[y]; }); } else if(fits2){ s._pri="P2"; s._why="Over the envelope, inside the reserve"; PRI_YEARS.forEach(function(y){ used2[y]+=cf[y]; }); } else { s._pri="P3"; s._why="Does not fit the envelope plus reserve"; } });
  var BO={P1:0,P2:1,P3:2,NA:3}; order.sort(function(a,b){ return (BO[a._pri]-BO[b._pri])||(b._score-a._score); });
  order.forEach(function(s,i){ s._rank=i+1; });
  return order; }
function priName(p){ return {P1:"Priority 1",P2:"Priority 2",P3:"Priority 3",NA:"Not assessed"}[p]; }
function priChip(p,why){ return '<span class="pchip '+p+'"'+(why?' title="'+h(why)+'"':'')+'>'+(p==="NA"?"n/a":p)+'</span>'; }
function noiseOf(s){ if(!s.res||s.res.prov==="STEAM run") return 0; return Math.max(s.res.d.noise||0, s.res.base&&s.res.base.vht?0.001*s.res.base.vht:0); }
function noisy(s){ return !!(s.res&&noiseOf(s)>0&&Math.abs(s.res.d.vht)<noiseOf(s)); }
function sig(){ var sc=S.screen||{method:"fw",sample:"250"}; return sc.method+"|"+sc.sample+"|3"; }
function pkgSchemes(){ return P.schemes.filter(function(s){ return s._pri==="P1"; }); }
function sumD(list,f){ var o={vht:0,vkt:0,spd:0,over:0,ckm:0}; list.forEach(function(s){ if(!s.res) return; Object.keys(o).forEach(function(k){ o[k]+=(s.res.d[k]||0)*(f||1); }); }); return o; }
function sameIds(a,b){ if(!a||!b||a.length!==b.length) return false; var x=a.slice().sort().join(","), y=b.slice().sort().join(","); return x===y; }

/* ---------------- map ---------------- */
function showSchemes(o){ o=o||{}; if(S.ws!=="pri") return;
  var list=P.schemes.filter(function(s){ return s.geo&&(Q.filter==="all"||s._pri===Q.filter); }).map(function(s){ var g=s.geo;
    return {id:s.id, num:s.num, x:g.x, y:g.y, bbox:g.bbox, color:PCOL[s._pri||"NA"], type:s.type, pts:s.pts, links:s.links, spacing:s.spacing, radius:s.radius}; });
  var wp=$("wsPanel"), st=$("stage"), cover=wp&&st&&st.offsetHeight?wp.offsetHeight/st.offsetHeight:0;
  return ai("schemeshow",{schemes:list, sel:Q.sel, all:true, fly:!!o.fly, fit:!!o.fit, cover:cover}); }
async function refreshGeo(s){ var r=await ai("schemeinfo",{schemes:[{type:s.type, links:s.links, pts:s.pts, lanes:s.lanes, lanesNew:s.lanesNew, spacing:s.spacing, catch:s.catch, radius:s.radius}]}); if(r&&r.ok) s.geo=r.geo[0]; }

/* ---------------- rendering ---------------- */
function rPri(){
  scoreAll(); var tab=S.tab.pri||"prog";
  if(tab==="prog") rProg(); else if(tab==="sch") rSchemes(); else if(tab==="est") rEstimator(); else rMethod();
  showSchemes(); }
function kpiBlock(){
  var sel=Q.sel?sById(Q.sel):null, o='';
  if(sel){ var e=sel._e, d=sel.res&&sel.res.d;
    o+='<div class="pk-h"><span class="pnum" style="background:'+PCOL[sel._pri]+'">'+sel.num+'</span><b>'+h(sel.name)+'</b></div><div class="tiny mute2" style="margin:2px 0 8px">'+h(STYPE[sel.type].t)+' · '+priName(sel._pri)+' · score '+sel._score+(sel._prov?' (provisional)':'')+'</div>'+(noisy(sel)?'<div class="tiny warn" style="margin-bottom:6px">The vehicle-hours change ('+fm(sel.res.d.vht)+') is inside the noise band of ± '+fm(noiseOf(sel))+' veh·h: no measurable effect at this engine profile. More origins or a STEAM run would resolve it.</div>':'');
    o+=kpiList(d, e, sel.res?sel.res.prov:null);
    if(sel.res&&noiseOf(sel)) o+='<div class="tiny mute2" style="margin-top:4px">Noise band on vehicle-hours: ± '+fm(noiseOf(sel))+' veh·h ('+h(sel.res.d.noiseMethod||"at least 0.1% of base VHT")+').</div>';
    o+='<div class="row w" style="margin-top:8px"><button class="btn sm" id="pkAll">Show programme</button><button class="btn sm" id="pkEdit">Edit</button>'+(sel.res?'':'<button class="btn sm pri" id="pkRun">'+svg("play")+'Run</button>')+'</div>'; }
  else { var p1=pkgSchemes(), pk=P.pkg&&sameIds(P.pkg.ids,p1.map(function(s){return s.id;}))?P.pkg:null, d=pk?pk.d:sumD(p1), cost=0, pvb=0, pvc=0, ann=0;
    p1.forEach(function(s){ cost+=costOf(s); if(s._e){ pvb+=s._e.pvb; pvc+=s._e.pvc; ann+=s._e.annual; } });
    if(pk){ var vot=(p1.filter(function(s){ return s.res; })[0]||{res:{vot:45}}).res.vot||45, annP=-pk.d.vht*P.set.annual*vot/1e6;
      if(ann>0) pvb*=annP/ann; else { pvb=0; for(var y=2028;y<2028+P.set.life;y++) pvb+=annP/Math.pow(1+P.set.disc/100,y-2025); } ann=annP; }
    o+='<div class="pk-h"><b>Programme: Priority 1</b></div><div class="tiny mute2" style="margin:2px 0 8px">'+p1.length+' schemes · AED '+fm(cost)+' m'+(p1.length?'':' · run schemes to fill Priority 1')+'</div>';
    o+=kpiList(p1.length?d:null, p1.length?{annual:ann, bcr:pvc>0?pvb/pvc:null}:null, pk?"Package engine run":p1.length?"Sum of scheme runs":null);
    if(p1.length&&!pk) o+='<div class="tiny mute2" style="margin-top:6px">Summed scheme by scheme, so interaction between schemes is ignored. Run the package (Estimator) for the combined effect.</div>'; }
  return o; }
function kpiList(d,e,pv){ var rows=[
    ["KPI 1","Vehicle-hours saved per period", d?fmt(-d.vht):"n/a", d&&d.vht<0?"good":d&&d.vht>0?"bad":""],
    ["KPI 2","Average network speed", d?sgn(d.spd,2)+" km/h":"n/a", d&&d.spd>0?"good":d&&d.spd<0?"bad":""],
    ["KPI 3","Congested road length", d?sgn(d.ckm,1)+" km":"n/a", d&&d.ckm<0?"good":d&&d.ckm>0?"bad":""],
    ["KPI 4","Travel-time benefit per year", e?"AED "+fm(e.annual)+" m":"n/a", e&&e.annual>0?"good":""],
    ["KPI 5","Benefit-cost ratio", e&&e.bcr!=null?e.bcr.toFixed(2):"n/a", e&&e.bcr>=1?"good":e&&e.bcr!=null?"bad":""]];
  return '<div class="pkpis">'+rows.map(function(r){ return '<div class="pkpi"><span class="k">'+r[0]+'</span><span class="l">'+r[1]+'</span><b class="'+r[3]+'">'+r[2]+'</b></div>'; }).join("")+'</div>'+(pv?'<div style="margin-top:6px">'+prov(pv==="STEAM run"?"Checked on file (STEAM run)":pv==="Package engine run"||pv==="Engine output"?"Engine output":"Illustrative (sum of scheme runs)")+'</div>':'')+'<div class="tiny mute2" style="margin-top:4px">Benefits use placeholder economics (Method tab): VOT, annualisation '+P.set.annual+', '+P.set.life+' years at '+P.set.disc+'%.</div>'; }
function rProg(){
  var order=scoreAll(), rows=order.filter(function(s){ return Q.filter==="all"||s._pri===Q.filter; }), tot={later:0}, bud=P.set.budget;
  PRI_YEARS.forEach(function(y){ tot[y]=0; });
  order.forEach(function(s){ if(s._pri!=="P1") return; var cf=cashflow(s); PRI_YEARS.forEach(function(y){ tot[y]+=cf[y]; }); tot.later+=cf.later; });
  var pend=P.schemes.filter(function(s){ return !s.res; }).length, mx=Math.max.apply(null,[1].concat(bud));
  var o='<div class="pbar"><div class="seg" id="pFilt">'+[["all","All"],["P1","P1"],["P2","P2"],["P3","P3"]].map(function(f){ return '<button data-f="'+f[0]+'" class="'+(Q.filter===f[0]?"on":"")+'">'+(PCOL[f[0]]?'<i class="pdot" style="background:'+PCOL[f[0]]+'"></i>':'')+f[1]+'</button>'; }).join("")+'</div>'+
    '<span class="grow"></span>'+(S.running?'<span class="small"><b>'+h(S.running.label)+'</b> '+Math.round(S.running.pct||0)+'%</span><div class="prog" style="width:120px"><i style="width:'+(S.running.pct||0)+'%"></i></div><button class="btn sm" id="pStop">Stop after this run</button>':
    (pend?'<button class="btn sm pri" id="pRunAll">'+svg("play")+'Run '+pend+' pending scheme'+(pend===1?'':'s')+'</button>':'')+'<button class="btn sm" id="pNew">+ New scheme</button><button class="btn sm" id="pDocx">'+svg("dl")+'Report</button><button class="btn sm" id="pCsv">CSV</button>')+'</div>';
  if(!P.schemes.length){ body(o+'<div class="pgrid"><div class="pk">'+kpiBlock()+'</div><div class="empty">No schemes yet. <div class="row w" style="margin-top:8px"><button class="btn pri" id="pSeed">Generate demonstration schemes</button><button class="btn" id="pNew2">+ New scheme</button><button class="btn" id="pCap">Capture from Scenario editor</button></div><div class="tiny mute2" style="margin-top:6px">The demonstration set comes from the congested corridors of the screening base run (widening, a relief road, signals and ITS, a charge), two transit lines across the busiest trip-end clusters, and parking management. Costs come from illustrative unit rates. A screening base run takes about a minute first.</div></div></div>'); bindProg(); return; }
  o+='<div class="pgrid"><div class="pk">'+kpiBlock()+'</div><div class="ptab"><table class="t ptbl"><thead><tr><th>#</th><th>Project</th><th class="n">Total cost<br><small>AED m</small></th>'+PRI_YEARS.map(function(y){ return '<th class="n cf">'+y+'</th>'; }).join("")+'<th class="n cf">Later</th><th class="n">Score</th><th>Priority</th></tr></thead><tbody>';
  rows.forEach(function(s){ var cf=cashflow(s), c=costOf(s);
    o+='<tr class="click'+(Q.sel===s.id?' sel':'')+'" data-sid="'+s.id+'"><td><span class="pnum" style="background:'+PCOL[s._pri]+'">'+s.num+'</span></td><td><b>'+h(s.name)+'</b><div class="tiny mute2">'+h(STYPE[s.type].t)+(s.demo?' · demonstration':'')+(s.res?(s.res.prov==="STEAM run"?' · STEAM KPIs':' · engine KPIs'):' · not run')+(noisy(s)?' · <span class="warn" title="|ΔVHT| '+fm(Math.abs(s.res.d.vht))+' is inside the noise band ± '+fm(noiseOf(s))+' veh·h">within run noise</span>':'')+(s.res&&s.res.sig&&s.res.sig!==sig()&&s.res.prov!=="STEAM run"?' · other engine profile':'')+'</div></td><td class="n">'+fm(c)+'</td>'+
      PRI_YEARS.map(function(y){ var v=cf[y]; return '<td class="n cf">'+(v>0.5?'<span class="cfb" style="--a:'+Math.min(1,v/Math.max(1,c)).toFixed(2)+'">'+fm(v)+'</span>':'<span class="mute2">·</span>')+'</td>'; }).join("")+
      '<td class="n cf">'+(cf.later>0.5?fm(cf.later):'<span class="mute2">·</span>')+'</td><td class="n" title="'+h(s._parts.map(function(p){ return p[0]+" "+Math.round(p[1]*100)+"% × w"+p[2]; }).join("; "))+'"><b>'+s._score+'</b>'+(s._prov?'<div class="tiny mute2">provisional</div>':'')+'</td><td>'+priChip(s._pri)+'</td></tr>'; });
  o+='</tbody><tfoot><tr><td></td><td><b>Priority 1 spend</b></td><td></td>'+PRI_YEARS.map(function(y,k){ var b=+bud[k]||0, v=tot[y]; return '<td class="n cf"><b class="'+(v>b+0.5?"bad":"")+'">'+fm(v)+'</b></td>'; }).join("")+'<td class="n cf">'+fm(tot.later)+'</td><td colspan="2"></td></tr>'+
    '<tr><td></td><td class="mute2">Budget envelope</td><td></td>'+PRI_YEARS.map(function(y,k){ return '<td class="n cf mute2">'+fm(+bud[k]||0)+'</td>'; }).join("")+'<td></td><td colspan="2"></td></tr>'+
    '<tr><td></td><td class="mute2">Use of envelope</td><td></td>'+PRI_YEARS.map(function(y,k){ var b=+bud[k]||0, f=b?tot[y]/b:0; return '<td class="n cf"><div class="cbar"><i style="height:'+Math.round(Math.min(1,f)*100)+'%"></i></div></td>'; }).join("")+'<td></td><td colspan="2"></td></tr></tfoot></table></div></div>';
  body(o); bindProg(); }
function bindProg(){
  on("#pFilt button","click",function(b){ Q.filter=b.dataset.f; rPri(); });
  on("tr[data-sid]","click",function(r){ Q.sel=Q.sel===r.dataset.sid?null:r.dataset.sid; rPri(); if(Q.sel) showSchemes({fly:true}); });
  on("#pkAll","click",function(){ Q.sel=null; rPri(); showSchemes({fit:true}); });
  on("#pkEdit","click",function(){ Q.edit=Q.sel; S.tab.pri="sch"; openWS("pri"); });
  on("#pkRun","click",function(){ runSchemes([sById(Q.sel)]); });
  on("#pRunAll","click",function(){ runSchemes(P.schemes.filter(function(s){ return !s.res; })); });
  on("#pStop","click",function(b){ Q.stop=true; b.disabled=true; b.textContent="Stopping after this run"; });
  on("#pNew,#pNew2","click",function(){ newScheme(); });
  on("#pSeed","click",function(b){ b.disabled=true; b.textContent="Running the screening base…"; seed(); });
  on("#pCap","click",function(){ capture(); });
  on("#pDocx","click",function(){ priDocx(); });
  on("#pCsv","click",function(){ download("programme.csv", priCSV(), "text/csv"); }); }

/* ---------------- scheme editor ---------------- */
function rSchemes(){
  var e=Q.edit?sById(Q.edit):null;
  var o='<div class="pgrid sch"><div class="slist"><div class="row w" style="margin-bottom:8px"><button class="btn sm pri" id="sNew">+ New</button><button class="btn sm" id="sCap" title="Lane upgrades and drawn roads from the Scenario tool">Capture from Scenario editor</button><button class="btn sm" id="sSeed">Demonstration set</button><label class="btn sm" style="cursor:pointer">Import schemes<input type="file" id="sImp" accept=".csv,.json" hidden></label></div>';
  o+=P.schemes.length?P.schemes.map(function(s){ return '<div class="sitem'+(e&&e.id===s.id?' on':'')+'" data-eid="'+s.id+'"><span class="pnum" style="background:'+PCOL[s._pri||"NA"]+'">'+s.num+'</span><div class="grow"><b>'+h(s.name)+'</b><div class="tiny mute2">'+h(STYPE[s.type].t)+' · AED '+fm(costOf(s))+' m · '+(s.res?'run':'not run')+'</div></div></div>'; }).join(""):'<div class="empty">No schemes yet.</div>';
  o+='</div><div class="sedit">'+(e?editorHTML(e):'<div class="empty">Select a scheme to edit, or add one. A scheme is coded once: its links or alignment, its parameters, its cost and cash flow, and its SPD25 parameters.</div>')+'</div></div>';
  body(o);
  on("[data-eid]","click",function(x){ Q.edit=x.dataset.eid; Q.sel=Q.edit; setMode(null); rPri(); showSchemes({fly:true}); });
  on("#sNew","click",function(){ newScheme(); }); on("#sCap","click",function(){ capture(); }); on("#sSeed","click",function(b){ b.disabled=true; b.textContent="Running…"; seed(); });
  on("#sImp","change",function(i){ if(i.files[0]) importSchemes(i.files[0]); });
  if(e) bindEditor(e); }
function fld(lbl,inner,tip){ return '<label class="ef"><span>'+lbl+(tip?' <i class="mute2" title="'+h(tip)+'">ⓘ</i>':'')+'</span>'+inner+'</label>'; }
function num(k,v,mn,mx,st){ return '<input class="fld" data-k="'+k+'" type="number" value="'+h(v)+'"'+(mn!=null?' min="'+mn+'"':'')+(mx!=null?' max="'+mx+'"':'')+(st?' step="'+st+'"':'')+'>'; }
function editorHTML(s){ var T=STYPE[s.type], g=s.geo||{}, c=costOf(s);
  var o='<div class="row"><span class="pnum" style="background:'+PCOL[s._pri||"NA"]+'">'+s.num+'</span><input class="fld grow" data-k="name" value="'+h(s.name)+'"></div>';
  o+='<div class="tiny mute2" style="margin:4px 0 8px">'+h(T.g)+' · '+h(T.t)+(g.km?' · '+g.km+' km':'')+(g.links?' · '+g.links+' links':'')+(g.zones!=null?' · '+g.zones+' zones in catchment':'')+'</div>';
  var geoTool='';
  if(s.type==="widen"||s.type==="ops"||s.type==="charge"){ geoTool='<div class="row w"><button class="btn sm'+(Q.mode==="links"?' pri':'')+'" id="eLinks">'+(Q.mode==="links"?'Done picking':'Pick links on the map')+'</button><button class="btn sm" id="eTarget"'+(S.target&&S.target.links?'':' disabled')+' title="'+h(S.target?S.target.label:"Pick a finding or hotspot first")+'">Use current target</button><button class="btn sm" id="eClr">Clear links</button></div><div class="tiny mute2">'+(s.links||[]).length+' links. Tap roads to add or remove them, or use a corridor from Diagnose or Forecast.</div>'; }
  else { var need=s.type==="demand"?"a centre point (or links)":"the alignment (two or more points)";
    geoTool='<div class="row w"><button class="btn sm'+(Q.mode==="draw"?' pri':'')+'" id="eDraw">'+(Q.mode==="draw"?'Finish drawing':'Draw on the map')+'</button><button class="btn sm" id="eUndo"'+((s.pts||[]).length?'':' disabled')+'>Undo point</button></div><div class="tiny mute2">'+(s.pts||[]).length+' points. Draw '+need+'.'+(s.type==="transit"?' Stations sit at each point and every '+(s.spacing||1200)+' m between them.':'')+'</div>'; }
  o+='<div class="sec"><h3>Where</h3>'+geoTool+'</div><div class="sec"><h3>What</h3><div class="egrid">';
  if(s.type==="widen") o+=fld("Lanes added", num("lanes",s.lanes||1,1,3));
  if(s.type==="ops") o+=fld("Capacity gain %", num("capPct",s.capPct||10,1,40), "Signal optimisation / ITS, as a capacity factor on the links");
  if(s.type==="charge") o+=fld("Charge AED per trip", num("aed",s.aed||4,1,50), "Enters route choice as time at the value of time; no approved toll elasticity");
  if(s.type==="newroad") o+=fld("Lanes", num("lanesNew",s.lanesNew||2,1,5))+fld("Road class", '<select class="fld" data-k="lt"><option value="5"'+(s.lt==5?' selected':'')+'>Freeway</option><option value="20"'+(s.lt!=5&&s.lt!=24?' selected':'')+'>Arterial</option><option value="24"'+(s.lt==24?' selected':'')+'>Collector</option></select>');
  if(s.type==="transit") o+=fld("Mode", '<select class="fld" data-k="mode"><option value="lrt"'+(s.mode!=="brt"?' selected':'')+'>Light rail</option><option value="brt"'+(s.mode==="brt"?' selected':'')+'>BRT</option></select>')+fld("Catchment m", num("catch",s.catch||800,300,2000,50))+fld("Station spacing m", num("spacing",s.spacing||1200,400,4000,100))+fld("Car trips shifted, both ends % ", num("both",s.both!=null?s.both:25,0,60), "Placeholder mode shift for car trips with both ends in station catchments. No approved mode-choice response is loaded.")+fld("One end % ", num("one",s.one!=null?s.one:5,0,30));
  if(s.type==="demand") o+=fld("Radius m", num("radius",s.radius||2000,300,8000,100))+fld("Trips to the area reduced %", num("redPct",s.redPct||10,1,50), "Placeholder response to parking supply or pricing for trips destined to the area");
  o+='</div></div><div class="sec"><h3>Cost and cash flow</h3><div class="egrid">'+fld("Total cost AED m", '<input class="fld" data-k="cost" type="number" value="'+c+'"'+(s.costManual?'':' title="Auto from the unit rate; type to override"')+'>', s.costManual?"Manual cost":"Auto: "+T.unit+" (illustrative)")+fld("Start year", num("start",s.start||2025,2025,2040))+fld("Duration years", num("dur",s.dur||2,1,10))+fld("Spend profile", '<select class="fld" data-k="profile"><option value="even">Even</option><option value="front"'+(s.profile==="front"?' selected':'')+'>Front-loaded</option><option value="scurve"'+(s.profile==="scurve"?' selected':'')+'>S-curve</option></select>')+'</div>'+(s.costManual?'<button class="btn sm" id="eAuto">Use the unit-rate cost</button>':'')+'</div>';
  o+='<div class="sec"><h3>SPD25 parameters <span class="r tiny mute2">placeholder set, 1 to 5</span></h3><div class="egrid">'+SPD.map(function(k){ var v=s.spd&&s.spd[k[0]]!=null?s.spd[k[0]]:3; return fld(k[1], '<input type="range" min="1" max="5" step="1" data-spd="'+k[0]+'" value="'+v+'"><b class="rv">'+v+'</b>'); }).join("")+'</div></div>';
  o+='<div class="sec"><h3>Result</h3>'+(s.res?'<div class="small">'+h(s.res.label||"")+'</div><div class="tiny mute2">'+h(s.res.profile||"")+(s.res.at?' · '+new Date(s.res.at).toLocaleString():'')+'</div>'+(s.res.notes&&s.res.notes.length?'<div class="tiny mute2">'+h(s.res.notes.join("; "))+'</div>':''):'<div class="small muted">Not run yet.</div>')+'</div>';
  o+='<div class="row w" style="margin-top:6px"><button class="btn sm pri" id="eRun"'+(S.running?' disabled':'')+'>'+svg("play")+(s.res?'Re-run':'Run')+' this scheme</button><button class="btn sm" id="eSpec">Scheme spec</button><button class="btn sm" id="eDup">Duplicate</button><button class="btn sm" id="eDel">Delete</button></div>';
  return o; }
function bindEditor(s){
  function changed(geo){ delete s.res; if(geo) refreshGeo(s).then(function(){ priSave(); rPri(); }); else { priSave(); rPri(); } }
  on(".sedit [data-k]","change",function(el){ var k=el.dataset.k, v=el.type==="number"?+el.value:el.value;
    if(k==="cost"){ s.cost=+el.value; s.costManual=true; priSave(); rPri(); return; }
    if(k==="name"){ s.name=el.value; priSave(); rPri(); return; }
    if(k==="start"||k==="dur"||k==="profile"){ s[k]=v; priSave(); rPri(); return; }
    s[k]=v; changed(k==="spacing"||k==="catch"||k==="radius"||k==="lanes"||k==="lanesNew"); });
  on(".sedit [data-spd]","input",function(el){ el.nextElementSibling.textContent=el.value; });
  on(".sedit [data-spd]","change",function(el){ s.spd=s.spd||{}; s.spd[el.dataset.spd]=+el.value; priSave(); rPri(); });
  on("#eAuto","click",function(){ s.costManual=false; priSave(); rPri(); });
  on("#eLinks","click",function(){ setMode(Q.mode==="links"?null:"links"); rPri(); });
  on("#eDraw","click",function(){ if(Q.mode==="draw"){ setMode(null); refreshGeo(s).then(function(){ priSave(); rPri(); showSchemes(); }); } else { setMode("draw", s.pts||[]); rPri(); } });
  on("#eUndo","click",function(){ (s.pts||[]).pop(); delete s.res; ai("draw",{on:Q.mode==="draw", pts:s.pts, clear:false}); refreshGeo(s).then(function(){ priSave(); rPri(); }); });
  on("#eTarget","click",function(){ s.links=(S.target.links||[]).slice(0,3000); if(/^(New|Scheme)/.test(s.name)&&S.target.label) s.name=STYPE[s.type].t+", "+S.target.label.replace(/^Hotspot #\d+ /,"").replace(/^F-\d+ /,""); changed(true); });
  on("#eClr","click",function(){ s.links=[]; changed(true); });
  on("#eRun","click",function(){ runSchemes([s]); });
  on("#eDel","click",function(){ if(!confirm("Delete scheme "+s.num+" ("+s.name+")?")) return; P.schemes=P.schemes.filter(function(x){ return x!==s; }); if(Q.adj){ delete Q.adj.incl[s.id]; delete Q.adj.lanes[s.id]; } Q.edit=null; Q.sel=null; setMode(null); priSave(); rPri(); });
  on("#eDup","click",function(){ var c=JSON.parse(JSON.stringify(s)); c.id="S"+Date.now().toString(36); c.num=P.nextNum++; c.name=s.name+" (copy)"; delete c.res; P.schemes.push(c); Q.edit=c.id; Q.sel=c.id; priSave(); rPri(); });
  on("#eSpec","click",function(){ showSpec(schemeSpec(s)); }); }
function setMode(m, pts){ Q.mode=m; ai("draw",{on:m==="draw", pts:m==="draw"?(pts||[]):null}); ai("pick",{on:true}); }
function newScheme(){
  modal("New scheme", '<div class="small muted">Pick what kind of scheme to code. You then set where it is on the map and its parameters.</div><div class="tgrid">'+Object.keys(STYPE).map(function(k){ return '<button class="btn" data-nt="'+k+'"><b>'+h(STYPE[k].t)+'</b><span class="tiny mute2">'+h(STYPE[k].g)+'</span></button>'; }).join("")+'</div>');
  on("[data-nt]","click",function(b){ $("aimodal").classList.remove("show"); var t=b.dataset.nt;
    var s={id:"S"+Date.now().toString(36), num:P.nextNum++, type:t, name:"New "+STYPE[t].t.toLowerCase(), start:2026, dur:t==="transit"?4:2, profile:"even", spd:{strat:3,safety:3,deliv:3,sust:3}, links:[], pts:[]};
    if(t==="widen") s.lanes=1; if(t==="ops") s.capPct=10; if(t==="charge") s.aed=4; if(t==="newroad"){ s.lanesNew=2; s.lt=20; } if(t==="transit"){ s.mode="lrt"; s.catch=800; s.spacing=1200; s.both=25; s.one=5; } if(t==="demand"){ s.radius=2000; s.redPct=10; }
    if(S.target&&S.target.links&&(t==="widen"||t==="ops"||t==="charge")){ s.links=S.target.links.slice(0,3000); s.name=STYPE[t].t+", "+S.target.label.replace(/^Hotspot #\d+ /,"").replace(/^F-\d+ /,""); }
    P.schemes.push(s); Q.edit=s.id; Q.sel=s.id; S.tab.pri="sch"; priSave(); openWS("pri");
    if(t==="newroad"||t==="transit"||t==="demand") setMode("draw",[]); else if(!s.links.length) setMode("links");
    refreshGeo(s).then(function(){ rPri(); }); audit("scheme","new "+t); }); }
async function capture(){ await prepare(); var r=await ai("scnedits"); if(!r||!r.ok){ toast("Scenario editor not reachable."); return; }
  if(!r.upgrades.length&&!r.extras.length){ modal("Capture from Scenario editor", '<div class="small">The Scenario editor has no edits yet. Open <b>Scenario</b> on the rail, tap links to add lanes or draw a new road, then capture them here as schemes.</div><button class="btn sm" id="capGo" style="margin-top:8px">Open the Scenario editor</button>'); on("#capGo","click",function(){ $("aimodal").classList.remove("show"); selectTool("scn"); }); return; }
  var made=[];
  var byAdd={}; r.upgrades.forEach(function(u){ (byAdd[u[1]]=byAdd[u[1]]||[]).push(u[0]); });
  Object.keys(byAdd).forEach(function(k){ made.push({type:"widen", name:"Captured widening (+"+k+" lane"+(k>1?"s":"")+")", links:byAdd[k], lanes:+k}); });
  r.extras.forEach(function(e,i){ made.push({type:"newroad", name:"Captured new road "+(i+1), pts:e.pts, lanesNew:e.lanes, lt:e.lt}); });
  for(var i=0;i<made.length;i++){ var s=Object.assign({id:"S"+Date.now().toString(36)+i, num:P.nextNum++, start:2026, dur:2, profile:"even", spd:{strat:3,safety:3,deliv:3,sust:3}}, made[i]); await refreshGeo(s); P.schemes.push(s); }
  priSave(); S.tab.pri="sch"; Q.edit=P.schemes[P.schemes.length-1].id; openWS("pri"); toast("Captured "+made.length+" scheme"+(made.length===1?"":"s")+" from the Scenario editor."); audit("scheme","captured "+made.length); }
async function seed(){ await prepare(); switchApp("assign"); S.running={label:"Screening base run", pct:0}; rPri();
  var r=await ai("seedschemes",{},3600000); S.running=null;
  if(!r||!r.ok){ toast((r&&r.err)||"Could not generate schemes."); rPri(); return; }
  var spdSeed=[[4,3,4,2],[4,4,3,3],[3,3,4,3],[3,4,4,2],[3,3,5,3],[5,3,2,3],[4,4,2,3],[3,3,4,4],[3,4,4,3],[5,4,2,5],[4,3,3,5],[3,3,4,4],[3,2,5,4],[4,3,3,4]];
  r.schemes.forEach(function(s,i){ s.id="S"+Date.now().toString(36)+i; s.num=P.nextNum++; s.profile=s.type==="transit"?"scurve":"even"; var q=spdSeed[i%spdSeed.length]; s.spd={strat:q[0],safety:q[1],deliv:q[2],sust:s.type==="transit"||s.type==="demand"?5:q[3]}; P.schemes.push(s); });
  priSave(); audit("scheme","demonstration set: "+r.schemes.length); toast(r.schemes.length+" demonstration schemes added. Run them to fill the KPIs."); S.tab.pri="prog"; openWS("pri"); showSchemes({fit:true}); }

/* ---------------- running ---------------- */
function engineSpec(s){ return {id:s.id, type:s.type, name:s.name, links:s.links, pts:s.pts, lanes:s.lanes, lanesNew:s.lanesNew, lt:s.lt, capPct:s.capPct, aed:s.aed, mode:s.mode, catch:s.catch, spacing:s.spacing, both:s.both, one:s.one, radius:s.radius, redPct:s.redPct}; }
async function runSchemes(list){
  list=list.filter(Boolean); if(!list.length) return; if(S.running){ toast("An engine run is already in progress."); return; }
  var bad=list.filter(function(s){ return (s.type==="newroad"||s.type==="transit")?(s.pts||[]).length<2:s.type==="demand"?!((s.pts||[]).length||(s.links||[]).length):!(s.links||[]).length; });
  if(bad.length){ toast("Scheme "+bad[0].num+" has no links or alignment yet."); return; }
  await prepare(); switchApp("assign"); setMode(null); Q.stop=false;
  for(var i=0;i<list.length;i++){ var s=list[i]; if(Q.stop) break;
    S.running={label:"Scheme "+s.num+" ("+(i+1)+" of "+list.length+")", pct:0}; rPri();
    var r=await ai("schemerun",{schemes:[engineSpec(s)], label:"Scheme "+s.num+": "+s.name, show:true},3600000);
    if(r&&r.ok){ s.res={d:r.d, base:{vht:r.base.vht,spd:r.base.spd,ckm:r.base.ckm,over:r.base.over}, label:r.label, profile:r.profile, vot:r.vot, sig:r.sig, at:new Date().toISOString(), prov:"Engine output", notes:(r.notes||[]).concat((r.extras||[]).map(function(x){ return "new road "+x.km+" km carries "+fm(x.v)+" veh; connectors "+fm(x.stub0)+" m and "+fm(x.stub1)+" m"+(x.sameNode?" (both ends join the same node: no new route)":""); })), gap:r.gap};
      S.cmp=null; S.justStressed=true; audit("run","scheme "+s.num+": ΔVHT "+fmt(r.d.vht)); priSave(); }
    else { toast("Scheme "+s.num+": "+((r&&r.err)||"no reply")); break; } }
  S.running=null; Q.stop=false; rPri(); }
async function runPackage(label, ids, f, laneAdj){
  if(S.running){ toast("An engine run is already in progress."); return null; }
  var list=ids.map(sById).filter(Boolean).map(function(s){ var e=engineSpec(s); if(laneAdj&&laneAdj[s.id]&&s.type==="widen") e.lanes=Math.max(0,(s.lanes||1)+laneAdj[s.id]); return e; }).filter(function(e){ return !(e.type==="widen"&&!e.lanes); });
  if(!list.length){ toast("The package is empty."); return null; }
  await prepare(); switchApp("assign"); S.running={label:label, pct:0}; rPri();
  var r=await ai("schemerun",{schemes:list, label:label, show:true, keep:!laneAdj&&(f||1)===1, f:f||1},3600000); S.running=null;
  if(!r||!r.ok){ toast((r&&r.err)||"Package run failed."); rPri(); return null; }
  S.cmp=null; S.justStressed=true; audit("run",label+": ΔVHT "+fmt(r.d.vht));
  return {label:label, ids:ids.slice(), f:f||1, laneAdj:laneAdj||null, d:r.d, base:r.base, scn:r.scn, profile:r.profile, at:new Date().toISOString(), notes:r.notes}; }

/* ---------------- estimator ---------------- */
function rEstimator(){
  var p1=pkgSchemes(), ids=p1.map(function(s){ return s.id; }), pk=P.pkg, cur=pk&&sameIds(pk.ids,ids);
  var o='<div class="pgrid est"><div><div class="sec"><h3>Most likely programme</h3><div class="card small">'+(p1.length?'Priority 1: '+p1.map(function(s){ return '<span class="pnum sm" style="background:'+PCOL.P1+'">'+s.num+'</span>'; }).join(" "):'Priority 1 is empty. Run schemes first.')+
    '<div style="margin-top:6px">'+(pk?(cur?'Package run '+new Date(pk.at).toLocaleString()+'. ':'<span class="warn">The last package run ('+pk.ids.length+' schemes) no longer matches Priority 1.</span> ')+'ΔVHT '+fmt(pk.d.vht)+' veh·h. '+(interaction()!=null?'Interaction factor '+interaction().toFixed(2)+' (package ÷ sum of scheme runs).':interactionRaw()!=null?'<span class="warn">Interaction factor '+interactionRaw().toFixed(2)+' is outside 0.2 to 2, so the estimator adds or drops schemes at face value (factor 1).</span>':''):'No package run yet.')+'</div>'+
    '<div class="row w" style="margin-top:8px"><button class="btn sm pri" id="xPkg"'+(p1.length&&!S.running?'':' disabled')+'>'+svg("play")+'Run the package</button><button class="btn sm" id="xVar"'+(p1.length&&!S.running?'':' disabled')+'>Run 3 variations</button></div></div></div>';
  if(P.variants.length) o+='<div class="sec"><h3>Package runs '+prov("Engine output")+'<span class="r tiny mute2">effect vs the base at the same demand</span></h3><table class="t"><tr><th>Run</th><th class="n">ΔVHT</th><th class="n">Δ speed</th><th class="n">Δ congested km</th></tr>'+P.variants.slice(0,8).map(function(v){ return '<tr><td>'+h(v.label)+'<div class="tiny mute2">'+new Date(v.at).toLocaleString()+'</div></td><td class="n">'+fmt(v.d.vht)+'</td><td class="n">'+sgn(v.d.spd,2)+'</td><td class="n">'+sgn(v.d.ckm,1)+'</td></tr>'; }).join("")+'</table></div>';
  o+='</div><div><div class="sec"><h3>Quick estimate: adjust the package</h3>';
  if(!pk||!cur) o+='<div class="empty">Run the package first. The estimator starts from its volumes.</div>';
  else { var A=Q.adj||(Q.adj={incl:{}, demand:0, lanes:{}});
    o+='<div class="small muted">Schemes in or out (added or removed through their own runs × the interaction factor):</div><div class="xs">'+P.schemes.filter(function(s){ return s.res; }).map(function(s){ var inP=ids.indexOf(s.id)>=0, v=A.incl[s.id]!=null?A.incl[s.id]:inP;
      return '<label class="xchk"><input type="checkbox" data-xi="'+s.id+'"'+(v?' checked':'')+'><span class="pnum sm" style="background:'+PCOL[s._pri]+'">'+s.num+'</span>'+h(s.name)+(s.type==="widen"&&inP?' <select class="fld sm" data-xl="'+s.id+'"><option value="-1"'+(A.lanes[s.id]==-1?' selected':'')+'>−1 lane</option><option value="0"'+(!A.lanes[s.id]?' selected':'')+'>as coded</option><option value="1"'+(A.lanes[s.id]==1?' selected':'')+'>+1 lane</option></select>':'')+'</label>'; }).join("")+'</div>';
    o+='<div class="row w" style="margin-top:8px"><span class="small">Demand (matrix) change</span><input type="range" id="xDem" min="-20" max="20" step="1" value="'+A.demand+'"><b id="xDemV">'+(A.demand>0?"+":"")+A.demand+'%</b></div>';
    var est=quickEstimate();
    o+='<div class="card" style="margin-top:8px"><div class="row"><b class="grow">Estimated ΔVHT vs base</b>'+prov("Surrogate estimate")+'</div><div class="kpis" style="margin-top:6px"><div class="kpi"><b>'+fmt(est.vht)+'</b><span>ΔVHT veh·h</span></div><div class="kpi"><b>'+fmt(est.vht-pk.d.vht)+'</b><span>vs package run</span></div><div class="kpi"><b>'+(Q.est&&Q.est.ok?sgn(Q.est.eff.spd,2):sgn(pk.d.spd,2))+'</b><span>Δ speed km/h</span></div></div>'+
      '<div class="tiny mute2" style="margin-top:6px">'+h(est.method)+'</div><div class="row w" style="margin-top:8px"><button class="btn sm pri" id="xConfirm"'+(S.running?' disabled':'')+'>Confirm by assignment</button></div></div>'; }
  o+='</div>';
  if(P.vlog.length){ var mae=P.vlog.reduce(function(a,v){ return a+Math.abs(v.err); },0)/P.vlog.length;
    o+='<div class="sec"><h3>Estimator track record <span class="r">mean abs. error '+mae.toFixed(1)+'% of the package effect</span></h3><table class="t"><tr><th>When</th><th>Adjustment</th><th class="n">Estimate</th><th class="n">Engine</th></tr>'+P.vlog.slice(0,10).map(function(v){ return '<tr><td class="tiny">'+new Date(v.at).toLocaleString()+'</td><td class="small">'+h(v.what)+'</td><td class="n">'+fmt(v.est)+'</td><td class="n">'+fmt(v.eng)+'</td></tr>'; }).join("")+'</table></div>'; }
  o+='</div></div>';
  body(o);
  on("#xPkg","click",async function(){ var r=await runPackage("Package: Priority 1 ("+ids.length+" schemes)", ids, 1); if(r){ P.pkg=r; P.variants.unshift(r); Q.adj=null; Q.est=null; priSave(); } rPri(); });
  on("#xVar","click",async function(){ var p2=P.schemes.filter(function(s){ return s._pri==="P2"; }).map(function(s){ return s.id; });
    var V=[["Variation: Priority 1 + Priority 2", ids.concat(p2), 1],["Variation: Priority 1, demand −10%", ids, 0.9],["Variation: Priority 1, demand +10%", ids, 1.1]];
    for(var i=0;i<V.length;i++){ if(V[i][1].length===ids.length&&V[i][2]===1) continue; var r=await runPackage(V[i][0], V[i][1], V[i][2]); if(!r) break; P.variants.unshift(r); priSave(); }
    rPri(); });
  on("[data-xi]","change",function(c){ Q.adj.incl[c.dataset.xi]=c.checked; estimateNow(); });
  on("[data-xl]","change",function(c){ Q.adj.lanes[c.dataset.xl]=+c.value; estimateNow(); });
  on("#xDem","input",function(r){ $("xDemV").textContent=(r.value>0?"+":"")+r.value+"%"; });
  on("#xDem","change",function(r){ Q.adj.demand=+r.value; estimateNow(); });
  on("#xConfirm","click",confirmEstimate); }
function interaction(){ var pk=P.pkg; if(!pk) return null; var s=sumD(pk.ids.map(sById).filter(Boolean)).vht; if(!s) return null; var f=pk.d.vht/s; return (f>=0.2&&f<=2)?f:null; }
function interactionRaw(){ var pk=P.pkg; if(!pk) return null; var s=sumD(pk.ids.map(sById).filter(Boolean)).vht; return s?pk.d.vht/s:null; }
function adjIds(){ var ids=P.pkg.ids.slice(); Object.keys(Q.adj.incl).forEach(function(id){ var i=ids.indexOf(id); if(Q.adj.incl[id]&&i<0) ids.push(id); if(!Q.adj.incl[id]&&i>=0) ids.splice(i,1); }); return ids; }
function quickEstimate(){ var pk=P.pkg, I=interaction(); if(I==null||!isFinite(I)) I=1; var A=Q.adj, d=pk.d.vht, parts=[];
  Object.keys(A.incl).forEach(function(id){ var s=sById(id); if(!s||!s.res) return; var inP=pk.ids.indexOf(id)>=0; if(A.incl[id]&&!inP){ d+=I*s.res.d.vht; parts.push("+"+s.num); } if(!A.incl[id]&&inP){ d-=I*s.res.d.vht; parts.push("−"+s.num); } });
  if(Q.est&&Q.est.ok&&(A.demand||Object.keys(A.lanes).some(function(k){ return A.lanes[k]; }))) d+=Q.est.d.vht;
  var m=(parts.length?"Schemes "+parts.join(" ")+" through their own runs × interaction "+I.toFixed(2)+". ":"")+(Q.est&&Q.est.ok&&(A.demand||Object.keys(A.lanes).some(function(k){ return A.lanes[k]; }))?Q.est.method+". "+Q.est.caveat:"");
  return {vht:d, method:m||"No adjustment: equal to the package run."}; }
async function estimateNow(){ var A=Q.adj, lanes=[]; Object.keys(A.lanes).forEach(function(id){ var s=sById(id); if(s&&A.lanes[id]) lanes.push({links:s.links, add:A.lanes[id]}); });
  Q.est=(A.demand||lanes.length)?await ai("estimate",{demandPct:A.demand, lanes:lanes},60000):null; rPri(); }
async function confirmEstimate(){ var est=quickEstimate(), A=Q.adj, ids=adjIds(), what=[];
  var nm=function(id){ return (sById(id)||{num:"?"}).num; }; ids=ids.filter(sById);
  var p0=P.pkg.ids; ids.forEach(function(id){ if(p0.indexOf(id)<0) what.push("+"+nm(id)); }); p0.forEach(function(id){ if(ids.indexOf(id)<0) what.push("−"+nm(id)); });
  Object.keys(A.lanes).forEach(function(id){ if(A.lanes[id]) what.push("scheme "+nm(id)+" "+(A.lanes[id]>0?"+":"")+A.lanes[id]+" lane"); }); if(A.demand) what.push("demand "+(A.demand>0?"+":"")+A.demand+"%");
  var pk=P.pkg, r=await runPackage("Confirm: "+(what.join(", ")||"package as run"), ids, 1+A.demand/100, A.lanes); if(!r){ rPri(); return; }
  var den=Math.max(Math.abs(r.d.vht),Math.abs(pk.d.vht),1); P.vlog.unshift({at:r.at, what:what.join(", ")||"none", est:est.vht, eng:r.d.vht, err:100*(est.vht-r.d.vht)/den}); P.variants.unshift(r); priSave(); rPri();
  toast("Engine ΔVHT "+fmt(r.d.vht)+" vs estimate "+fmt(est.vht)+"."); }

/* ---------------- method, settings, exchange ---------------- */
function rMethod(){ var St=P.set, n=P.schemes.length, run=P.schemes.filter(function(s){ return s.res; }).length, steam=P.schemes.filter(function(s){ return s.res&&s.res.prov==="STEAM run"; }).length;
  var steps=[["Code the schemes", n+" coded: "+["Roadway","Mass transit","Policy"].map(function(g){ return P.schemes.filter(function(s){ return STYPE[s.type].g===g; }).length+" "+g.toLowerCase(); }).join(", "), n>0],
    ["Run each scheme independently", run+" of "+n+" run ("+steam+" with STEAM KPIs). Collects KPIs against the base; SPD25 parameters are set per scheme.", n>0&&run===n],
    ["Full run of the most likely programme and variations", P.pkg?("Package run "+new Date(P.pkg.at).toLocaleDateString()+", "+P.variants.length+" runs in total"):"Not run yet (Estimator tab)", !!P.pkg],
    ["Quick estimation engine", P.vlog.length?P.vlog.length+" estimates checked against the engine":"Ready once the package is run", P.vlog.length>0]];
  var o='<div class="pgrid meth"><div><div class="sec"><h3>Method</h3>'+steps.map(function(s,i){ return '<div class="mstep'+(s[2]?' ok':'')+'"><span class="mi">'+(s[2]?'✓':i+1)+'</span><div><b>'+h(s[0])+'</b><div class="tiny mute2">'+h(s[1])+'</div></div></div>'; }).join("")+
    '<div class="warnbox small" style="margin-top:6px">Scheme runs here use the in-app equilibrium assignment of the STEAM 2040 OD (screening profile). The 30 to 40 full STEAM runs belong on the TFP workstation: export the batch below, run it there, and import the KPIs back. Imported KPIs replace engine KPIs and are labelled STEAM run.</div>'+
    '<div class="row w"><button class="btn sm" id="mBatch">'+svg("dl")+'STEAM batch specs (JSON)</button><button class="btn sm" id="mTpl">KPI import template (CSV)</button><label class="btn sm" style="cursor:pointer">Import STEAM KPIs<input type="file" id="mImp" accept=".csv" hidden></label></div></div>'+
    '<div class="sec"><h3>Engine profile</h3><div class="row w"><select class="fld" id="mMeth"><option value="fw">Frank-Wolfe</option><option value="msa">MSA equilibrium</option><option value="bpr">BPR incremental</option></select><select class="fld" id="mSamp"><option value="100">100 origins</option><option value="250">250 origins</option><option value="500">500 origins</option><option value="1000">1000 origins</option><option value="0">all origins</option></select></div><div class="tiny mute2">Shared with Stress tests. Every scheme and package runs against the same screening base with this profile; changing it marks earlier results as another profile. The noise band comes from a null test (two negligible changes) and is at least 0.1% of base VHT. Sampled origins also carry sampling error that the band does not measure: fewer origins concentrate demand (each one is scaled up), so results at 100 origins are for drafting only. Use 250 or more, and STEAM runs for decisions.</div></div></div>';
  o+='<div><div class="sec"><h3>Prioritisation weights</h3><div class="egrid">'+[["bcr","Benefit-cost ratio"],["relief","Congestion relief"]].concat(SPD).map(function(k){ return fld(k[1], '<input class="fld" type="number" min="0" max="100" data-w="'+k[0]+'" value="'+St.w[k[0]]+'">'); }).join("")+'</div><div class="tiny mute2">Score = Σ weight × component ÷ Σ weights. BCR counts in full at 3.0. Relief is the scheme\'s rank on vehicle-hours saved. SPD25 parameters map 1 to 5 onto 0 to 1. Weights and the SPD25 set are placeholders until the SPD25 criteria are supplied.</div></div>';
  o+='<div class="sec"><h3>Budget envelope, AED m</h3><div class="egrid">'+PRI_YEARS.map(function(y,k){ return fld(String(y), '<input class="fld" type="number" min="0" data-b="'+k+'" value="'+(St.budget[k]||0)+'">'); }).join("")+fld("Priority 2 reserve %", '<input class="fld" type="number" min="0" max="200" data-s="reserve" value="'+St.reserve+'">')+'</div><div class="tiny mute2">Only schemes with a benefit-cost ratio of at least 1 and an effect above run noise can be Priority 1 or 2. Priority 1: best score first while every year stays inside the envelope. Priority 2: inside the envelope plus the reserve. Priority 3: the rest, with the reason shown.</div></div>';
  o+='<div class="sec"><h3>Economics (placeholder)</h3><div class="egrid">'+fld("Annualisation (period → year)", '<input class="fld" type="number" min="1" data-s="annual" value="'+St.annual+'">')+fld("Appraisal years", '<input class="fld" type="number" min="5" max="60" data-s="life" value="'+St.life+'">')+fld("Discount rate %", '<input class="fld" type="number" min="0" max="15" step="0.5" data-s="disc" value="'+St.disc+'">')+'</div><div class="tiny mute2">Benefit per year = vehicle-hours saved in the period × annualisation × VOT. Present values to 2025; benefits start the year after completion. Travel time only: no safety, emissions, reliability or charge revenue.</div>'+
    '<div class="row w" style="margin-top:8px"><button class="btn sm" id="mReset">Reset settings</button><button class="btn sm" id="mClear">Remove all schemes</button></div></div></div></div>';
  body(o);
  var mm=$("mMeth"), ms=$("mSamp"); var sc=S.screen||{method:"fw",sample:"250"}; mm.value=sc.method; ms.value=sc.sample;
  on("#mMeth,#mSamp","change",function(){ S.screen={method:mm.value, sample:ms.value}; ai("setscreen",S.screen); rPri(); });
  on("[data-w]","change",function(e){ St.w[e.dataset.w]=Math.max(0,+e.value||0); priSave(); scoreAll(); showSchemes(); });
  on("[data-b]","change",function(e){ St.budget[+e.dataset.b]=Math.max(0,+e.value||0); priSave(); scoreAll(); showSchemes(); });
  on("[data-s]","change",function(e){ St[e.dataset.s]=+e.value||0; priSave(); scoreAll(); showSchemes(); });
  on("#mReset","click",function(){ P.set=JSON.parse(JSON.stringify(PRI_DEF)); priSave(); rPri(); });
  on("#mClear","click",function(){ if(!confirm("Remove all "+P.schemes.length+" schemes and their results?")) return; P.schemes=[]; P.pkg=null; P.variants=[]; P.vlog=[]; P.nextNum=1; Q.sel=Q.edit=null; priSave(); rPri(); });
  on("#mBatch","click",function(){ download("tfp-steam-batch.json", JSON.stringify({schema:"steam-ai.scheme-batch/v1", generated:new Date().toISOString(), base:"steam-2040-reference", note:"One STEAM run per scheme against the base, then the Priority 1 package.", runs:P.schemes.map(schemeSpec).concat(pkgSchemes().length?[{scenario_id:"pkg-p1", label:"Priority 1 package", schemes:pkgSchemes().map(function(s){ return s.id; })}]:[])},null,2), "application/json"); });
  on("#mTpl","click",function(){ download("tfp-kpi-import.csv", "scheme_id,scheme_no,name,d_vht,d_vkt,d_speed_kmh,d_over_capacity_links,d_congested_km\n"+P.schemes.map(function(s){ return [s.id,s.num,'"'+s.name.replace(/"/g,"'")+'"',"","","","",""].join(","); }).join("\n"), "text/csv"); });
  on("#mImp","change",function(i){ if(i.files[0]) importKPIs(i.files[0]); }); }
function schemeSpec(s){ var t=s.type, iv={widen:{parameter:"lanes_add", value:s.lanes||1}, ops:{parameter:"capacity_factor", value:1+(s.capPct||10)/100}, charge:{parameter:"charge_aed", value:s.aed||4},
    newroad:{parameter:"new_link", value:{lanes:s.lanesNew||2, ltype:s.lt||20, alignment_epsg32640:s.pts}}, transit:{parameter:"transit_line", value:{mode:s.mode||"lrt", alignment_epsg32640:s.pts, station_spacing_m:s.spacing||1200, catchment_m:s.catch||800, placeholder_car_shift_pct:{both_ends:s.both, one_end:s.one}}},
    demand:{parameter:"destination_demand_factor", value:{centre_epsg32640:(s.pts||[])[0], radius_m:s.radius||2000, factor:1-(s.redPct||10)/100}}}[t];
  return {schema_version:"1.0", scenario_id:"tfp-"+s.id, scheme_no:s.num, label:s.name, parent_run_id:"steam-2040-reference", status:"draft", year:2040, period_ids:["am_peak"], network_version:"steam-2040", zone_system_version:"steam-2040-3692",
    interventions:[{type:t, target_entity_ids:(s.links||[]).slice(0,5000).map(function(g){ return "link:"+g; }), parameter:iv.parameter, new_value:iv.value, assumption_source:s.demo?"demonstration scheme":"user-coded scheme"}],
    cost_aed_m:costOf(s), cash_flow:cashflow(s), spd25:s.spd, evaluation_method:"STEAM full run on the TFP workstation; in-app screening for comparison", kpis_requested:["d_vht","d_vkt","d_speed_kmh","d_over_capacity_links","d_congested_km","skims"]}; }
function csvRows(t){ var L=t.replace(/\r/g,"").split("\n").filter(function(l){ return l.trim(); }); if(!L.length) return {h:[],r:[]}; function sp(l){ var o=[],c="",q=false; for(var i=0;i<l.length;i++){ var ch=l[i]; if(ch==='"') q=!q; else if(ch===","&&!q){ o.push(c); c=""; } else c+=ch; } o.push(c); return o.map(function(x){ return x.trim(); }); }
  var hd=sp(L[0]).map(function(x){ return x.toLowerCase(); }); return {h:hd, r:L.slice(1).map(sp)}; }
function importKPIs(f){ var rd=new FileReader(); rd.onload=function(){ var c=csvRows(rd.result), ix=function(k){ return c.h.indexOf(k); }, n=0;
    c.r.forEach(function(r){ var s=(ix("scheme_id")>=0&&sById(r[ix("scheme_id")]))||(ix("scheme_no")>=0&&P.schemes.filter(function(x){ return String(x.num)===r[ix("scheme_no")]; })[0]); if(!s) return;
      var g=function(k){ var i=ix(k); return i>=0&&r[i]!==""?+r[i]:null; }; if(g("d_vht")==null) return;
      s.res={d:{vht:g("d_vht"), vkt:g("d_vkt")||0, spd:g("d_speed_kmh")||0, over:g("d_over_capacity_links")||0, ckm:g("d_congested_km")||0}, label:"Imported from "+f.name, profile:"STEAM run (imported KPIs)", vot:(s.res&&s.res.vot)||45, at:new Date().toISOString(), prov:"STEAM run"}; n++; });
    priSave(); rPri(); toast(n?"Imported STEAM KPIs for "+n+" scheme"+(n===1?"":"s")+".":"No rows matched a scheme (scheme_id or scheme_no, and d_vht are required)."); audit("import","STEAM KPIs "+f.name+": "+n); }; rd.readAsText(f); }
function importSchemes(f){ var rd=new FileReader(); rd.onload=async function(){ var list=[];
    try{ if(/\.json$/i.test(f.name)){ var j=JSON.parse(rd.result); list=Array.isArray(j)?j:(j.schemes||[]); }
      else { var c=csvRows(rd.result), ix=function(k){ return c.h.indexOf(k); };
        c.r.forEach(function(r){ var g=function(k){ var i=ix(k); return i>=0?r[i]:""; }; var t=g("type")||"widen"; if(!STYPE[t]) return;
          var s={type:t, name:g("name")||STYPE[t].t, start:+g("start")||2026, dur:+g("duration")||2, profile:g("profile")||"even", spd:{strat:+g("strat")||3, safety:+g("safety")||3, deliv:+g("deliv")||3, sust:+g("sust")||3}};
          if(g("cost_aed_m")){ s.cost=+g("cost_aed_m"); s.costManual=true; } if(g("links")) s.links=g("links").split(/[ ;|]+/).map(Number).filter(function(x){ return x>=0; });
          if(g("points")) s.pts=g("points").split(/[;|]/).map(function(p){ var q=p.trim().split(/\s+/).map(Number); return [q[0],q[1]]; }).filter(function(p){ return isFinite(p[0])&&isFinite(p[1]); });
          ["lanes","lanesnew","lt","cappct","aed","catch","spacing","both","one","radius","redpct"].forEach(function(k){ var v=g(k); if(v!=="") s[{lanesnew:"lanesNew",cappct:"capPct",redpct:"redPct"}[k]||k]=+v; }); if(g("mode")) s.mode=g("mode");
          list.push(s); }); } }
    catch(e){ toast("Could not read "+f.name+": "+e.message); return; }
    for(var i=0;i<list.length;i++){ var s=list[i]; s.id="S"+Date.now().toString(36)+i; s.num=P.nextNum++; delete s.res; s.links=s.links||[]; s.pts=s.pts||[]; await refreshGeo(s); P.schemes.push(s); }
    priSave(); rPri(); toast("Imported "+list.length+" scheme"+(list.length===1?"":"s")+"."); audit("import","schemes "+f.name+": "+list.length); }; rd.readAsText(f); }
function priCSV(){ var order=scoreAll(); return "no,name,type,group,cost_aed_m,"+PRI_YEARS.join(",")+",later,score,provisional,priority,d_vht,d_speed_kmh,d_congested_km,annual_benefit_aed_m,bcr,kpi_source\n"+order.map(function(s){ var cf=cashflow(s), e=s._e, d=s.res&&s.res.d;
  return [s.num,'"'+s.name.replace(/"/g,"'")+'"',s.type,STYPE[s.type].g,costOf(s)].concat(PRI_YEARS.map(function(y){ return cf[y].toFixed(1); })).concat([cf.later.toFixed(1),s._score,s._prov?"yes":"no",s._pri,d?d.vht.toFixed(1):"",d?d.spd.toFixed(3):"",d?d.ckm.toFixed(2):"",e?e.annual.toFixed(2):"",e&&e.bcr!=null?e.bcr.toFixed(2):"",s.res?s.res.prov:""]).join(","); }).join("\n"); }
async function priDocx(){ var order=scoreAll(), D=new Doc("Programme prioritisation"); docControl(D,"Scheme Prioritisation (TFP programme)");
  toast("Building the report…"); Q.sel=null; await showSchemes({fit:true}); await new Promise(function(r){ setTimeout(r,1100); }); var img=await ai("snapshot",{},20000); if(!img||!img.ok) img=null;
  D.h("Summary"); var p1=order.filter(function(s){ return s._pri==="P1"; }), c1=p1.reduce(function(a,s){ return a+costOf(s); },0);
  D.draft(P.schemes.length+" schemes coded; "+order.filter(function(s){ return !s._prov; }).length+" assessed. Priority 1 holds "+p1.length+" schemes costing AED "+fm(c1)+" m within the 2025 to 2030 envelope."+(P.pkg?" The Priority 1 package changes vehicle-hours by "+fmt(P.pkg.d.vht)+" per period ("+P.pkg.profile+").":""), "programme");
  if(img) D.img(img.png, img.w, img.h);
  D.h("Programme"); D.table(order.map(function(s){ var cf=cashflow(s); return [String(s.num), s.name, STYPE[s.type].t, fmt(costOf(s))].concat(PRI_YEARS.map(function(y){ return cf[y]>0.5?fmt(cf[y]):""; })).concat([cf.later>0.5?fmt(cf.later):"", String(s._score)+(s._prov?" (prov.)":""), priName(s._pri)]); }), ["#","Project","Type","Cost AED m"].concat(PRI_YEARS.map(String)).concat(["Later","Score","Priority"]));
  D.h("KPIs by scheme"); D.table(order.filter(function(s){ return s.res; }).map(function(s){ var d=s.res.d, e=s._e; return [String(s.num), s.name, fmt(-d.vht), sgn(d.spd,2), sgn(d.ckm,1), e?fmt(e.annual):"", e&&e.bcr!=null?e.bcr.toFixed(2):"", s.res.prov]; }), ["#","Scheme","VHT saved","Δ speed km/h","Δ congested km","Benefit AED m/yr","BCR","Source"]);
  D.h("Method and assumptions"); ["Each scheme runs on its own against the common screening base: "+(order.filter(function(s){ return s.res; })[0]||{res:{profile:"no runs yet"}}).res.profile+".", "Transit and parking schemes act through placeholder shifts of car trips in station catchments or to the area; no approved mode-choice response is loaded.", "Road-user charges enter route choice as time at the value of time; revenue and elasticity are not modelled.", "Costs from illustrative unit rates unless entered; SPD25 parameters are a placeholder set.", "Economics: benefit per year = vehicle-hours saved × "+P.set.annual+" × VOT; "+P.set.life+" years at "+P.set.disc+"%, present value to 2025.", "Weights: "+Object.keys(P.set.w).map(function(k){ return k+" "+P.set.w[k]; }).join(", ")+"."].forEach(function(t){ D.bullet(t); });
  if(P.vlog.length){ D.h("Quick estimator track record"); D.table(P.vlog.slice(0,15).map(function(v){ return [new Date(v.at).toLocaleString(), v.what, fmt(v.est), fmt(v.eng), v.err.toFixed(1)+"%"]; }), ["When","Adjustment","Estimate ΔVHT","Engine ΔVHT","Error"]); }
  download("programme-prioritisation.docx", D.blob()); }

/* ---------------- map events in the Schemes workspace ---------------- */
function priPick(g){ if(S.ws!=="pri") return false; var s=Q.edit?sById(Q.edit):null;
  if(Q.mode!=="links"||!s) return false; s.links=s.links||[]; var i=s.links.indexOf(g); if(i>=0) s.links.splice(i,1); else s.links.push(g); delete s.res;
  refreshGeo(s).then(function(){ priSave(); rPri(); }); return true; }
function priPoint(m){ if(S.ws!=="pri"||Q.mode!=="draw") return; var s=Q.edit?sById(Q.edit):null; if(!s) return;
  s.pts=s.pts||[]; s.pts.push([m.x,m.y]); delete s.res;
  if(s.type==="demand"){ s.pts=[[m.x,m.y]]; setMode(null); }
  refreshGeo(s).then(function(){ priSave(); rPri(); }); }

/* copilot tool */
TOOLS_AI.rank_schemes={d:"Programme prioritisation: schemes ranked by score with cost, priority band and KPIs.", p:{priority:{type:"string",enum:["P1","P2","P3"]}},
  run:async function(a){ var o=scoreAll().filter(function(s){ return !a.priority||s._pri===a.priority; });
    return {rows:o.map(function(s){ return {no:s.num, scheme:s.name, type:STYPE[s.type].t, cost_aed_m:costOf(s), score:s._score, provisional:s._prov, priority:s._pri, d_vht:s.res?Math.round(s.res.d.vht):null, bcr:s._e&&s._e.bcr!=null?+s._e.bcr.toFixed(2):null}; }),
      summary:{n:P.schemes.length, assessed:o.filter(function(s){ return !s._prov; }).length, p1:o.filter(function(s){ return s._pri==="P1"; }).map(function(s){ return {no:s.num,name:s.name,score:s._score,cost:costOf(s)}; }), top:o.slice(0,6).map(function(s){ return {no:s.num,name:s.name,score:s._score,pri:s._pri}; })}}; }};
