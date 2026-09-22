/* =====================================================================
   STEAM-AI engine (injected into the Assignment app, same realm as its
   globals: GLINK, GRAPH, L, RD, CLS, CENT, CIDS, CR, N0, PARAMS, baseVol,
   scnVol, ODMAT, window.__ODRAW, assignChunked, buildGraph, render ...).

   Everything here is model-native QA and forecasting over the real STEAM
   2040 network and OD that ship inside the Brain:
     - post-run diagnostics (inputs + outputs) with a rule, a file and a
       record behind every finding
     - numerical tolerance (noise band) from the last assignment iteration
     - scenario comparison screened by that tolerance
     - a growth-response surrogate fitted from paired engine runs, with a
       held-out back-test, used for 2026-2050 hotspot forecasts
     - stress tests run through the real assignment engine
     - map overlay (highlighted links, pulsing finding markers), entity
       inspection, link/zone queries, HSM cordon export
   The shell calls it through the bridge: {cmd:"ai.<name>", ...}.
   ===================================================================== */
(function(){
"use strict";
var BIG=1e9;
var AI=window.__AI={ lu:null, luById:null, zoneDist:null, linkZone:null, findings:[], checks:[],
  tol:null, surrogate:null, forecastOn:false, hl:null, markers:[], pick:false, lastRun:null,
  volSource:"none", importInfo:null };

/* ---------------- helpers ---------------- */
function post(o){ try{ o.steam=1; o.resp=1; o.app="assign"; window.parent.postMessage(o,"*"); }catch(e){} }
function progress(label,pct){ post({event:"aiprog", label:label, pct:pct}); }
function pl(n,w){ return n.toLocaleString()+" "+w+(n===1?"":"s"); }
function r1(x){ return Math.round(x*10)/10; }
function r2(x){ return Math.round(x*100)/100; }
function fmt(n){ n=+n||0; var a=Math.abs(n); return a>=1e6?(n/1e6).toFixed(2)+"M":a>=1e4?Math.round(n/1e3)+"k":a>=1e3?(n/1e3).toFixed(1)+"k":a>=100?Math.round(n)+"":a>=10?n.toFixed(1):n.toFixed(2); }
function clsName(ci){ return CLS[ci]; }
var CLSLABEL={fwy:"freeway",ramp:"ramp",art:"arterial",coll:"collector",rural:"rural road",local:"local road",junc:"junction link"};
function ensureNet(){ if(!GLINK) buildLinks(); if(!GRAPH) buildGraph(null); }
function nodeIdx(id){ return GRAPH.idMap.get(id); }
function linkMid(g){ return [(GLINK.ax[g]+GLINK.bx[g])/2,(GLINK.ay[g]+GLINK.by[g])/2]; }
function bboxOf(links){ var x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
  for(var k=0;k<links.length;k++){ var g=links[k];
    x0=Math.min(x0,GLINK.ax[g],GLINK.bx[g]); y0=Math.min(y0,GLINK.ay[g],GLINK.by[g]);
    x1=Math.max(x1,GLINK.ax[g],GLINK.bx[g]); y1=Math.max(y1,GLINK.ay[g],GLINK.by[g]); }
  return [x0,y0,x1,y1]; }
function geomLen(g){ var c=CLS[GLINK.cls[g]], d=L[c], i=GLINK.loc[g], s=0;
  for(var j=d.off[i]+1;j<d.off[i+1];j++){ s+=Math.hypot(d.xy[j*2]-d.xy[j*2-2], d.xy[j*2+1]-d.xy[j*2-1]); } return s; }
function linkRef(g){ return "link #"+g+" (A="+GLINK.A[g]+", B="+GLINK.B[g]+", LTYPE="+GLINK.lt[g]+")"; }
var NETFILE="STEAM 2040 network (STEAM_network_links, embedded in this build)";
var LUFILE="STEAM_landuse_2040.csv (embedded)";
var ODFILE="STEAM 2040 OD matrix (24h, embedded; 2,225,004 cells)";
function curMethod(){ var e=document.getElementById("methodSel"); return e?e.value:"aon"; }
function periodLabel(){ var e=document.getElementById("periodSel"); if(!e) return "";
  return e.options[e.selectedIndex]?e.options[e.selectedIndex].text:""; }
function isEquilibrium(m){ return m==="fw"||m==="msa"; }
function vcOf(vol,g){ return vol[g]/GRAPH.ECAP[g]; }
function linkTimeFF(g){ return GRAPH.EFF[g]; }
function linkTimeV(g,vol){ return linkTime(g,vol); }
/* KPIs over the base links only (safe whatever graph is current) */
function mets(vol){ var vht=0,vmt=0,over=0,ff=0; for(var g=0;g<GLINK.m;g++){ var v=vol[g]; if(!(v>0)) continue; var t=linkTime(g,vol); vht+=v*t/3600; ff+=v*GRAPH.EFF[g]/3600; vmt+=v*GLINK.len[g]/1000; if(v>GRAPH.ECAP[g]) over++; } return {vht:vht,vmt:vmt,over:over,delay:vht-ff,spd:vht>0?vmt/vht:0}; }

/* union-find */
function UF(n){ var p=new Int32Array(n); for(var i=0;i<n;i++)p[i]=i;
  function f(x){ while(p[x]!==x){ p[x]=p[p[x]]; x=p[x]; } return x; }
  return {find:f, union:function(a,b){ a=f(a); b=f(b); if(a!==b) p[a]=b; }}; }

/* ---------------- land use (from the shell) ---------------- */
function setLU(csv){
  var lines=csv.split(/\r?\n/).filter(function(l){return l.trim().length;});
  var head=lines[0].split(","); var rows=[], byId=new Map();
  for(var r=1;r<lines.length;r++){ var p=lines[r].split(","); var o={};
    for(var c=0;c<head.length;c++){ var v=p[c]; var n=parseFloat(v); o[head[c]]=(head[c]==="DISTNAME")?v:(isFinite(n)?n:v); }
    o._row=r+1; rows.push(o); byId.set(o.Z|0,o); }
  AI.lu={head:head, rows:rows}; AI.luById=byId;
  // zone index -> district
  var zd=new Int32Array(N0).fill(-1);
  for(var z=0;z<N0;z++){ var rec=byId.get(CIDS[z]>>>0); if(rec) zd[z]=rec.DISTRICT|0; }
  AI.zoneDist=zd; AI.distName=new Map();
  rows.forEach(function(o){ if(o.DISTRICT && !AI.distName.has(o.DISTRICT|0)) AI.distName.set(o.DISTRICT|0,String(o.DISTNAME||("District "+o.DISTRICT))); });
  AI.linkZone=null;
  return {ok:true, rows:rows.length, cols:head.length};
}
/* nearest zone centroid for every link midpoint (grid index) */
function linkZones(){
  if(AI.linkZone) return AI.linkZone; ensureNet();
  var cell=3000, grid=new Map();
  for(var z=0;z<N0;z++){ var k=Math.floor(CENT[z*2]/cell)+":"+Math.floor(CENT[z*2+1]/cell); var a=grid.get(k); if(!a){a=[];grid.set(k,a);} a.push(z); }
  var m=GLINK.m, out=new Int32Array(m);
  for(var g=0;g<m;g++){ var x=(GLINK.ax[g]+GLINK.bx[g])/2, y=(GLINK.ay[g]+GLINK.by[g])/2;
    var gx=Math.floor(x/cell), gy=Math.floor(y/cell), best=-1, bd=1e30;
    for(var rad=0;rad<6 && (best<0||rad<2);rad++){
      for(var i=-rad;i<=rad;i++) for(var j=-rad;j<=rad;j++){ if(Math.max(Math.abs(i),Math.abs(j))!==rad) continue;
        var a=grid.get((gx+i)+":"+(gy+j)); if(!a) continue;
        for(var q=0;q<a.length;q++){ var zz=a[q], dx=CENT[zz*2]-x, dy=CENT[zz*2+1]-y, d=dx*dx+dy*dy; if(d<bd){bd=d;best=zz;} } }
    }
    out[g]=best; }
  AI.linkZone=out; return out;
}
function linkDistrict(g){ var lz=linkZones(); var z=lz[g]; if(z<0||!AI.zoneDist) return null; return AI.zoneDist[z]; }
function distLabel(d){ if(d==null||d<0) return "unknown district"; var n=AI.distName&&AI.distName.get(d); return n?titleCase(n):("District "+d); }
function titleCase(s){ return String(s).toLowerCase().replace(/\b[a-z]/g,function(c){return c.toUpperCase();}); }

/* ---------------- OD totals per zone ---------------- */
function odZoneTotals(){
  if(AI.odz) return AI.odz;
  var R=window.__ODRAW; if(!R) return null;
  var idx=zoneIdIndex(); var P=new Float64Array(N0), A=new Float64Array(N0), I=new Float64Array(N0);
  var tot=0, skipped=0, skippedTrips=0, neg=0, cells=0;
  for(var i=0;i<R.cnt;i++){ var v=h2f(R.V[i]); if(v<0){neg++;}
    var o=idx.get(R.O[i]>>>0), d=idx.get(R.D[i]>>>0);
    if(o===undefined||d===undefined){ skipped++; skippedTrips+=v; continue; }
    P[o]+=v; A[d]+=v; if(o===d) I[o]+=v; tot+=v; cells++; }
  AI.odz={P:P,A:A,I:I,tot:tot,skipped:skipped,skippedTrips:skippedTrips,neg:neg,cells:cells,cnt:R.cnt};
  return AI.odz;
}

/* =====================================================================
   CHECK LIBRARY
   ===================================================================== */
var SEVW={Critical:25, High:10, Medium:3, Info:0};
var CHECKS=[
 {id:"NET-01", name:"Links with zero or missing lanes", family:"Network", phase:"input", needs:"network links"},
 {id:"NET-02", name:"Lane count inconsistent with facility class", family:"Network", phase:"input", needs:"network links"},
 {id:"NET-03", name:"Stored length vs geometric length", family:"Network", phase:"input", needs:"network links + geometry"},
 {id:"NET-04", name:"Duplicate directed links", family:"Network", phase:"input", needs:"network links"},
 {id:"NET-05", name:"Self-loops (A = B)", family:"Network", phase:"input", needs:"network links"},
 {id:"NET-06", name:"Disconnected network components", family:"Network", phase:"input", needs:"network links"},
 {id:"NET-07", name:"Zones with no network attachment", family:"Network", phase:"input", needs:"zone centroids + connectors"},
 {id:"NET-08", name:"Centroid far from its attachment node", family:"Network", phase:"input", needs:"zone centroids + connectors"},
 {id:"NET-09", name:"Centroid connectors on freeway nodes", family:"Network", phase:"input", needs:"zone centroids + connectors"},
 {id:"NET-10", name:"Dead ends on freeways and arterials", family:"Network", phase:"input", needs:"network links"},
 {id:"LU-01",  name:"Population without households (and vice versa)", family:"Land use", phase:"input", needs:"land-use file"},
 {id:"LU-02",  name:"Negative land-use values", family:"Land use", phase:"input", needs:"land-use file"},
 {id:"LU-03",  name:"Land-use control totals", family:"Land use", phase:"input", needs:"land-use file + control totals"},
 {id:"LU-04",  name:"Resident workers exceed population", family:"Land use", phase:"input", needs:"land-use file"},
 {id:"LU-05",  name:"Zone ID mismatch between land use and network", family:"Land use", phase:"input", needs:"land-use file + zone centroids"},
 {id:"OD-01",  name:"Matrix totals, negatives and unmatched zones", family:"Matrix", phase:"input", needs:"OD matrix"},
 {id:"OD-02",  name:"Intrazonal share outliers", family:"Matrix", phase:"input", needs:"OD matrix"},
 {id:"OD-03",  name:"Demand without land use / land use without demand", family:"Matrix", phase:"input", needs:"OD matrix + land-use file"},
 {id:"PAR-01", name:"Parameter drift against the approved register", family:"Parameters", phase:"input", needs:"parameter register"},
 {id:"OUT-01", name:"Over-capacity corridors (clustered)", family:"Highway outputs", phase:"output", needs:"assigned link volumes"},
 {id:"OUT-02", name:"Volume discontinuities along continuous roads", family:"Highway outputs", phase:"output", needs:"assigned link volumes"},
 {id:"OUT-03", name:"Unused freeway and arterial links", family:"Highway outputs", phase:"output", needs:"assigned link volumes"},
 {id:"OUT-04", name:"Implausible congested speeds", family:"Highway outputs", phase:"output", needs:"assigned link volumes"},
 {id:"OUT-05", name:"Assignment convergence", family:"Convergence/noise", phase:"output", needs:"iteration history (relative gap)"},
 {id:"OUT-06", name:"Average trip length plausibility", family:"Highway outputs", phase:"output", needs:"assigned link volumes + OD"},
 {id:"OUT-07", name:"Screenline and cordon balance", family:"Calibration/observations", phase:"output", needs:"screenline definitions + observed counts", notRun:true},
 {id:"OUT-08", name:"Observed count comparison (GEH)", family:"Calibration/observations", phase:"output", needs:"traffic counts from the ITC Data Warehouse", notRun:true},
 {id:"PT-01",  name:"Transit lines with broken node sequences", family:"Public transport", phase:"input", needs:"PT line files (LIN)", notRun:true},
 {id:"PT-02",  name:"Unused transit services despite catchment demand", family:"Public transport", phase:"output", needs:"PT assignment (line boardings)", notRun:true},
 {id:"PT-03",  name:"Headways and fares outside plausible ranges", family:"Public transport", phase:"input", needs:"PT line files + fare tables", notRun:true},
 {id:"JN-01",  name:"Junction delay outliers", family:"Junctions", phase:"output", needs:"junction/turn delays (HSM or node-based assignment)", notRun:true},
 {id:"SCN-01", name:"Flow shifts with no explanatory input change", family:"Scenario response", phase:"compare", needs:"two runs (base + scenario)"}
];
function F(o){ o.provenance=o.provenance||"Checked on file"; return o; }
function sevRank(s){ return s==="Critical"?0:s==="High"?1:s==="Medium"?2:3; }
function capList(a,n){ return a.length>n?a.slice(0,n):a; }

/* --------- input checks --------- */
function runInputChecks(out){
  ensureNet();
  var m=GLINK.m, A=GLINK.A, B=GLINK.B, ln=GLINK.ln, cls=GLINK.cls, len=GLINK.len;
  // NET-01
  (function(){ var bad=[]; for(var g=0;g<m;g++) if(ln[g]===0) bad.push(g);
    var st={id:"NET-01",status:"ran",n:bad.length};
    if(bad.length){ var byC={}; bad.forEach(function(g){ var c=CLS[cls[g]]; byC[c]=(byC[c]||0)+1; });
      out.push(F({check:"NET-01", severity:bad.length>200?"High":"Medium", title:pl(bad.length,"link")+" are coded with 0 lanes",
        exec:bad.length.toLocaleString()+" road links have no lanes coded, so the model gives them a guessed capacity.",
        location:{type:"links", links:capList(bad,3000), count:bad.length},
        evidence:[["Links with LANE_2040 = 0",bad.length.toLocaleString()],["By class",Object.keys(byC).map(function(k){return CLSLABEL[k]+" "+byC[k];}).join(", ")],["Engine treatment","capacity = max(1, lanes) x class capacity"]],
        rule:"LANE_2040 must be >= 1 on every road link (LTYPE 1-44)", source_file:NETFILE, source_rows:"e.g. "+linkRef(bad[0]),
        likely_cause:"Lane attribute not populated when links were added or split.",
        action:"Populate LANE_2040 from the as-built record or the scheme drawings; re-run.", expected_effect:"Capacity on these links becomes correct; flows can shift where the guessed 1-lane capacity was wrong.",
        effect_method:"Checked on file (no model run needed)", confidence:"High"})); }
    out.checks.push(st); })();
  // NET-02
  (function(){ var bad=[];
    for(var g=0;g<m;g++){ var c=CLS[cls[g]], l=ln[g]; if(!l) continue;
      if((c==="fwy"&&l<2)||(c==="local"&&l>=4)||(c==="coll"&&l>=5)||l>8) bad.push(g); }
    out.checks.push({id:"NET-02",status:"ran",n:bad.length});
    if(bad.length){ out.push(F({check:"NET-02", severity:"Medium", title:pl(bad.length,"link")+" have a lane count unusual for their class",
      exec:"Some roads carry a lane count that does not match their road type; worth a quick coding review.",
      location:{type:"links", links:capList(bad,3000), count:bad.length},
      evidence:[["Rule hits",bad.length.toLocaleString()],["Example",linkRef(bad[0])+" · "+ln[bad[0]]+" lanes · "+CLSLABEL[CLS[cls[bad[0]]]]]],
      rule:"freeway >= 2 lanes; local < 4; collector < 5; any class <= 8", source_file:NETFILE, source_rows:linkRef(bad[0]),
      likely_cause:"Class (LTYPE_2040) or lane attribute miscoded, or a genuine exception (single-lane freeway ramp-merge section).",
      action:"Review the listed links; correct LTYPE or LANE where it is a coding error, otherwise mark as a known exception.",
      expected_effect:"Correct capacity and free-flow speed on reviewed links.", effect_method:"Checked on file", confidence:"Medium"})); } })();
  // NET-03
  (function(){ var bad=[], worst=0, wg=-1;
    for(var g=0;g<m;g++){ var gl=geomLen(g); var d=Math.abs(len[g]-gl); if(d>50 && d/Math.max(1,gl)>0.2){ bad.push(g); if(d>worst){worst=d;wg=g;} } }
    out.checks.push({id:"NET-03",status:"ran",n:bad.length});
    if(bad.length){ out.push(F({check:"NET-03", severity:bad.length>500?"Medium":"Info", title:bad.length.toLocaleString()+" links: stored length differs from geometry by >20%",
      exec:"Some road lengths in the model do not match the drawn road, which distorts travel times.",
      location:{type:"links", links:capList(bad,3000), count:bad.length},
      evidence:[["Links > 50 m and > 20% off",bad.length.toLocaleString()],["Worst",linkRef(wg)+" · stored "+Math.round(len[wg])+" m vs geometry "+Math.round(geomLen(wg))+" m"]],
      rule:"|SHAPE_Leng - polyline length| <= max(50 m, 20%)", source_file:NETFILE, source_rows:linkRef(wg),
      likely_cause:"Length not recomputed after the link was re-shaped or split; curved links stored as chords.",
      action:"Recompute SHAPE_Leng from geometry for the listed links.", expected_effect:"Free-flow times and VKT on those links correct.",
      effect_method:"Checked on file", confidence:"Medium"})); } })();
  // NET-04 & NET-05
  (function(){ var seen=new Map(), dup=[], loops=[], pairs=0;
    for(var g=0;g<m;g++){ if(A[g]===B[g]){ loops.push(g); continue; }
      var k=A[g]*BIG+B[g]; if(seen.has(k)) dup.push(g); else seen.set(k,g); }
    seen.forEach(function(g,k){ if(A[g]<B[g] && seen.has(B[g]*BIG+A[g])) pairs++; });
    AI.twoWayPairs=pairs;
    out.checks.push({id:"NET-04",status:"ran",n:dup.length}); out.checks.push({id:"NET-05",status:"ran",n:loops.length});
    if(dup.length){ out.push(F({check:"NET-04", severity:dup.length>100?"Medium":"Info", title:dup.length.toLocaleString()+" duplicate directed links (same A to B twice)",
      exec:"Some road links are coded twice in the same direction, which doubles their capacity.",
      location:{type:"links", links:capList(dup,3000), count:dup.length},
      evidence:[["Duplicate directed A-B",dup.length.toLocaleString()],["Example",linkRef(dup[0])],["Two-way roads coded as opposing pairs (normal)",pairs.toLocaleString()]],
      rule:"each directed A-B pair appears once", source_file:NETFILE, source_rows:linkRef(dup[0]),
      likely_cause:"Record duplicated during a network merge.", action:"Delete the duplicate record.",
      expected_effect:"Capacity on the pair stops being double-counted.", effect_method:"Checked on file", confidence:"High"})); }
    if(loops.length){ out.push(F({check:"NET-05", severity:"Medium", title:loops.length+" self-loop links (A = B)",
      exec:"A few links start and end at the same node and cannot carry traffic.",
      location:{type:"links", links:loops, count:loops.length}, evidence:[["Self-loops",loops.length],["Example",linkRef(loops[0])]],
      rule:"A != B", source_file:NETFILE, source_rows:linkRef(loops[0]), likely_cause:"Digitising error.",
      action:"Delete or re-node the listed links.", expected_effect:"None on flows; cleaner network.", effect_method:"Checked on file", confidence:"High"})); } })();
  // node degree + components
  var nn=GRAPH.idMap.size, uf=UF(nn), deg=new Int32Array(nn), fwyNode=new Uint8Array(nn), artNode=new Uint8Array(nn);
  var ai=new Int32Array(m), bi=new Int32Array(m);
  for(var g=0;g<m;g++){ var a=nodeIdx(A[g]), b=nodeIdx(B[g]); ai[g]=a; bi[g]=b; uf.union(a,b); deg[a]++; deg[b]++;
    var c=CLS[cls[g]]; if(c==="fwy"){fwyNode[a]=1;fwyNode[b]=1;} if(c==="art"||c==="fwy"){artNode[a]=1;artNode[b]=1;} }
  var compSize=new Map(); for(var i=0;i<nn;i++){ var r=uf.find(i); compSize.set(r,(compSize.get(r)||0)+1); }
  var mainR=-1,mainS=0; compSize.forEach(function(s,r){ if(s>mainS){mainS=s;mainR=r;} });
  // attached zones
  var zAttach=new Int32Array(N0).fill(-1), zNodeId=new Float64Array(N0), zDist=new Float64Array(N0);
  for(var k=0;k<CR.n;k++){ var z=CR.ci[k]; if(z<N0 && zAttach[z]<0){ var nd=nodeIdx(CR.nid[k]|0); if(nd!==undefined){ zAttach[z]=nd; zNodeId[z]=CR.nid[k];
    zDist[z]=Math.hypot(CENT[z*2]-CR.nx[k], CENT[z*2+1]-CR.ny[k]); } } }
  // NET-06
  (function(){ var offLinks=[], zonesOff=[];
    for(var g=0;g<m;g++) if(uf.find(ai[g])!==mainR) offLinks.push(g);
    for(var z=0;z<N0;z++) if(zAttach[z]>=0 && uf.find(zAttach[z])!==mainR) zonesOff.push(z);
    var ncomp=compSize.size;
    out.checks.push({id:"NET-06",status:"ran",n:offLinks.length});
    if(offLinks.length){ var sev=zonesOff.length?"High":(offLinks.length>50?"Medium":"Info");
      out.push(F({check:"NET-06", severity:sev, title:(ncomp-1)+" disconnected sub-networks ("+offLinks.length.toLocaleString()+" links"+(zonesOff.length?", "+pl(zonesOff.length,"zone")+" cut off":"")+")",
        exec:zonesOff.length?pl(zonesOff.length,"zone")+" sit on road pieces that are not joined to the main network, so their trips cannot reach most destinations.":"Some road pieces are not joined to the main network.",
        location:{type:"links", links:capList(offLinks,3000), count:offLinks.length, zones:capList(zonesOff,500)},
        evidence:[["Components",ncomp.toLocaleString()],["Main component nodes",mainS.toLocaleString()+" of "+nn.toLocaleString()],["Links off the main component",offLinks.length.toLocaleString()],["Zones attached off-network",zonesOff.length.toLocaleString()]],
        rule:"all road links and zone attachments belong to one connected component", source_file:NETFILE, source_rows:linkRef(offLinks[0]),
        likely_cause:"This export leaves out LTYPE 60-63, 65, 70-73, 99 and 100 (connectors, PT, walk and dummy links). If those links join these pieces in STEAM, this is an export artefact, but it still cuts these zones off in the in-app assignment. Otherwise it is a missing link or a duplicated node.",
        action:"Check the largest islands against the full STEAM network. Add the joining links to the export, or fix the missing connection in STEAM.",
        expected_effect:zonesOff.length?"Trips from the cut-off zones get routed; unreachable OD demand falls to zero.":"No change to routed demand; cleaner network.",
        effect_method:"Checked on file (graph connectivity)", confidence:"High"})); } })();
  // NET-07
  (function(){ var un=[]; for(var z=0;z<N0;z++) if(zAttach[z]<0) un.push(z);
    var odz=odZoneTotals(); var lost=0; if(odz) un.forEach(function(z){ lost+=odz.P[z]+odz.A[z]; });
    out.checks.push({id:"NET-07",status:"ran",n:un.length});
    if(un.length){ out.push(F({check:"NET-07", severity:"Critical", title:pl(un.length,"zone")+" have no network attachment",
      exec:pl(un.length,"zone")+" are not connected to any road, so their trips are silently dropped from the assignment.",
      location:{type:"zones", zones:un, count:un.length, x:CENT[un[0]*2], y:CENT[un[0]*2+1]},
      evidence:[["Zones without connector",un.length],["Trip ends affected (24h)",odz?Math.round(lost).toLocaleString():"OD not loaded"],["Example zone",CIDS[un[0]]]],
      rule:"every zone has a centroid connector to a network node", source_file:"Zone centroid connectors (embedded)", source_rows:"zone "+CIDS[un[0]],
      likely_cause:"Connector missing after zone split or network edit.", action:"Add a centroid connector to the nearest suitable local/collector node.",
      expected_effect:"Their trips return to the network (see trip ends affected).", effect_method:"Checked on file", confidence:"High"})); } })();
  // NET-08
  (function(){ var far=[]; for(var z=0;z<N0;z++) if(zAttach[z]>=0 && zDist[z]>3000) far.push(z);
    far.sort(function(a,b){return zDist[b]-zDist[a];});
    out.checks.push({id:"NET-08",status:"ran",n:far.length});
    if(far.length){ out.push(F({check:"NET-08", severity:far.length>30?"Medium":"Info", title:far.length+" zone centroids sit > 3 km from their attachment node",
      exec:"Some zones load traffic onto the network far from where people actually live or work.",
      location:{type:"zones", zones:capList(far,500), count:far.length, x:CENT[far[0]*2], y:CENT[far[0]*2+1]},
      evidence:[["Zones > 3 km",far.length],["Worst","zone "+CIDS[far[0]]+" · "+(zDist[far[0]]/1000).toFixed(1)+" km"]],
      rule:"centroid to attachment node <= 3 km (large rural zones excepted)", source_file:"Zone centroid connectors (embedded)", source_rows:"zone "+CIDS[far[0]],
      likely_cause:"Large rural zone (acceptable) or connector attached to a wrong node.", action:"Review urban cases and re-attach to the nearest local road node.",
      expected_effect:"More realistic loading points; local link flows change near the zone.", effect_method:"Checked on file", confidence:"Medium"})); } })();
  // NET-09
  (function(){ var bad=[]; for(var z=0;z<N0;z++) if(zAttach[z]>=0 && fwyNode[zAttach[z]]) bad.push(z);
    out.checks.push({id:"NET-09",status:"ran",n:bad.length});
    if(bad.length){ out.push(F({check:"NET-09", severity:bad.length>20?"High":"Medium", title:pl(bad.length,"zone")+" load directly onto freeway nodes",
      exec:pl(bad.length,"zone")+" put their traffic straight onto freeways, which overloads freeways and skips local roads.",
      location:{type:"zones", zones:capList(bad,500), count:bad.length, x:CENT[bad[0]*2], y:CENT[bad[0]*2+1]},
      evidence:[["Zones attached to a freeway node",bad.length],["Example","zone "+CIDS[bad[0]]+" -> node "+zNodeId[bad[0]]]],
      rule:"centroid connectors attach to local, collector or arterial nodes only", source_file:"Zone centroid connectors (embedded)", source_rows:"zone "+CIDS[bad[0]],
      likely_cause:"Nearest-node auto-connection picked a freeway node.", action:"Move each connector to the nearest non-freeway node.",
      expected_effect:"Freeway volumes near these zones fall; local access roads carry the access traffic.", effect_method:"Checked on file", confidence:"High"})); } })();
  // NET-10
  (function(){ var zoneNode=new Uint8Array(nn); for(var z=0;z<N0;z++) if(zAttach[z]>=0) zoneNode[zAttach[z]]=1;
    var bad=[]; for(var g=0;g<m;g++){ var c=CLS[cls[g]]; if(c!=="fwy"&&c!=="art") continue;
      var a=ai[g], b=bi[g]; if((deg[a]===1&&!zoneNode[a])||(deg[b]===1&&!zoneNode[b])) bad.push(g); }
    out.checks.push({id:"NET-10",status:"ran",n:bad.length});
    if(bad.length){ out.push(F({check:"NET-10", severity:bad.length>40?"Medium":"Info", title:bad.length+" freeway/arterial links end in a dead end",
      exec:"Some major roads stop abruptly in the model; traffic cannot continue past them.",
      location:{type:"links", links:capList(bad,3000), count:bad.length},
      evidence:[["Dead-ended freeway/arterial links",bad.length],["Example",linkRef(bad[0])]],
      rule:"freeway and arterial ends connect to another link or a zone", source_file:NETFILE, source_rows:linkRef(bad[0]),
      likely_cause:"Scheme edge at the model boundary (fine) or a missing continuation link.",
      action:"Confirm boundary cases; add the missing continuation where the road continues in reality.",
      expected_effect:"Parallel roads lose traffic that was forced around the gap.", effect_method:"Checked on file", confidence:"Medium"})); } })();
  AI._net={ai:ai,bi:bi,deg:deg,zAttach:zAttach,nn:nn};

  // ---- land use ----
  if(!AI.lu){ ["LU-01","LU-02","LU-03","LU-04","LU-05"].forEach(function(id){ out.checks.push({id:id,status:"not_run",why:"land-use file not loaded"}); }); }
  else {
    var rows=AI.lu.rows;
    (function(){ var bad=rows.filter(function(o){ return (o.POP_TOT>50&&!(o.HH>0))||(o.HH>0&&!(o.POP_TOT>0)); });
      out.checks.push({id:"LU-01",status:"ran",n:bad.length});
      if(bad.length){ out.push(F({check:"LU-01", severity:bad.length>20?"Medium":"Info", title:bad.length+" zones: population without households (or households without people)",
        exec:"Some zones have people but no households (or the reverse), which breaks trip generation.",
        location:zonesLoc(bad), evidence:[["Zones",bad.length],["Example","Z="+bad[0].Z+" POP_TOT="+bad[0].POP_TOT+" HH="+bad[0].HH]],
        rule:"POP_TOT > 50 implies HH > 0; HH > 0 implies POP_TOT > 0", source_file:LUFILE, source_rows:"row "+bad[0]._row+" (Z="+bad[0].Z+")",
        likely_cause:"Labour-camp or institutional population with no household record, or a data join gap.", action:"Confirm the zone type; add HH or reclassify the population.",
        expected_effect:"Home-based trip generation in these zones becomes consistent.", effect_method:"Checked on file", confidence:"Medium"})); } })();
    (function(){ var bad=[], cols=AI.lu.head.filter(function(h){ return ["Z","DISTRICT","DISTNAME","CENTROIDX","CENTROIDY"].indexOf(h)<0; });
      rows.forEach(function(o){ for(var c=0;c<cols.length;c++){ var v=o[cols[c]]; if(typeof v==="number"&&v<0){ bad.push({o:o,col:cols[c],v:v}); break; } } });
      out.checks.push({id:"LU-02",status:"ran",n:bad.length});
      if(bad.length){ out.push(F({check:"LU-02", severity:"High", title:pl(bad.length,"zone")+" with negative land-use values",
        exec:"Some zones hold negative quantities, which cannot be real.",
        location:zonesLoc(bad.map(function(b){return b.o;})), evidence:[["Zones",bad.length],["Example","Z="+bad[0].o.Z+" "+bad[0].col+"="+bad[0].v]],
        rule:"all land-use quantities >= 0", source_file:LUFILE, source_rows:"row "+bad[0].o._row, likely_cause:"Subtraction artefact in the forecast pipeline.",
        action:"Fix the source values; floor at zero only as a last resort.", expected_effect:"Trip generation stops producing negative trips.", effect_method:"Checked on file", confidence:"High"})); } })();
    (function(){ var pop=0, hh=0, wk=0, gfa=0; rows.forEach(function(o){ pop+=+o.POP_TOT||0; hh+=+o.HH||0; wk+=+o.WORKER||0; gfa+=+o.GFA_TOTAL||0; });
      var CONTROL=5.93e6, dev=(pop-CONTROL)/CONTROL;
      out.checks.push({id:"LU-03",status:"ran",n:Math.abs(dev)>0.01?1:0, value:pop});
      out.push(F({check:"LU-03", severity:Math.abs(dev)>0.05?"High":Math.abs(dev)>0.01?"Medium":"Info",
        title:"Population total "+(pop/1e6).toFixed(2)+"M vs 5.93M control ("+(dev>=0?"+":"")+(dev*100).toFixed(1)+"%)",
        exec:Math.abs(dev)<=0.01?"The land-use population matches the 2040 control total.":"The land-use population does not match the 2040 control total.",
        location:{type:"network"}, evidence:[["POP_TOT sum",Math.round(pop).toLocaleString()],["Control (2040 brief)","5,930,000"],["Households",Math.round(hh).toLocaleString()],["Resident workers",Math.round(wk).toLocaleString()],["GFA total (m²)",Math.round(gfa).toLocaleString()]],
        rule:"|sum(POP_TOT) - control| <= 1%", source_file:LUFILE, source_rows:"all "+rows.length+" rows", likely_cause:Math.abs(dev)<=0.01?"—":"Control total from a different land-use release.",
        action:Math.abs(dev)<=0.01?"None.":"Reconcile with the approved land-use release before issuing results.", expected_effect:"—", effect_method:"Checked on file", confidence:"High"})); })();
    (function(){ var bad=rows.filter(function(o){ return o.WORKER>o.POP_TOT && o.WORKER>20; });
      out.checks.push({id:"LU-04",status:"ran",n:bad.length});
      if(bad.length){ out.push(F({check:"LU-04", severity:"Medium", title:pl(bad.length,"zone")+" where resident workers exceed population",
        exec:"Some zones list more working residents than residents.", location:zonesLoc(bad),
        evidence:[["Zones",bad.length],["Example","Z="+bad[0].Z+" WORKER="+bad[0].WORKER+" POP_TOT="+bad[0].POP_TOT]],
        rule:"WORKER <= POP_TOT", source_file:LUFILE, source_rows:"row "+bad[0]._row, likely_cause:"Workers counted at workplace instead of residence.",
        action:"Check the field definition for these zones.", expected_effect:"Commute generation corrected.", effect_method:"Checked on file", confidence:"Medium"})); } })();
    (function(){ var inNet=new Set(); for(var z=0;z<N0;z++) inNet.add(CIDS[z]>>>0);
      var noNet=rows.filter(function(o){ return !inNet.has(o.Z|0) && ((+o.POP_TOT||0)+(+o.GFA_TOTAL||0))>0; });
      var noLU=0; for(var z2=0;z2<N0;z2++) if(!AI.luById.has(CIDS[z2]>>>0)) noLU++;
      out.checks.push({id:"LU-05",status:"ran",n:noNet.length+noLU});
      if(noNet.length||noLU){ out.push(F({check:"LU-05", severity:noNet.length?"High":"Medium", title:noNet.length+" land-use zones with activity missing from the network; "+noLU+" network zones missing land use",
        exec:"Zone lists in the land-use file and the network do not match, so some activity is never modelled.", location:zonesLoc(noNet),
        evidence:[["LU zones with activity, no centroid",noNet.length],["Network zones with no LU row",noLU],["Example",noNet.length?("Z="+noNet[0].Z+" POP="+noNet[0].POP_TOT):"—"]],
        rule:"zone IDs identical across land use and network", source_file:LUFILE+" + zone centroids", source_rows:noNet.length?("row "+noNet[0]._row):"—",
        likely_cause:"Land-use file carries the full zone register (reserve zones) while the network only codes active zones.",
        action:"Confirm reserve zones carry no activity; add centroids where they do.", expected_effect:"Missing activity enters the model.", effect_method:"Checked on file", confidence:"Medium"})); } })();
  }
  // ---- OD ----
  var odz=odZoneTotals();
  if(!odz){ ["OD-01","OD-02","OD-03"].forEach(function(id){ out.checks.push({id:id,status:"not_run",why:"OD matrix not decoded yet"}); }); }
  else {
    (function(){ var CONTROL=12.73e6, dev=(odz.tot-CONTROL)/CONTROL;
      out.checks.push({id:"OD-01",status:"ran",n:(odz.skipped?1:0)+(odz.neg?1:0)});
      out.push(F({check:"OD-01", severity:odz.neg?"High":odz.skipped?"Medium":(Math.abs(dev)>0.02?"Medium":"Info"),
        title:"OD total "+(odz.tot/1e6).toFixed(2)+"M trips · "+odz.skipped.toLocaleString()+" cells reference zones outside the network",
        exec:odz.skipped?"Some trips in the matrix point at zones the network does not have and are dropped.":"The matrix is consistent with the network zones and the 2040 trip control.",
        location:{type:"network"}, evidence:[["Cells",odz.cnt.toLocaleString()],["Trips (24h)",Math.round(odz.tot).toLocaleString()],["Control (2040 brief)","12,730,000"],["Unmatched cells",odz.skipped.toLocaleString()+" ("+Math.round(odz.skippedTrips).toLocaleString()+" trips)"],["Negative cells",odz.neg]],
        rule:"no negative cells; every O and D is a network zone; total within 2% of control", source_file:ODFILE, source_rows:"all cells",
        likely_cause:odz.skipped?"Matrix built on a zone system that differs from the network (renumbering).":"—", action:odz.skipped?"Re-export the matrix on the network zone system.":"None.",
        expected_effect:odz.skipped?"Dropped trips return to the assignment.":"—", effect_method:"Checked on file", confidence:"High"})); })();
    (function(){ var bad=[]; for(var z=0;z<N0;z++){ var p=odz.P[z]; if(p>500 && odz.I[z]/p>0.35) bad.push(z); }
      bad.sort(function(a,b){ return odz.I[b]/odz.P[b]-odz.I[a]/odz.P[a]; });
      var totI=0; for(var z3=0;z3<N0;z3++) totI+=odz.I[z3];
      out.checks.push({id:"OD-02",status:"ran",n:bad.length});
      if(bad.length){ out.push(F({check:"OD-02", severity:bad.length>25?"Medium":"Info", title:pl(bad.length,"zone")+" keep > 35% of their trips intrazonal",
        exec:"In some zones most trips never leave the zone, so those trips never appear on the road network.",
        location:{type:"zones", zones:capList(bad,500), count:bad.length, x:CENT[bad[0]*2], y:CENT[bad[0]*2+1]},
        evidence:[["Network-wide intrazonal share",(100*totI/odz.tot).toFixed(1)+"%"],["Zones > 35%",bad.length],["Worst","zone "+CIDS[bad[0]]+" · "+(100*odz.I[bad[0]]/odz.P[bad[0]]).toFixed(0)+"%"]],
        rule:"intrazonal share <= 35% for zones with > 500 trips", source_file:ODFILE, source_rows:"zone "+CIDS[bad[0]]+" row/column",
        likely_cause:"Very large zone, or distribution model intrazonal cost too low.", action:"Review intrazonal cost; split oversized zones.",
        expected_effect:"More trips on local roads in these zones.", effect_method:"Checked on file", confidence:"Medium"})); } })();
    if(AI.lu){ (function(){ var noLU=[], noDem=[];
      for(var z=0;z<N0;z++){ var o=AI.luById.get(CIDS[z]>>>0); var act=o?((+o.POP_TOT||0)+(+o.GFA_TOTAL||0)/50+(+o.ACTIVITY||0)):0; var t=odz.P[z]+odz.A[z];
        if(t>2000 && act<1) noLU.push(z); if(o && (+o.POP_TOT||0)>2000 && t<10) noDem.push(z); }
      out.checks.push({id:"OD-03",status:"ran",n:noLU.length+noDem.length});
      if(noLU.length||noDem.length){ var zz=noLU.concat(noDem); out.push(F({check:"OD-03", severity:"Medium", title:pl(noLU.length,"zone")+" generate trips with no land use; "+noDem.length+" populated zones generate no trips",
        exec:"Trips and land use disagree in some zones.", location:{type:"zones", zones:capList(zz,500), count:zz.length, x:CENT[zz[0]*2], y:CENT[zz[0]*2+1]},
        evidence:[["Trips > 2,000, no activity",noLU.length],["POP > 2,000, trips < 10",noDem.length]],
        rule:"trip ends require land-use activity and vice versa", source_file:ODFILE+" + "+LUFILE, source_rows:"zone "+CIDS[zz[0]],
        likely_cause:"Special generators (airport, port) or a land-use / matrix version mismatch.", action:"Confirm special generators; otherwise rebuild the matrix from the current land use.",
        expected_effect:"Demand follows the current land use.", effect_method:"Checked on file", confidence:"Medium"})); } })(); }
    else out.checks.push({id:"OD-03",status:"not_run",why:"land-use file not loaded"});
  }
  // ---- parameters ----
  (function(){ var diffs=[]; ["fwy","ramp","art","coll","rural","local","junc"].forEach(function(c){
      if(PARAMS.cap[c]!==PARAM_DEFAULT.cap[c]) diffs.push(["Capacity "+CLSLABEL[c], PARAM_DEFAULT.cap[c]+" → "+PARAMS.cap[c]+" veh/h/lane"]);
      if(PARAMS.spd[c]!==PARAM_DEFAULT.spd[c]) diffs.push(["Free-flow speed "+CLSLABEL[c], PARAM_DEFAULT.spd[c]+" → "+PARAMS.spd[c]+" km/h"]); });
    ["alpha","beta","growth","vot"].forEach(function(k){ if(PARAMS[k]!==PARAM_DEFAULT[k]) diffs.push([k, PARAM_DEFAULT[k]+" → "+PARAMS[k]]); });
    out.checks.push({id:"PAR-01",status:"ran",n:diffs.length});
    if(diffs.length){ out.push(F({check:"PAR-01", severity:"High", title:diffs.length+" parameters differ from the approved register",
      exec:"Model settings were changed from the approved values; results are not comparable with the reference run.",
      location:{type:"network"}, evidence:diffs, rule:"engine parameters equal the approved register (working defaults until STEAM v4 values arrive)",
      source_file:"Parameter register (working defaults, Settings)", source_rows:diffs.map(function(d){return d[0];}).join("; "),
      likely_cause:"Settings edited for a sensitivity test and not reset.", action:"Reset Settings to the register, or record the change as a named scenario.",
      expected_effect:"Results comparable with the reference run.", effect_method:"Checked on file", confidence:"High"})); } })();
}
function zonesLoc(recs){ var zs=[]; var idx=zoneIdIndex();
  recs.forEach(function(o){ var z=idx.get((o.Z|0)>>>0); if(z!==undefined) zs.push(z); });
  var loc={type:"zones", zones:capList(zs,500), count:recs.length};
  if(zs.length){ loc.x=CENT[zs[0]*2]; loc.y=CENT[zs[0]*2+1]; }
  else if(recs.length && recs[0].CENTROIDX){ loc.x=recs[0].CENTROIDX; loc.y=recs[0].CENTROIDY; }
  return loc; }

/* --------- output checks --------- */
function runOutputChecks(out){
  var vol=baseVol; if(!vol){ CHECKS.filter(function(c){return c.phase==="output"&&!c.notRun;}).forEach(function(c){ out.checks.push({id:c.id,status:"not_run",why:"no assigned volumes yet (run an assignment or import STEAM loaded-network volumes)"}); }); return; }
  ensureNet(); if(GRAPH.me<GLINK.m) buildGraph(null);
  var m=GLINK.m, cls=GLINK.cls, net=AI._net, src=AI.volSource==="imported"?"STEAM output (imported)":"Engine output";
  var srcFile=AI.volSource==="imported"?(AI.importInfo&&AI.importInfo.name||"imported loaded network"):"In-app assignment of the STEAM 2040 OD ("+methodName(window.__BASEMETHOD||curMethod())+", "+periodLabel()+")";
  // OUT-01 over-capacity corridors
  (function(){ var TH=1.0, flag=[], skipped=0;
    var sampled=AI.volSource!=="imported" && (+((document.getElementById("sampleSel")||{}).value)||0)>0;
    for(var g=0;g<m;g++){ if(vol[g]>0 && vcOf(vol,g)>TH){ var cc=CLS[cls[g]]; if(sampled&&(cc==="local"||cc==="coll")){ skipped++; continue; } flag.push(g); } }
    out.checks.push({id:"OUT-01",status:"ran",n:flag.length});
    var cors=corridorsOf(flag, vol);
    cors.slice(0,8).forEach(function(c,ix){
      var implaus=c.maxvc>3;
      var sev=(c.maxvc>1.5&&c.km>2)?"Critical":(c.maxvc>1.2||c.km>3)?"High":"Medium";
      out.push(F({check:"OUT-01", severity:sev, provenance:src, corridor:c, title:c.name+": "+c.km.toFixed(1)+" km over capacity (peak V/C "+c.maxvc.toFixed(2)+")"+(implaus?", implausible":""),
        exec:implaus?(c.name+" shows V/C "+c.maxvc.toFixed(1)+", which no real road carries. Treat it as a model problem (coding, connectivity or loading), not a forecast."):(c.name+" is over capacity for "+c.km.toFixed(1)+" km; drivers lose about "+fmt(c.delay)+" vehicle-hours in the period."),
        location:{type:"corridor", links:c.links, count:c.links.length},
        evidence:[["Links",c.links.length],["Length",c.km.toFixed(1)+" km"],["Peak V/C",c.maxvc.toFixed(2)],["Mean V/C (VKT-weighted)",c.meanvc.toFixed(2)],["Delay",fmt(c.delay)+" veh·h"],["Peak volume",fmt(c.maxv)+" veh"],["Class",CLSLABEL[c.cls]],["Lanes (median)",c.lanes]].concat(sampled?[["Local and collector roads","excluded ("+skipped.toLocaleString()+" links over capacity): sampled origins concentrate loading next to the sampled zones"]]:[]),
        rule:"V/C > 1.0 on contiguous links (clustered by shared nodes); Critical if peak V/C > 1.5 over > 2 km", source_file:srcFile, source_rows:linkRef(c.peak),
        likely_cause:c.maxvc>2?"Either a genuine bottleneck or a capacity/lane coding error on the peak link (V/C above 2 is rare in equilibrium).":"Demand exceeds coded capacity on this corridor.",
        action:"Check lane coding on the peak link first; if correct, test capacity, bus priority, junction and demand-management options (Scenarios).",
        expected_effect:"See the solution estimate below.", effect_method:"Screening estimate (fixed-volume BPR) + engine test on request", confidence:c.maxvc>2?"Medium":"High"}));
    }); })();
  // OUT-02 volume discontinuity
  (function(){ var nodeLinks=new Map(); for(var g=0;g<m;g++){ if(vol[g]<=0) continue; var c=cls[g]; if(CLS[c]!=="fwy"&&CLS[c]!=="art") continue;
      [net.ai[g],net.bi[g]].forEach(function(n){ var a=nodeLinks.get(n); if(!a){a=[];nodeLinks.set(n,a);} a.push(g); }); }
    var bad=[]; nodeLinks.forEach(function(a,n){ if(a.length!==2||net.deg[n]!==2) return; var g1=a[0], g2=a[1]; if(cls[g1]!==cls[g2]) return;
      var v1=vol[g1], v2=vol[g2], r=Math.max(v1,v2)/Math.max(1,Math.min(v1,v2)); if(r>3 && Math.max(v1,v2)>300) bad.push({g:v1>v2?g1:g2,o:v1>v2?g2:g1,r:r}); });
    bad.sort(function(a,b){return b.r-a.r;});
    out.checks.push({id:"OUT-02",status:"ran",n:bad.length});
    if(bad.length){ var ls=bad.map(function(b){return b.g;});
      out.push(F({check:"OUT-02", severity:bad.length>20?"Medium":"Info", provenance:src, title:bad.length+" places where volume jumps > 3x between consecutive links",
        exec:"On some continuous major roads the traffic jumps sharply from one link to the next with no junction to explain it.",
        location:{type:"links", links:capList(ls,2000), count:ls.length},
        evidence:[["Node pairs with a > 3x jump (degree-2 nodes, same class)",bad.length],["Worst",linkRef(bad[0].g)+" "+fmt(vol[bad[0].g])+" vs "+fmt(vol[bad[0].o])+" veh"]],
        rule:"at a degree-2 node joining two links of the same class, volumes differ by <= 3x", source_file:srcFile, source_rows:linkRef(bad[0].g),
        likely_cause:"A hidden zone connector or missing link at the node, or a class change coded as the same class.", action:"Inspect the node; fix connector or coding.",
        expected_effect:"Continuous corridor volumes.", effect_method:"Checked on file", confidence:"Medium"})); } })();
  // OUT-03 unused major links
  (function(){ var bad=[]; for(var g=0;g<m;g++){ var c=CLS[cls[g]]; if((c==="fwy"||c==="art") && !(vol[g]>0)) bad.push(g); }
    var sampled=(+((document.getElementById("sampleSel")||{}).value)||0)>0 && AI.volSource!=="imported";
    out.checks.push({id:"OUT-03",status:"ran",n:bad.length});
    if(bad.length){ out.push(F({check:"OUT-03", severity:sampled?"Info":(bad.length>200?"Medium":"Info"), provenance:src, title:bad.length.toLocaleString()+" freeway/arterial links carry no traffic",
      exec:"Some major roads carry no traffic at all in this run.", location:{type:"links", links:capList(bad,3000), count:bad.length},
      evidence:[["Zero-flow freeway/arterial links",bad.length.toLocaleString()],["Origins assigned",sampled?"sampled (unused links partly an artefact of sampling)":"all"]],
      rule:"freeway and arterial links carry > 0 veh", source_file:srcFile, source_rows:linkRef(bad[0]),
      likely_cause:sampled?"Origin sampling; also possible disconnection or wrong direction coding.":"Disconnected or inaccessible links; or future-year links with no demand yet.",
      action:sampled?"Re-run with all origins before acting on this.":"Cross-check with NET-06 and NET-10.", expected_effect:"—", effect_method:"Checked on file", confidence:sampled?"Low":"Medium"})); } })();
  // OUT-04 speeds
  (function(){ var bad=[]; for(var g=0;g<m;g++){ var v=vol[g]; if(v<=0) continue; var t=linkTimeV(g,vol); var sp=GLINK.len[g]/Math.max(0.01,t)*3.6;
      var c=CLS[cls[g]]; if((c==="fwy"&&sp<10)||(c==="art"&&sp<5)) bad.push({g:g,sp:sp}); }
    bad.sort(function(a,b){return a.sp-b.sp;});
    out.checks.push({id:"OUT-04",status:"ran",n:bad.length});
    if(bad.length){ var ls=bad.map(function(b){return b.g;}); out.push(F({check:"OUT-04", severity:bad.length>50?"High":"Medium", provenance:src,
      title:bad.length+" freeway/arterial links with congested speed below 10 / 5 km/h",
      exec:"The model predicts near-standstill speeds on some major roads, which usually means a capacity problem in the model rather than reality.",
      location:{type:"links", links:capList(ls,2000), count:ls.length},
      evidence:[["Links",bad.length],["Slowest",linkRef(bad[0].g)+" · "+bad[0].sp.toFixed(1)+" km/h"],["Speed-flow","BPR α="+PARAMS.alpha+", β="+PARAMS.beta]],
      rule:"BPR congested speed >= 10 km/h (freeway), >= 5 km/h (arterial)", source_file:srcFile, source_rows:linkRef(bad[0].g),
      likely_cause:"V/C well above 1 from a lane or capacity coding error, or a genuine bottleneck amplified by the BPR curve.",
      action:"Check lanes/capacity on the slowest links; consider a bounded volume-delay function for reporting.", expected_effect:"Speeds within plausible range.",
      effect_method:"Checked on file", confidence:"Medium"})); } })();
  // OUT-05 convergence
  (function(){ var meth=window.__BASEMETHOD||curMethod(), gap=window.__BASEGAP;
    if(AI.volSource==="imported"){ out.checks.push({id:"OUT-05",status:"not_run",why:"imported volumes carry no iteration history — read the STEAM print file"}); return; }
    if(!isEquilibrium(meth)){ out.checks.push({id:"OUT-05",status:"ran",n:1});
      out.push(F({check:"OUT-05", severity:"Medium", provenance:src, title:"Run used "+methodName(meth)+" — no equilibrium, noise not assessed",
        exec:"This run is a quick loading, not a converged equilibrium; small differences between scenarios cannot be judged.", location:{type:"network"},
        evidence:[["Method",methodName(meth)],["Relative gap","not defined"]], rule:"decision runs use Frank-Wolfe or MSA with relative gap <= 1%", source_file:srcFile, source_rows:"iteration log",
        likely_cause:"Quick run for exploration.", action:"Re-run with Frank-Wolfe before comparing scenarios.", expected_effect:"Numerical tolerance becomes assessable.", effect_method:"—", confidence:"High"})); return; }
    var bad=gap!=null&&gap>0.01; out.checks.push({id:"OUT-05",status:"ran",n:bad?1:0});
    out.push(F({check:"OUT-05", severity:bad?"High":"Info", provenance:src, title:"Relative gap "+(gap!=null?(gap*100).toFixed(2)+"%":"n/a")+" after "+(GAPHIST.length+1)+" iterations",
      exec:bad?"The assignment did not converge well; small differences are noise.":"The assignment converged; differences above the noise band are meaningful.", location:{type:"network"},
      evidence:[["Method",methodName(meth)],["Final relative gap",gap!=null?(gap*100).toFixed(3)+"%":"n/a"],["Gap history",GAPHIST.map(function(x){return (x*100).toFixed(2);}).join(" → ")+" %"]],
      rule:"relative gap <= 1%", source_file:srcFile, source_rows:"iteration log", likely_cause:bad?"Too few iterations or sampled origins.":"—",
      action:bad?"Increase iterations / use all origins.":"None.", expected_effect:"Smaller noise band.", effect_method:"—", confidence:"High"})); })();
  // OUT-06 trip length
  (function(){ var met=mets(vol); var od=ODMAT; var assigned=od?od.grand:0; var pf=(+((document.getElementById("periodSel")||{}).value)||1)*((+((document.getElementById("growthIn")||{}).value))||1);
    var trips=assigned*pf; var tl=trips>0?met.vmt/trips:0;
    out.checks.push({id:"OUT-06",status:"ran",n:(tl<5||tl>40)?1:0});
    out.push(F({check:"OUT-06", severity:(tl>0&&(tl<5||tl>40))?"Medium":"Info", provenance:src, title:"Average assigned trip length "+tl.toFixed(1)+" km",
      exec:"Average car trip is about "+tl.toFixed(0)+" km, "+((tl>=5&&tl<=40)?"within the plausible range for Abu Dhabi.":"outside the plausible range; check demand or network."),
      location:{type:"network"}, evidence:[["VKT",fmt(met.vmt)+" veh·km"],["Trips in period",fmt(trips)],["Mean trip length",tl.toFixed(2)+" km"],["Reference band","5-40 km (placeholder until observed TLD is loaded)"]],
      rule:"mean assigned trip length within reference band", source_file:srcFile, source_rows:"network totals", likely_cause:"—", action:"Compare against the household-survey TLD when available.",
      expected_effect:"—", effect_method:"Checked on file", confidence:"Low"})); })();
}
function methodName(m){ return {aon:"free-flow (all-or-nothing)",bpr:"BPR incremental",fw:"Frank-Wolfe equilibrium",msa:"MSA equilibrium"}[m]||m; }

/* cluster flagged links into corridors by shared nodes */
function corridorsOf(flag, vol){
  if(!flag.length) return [];
  ensureNet(); var net=AI._net; if(!net){ var tmp=[]; runInputChecks(tmp); net=AI._net; }
  var idx=new Map(); flag.forEach(function(g,i){ idx.set(g,i); });
  var uf=UF(flag.length), byNode=new Map();
  var FAM={fwy:0,ramp:0,art:1,junc:1,coll:2,local:3,rural:4};
  flag.forEach(function(g,i){ var f=FAM[CLS[GLINK.cls[g]]]; [net.ai[g],net.bi[g]].forEach(function(n){ var k=n*8+f; var p=byNode.get(k); if(p===undefined) byNode.set(k,i); else uf.union(p,i); }); });
  var CH=5000, groups=new Map(); flag.forEach(function(g,i){ var r=uf.find(i)+":"+Math.floor((GLINK.ax[g]+GLINK.bx[g])/2/CH)+":"+Math.floor((GLINK.ay[g]+GLINK.by[g])/2/CH); var a=groups.get(r); if(!a){a=[];groups.set(r,a);} a.push(g); });
  var cors=[]; groups.forEach(function(ls){
    var km=0, delay=0, maxvc=0, maxv=0, peak=ls[0], vkt=0, vcw=0, lanes=[], cc={};
    ls.forEach(function(g){ var L_=GLINK.len[g]/1000, v=vol[g], vc=vcOf(vol,g); km+=L_; vkt+=v*L_; vcw+=vc*v*L_;
      delay+=v*(linkTimeV(g,vol)-GRAPH.EFF[g])/3600; if(vc>maxvc){maxvc=vc;peak=g;} if(v>maxv)maxv=v; lanes.push(GLINK.ln[g]); var c=CLS[GLINK.cls[g]]; cc[c]=(cc[c]||0)+L_; });
    lanes.sort(function(a,b){return a-b;});
    var dom=Object.keys(cc).sort(function(a,b){return cc[b]-cc[a];})[0];
    var d=linkDistrict(peak); var bb=bboxOf(ls);
    cors.push({links:ls, km:km, delay:delay, maxvc:maxvc, maxv:maxv, meanvc:vkt>0?vcw/vkt:0, peak:peak, cls:dom, lanes:lanes[lanes.length>>1],
      district:d, name:titleCase(CLSLABEL[dom])+" corridor near "+distLabel(d), bbox:bb, x:(bb[0]+bb[2])/2, y:(bb[1]+bb[3])/2});
  });
  cors.sort(function(a,b){ return b.delay-a.delay; });
  cors.forEach(function(c,i){ c.rank=i+1; });
  return cors;
}

/* ---------------- solution screening (fixed-volume BPR) ---------------- */
function screenLaneAdd(links, vol, add){
  var dv=0; links.forEach(function(g){ var v=vol[g]; if(v<=0) return; var cap=GRAPH.ECAP[g], cap2=cap*(GLINK.ln[g]+add)/Math.max(1,GLINK.ln[g]);
    var t0=GRAPH.EFF[g], a=PARAMS.alpha, b=PARAMS.beta;
    var t1=t0*(1+a*Math.pow(v/cap,b)), t2=t0*(1+a*Math.pow(v/cap2,b)); dv+=v*(t1-t2)/3600; });
  var lanekm=0; links.forEach(function(g){ lanekm+=add*GLINK.len[g]/1000; });
  return {dvht:dv, lanekm:lanekm};
}
function solutionsFor(f){
  if(f.check!=="OUT-01"||!f.corridor||!baseVol) return null;
  var c=f.corridor, s1=screenLaneAdd(c.links, baseVol, 1);
  return [
    {measure:"Correct lane / capacity coding on the peak link", type:"coding", estimate:null, method:"Checked on file", note:"Do this first: a coding error is fixed by correcting the input, not by adding capacity.", confidence:"—"},
    {measure:"+1 lane over the over-capacity section ("+s1.lanekm.toFixed(1)+" lane-km)", type:"capacity", estimate:{dvht:s1.dvht, lanekm:s1.lanekm}, method:"Screening estimate: fixed volumes, BPR travel time; ignores induced demand and rerouting", confidence:"Low–Medium", engine:true},
    {measure:"Bus priority / PT frequency on the corridor", type:"pt", estimate:null, method:"Not estimable: needs a PT assignment and an approved mode-shift response", confidence:"—"},
    {measure:"Junction and signal review at the section ends", type:"junction", estimate:null, method:"Not estimable strategically: escalate to HSM for queues and junction interaction", confidence:"—"},
    {measure:"Demand management (parking / road-user charging)", type:"policy", estimate:null, method:"Stress-test with the toll engine run; no approved elasticity is loaded", confidence:"—"}
  ];
}

/* =====================================================================
   NOISE BAND / TOLERANCE
   ===================================================================== */
var TOL={min:10, k:2};
function tolerance(which){
  var d=which==="scn"?window.__SCNDELTA:window.__BASEDELTA, gap=which==="scn"?window.__SCNGAP:window.__BASEGAP, meth=which==="scn"?window.__SCNMETHOD:window.__BASEMETHOD;
  var vol=which==="scn"?scnVol:baseVol; if(!vol) return null;
  if(!d||!isEquilibrium(meth)) return {assessed:false, method:meth};
  var m=GLINK.m, t=new Float32Array(m);
  for(var g=0;g<m;g++){ t[g]=Math.max(TOL.min, TOL.k*d[g]); }
  return {assessed:true, tol:t, gap:gap, method:meth};
}
function withClamp(fn){ var c=window.__APPRCLAMP; if(AI.pairClamp) window.__APPRCLAMP=AI.pairClamp; try{ return fn(); } finally { window.__APPRCLAMP=c||null; } }
function compare(opts){ return withClamp(function(){ return compare0(opts); }); }
function compare0(opts){
  if(!baseVol||!scnVol) return {ok:false, err:"Needs a base run and a scenario run. Run a scenario in Scenario, or a stress test."};
  var tb=tolerance("base"), ts=tolerance("scn"), m=GLINK.m, assessed=!!(tb&&tb.assessed&&ts&&ts.assessed);
  var tolD=assessed?new Float32Array(m):null;
  var busier=0, quieter=0, inside=0, changed=0, top=[], sumAbs=0;
  for(var g=0;g<m;g++){ var dv=scnVol[g]-baseVol[g], a=Math.abs(dv); if(a<1e-6) continue; changed++;
    var td=assessed?Math.sqrt(tb.tol[g]*tb.tol[g]+ts.tol[g]*ts.tol[g]):0; if(tolD) tolD[g]=td;
    if(assessed && a<td){ inside++; continue; }
    if(dv>0) busier++; else quieter++; sumAbs+=a; top.push(g); }
  top.sort(function(a,b){ return Math.abs(scnVol[b]-baseVol[b])-Math.abs(scnVol[a]-baseVol[a]); });
  window.__NOISETOLD=tolD; window.__NOISEON=assessed && opts && opts.screen!==false;
  var rows=top.slice(0,25).map(function(g){ return {g:g, name:CLSLABEL[CLS[GLINK.cls[g]]]+" · "+distLabel(linkDistrict(g)), base:r1(baseVol[g]), scn:r1(scnVol[g]), d:r1(scnVol[g]-baseVol[g]), tol:tolD?r1(tolD[g]):null, x:linkMid(g)[0], y:linkMid(g)[1]}; });
  // districts
  var dist={}; if(AI.zoneDist){ top.forEach(function(g){ var d=linkDistrict(g); var k=distLabel(d); var o=dist[k]||(dist[k]={name:k, dvkt:0, links:0}); o.dvkt+=(scnVol[g]-baseVol[g])*GLINK.len[g]/1000; o.links++; }); }
  var distRows=Object.keys(dist).map(function(k){return dist[k];}).sort(function(a,b){return Math.abs(b.dvkt)-Math.abs(a.dvkt);}).slice(0,12);
  var bm=mets(baseVol), sm=mets(scnVol);
  if(typeof render==="function") render();
  // SCN-01 unexplained shifts: significant changes far from any changed input
  var shifts=unexplained(top, opts&&opts.inputs);
  return {ok:true, assessed:assessed, tolNote:assessed?("tolerance per link = max("+TOL.min+" veh, "+TOL.k+" × |change between the last two iterations|), combined for both runs as √(t_base² + t_scn²). Final relative gaps: base "+(tb.gap!=null?(tb.gap*100).toFixed(1)+"%":"n/a")+", scenario "+(ts.gap!=null?(ts.gap*100).toFixed(1)+"%":"n/a")+"."):"Not assessed: at least one run is not an equilibrium assignment (use Frank-Wolfe or MSA). All differences are shown.",
    busier:busier, quieter:quieter, inside:inside, changed:changed, top:rows, districts:distRows, screen:!!window.__NOISEON,
    kpi:{base:bm, scn:sm}, shifts:shifts};
}
/* input catchment: links edited in the scenario (upgrades / drawn roads / stress targets) */
function scenarioInputs(extra){
  var pts=[]; try{ if(SCN&&SCN.upgrades) SCN.upgrades.forEach(function(v,g){ pts.push(linkMid(g)); });
    if(SCN&&SCN.extras) SCN.extras.forEach(function(ex){ ex.pts.forEach(function(p){ pts.push(p); }); }); }catch(e){}
  (AI.stressTargets||[]).forEach(function(g){ pts.push(linkMid(g)); });
  return pts; }
function unexplained(sig, inp){
  var pts=scenarioInputs(); var global=(AI.stressGlobal===true);
  if(global) return {note:"Stress test changes demand network-wide; every link is inside the input catchment.", n:0, links:[]};
  if(!pts.length) return {note:"No scenario inputs recorded (no edits). Every significant change is unexplained.", n:sig.length, links:sig.slice(0,200)};
  var R=5000, far=[];
  sig.forEach(function(g){ var p=linkMid(g), near=false; for(var i=0;i<pts.length;i++){ if(Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1])<R){ near=true; break; } }
    if(!near && Math.abs(scnVol[g]-baseVol[g])>50) far.push(g); });
  return {note:"Significant changes (above tolerance, > 50 veh) more than 5 km from any changed input. Proximity alone does not prove or disprove a cause: check select-link or path outputs before concluding.", n:far.length, links:far.slice(0,300)};
}

/* =====================================================================
   ENGINE RUNS (screening profile) — used by the surrogate and stress tests
   ===================================================================== */
var SCREEN={method:"fw", sample:"250", clamp:3};
function engineRun(o){
  return new Promise(function(res,rej){
    if(ASSIGN.running) return rej(new Error("The engine is busy with another run."));
    ensureNet();
    if(!ODMAT||!ODMAT.byOrigNode||!ODMAT.byOrigNode.size) return rej(new Error("OD matrix not loaded yet."));
    var ids=["methodSel","sampleSel","growthIn","demandSel"], old={};
    ids.forEach(function(id){ var e=document.getElementById(id); if(e) old[id]=e.value; });
    var set=function(id,v){ var e=document.getElementById(id); if(e) e.value=v; };
    set("methodSel", o.method||SCREEN.method); set("sampleSel", o.sample||SCREEN.sample); set("growthIn", String(o.f||1)); set("demandSel","od");
    var oldCap=window.__YEARCAPF, oldClamp=window.__APPRCLAMP; window.__APPRCLAMP=(o.clamp!==undefined?o.clamp:SCREEN.clamp)||null;
    if(o.capf){ var cf=new Float32Array(GLINK.m).fill(1); o.capf.forEach(function(v,g){ cf[g]=v; }); window.__YEARCAPF=cf; }
    buildGraph(null);
    if(o.penalty){ o.penalty.forEach(function(sec,g){ GRAPH.EFF[g]+=sec; }); }
    var iv=setInterval(function(){ var pb=document.getElementById("progbar"); if(pb) progress(o.label||"Engine run", parseFloat(pb.style.width)||0); },400);
    try{
      assignChunked(o.label||"AI engine run", function(vol){
        clearInterval(iv);
        var v=vol.slice(0,GLINK.m), met=null;
        if(!o.penalty) met=mets(vol);
        var delta=window.__LASTDELTA?window.__LASTDELTA.slice(0,GLINK.m):null, gap=window.__LASTGAP;
        ids.forEach(function(id){ set(id, old[id]); });
        window.__YEARCAPF=oldCap||null;
        if(o.capf||o.penalty) buildGraph(null);
        // penalties (closure, charge) steer route choice only: report travel time without them
        if(o.penalty) met=mets(v);
        window.__APPRCLAMP=oldClamp||null;
        res({vol:v, met:met, delta:delta, gap:gap, method:o.method||SCREEN.method});
      });
    }catch(e){ clearInterval(iv); ids.forEach(function(id){ set(id, old[id]); }); window.__YEARCAPF=oldCap||null; window.__APPRCLAMP=oldClamp||null; rej(e); }
  });
}
/* show a pair of runs as the app's base/scenario so the map + compare work */
function showPair(base, scn, label){
  var _c=window.__APPRCLAMP; window.__APPRCLAMP=SCREEN.clamp||null;
  baseVol=base.vol; baseMet=metricsOf(base.vol); window.__BASEDELTA=base.delta; window.__BASEGAP=base.gap; window.__BASEMETHOD=base.method;
  scnVol=scn.vol; scnMet=metricsOf(scn.vol); window.__APPRCLAMP=_c||null; window.__SCNDELTA=scn.delta; window.__SCNGAP=scn.gap; window.__SCNMETHOD=scn.method;
  AI.pairClamp=SCREEN.clamp||null;
  RESULT="scenario"; DIFF=new Float64Array(GLINK.m); var ad=[];
  for(var g=0;g<GLINK.m;g++){ DIFF[g]=scnVol[g]-baseVol[g]; if(Math.abs(DIFF[g])>1e-6) ad.push(Math.abs(DIFF[g])); }
  ad.sort(function(a,b){return a-b;}); DIFFMAX=ad.length?Math.max(1,ad[Math.floor(ad.length*0.95)]):1;
  scatterVOL(scnVol); assignDone=true; AI.volSource="engine";
  MODE="diff"; document.querySelectorAll("#modeSeg button,#miniMode button").forEach(function(x){ x.classList.toggle("on",x.dataset.m==="diff"); });
  try{ updateScnPanel(); }catch(e){} render(); setStatus(label||"Stress test shown as Δ");
}
function screenBase(){
  var sig=SCREEN.method+"|"+SCREEN.sample+"|"+JSON.stringify(PARAMS)+"|"+((document.getElementById("periodSel")||{}).value);
  if(AI.sbase && AI.sbase.sig===sig) return Promise.resolve(AI.sbase.run);
  return engineRun({f:1, label:"Screening base run"}).then(function(r){ AI.sbase={sig:sig, run:r}; return r; });
}

/* ---------------- stress tests ---------------- */
function stress(o){
  var targets=(o.links||[]).slice(0,5000);
  AI.stressTargets=targets; AI.stressGlobal=(o.type==="growth"||o.type==="spike");
  return screenBase().then(function(base){
    var spec={label:"Stress test"};
    if(o.type==="growth"){ spec.f=1+(o.pct||10)/100; spec.label="Population / demand growth +"+(o.pct||10)+"%"; }
    else if(o.type==="spike"){ spec.f=1+(o.pct||25)/100; spec.label="Demand spike +"+(o.pct||25)+"% (event / peak spreading loss)"; }
    else if(o.type==="closure"){ if(!targets.length) throw new Error("Select a corridor or finding to close."); var pc=new Map(); targets.forEach(function(g){ pc.set(g,1800); }); spec.penalty=pc; spec.label="Closure of "+pl(targets.length,"link"); }
    else if(o.type==="capacity"){ if(!targets.length) throw new Error("Select a corridor."); var cf2=new Map(); targets.forEach(function(g){ var l=Math.max(1,GLINK.ln[g]); cf2.set(g,(l+(o.lanes||1))/l); }); spec.capf=cf2; spec.label="+"+(o.lanes||1)+" lane on "+targets.length+" links"; }
    else if(o.type==="toll"){ if(!targets.length) throw new Error("Select a corridor to toll."); var sec=(o.aed||4)/Math.max(1,PARAMS.vot)*3600, tl=0; targets.forEach(function(g){ tl+=GLINK.len[g]; }); var pen=new Map(); targets.forEach(function(g){ pen.set(g,sec*GLINK.len[g]/Math.max(1,tl)); }); spec.penalty=pen; spec.label="Road-user charge AED "+(o.aed||4)+" on "+targets.length+" links (as time penalty at VOT "+PARAMS.vot+" AED/h)"; }
    return engineRun(spec).then(function(s){
      showPair(base, s, spec.label);
      var c=compare({screen:true});
      AI.lastStress={spec:{type:o.type,pct:o.pct,aed:o.aed,lanes:o.lanes,links:targets.length,label:spec.label}, base:base.met, scn:s.met};
      return {ok:true, label:spec.label, spec:AI.lastStress.spec, base:base.met, scn:s.met, compare:c, method:methodName(s.method)+", "+(+SCREEN.sample?SCREEN.sample+" sampled origins (demand-scaled)":"all origins")+(SCREEN.clamp?", reported travel time bounded at V/C "+SCREEN.clamp+" (routing uses the full BPR curve)":""),
        note:o.type==="toll"?"The charge enters route choice as time at the value of time; reported VHT is travel time only. No approved toll elasticity is used, so only route choice responds.":o.type==="closure"?"Closed links carry a 30-minute penalty, so only trips with no other route still use them. Fixed demand; route choice responds.":(o.type==="growth"||o.type==="spike")?"Uniform demand scaling; destination and mode choice are fixed (highway assignment only).":"Fixed demand; only route choice responds."};
    });
  });
}

/* =====================================================================
   SURROGATE (growth-response) + FORECAST
   v_g(f) = v_g(1) · f^e_g ; e_g fitted from paired engine runs at
   f = 0.85 and 1.15; back-tested on the held-out f = 1.0 run.
   ===================================================================== */
function fitSurrogate(){
  var F1=0.85, F2=1.15, runs={};
  return screenBase().then(function(b){ runs.b=b; return engineRun({f:F1, label:"Surrogate training run f=0.85"}); })
  .then(function(r){ runs.lo=r; return engineRun({f:F2, label:"Surrogate training run f=1.15"}); })
  .then(function(r){ runs.hi=r;
    var m=GLINK.m, e=new Float32Array(m), v1=runs.b.vol, lo=runs.lo.vol, hi=runs.hi.vol, span=Math.log(F2/F1);
    var n=0, se=0, ae=0, aeN=0, sN=0, bias=0, geh5=0, geh5n=0, cnt=0;
    var res=new Float32Array(m);
    for(var g=0;g<m;g++){
      var ee=(lo[g]>0.5&&hi[g]>0.5)?Math.log(hi[g]/lo[g])/span:(hi[g]>0.5?2:1); ee=Math.max(0,Math.min(3,ee)); e[g]=ee;
      if(v1[g]<=0&&lo[g]<=0&&hi[g]<=0) continue;
      // back-test: predict f=1 from the f=0.85 run with the fitted elasticity (held-out point)
      var pred=lo[g]>0?lo[g]*Math.pow(1/F1,ee):0, naive=lo[g]/F1, obs=v1[g];
      var err=pred-obs; ae+=Math.abs(err); aeN+=Math.abs(naive-obs); se+=err*err; bias+=err; cnt++;
      res[g]=err;
      if(obs+pred>0){ var gh=Math.sqrt(2*err*err/(obs+pred)); if(gh<5) geh5++; geh5n++; }
    }
    var rmse=Math.sqrt(se/Math.max(1,cnt));
    AI.surrogate={e:e, v1:v1, F1:F1, F2:F2, fittedAt:new Date().toISOString(), method:runs.b.method, sample:SCREEN.sample,
      metrics:{links:cnt, mae:ae/Math.max(1,cnt), maeNaive:aeN/Math.max(1,cnt), rmse:rmse, bias:bias/Math.max(1,cnt), geh5:geh5/Math.max(1,geh5n)}, res:res,
      kpis:{lo:runs.lo.met, b:runs.b.met, hi:runs.hi.met}};
    return {ok:true, card:surrogateCard()};
  });
}
function surrogateCard(){
  var s=AI.surrogate; if(!s) return null;
  return {name:"Growth-response surrogate (per-link elasticity)", target:"link volume in the assignment period as a function of uniform demand scaling f",
    formula:"v(f) = v(1) · f^e, e = ln(v(1.15)/v(0.85)) / ln(1.15/0.85), e clamped to [0, 3]",
    training:"3 engine runs of the STEAM 2040 OD on the 2040 network: f = 0.85, 1.00, 1.15 · "+methodName(s.method)+" · "+s.sample+" sampled origins (demand-scaled)"+(SCREEN.clamp?" · reported times bounded at V/C "+SCREEN.clamp:""),
    validation:"held-out: predict f = 1.00 from the f = 0.85 run; compare with the engine run at f = 1.00",
    metrics:{links:s.metrics.links, mae:r2(s.metrics.mae), maeNaive:r2(s.metrics.maeNaive), rmse:r2(s.metrics.rmse), bias:r2(s.metrics.bias), geh5:r2(100*s.metrics.geh5)},
    beatsNaive:s.metrics.mae<s.metrics.maeNaive,
    domain:"f between 0.85 and 1.15 is interpolation; outside it the surrogate extrapolates the local response (flagged)",
    failure:["Does not model new roads, closures or policy (use stress tests)","Rerouting beyond the fitted range is not captured","Destination, mode and time-of-day responses are fixed","Sampled origins add noise on low-volume links"],
    fittedAt:s.fittedAt};
}
function growthF(year, r, base){ return Math.pow(1+r, year-(base||2040)); }
function forecast(o){
  ensureNet(); if(GRAPH.me<GLINK.m) buildGraph(null);
  var year=o.year||2035, r=(o.rate!=null?o.rate:2.0)/100, span=(o.span!=null?o.span:1.0)/100, TH=o.th||1.0, H=o.horizon||2040;
  var s=AI.surrogate, sketch=!s;
  var v1=s?s.v1:baseVol; if(!v1) return {ok:false, err:"Run an assignment (or fit the surrogate) first."};
  var e=s?s.e:null, m=GLINK.m;
  var fC=growthF(year,r,H), fL=growthF(year,Math.max(-0.05,r-span),H), fH=growthF(year,r+span,H);
  var pred=new Float64Array(m), flagged=[];
  var relErr=s?Math.min(0.5,s.metrics.rmse/Math.max(1,meanPos(v1))):0;
  for(var g=0;g<m;g++){ var v=v1[g]; if(v<=0) continue; var ee=e?e[g]:1; pred[g]=v*Math.pow(fC,ee); }
  // hotspots: links crossing TH in the scenario range by `year`
  var hot=[];
  var sampledBase=s?(+s.sample>0):((+((document.getElementById("sampleSel")||{}).value)||0)>0);
  for(var g2=0;g2<m;g2++){ var v=v1[g2]; if(v<=0) continue; var cap=GRAPH.ECAP[g2], vc1=v/cap, ee2=e?e[g2]:1; if(ee2<0.05) continue;
    var cn=CLS[GLINK.cls[g2]]; if(sampledBase&&(cn==="local"||cn==="coll")) continue;
    var vcC=vc1*Math.pow(fC,ee2); if(vcC<TH*0.9 && vc1*Math.pow(fH,ee2)<TH) continue;
    var fStar=Math.pow(TH/vc1,1/ee2); var yC=H+Math.log(fStar)/Math.log(1+r);
    var yL=(r-span)>0?H+Math.log(fStar)/Math.log(1+r-span):(fStar<=1?-Infinity:Infinity), yH=H+Math.log(fStar)/Math.log(1+r+span);
    var cat=yL<=year?"High":yC<=year?"Medium":yH<=year?"Low":null; if(!cat) continue;
    hot.push({g:g2, vc1:vc1, vcY:vcC, vcLo:vc1*Math.pow(fL,ee2), vcHi:vc1*Math.pow(fH,ee2), yC:yC, cat:cat, e:ee2}); }
  // corridors
  var groups=corridorsOf(hot.map(function(h){return h.g;}), pred);
  var byG=new Map(); hot.forEach(function(h){ byG.set(h.g,h); });
  var med=classMedians(v1);
  var list=groups.map(function(c){
    var hs=c.links.map(function(g){return byG.get(g);}).filter(Boolean); var onset=Infinity, cat="Low", vcY=0, vc1=0, pk=hs[0];
    hs.forEach(function(h){ if(h.yC<onset){onset=h.yC;} if(sevRank(h.cat)<sevRank(cat)) cat=h.cat; if(h.vcY>vcY){vcY=h.vcY; pk=h;} if(h.vc1>vc1) vc1=h.vc1; });
    var flag=vc1>=TH?(onset<H?"earlier than STEAM "+H:"in STEAM "+H+" run"):"beyond STEAM horizon";
    var early=isFinite(onset)&&onset<2026;
    // additive decomposition of ln(V/C_year / V/C_class median)
    var g=pk.g, cm=med[GLINK.cls[g]], lnm=Math.max(1,cm.ln);
    var drv=[["Base demand concentration (vs class median volume)", Math.log(Math.max(1e-6,v1[g])/Math.max(1e-6,cm.v))],
             ["Capacity (lanes vs class median)", -Math.log(Math.max(1,GLINK.ln[g])/lnm)],
             ["Demand growth response to "+year+" (e = "+pk.e.toFixed(2)+")", pk.e*Math.log(fC)]];
    return {rank:0, name:c.name, links:c.links.slice(0,400), n:c.links.length, km:r1(c.km), onset:isFinite(onset)?Math.max(2026,Math.round(onset*10)/10):null, byNow:early, implausible:vcY>3, cat:cat, delay:c.delay,
      vcY:r2(vcY), vcLo:r2(pk.vcLo), vcHi:r2(pk.vcHi), vc1:r2(vc1), flag:flag, x:c.x, y:c.y, bbox:c.bbox, drivers:drv.map(function(d){return [d[0], r2(d[1])];}), peak:g, cls:c.cls};
  }).filter(function(c){ return c.km>=0.3; });
  list.sort(function(a,b){ return sevRank(a.cat)-sevRank(b.cat) || (a.onset||9999)-(b.onset||9999) || b.delay-a.delay; });
  list.forEach(function(c,i){ c.rank=i+1; });
  // show forecast volumes on the map
  if(o.show!==false){ AI.forecastOn=true; scatterVOL(pred); assignDone=true; MODE="vc"; document.querySelectorAll("#modeSeg button,#miniMode button").forEach(function(x){ x.classList.toggle("on",x.dataset.m==="vc"); }); render(); }
  var over=0, vkt=0, csiN=0; for(var g3=0;g3<m;g3++){ if(pred[g3]>0){ var vc=pred[g3]/GRAPH.ECAP[g3]; if(vc>1) over++; var w=pred[g3]*GLINK.len[g3]/1000; vkt+=w; csiN+=w*csi(vc); } }
  AI.lastForecast={year:year, rate:r*100, span:span*100, count:list.length};
  return {ok:true, year:year, f:r2(fC), fLo:r2(fL), fHi:r2(fH), sketch:sketch, relErr:r2(relErr), hotspots:list.slice(0,40), total:list.length,
    over:over, csi:vkt>0?r1(csiN/vkt):0, provenance:sketch?"Illustrative (proportional sketch, no surrogate fitted)":"Surrogate estimate",
    assumption:"Demand scales as (1 + "+(r*100).toFixed(1)+"%)^(year − "+H+") around the STEAM "+H+" OD; range ± "+(span*100).toFixed(1)+" pp. Placeholder growth path until the approved land-use pipeline is loaded.",
    horizonNote:year>H?"Beyond the modelled STEAM horizon ("+H+"): extrapolation.":year<H?"Before the modelled horizon: STEAM 2030/2035 runs are not loaded, so the "+H+" network is assumed in place.":"At the modelled horizon."};
}
function meanPos(v){ var s=0,n=0; for(var i=0;i<v.length;i++) if(v[i]>0){ s+=v[i]; n++; } return n?s/n:1; }
function classMedians(v){ var by=CLS.map(function(){return {v:[],ln:[]};});
  for(var g=0;g<GLINK.m;g++){ if(v[g]>0){ by[GLINK.cls[g]].v.push(v[g]); by[GLINK.cls[g]].ln.push(GLINK.ln[g]||1); } }
  return by.map(function(o){ o.v.sort(function(a,b){return a-b;}); o.ln.sort(function(a,b){return a-b;}); return {v:o.v[o.v.length>>1]||1, ln:o.ln[o.ln.length>>1]||1}; }); }
function forecastOff(){ if(AI.forecastOn){ AI.forecastOn=false; var v=(RESULT==="scenario"&&scnVol)?scnVol:baseVol; if(v){ scatterVOL(v); render(); } } return {ok:true}; }
/* AI vs engine at the horizon: surrogate (from f=0.85) vs engine run at f=1 */
function aiVsEngine(){
  var s=AI.surrogate; if(!s) return {ok:false, err:"Fit the surrogate first."};
  var rows=[], m=GLINK.m;
  for(var g=0;g<m;g++){ var err=s.res[g]; if(!err) continue; var obs=s.v1[g]; if(obs<100) continue; rows.push({g:g, d:err, obs:obs}); }
  rows.sort(function(a,b){ return Math.abs(b.d)-Math.abs(a.d); });
  return {ok:true, rows:rows.slice(0,20).map(function(r){ var vc=r.obs/GRAPH.ECAP[r.g];
    return {g:r.g, name:CLSLABEL[CLS[GLINK.cls[r.g]]]+" · "+distLabel(linkDistrict(r.g)), engine:r1(r.obs), ai:r1(r.obs+r.d), d:r1(r.d), vc:r2(vc),
      reason:vc>0.95?"Near capacity: rerouting is non-linear, so a single elasticity misses it":Math.abs(r.d)>r.obs*0.3?"Route switch between parallel roads (threshold effect)":"Sampling noise on the training runs"}; }),
    card:surrogateCard()};
}
function csi(vc){ return 100*Math.max(0,Math.min(1,(vc-0.8)/0.6)); }
/* congestion severity index by district / class / emirate */
function severityIndex(){
  var vol=AI.forecastOn?null:((RESULT==="scenario"&&scnVol)?scnVol:baseVol); if(!vol) return {ok:false, err:"No assigned volumes."};
  var d={}, cl={}, tot=[0,0,0];
  for(var g=0;g<GLINK.m;g++){ var v=vol[g]; if(v<=0) continue; var vc=v/GRAPH.ECAP[g], w=v*GLINK.len[g]/1000, s=csi(vc)*w;
    var k=distLabel(linkDistrict(g)); var o=d[k]||(d[k]={name:k,vkt:0,s:0,over:0}); o.vkt+=w; o.s+=s; if(vc>1) o.over++;
    var c=CLSLABEL[CLS[GLINK.cls[g]]]; var q=cl[c]||(cl[c]={name:c,vkt:0,s:0,over:0}); q.vkt+=w; q.s+=s; if(vc>1) q.over++;
    tot[0]+=w; tot[1]+=s; if(vc>1) tot[2]++; }
  function fin(o){ return Object.keys(o).map(function(k){ var x=o[k]; return {name:x.name, csi:r1(x.vkt>0?x.s/x.vkt:0), vkt:Math.round(x.vkt), over:x.over}; }).sort(function(a,b){return b.csi-a.csi;}); }
  return {ok:true, formula:"link CSI = 100 · clamp((V/C − 0.8) / 0.6, 0, 1); aggregated VKT-weighted", emirate:r1(tot[0]>0?tot[1]/tot[0]:0), over:tot[2], districts:fin(d).slice(0,40), classes:fin(cl)};
}

/* =====================================================================
   INSPECT / QUERY
   ===================================================================== */
function linkProfile(g){
  ensureNet(); g=g|0; if(g<0||g>=GLINK.m) return {ok:false, err:"no such link"};
  var vol=(RESULT==="scenario"&&scnVol)?scnVol:baseVol, c=CLS[GLINK.cls[g]];
  var p={ok:true, g:g, A:GLINK.A[g], B:GLINK.B[g], ltype:GLINK.lt[g], cls:CLSLABEL[c], lanes:GLINK.ln[g], len:Math.round(GLINK.len[g]), geomLen:Math.round(geomLen(g)),
    cap:Math.round(GRAPH.ECAP[g]), ffspd:PARAMS.spd[c], district:distLabel(linkDistrict(g)), source:NETFILE+" · "+linkRef(g), x:linkMid(g)[0], y:linkMid(g)[1]};
  if(vol){ var v=vol[g], t=linkTimeV(g,vol); p.vol=r1(v); p.vc=r2(v/GRAPH.ECAP[g]); p.spd=r1(GLINK.len[g]/Math.max(0.01,t)*3.6); p.delay=r2(v*(t-GRAPH.EFF[g])/3600);
    p.volSource=AI.volSource==="imported"?"STEAM output (imported)":"Engine output"; p.base=baseVol?r1(baseVol[g]):null; p.scn=scnVol?r1(scnVol[g]):null; }
  var tb=tolerance("base"); if(tb&&tb.assessed) p.tol=r1(tb.tol[g]);
  var s=AI.surrogate; if(s){ var e=s.e[g], v1=s.v1[g], rate=(AI.lastForecast?AI.lastForecast.rate:2)/100, span=(AI.lastForecast?AI.lastForecast.span:1)/100;
    p.e=r2(e); p.series=[2026,2030,2035,2040,2045,2050].map(function(y){ var f=growthF(y,rate), fl=growthF(y,Math.max(-0.05,rate-span)), fh=growthF(y,rate+span);
      return {y:y, vc:r2(v1*Math.pow(f,e)/GRAPH.ECAP[g]), lo:r2(v1*Math.pow(fl,e)/GRAPH.ECAP[g]), hi:r2(v1*Math.pow(fh,e)/GRAPH.ECAP[g])}; });
    p.steam2040=r2(v1/GRAPH.ECAP[g]); }
  return p;
}
function queryLinks(q){
  ensureNet(); var vol=(RESULT==="scenario"&&scnVol)?scnVol:baseVol; q=q||{};
  var clsWant=q.cls?[].concat(q.cls):null, out=[], m=GLINK.m, dist=q.district?String(q.district).toLowerCase():null;
  for(var g=0;g<m;g++){ var c=CLS[GLINK.cls[g]]; if(clsWant&&clsWant.indexOf(c)<0) continue;
    var v=vol?vol[g]:0, vc=vol?v/GRAPH.ECAP[g]:0;
    if(q.vcMin!=null&&!(vc>=q.vcMin)) continue; if(q.vcMax!=null&&!(vc<=q.vcMax)) continue; if(q.minVol!=null&&!(v>=q.minVol)) continue;
    if(q.lanes!=null&&GLINK.ln[g]!==q.lanes) continue;
    if(dist){ if(distLabel(linkDistrict(g)).toLowerCase().indexOf(dist)<0) continue; }
    out.push(g); }
  var key=q.sort||"vc"; out.sort(function(a,b){ if(!vol) return 0; if(key==="vol") return vol[b]-vol[a]; if(key==="delay") return vol[b]*(linkTimeV(b,vol)-GRAPH.EFF[b])-vol[a]*(linkTimeV(a,vol)-GRAPH.EFF[a]); return vol[b]/GRAPH.ECAP[b]-vol[a]/GRAPH.ECAP[a]; });
  var lim=Math.min(q.limit||50,500);
  return {ok:true, total:out.length, hasVol:!!vol, rows:out.slice(0,lim).map(function(g){ var v=vol?vol[g]:null;
    return {g:g, A:GLINK.A[g], B:GLINK.B[g], cls:CLSLABEL[CLS[GLINK.cls[g]]], lanes:GLINK.ln[g], len:Math.round(GLINK.len[g]), district:distLabel(linkDistrict(g)), vol:v!=null?r1(v):null, vc:v!=null?r2(v/GRAPH.ECAP[g]):null}; }),
    links:out.slice(0,3000)};
}
function zoneDetail(q){
  var idx=zoneIdIndex(), z=idx.get((q.id|0)>>>0); if(z===undefined) return {ok:false, err:"zone "+q.id+" is not in the network"};
  var o=AI.luById?AI.luById.get(q.id|0):null, odz=odZoneTotals();
  return {ok:true, id:q.id|0, x:CENT[z*2], y:CENT[z*2+1], district:o?titleCase(o.DISTNAME):null,
    lu:o?{POP_TOT:o.POP_TOT, HH:o.HH, WORKER:o.WORKER, STUDENT:o.STUDENT, GFA_TOTAL:o.GFA_TOTAL, RETAIL_GFA:o.RETAIL_GFA, OFFICE_GFA:o.OFFICE_GFA, AREATYPE:o.AREATYPE, METRO_ACCESS:o.METRO_ACCESS, row:o._row}:null,
    od:odz?{productions:Math.round(odz.P[z]), attractions:Math.round(odz.A[z]), intrazonal:Math.round(odz.I[z])}:null,
    source:LUFILE+(o?" row "+o._row:"")+" · "+ODFILE};
}
function districtSummary(){
  if(!AI.lu) return {ok:false, err:"land use not loaded"};
  var odz=odZoneTotals(), d={};
  AI.lu.rows.forEach(function(o){ var k=titleCase(o.DISTNAME||("District "+o.DISTRICT)); var x=d[k]||(d[k]={name:k, code:o.DISTRICT|0, pop:0, jobs:0, zones:0, trips:0}); x.pop+=+o.POP_TOT||0; x.zones++; });
  if(odz){ var idx=zoneIdIndex(); AI.lu.rows.forEach(function(o){ var z=idx.get((o.Z|0)>>>0); if(z===undefined) return; var k=titleCase(o.DISTNAME||("District "+o.DISTRICT)); d[k].trips+=odz.P[z]; }); }
  var si=severityIndex(), byName={}; if(si.ok) si.districts.forEach(function(r){ byName[r.name]=r; });
  return {ok:true, rows:Object.keys(d).map(function(k){ var x=d[k], s=byName[k]; return {name:k, pop:Math.round(x.pop), zones:x.zones, trips:Math.round(x.trips), csi:s?s.csi:null, over:s?s.over:null}; }).sort(function(a,b){ return b.pop-a.pop; })};
}

/* =====================================================================
   RUN DIAGNOSTICS + HEALTH
   ===================================================================== */
function diagnose(){
  ensureNet(); var out=[]; out.checks=[];
  runInputChecks(out); runOutputChecks(out);
  var byCheck={}; out.checks.forEach(function(c){ byCheck[c.id]=c; });
  var lib=CHECKS.map(function(c){ var s=byCheck[c.id]; var st=c.notRun?"not_run":s?s.status:(c.phase==="compare"?"on_compare":"not_run");
    return {id:c.id, name:c.name, family:c.family, phase:c.phase, status:st, n:s?s.n:null, needs:c.needs, why:s&&s.why?s.why:(c.notRun?"input not available in this build: "+c.needs:null)}; });
  out.sort(function(a,b){ return sevRank(a.severity)-sevRank(b.severity); });
  out.forEach(function(f,i){ f.id="F-"+String(i+1).padStart(3,"0"); var loc=f.location||{};
    if(loc.links&&loc.links.length){ var bb=bboxOf(loc.links); loc.bbox=bb; if(loc.x==null){ loc.x=(bb[0]+bb[2])/2; loc.y=(bb[1]+bb[3])/2; } }
    var sol=solutionsFor(f); if(sol) f.solutions=sol; if(f.corridor){ f.corridor={name:f.corridor.name, km:f.corridor.km, maxvc:f.corridor.maxvc, links:f.corridor.links.length}; } });
  // health
  var per={}; out.forEach(function(f){ per[f.check]=(per[f.check]||0)+SEVW[f.severity]; });
  var ded=0, detail=[]; Object.keys(per).forEach(function(k){ var w=per[k], cap=0; out.forEach(function(f){ if(f.check===k) cap=Math.max(cap,SEVW[f.severity]); }); var d=Math.min(w, cap*2); ded+=d; if(d>0) detail.push([k,d]); });
  var ran=lib.filter(function(c){return c.status==="ran";}).length, applicable=lib.length;
  var health={score:Math.max(0,Math.round(100-ded)), deductions:detail, coverage:ran+" of "+applicable+" checks ran",
    formula:"score = 100 − Σ over checks of min(Σ severity weights of its findings, 2 × its highest weight); weights Critical 25, High 10, Medium 3, Info 0. A readiness indicator, not a measure of forecast accuracy."};
  var counts={Critical:0,High:0,Medium:0,Info:0}; out.forEach(function(f){ counts[f.severity]++; });
  AI.findings=out; AI.lib=lib;
  var ctx={volSource:AI.volSource, method:window.__BASEMETHOD||null, gap:window.__BASEGAP, hasVol:!!baseVol, period:periodLabel(), sample:((document.getElementById("sampleSel")||{}).value), import:AI.importInfo};
  return {ok:true, findings:out.map(slim), library:lib, health:health, counts:counts, ctx:ctx, ranAt:new Date().toISOString()};
}
function slim(f){ var o={}; for(var k in f){ if(k==="location"){ var l=f.location; o.location={type:l.type, count:l.count||(l.links?l.links.length:l.zones?l.zones.length:0), x:l.x, y:l.y, bbox:l.bbox, zones:l.zones?l.zones.slice(0,20):undefined}; } else o[k]=f[k]; } return o; }

/* ---------------- inventory ---------------- */
function inventory(){
  ensureNet(); var byC={}; var lkm=0;
  for(var g=0;g<GLINK.m;g++){ var c=CLSLABEL[CLS[GLINK.cls[g]]]; var o=byC[c]||(byC[c]={links:0,km:0,lanekm:0}); o.links++; o.km+=GLINK.len[g]/1000; o.lanekm+=GLINK.len[g]*(GLINK.ln[g]||1)/1000; }
  var zAtt=0; for(var z=0;z<N0;z++) if(GRAPH.znode[z]>=0) zAtt++;
  var odz=odZoneTotals();
  var crs=(PRJ_WKT.match(/PROJCS\["([^"]+)"/)||[])[1]||"UTM 40N";
  return {ok:true, links:GLINK.m, nodes:GRAPH.idMap.size, zones:N0, zonesAttached:zAtt, byClass:Object.keys(byC).map(function(k){ return {cls:k, links:byC[k].links, km:Math.round(byC[k].km), lanekm:Math.round(byC[k].lanekm)}; }),
    od:odz?{cells:odz.cnt, trips:Math.round(odz.tot), skipped:odz.skipped}:null, lu:AI.lu?{rows:AI.lu.rows.length, cols:AI.lu.head.length}:null, crs:crs,
    params:JSON.parse(JSON.stringify(PARAMS)), paramsDefault:PARAM_DEFAULT, hasVol:!!baseVol, volSource:AI.volSource, method:window.__BASEMETHOD||null, gap:window.__BASEGAP};
}

/* ---------------- import STEAM loaded-network volumes ---------------- */
function importVolumes(o){
  ensureNet(); if(GRAPH.me<GLINK.m) buildGraph(null);
  var lines=o.text.split(/\r?\n/).filter(function(l){return l.trim();}); if(lines.length<2) return {ok:false, err:"empty file"};
  var d=lines[0].indexOf("\t")>=0?"\t":lines[0].indexOf(";")>=0?";":",";
  var head=lines[0].split(d).map(function(s){return s.trim().replace(/"/g,"").toUpperCase();});
  var ia=head.indexOf("A"), ib=head.indexOf("B"); if(ia<0||ib<0) return {ok:false, err:"needs A and B columns"};
  var pref=o.col?[o.col.toUpperCase()]:["V_1","VOLUME","VOL","V","TOTAL","FLOW","V1","VOLT"]; var iv=-1, colName=null;
  for(var k=0;k<pref.length&&iv<0;k++){ iv=head.indexOf(pref[k]); if(iv>=0) colName=pref[k]; }
  if(iv<0){ for(var j=0;j<head.length;j++){ if(j!==ia&&j!==ib&&/^V|VOL|FLOW/.test(head[j])){ iv=j; colName=head[j]; break; } } }
  if(iv<0) return {ok:false, err:"no volume column found (looked for "+pref.join(", ")+")", head:head};
  var key=new Map(); for(var g=0;g<GLINK.m;g++){ key.set(GLINK.A[g]*BIG+GLINK.B[g],g); if(!key.has(GLINK.B[g]*BIG+GLINK.A[g])) key.set(GLINK.B[g]*BIG+GLINK.A[g],g); }
  var vol=new Float64Array(GLINK.m), matched=0, unmatched=0, rowsN=0;
  for(var r=1;r<lines.length;r++){ var p=lines[r].split(d); var a=parseInt(p[ia],10), b=parseInt(p[ib],10), v=parseFloat(p[iv]); rowsN++;
    var g2=key.get(a*BIG+b); if(g2===undefined){ unmatched++; continue; } if(isFinite(v)){ vol[g2]+=v*(o.scale||1); matched++; } }
  baseVol=vol; baseMet=metricsOf(vol); RESULT="base"; scnVol=null; DIFF=null; window.__BASEDELTA=null; window.__BASEGAP=null; window.__BASEMETHOD="imported";
  scatterVOL(vol); assignDone=true; AI.volSource="imported"; AI.importInfo={name:o.name||"loaded network", col:colName, rows:rowsN, matched:matched, unmatched:unmatched};
  MODE="vc"; document.querySelectorAll("#modeSeg button,#miniMode button").forEach(function(x){ x.classList.toggle("on",x.dataset.m==="vc"); }); render();
  return {ok:true, info:AI.importInfo};
}

/* ---------------- HSM cordon handoff (draft) ---------------- */
function hsmExport(o){
  ensureNet(); var bb=o.bbox; if(!bb) return {ok:false, err:"no study area"};
  var pad=o.pad||1500, x0=bb[0]-pad, y0=bb[1]-pad, x1=bb[2]+pad, y1=bb[3]+pad;
  var inZ=new Uint8Array(N0), zl=[]; for(var z=0;z<N0;z++){ var x=CENT[z*2], y=CENT[z*2+1]; if(x>=x0&&x<=x1&&y>=y0&&y<=y1){ inZ[z]=1; zl.push(CIDS[z]); } }
  var links=["A,B,LTYPE,LANES,LENGTH_M,CLASS,VOLUME,VC"]; var vol=baseVol;
  for(var g=0;g<GLINK.m;g++){ var mx=(GLINK.ax[g]+GLINK.bx[g])/2, my=(GLINK.ay[g]+GLINK.by[g])/2; if(mx<x0||mx>x1||my<y0||my>y1) continue;
    links.push([GLINK.A[g],GLINK.B[g],GLINK.lt[g],GLINK.ln[g],Math.round(GLINK.len[g]),CLS[GLINK.cls[g]],vol?r1(vol[g]):"",vol?r2(vol[g]/GRAPH.ECAP[g]):""].join(",")); }
  var R=window.__ODRAW, idx=zoneIdIndex(), od=["origin,destination,trips_24h"], ext={};
  if(R){ for(var i=0;i<R.cnt;i++){ var oz=idx.get(R.O[i]>>>0), dz=idx.get(R.D[i]>>>0); if(oz===undefined||dz===undefined) continue; var v=h2f(R.V[i]);
      if(inZ[oz]&&inZ[dz]) od.push(R.O[i]+","+R.D[i]+","+v.toFixed(3));
      else if(inZ[oz]){ ext["O"+R.O[i]]=(ext["O"+R.O[i]]||0)+v; } else if(inZ[dz]){ ext["D"+R.D[i]]=(ext["D"+R.D[i]]||0)+v; } } }
  var exl=["zone,direction,trips_24h"]; Object.keys(ext).forEach(function(k){ exl.push(k.slice(1)+","+(k[0]==="O"?"to_outside":"from_outside")+","+ext[k].toFixed(1)); });
  return {ok:true, zones:zl.length, links:links.length-1, odCells:od.length-1, files:{"links.csv":links.join("\n"), "od_internal.csv":od.join("\n"), "od_boundary_by_zone.csv":exl.join("\n")},
    bbox:[x0,y0,x1,y1], note:"Draft handoff: internal-internal OD and per-zone boundary totals only. Gate (cordon-crossing) demand needs a path-based extraction (select-link) before HSM calibration."};
}

/* =====================================================================
   MAP OVERLAY: highlights + pulsing markers + picking
   ===================================================================== */
var ov=null, ovx=null, raf=0, reduce=false;
try{ reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
function ensureOv(){ if(ov) return; var map=document.getElementById("map"); if(!map) return;
  ov=document.createElement("canvas"); ov.id="aiov"; ov.style.cssText="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3";
  (map.parentNode||document.body).appendChild(ov); ovx=ov.getContext("2d");
  var cs=getComputedStyle(map); if(cs.position==="fixed"){ ov.style.position="fixed"; } }
var SEVCOL={Critical:"#e5484d",High:"#f5a524",Medium:"#e2c541",Info:"#7aa7d9"};
function drawOverlay(){
  ensureOv(); if(!ov) return; var w=W, h=H; if(ov.width!==Math.round(w*DPR)||ov.height!==Math.round(h*DPR)){ ov.width=Math.round(w*DPR); ov.height=Math.round(h*DPR); }
  var t=ovx; t.setTransform(DPR,0,0,DPR,0,0); t.clearRect(0,0,w,h);
  var hw=w/2, hh=h/2;
  if(AI.hl&&AI.hl.links&&AI.hl.links.length){
    var ls=AI.hl.links; t.lineCap="round"; t.lineJoin="round";
    [["rgba(4,10,20,.85)",7.5],[AI.hl.color||"#36B7B4",3.6]].forEach(function(st){
      t.strokeStyle=st[0]; t.lineWidth=st[1]; t.beginPath();
      for(var k=0;k<ls.length;k++){ var g=ls[k], c=CLS[GLINK.cls[g]], d=L[c], i=GLINK.loc[g];
        for(var j=d.off[i];j<d.off[i+1];j++){ var x=(d.xy[j*2]-cx)*sc+hw, y=hh-(d.xy[j*2+1]-cy)*sc; if(j===d.off[i]) t.moveTo(x,y); else t.lineTo(x,y); } }
      t.stroke(); });
  }
  if(AI.hlZones&&AI.hlZones.length){ t.fillStyle="rgba(54,183,180,.9)"; t.strokeStyle="#04101c"; t.lineWidth=1.5;
    AI.hlZones.forEach(function(z){ var x=(CENT[z*2]-cx)*sc+hw, y=hh-(CENT[z*2+1]-cy)*sc; t.beginPath(); t.arc(x,y,5,0,6.2832); t.fill(); t.stroke(); }); }
  var now=performance.now();
  AI.markers.forEach(function(mk){ var x=(mk.x-cx)*sc+hw, y=hh-(mk.y-cy)*sc; if(x<-30||x>w+30||y<-30||y>h+30) return;
    var col=SEVCOL[mk.sev]||mk.color||"#36B7B4";
    if(!reduce){ var ph=((now/1400)+(mk.ph||0))%1; t.beginPath(); t.arc(x,y,7+ph*16,0,6.2832); t.strokeStyle=col; t.globalAlpha=1-ph; t.lineWidth=2; t.stroke(); t.globalAlpha=1; }
    t.beginPath(); t.arc(x,y,mk.sel?8:6,0,6.2832); t.fillStyle=col; t.fill(); t.lineWidth=2; t.strokeStyle="#0b1220"; t.stroke();
    if(mk.label&&(mk.sel||sc>0.02)){ t.font="600 11px system-ui,sans-serif"; var tw=t.measureText(mk.label).width; t.fillStyle="rgba(11,18,32,.88)"; t.fillRect(x+10,y-9,tw+10,18); t.fillStyle="#F4F7FB"; t.fillText(mk.label,x+15,y+4); } });
  if(AI.markers.length&&!reduce&&!raf){ raf=requestAnimationFrame(function(){ raf=0; drawOverlay(); }); }
}
var _render=window.render;
if(typeof _render==="function"){ window.render=function(){ var r=_render.apply(this,arguments); try{ drawOverlay(); }catch(e){} return r; }; }
function focus(o){
  AI.hl=o.links&&o.links.length?{links:o.links, color:o.color}:null; AI.hlZones=o.zones||null;
  var bb=o.bbox; if(!bb&&o.links&&o.links.length) bb=bboxOf(o.links);
  if(!bb&&o.zones&&o.zones.length){ var x0=1e18,y0=1e18,x1=-1e18,y1=-1e18; o.zones.forEach(function(z){ x0=Math.min(x0,CENT[z*2]); x1=Math.max(x1,CENT[z*2]); y0=Math.min(y0,CENT[z*2+1]); y1=Math.max(y1,CENT[z*2+1]); }); bb=[x0,y0,x1,y1]; }
  if(!bb&&o.x!=null) bb=[o.x-1500,o.y-1500,o.x+1500,o.y+1500];
  if(bb&&o.fly!==false){ var pad=Math.max(600,(bb[2]-bb[0])*0.25,(bb[3]-bb[1])*0.25); animateTo(bb[0]-pad,bb[1]-pad,bb[2]+pad,bb[3]+pad); }
  else render();
  return {ok:true};
}
function animateTo(x0,y0,x1,y1){
  var tsc=Math.min(W/(x1-x0),H/(y1-y0))*0.92, tcx=(x0+x1)/2, tcy=(y0+y1)/2; tsc=Math.max(SCMIN(),Math.min(tsc,60));
  if(reduce){ cx=tcx; cy=tcy; sc=tsc; render(); return; }
  var s0={cx:cx,cy:cy,sc:sc}, t0=performance.now(), D=650;
  (function step(){ var k=Math.min(1,(performance.now()-t0)/D), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    cx=s0.cx+(tcx-s0.cx)*e; cy=s0.cy+(tcy-s0.cy)*e; sc=Math.exp(Math.log(s0.sc)+(Math.log(tsc)-Math.log(s0.sc))*e); render(); if(k<1) requestAnimationFrame(step); })();
}
function pickAt(px,py){ var best=-1, bd=12, hw=W/2, hh=H/2;
  for(var ci=0;ci<CLS.length;ci++){ var c=CLS[ci], d=L[c], bb=d.bb, xy=d.xy, off=d.off; var gi=GLINK?GLINK.gindex[c]:null; if(!gi) continue;
    for(var i=0;i<d.n;i++){ var b4=i*4, sx0=(bb[b4]-cx)*sc+hw, sy0=hh-(bb[b4+1]-cy)*sc, sx1=(bb[b4+2]-cx)*sc+hw, sy1=hh-(bb[b4+3]-cy)*sc;
      if(px<Math.min(sx0,sx1)-12||px>Math.max(sx0,sx1)+12||py<Math.min(sy0,sy1)-12||py>Math.max(sy0,sy1)+12) continue;
      for(var j=off[i]+1;j<off[i+1];j++){ var ax=(xy[j*2-2]-cx)*sc+hw, ay=hh-(xy[j*2-1]-cy)*sc, bx=(xy[j*2]-cx)*sc+hw, by=hh-(xy[j*2+1]-cy)*sc;
        var dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy, u=L2>0?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/L2)):0, qx=ax+u*dx-px, qy=ay+u*dy-py, dd=Math.sqrt(qx*qx+qy*qy);
        if(dd<bd){ bd=dd; best=gi[i]; } } } }
  return best; }
(function(){ var map=document.getElementById("map"); if(!map) return; var down=null;
  map.addEventListener("pointerdown",function(e){ down=[e.clientX,e.clientY]; },true);
  map.addEventListener("pointerup",function(e){ if(!AI.pick||!down) return; if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>6) return;
    ensureNet(); var r=map.getBoundingClientRect(); var g=pickAt(e.clientX-r.left,e.clientY-r.top); if(g>=0){ AI.hl={links:[g]}; drawOverlay(); post({event:"aipick", g:g}); } },true);
})();
function snapshotMap(){ try{ ensureOv(); var map=document.getElementById("map"); var c=document.createElement("canvas"); c.width=map.width; c.height=map.height; var t=c.getContext("2d");
  t.drawImage(map,0,0); if(ov) t.drawImage(ov,0,0,map.width,map.height); var s=Math.min(1,1400/c.width); var c2=document.createElement("canvas"); c2.width=Math.round(c.width*s); c2.height=Math.round(c.height*s);
  c2.getContext("2d").drawImage(c,0,0,c2.width,c2.height); return {ok:true, png:c2.toDataURL("image/png"), w:c2.width, h:c2.height}; }catch(e){ return {ok:false, err:String(e)}; } }

/* =====================================================================
   COMMAND ROUTER
   ===================================================================== */
function prepare(){
  ensureNet(); try{ loadLU(); }catch(e){}
  var p=(typeof loadEmbeddedOD==="function")?loadEmbeddedOD():null;
  return Promise.resolve(p).then(function(){ return {ok:true, od:!!ODMAT, links:GLINK.m}; });
}
window.__AICMD=function(m){
  var c=m.cmd.slice(3);
  try{
    switch(c){
      case "prepare":   return prepare();
      case "setlu":     return setLU(m.csv);
      case "inventory": return inventory();
      case "diagnose":  return prepare().then(function(){ return withClamp(diagnose); });
      case "finding":   { var f=AI.findings.filter(function(x){return x.id===m.id;})[0]; if(!f) return {ok:false, err:"unknown finding"}; var l=f.location||{};
                          return {ok:true, links:l.links?l.links.slice(0,3000):[], zones:l.zones||[], bbox:l.bbox, x:l.x, y:l.y}; }
      case "focus":     return focus(m);
      case "markers":   AI.markers=m.markers||[]; drawOverlay(); return {ok:true};
      case "clear":     AI.hl=null; AI.hlZones=null; if(m.markers) AI.markers=[]; drawOverlay(); return {ok:true};
      case "pick":      AI.pick=!!m.on; return {ok:true};
      case "link":      return linkProfile(m.g);
      case "query":     return queryLinks(m.q);
      case "zone":      return zoneDetail(m);
      case "districts": return districtSummary();
      case "csi":       return severityIndex();
      case "compare":   return compare(m);
      case "noise":     window.__NOISEON=!!m.on; if(typeof render==="function") render(); return {ok:true, on:window.__NOISEON};
      case "stress":    return stress(m);
      case "fit":       return prepare().then(function(){ return fitSurrogate(); });
      case "card":      return {ok:!!AI.surrogate, card:surrogateCard()};
      case "forecast":  return forecast(m);
      case "fcoff":     return forecastOff();
      case "aivs":      return aiVsEngine();
      case "import":    return importVolumes(m);
      case "hsm":       return hsmExport(m);
      case "snapshot":  return snapshotMap();
      case "mode":      MODE=m.mode; document.querySelectorAll("#modeSeg button,#miniMode button").forEach(function(x){ x.classList.toggle("on",x.dataset.m===m.mode); }); render(); return {ok:true};
      case "setscreen": if(m.method) SCREEN.method=m.method; if(m.sample!=null) SCREEN.sample=String(m.sample); if(m.clamp!==undefined) SCREEN.clamp=+m.clamp||0; AI.sbase=null; return {ok:true, screen:SCREEN};
      case "status":    return {ok:true, hasVol:!!baseVol, hasScn:!!scnVol, running:!!ASSIGN.running, od:!!ODMAT, volSource:AI.volSource, surrogate:!!AI.surrogate, method:window.__BASEMETHOD||null, gap:window.__BASEGAP, screen:SCREEN, lastStress:AI.lastStress||null};
      default: return {ok:false, err:"unknown ai command "+c};
    }
  }catch(e){ return {ok:false, err:String(e&&e.message||e)}; }
};
/* record when a normal app run finishes so the shell can refresh diagnostics */
setInterval(function(){ var sig=(baseVol?baseVol.length+":"+(baseMet?Math.round(baseMet.vht):0):"")+"|"+(scnVol?Math.round(scnMet?scnMet.vht:0):""); if(sig!==AI._sig){ AI._sig=sig; if(baseVol&&AI.volSource==="none") AI.volSource="engine"; post({event:"airun", sig:sig}); } },1500);
})();
