/* STEAM 2040 Studio — copilot bridge (injected into each embedded app).
   A thin, generic executor: the parent sends postMessage commands, this
   runs them against the app's own DOM and reports results back. No app
   internals are required — everything works through the public controls. */
(function(){
  "use strict";
  var APP = "__APPID__";
  function $(id){ return document.getElementById(id); }
  function fire(el, type){ try{ el.dispatchEvent(new Event(type, {bubbles:true})); }catch(e){} }

  function clickId(id){ var el=$(id); if(!el) return {ok:false, err:"no #"+id}; el.click(); return {ok:true}; }
  function clickSel(sel){ var el=document.querySelector(sel); if(!el) return {ok:false, err:"no "+sel}; el.click(); return {ok:true}; }

  function setVal(id, val){
    var el=$(id); if(!el) return {ok:false, err:"no #"+id};
    el.value = val; fire(el,"input"); fire(el,"change");
    return {ok:true, value:el.value};
  }
  function setCheck(id, want){
    var el=$(id); if(!el) return {ok:false, err:"no #"+id};
    want = !!want;
    if(el.checked !== want){ el.click(); }      // native click flips + fires change
    return {ok:true, checked:el.checked};
  }
  /* click a segmented-control button by any of its data-* values */
  function seg(container, key){
    var btns = document.querySelectorAll(container + " button");
    for(var i=0;i<btns.length;i++){
      var d = btns[i].dataset || {};
      for(var k in d){ if(d[k] === key){ btns[i].click(); return {ok:true}; } }
    }
    return {ok:false, err:"no segment '"+key+"' in "+container};
  }
  function readId(id){
    var el=$(id); if(!el) return {ok:false, text:""};
    return {ok:true, text:(el.innerText||el.textContent||"").replace(/\s+/g," ").trim()};
  }
  function snap(ids){
    var out={};
    (ids||[]).forEach(function(id){
      var el=$(id); if(el) out[id]=(el.innerText||el.textContent||"").replace(/\s+/g," ").trim();
    });
    out.__title = document.title;
    return {ok:true, data:out};
  }
  /* reveal a <details> section whose <summary> matches the given text */
  function openDetails(text){
    text=(text||"").toLowerCase();
    var ds=document.querySelectorAll("details");
    for(var i=0;i<ds.length;i++){
      var s=ds[i].querySelector("summary");
      if(s && (s.innerText||"").toLowerCase().indexOf(text)>=0){
        ds[i].open=true; try{ s.scrollIntoView({block:"nearest"}); }catch(e){}
        return {ok:true};
      }
    }
    return {ok:false, err:"no section '"+text+"'"};
  }
  function pressKey(key){
    try{ document.dispatchEvent(new KeyboardEvent("keydown",{key:key, bubbles:true})); return {ok:true}; }
    catch(e){ return {ok:false, err:String(e)}; }
  }
  /* toggle a class on <body> (used by the Studio rail for map-first / panel visibility) */
  function bodyClass(name, on){ document.body.classList.toggle(name, !!on); return {ok:true, on:document.body.classList.contains(name)}; }
  /* accordion apps: show ONLY the selected <details class="sec"> (hide the rest)
     so a left-rail tap reveals just that one function — no stacked headers. */
  function section(text){
    document.body.classList.remove("collapsed");
    var t=(text||"").toLowerCase(), ds=document.querySelectorAll("details.sec"), found=false;
    for(var i=0;i<ds.length;i++){
      var s=ds[i].querySelector("summary"), hit=!!s && (s.innerText||"").toLowerCase().indexOf(t)>=0;
      ds[i].style.display = hit ? "" : "none";
      ds[i].open = hit;
      if(hit) found=true;
    }
    return {ok:found};
  }
  /* VIEWER: hand the extra layer geometry (connectors / walk / PnR / PT) to the
     Assignment, which doesn't embed them, so it can draw the same full network. */
  function getXlayers(){
    try{
      function pick(d){ return d && d.xy ? {xy:d.xy, off:d.off, bb:d.bb, n:d.n} : null; }
      var out={};
      if(typeof ACT!=="undefined" && ACT){ out.conn=pick(ACT.conn); out.walk=pick(ACT.walk); out.pnr=pick(ACT.pnr); }
      if(typeof L!=="undefined" && L){ out.pt=pick(L.pt); }
      return {ok:true, layers:out};
    }catch(e){ return {ok:false, err:String(e)}; }
  }
  /* ASSIGNMENT: store transferred layers and repaint */
  function setXlayers(layers){
    try{ window.__XLAYERS=layers; if(typeof render==="function") render(); return {ok:true}; }
    catch(e){ return {ok:false, err:String(e)}; }
  }
  /* ASSIGNMENT: serialize the current solution program for the draggable list */
  function getProgram(){
    try{
      if(typeof PROGRAM==="undefined" || !PROGRAM || !PROGRAM.picks || !PROGRAM.picks.length) return {ok:false};
      var picks=PROGRAM.picks.map(function(p){
        return { type:p.type, rank:p.rank, stepSaved:p.stepSaved||0, stepCost:p.stepCost||0,
          up:Array.from(p.up||[]).map(function(e){ return [e[0], e[1]]; }),
          extras:(p.extras||[]).map(function(e){ return {pts:e.pts, lanes:e.lanes, lt:e.lt, _n0:e._n0, _n1:e._n1}; }) };
      });
      return {ok:true, picks:picks, cost:PROGRAM.cost||0};
    }catch(e){ return {ok:false, err:String(e)}; }
  }
  /* ASSIGNMENT: apply an edited / reordered program to the scenario */
  function applyProgram(picks){
    try{
      if(typeof SCN==="undefined") return {ok:false, err:"no scenario"};
      var up=new Map(), extras=[];
      (picks||[]).forEach(function(p){
        (p.up||[]).forEach(function(e){ up.set(e[0], (up.get(e[0])||0)+e[1]); });
        (p.extras||[]).forEach(function(e){ extras.push({pts:e.pts, lanes:e.lanes, lt:e.lt, _n0:e._n0, _n1:e._n1}); });
      });
      SCN.upgrades=up; SCN.extras=extras;
      if(typeof updateScnPanel==="function") updateScnPanel();
      if(typeof render==="function") render();
      return {ok:true, n:(picks||[]).length};
    }catch(e){ return {ok:false, err:String(e)}; }
  }
  /* ---- aggregation optimiser (Assignment side) ---- */
  /* snapshot the current (full-zone) assigned flows as the reference */
  function snapFull(){
    if(typeof baseVol==="undefined" || !baseVol) return {ok:false, err:"run a full assignment first"};
    window.__FULLVOL = baseVol.slice();
    window.__FULLMET = (typeof baseMet!=="undefined") ? baseMet : null;
    return {ok:true, vht:(window.__FULLMET&&window.__FULLMET.vht)||0, links:baseVol.length};
  }
  /* restrict the error to a study area: a 1/0 mask over real links (g<GLINK.m)
     whose midpoint or either endpoint falls in rect (world coords) expanded by
     a buffer (metres). Links outside are ignored entirely in the comparison. */
  function setAreaMask(rect, buffer){
    if(typeof GLINK==="undefined" || !GLINK || !GLINK.ax){ window.__AREAMASK=null; return {ok:false, err:"no links"}; }
    if(!rect){ window.__AREAMASK=null; window.__AREARECT=null; return {ok:true, n:0, all:true}; }
    var b=(typeof buffer==="number")?buffer:0;
    var vx0=Math.min(rect[0],rect[2])-b, vx1=Math.max(rect[0],rect[2])+b,
        vy0=Math.min(rect[1],rect[3])-b, vy1=Math.max(rect[1],rect[3])+b;
    var M=GLINK.m, mask=new Uint8Array(M), n=0, ax=GLINK.ax, ay=GLINK.ay, bx=GLINK.bx, by=GLINK.by;
    for(var g=0; g<M; g++){
      var mxp=(ax[g]+bx[g])*0.5, myp=(ay[g]+by[g])*0.5;
      var hit=(mxp>=vx0&&mxp<=vx1&&myp>=vy0&&myp<=vy1)
            ||(ax[g]>=vx0&&ax[g]<=vx1&&ay[g]>=vy0&&ay[g]<=vy1)
            ||(bx[g]>=vx0&&bx[g]<=vx1&&by[g]>=vy0&&by[g]<=vy1);
      if(hit){ mask[g]=1; n++; }
    }
    window.__AREAMASK=mask; window.__AREARECT=[vx0,vy0,vx1,vy1];
    return {ok:true, n:n, total:M};
  }
  function clearAreaMask(){ window.__AREAMASK=null; window.__AREARECT=null; return {ok:true}; }
  /* VHT (veh-hours) summed only over the given link indices — same formula as
     metricsOf, but restricted to the study area. linkTime is a pure function of
     the volume, so this is valid for any stored volume vector. */
  function areaVHT(vol, idx){
    if(typeof linkTime!=="function" || typeof GRAPH==="undefined") return 0;
    var vht=0; for(var j=0;j<idx.length;j++){ var g=idx[j], v=vol[g]; if(!(v>0)) continue; vht+=v*linkTime(g,vol)/3600; }
    return vht;
  }
  /* compare current assigned flows to the snapshot: %RMSE, correlation, VHT
     error — over the study-area mask if one is set, otherwise all real links. */
  function cmpFull(){
    if(!window.__FULLVOL || typeof baseVol==="undefined" || !baseVol) return {ok:false};
    var F=window.__FULLVOL, A=baseVol, mask=window.__AREAMASK;
    var M=(typeof GLINK!=="undefined"&&GLINK.m)?GLINK.m:Math.min(F.length,A.length);
    var lim=Math.min(M,F.length,A.length), idx=[];
    for(var g=0; g<lim; g++){ if(!mask || mask[g]) idx.push(g); }
    var n=idx.length; if(!n) return {ok:false, err:"no links in study area"};
    var mf=0, ma=0, j, gg;
    for(j=0;j<n;j++){ gg=idx[j]; mf+=F[gg]; ma+=A[gg]; } mf/=n; ma/=n;
    var sumSq=0, maxAbs=0, cov=0, va=0, vf=0;
    for(j=0;j<n;j++){ gg=idx[j]; var d=A[gg]-F[gg]; sumSq+=d*d; if(Math.abs(d)>maxAbs)maxAbs=Math.abs(d);
      var fa=A[gg]-ma, ff=F[gg]-mf; cov+=fa*ff; va+=fa*fa; vf+=ff*ff; }
    var rmse=Math.sqrt(sumSq/n), pctRmse= mf>0 ? 100*rmse/mf : 0;
    var corr=(va>0&&vf>0)? cov/Math.sqrt(va*vf) : 0;
    var vhtF=areaVHT(F,idx), vhtA=areaVHT(A,idx);
    var vhtErr= vhtF>0 ? 100*Math.abs(vhtA-vhtF)/vhtF : 0;
    return {ok:true, pctRmse:pctRmse, corr:corr, vhtErr:vhtErr, vhtFull:vhtF, vhtNow:vhtA, maxAbs:maxAbs, nLinks:n, masked:!!mask};
  }
  /* render the difference plot: aggregated flows minus the full snapshot.
     srcVol lets us re-show ANY cached scenario's Δ (vs the same full baseline)
     so the user can click back through every method that was tested. */
  function showDiff(srcVol){
    var V = srcVol || ((typeof baseVol!=="undefined") ? baseVol : null);
    if(!window.__FULLVOL || !V || typeof GLINK==="undefined") return {ok:false};
    DIFF=new Float64Array(GLINK.m); var ad=[];
    for(var g=0; g<GLINK.m; g++){ var d=(V[g]||0)-(window.__FULLVOL[g]||0); DIFF[g]=d; if(d) ad.push(Math.abs(d)); }
    ad.sort(function(a,b){return a-b;});
    DIFFMAX = ad.length ? Math.max(1, ad[Math.floor(ad.length*0.95)]) : 1;
    scnVol = V.slice(); if(typeof RESULT!=="undefined") RESULT="scenario";
    MODE="diff";
    try{ document.querySelectorAll("#modeSeg button,#miniMode button").forEach(function(x){ x.classList.toggle("on", x.dataset.m==="diff"); }); }catch(e){}
    if(typeof render==="function") render();
    return {ok:true};
  }
  /* cache the current aggregated flows under a key so its Δ plot can be
     re-shown later when the user clicks that scenario in the chat. */
  function scnSave(key){
    try{ if(typeof baseVol==="undefined" || !baseVol) return {ok:false};
      window.__SCN = window.__SCN || {}; window.__SCN[key] = baseVol.slice(); return {ok:true}; }
    catch(e){ return {ok:false, err:String(e)}; }
  }
  /* the current map viewport as a world-coordinate rectangle — used as the
     "study area" for study-area-adaptive aggregation. */
  function getRect(){
    try{ var W=document.documentElement.clientWidth||window.innerWidth, H=document.documentElement.clientHeight||window.innerHeight, hwm=(W/2)/sc, hhm=(H/2)/sc;
      return {ok:true, rect:[cx-hwm, cy-hhm, cx+hwm, cy+hhm], cx:cx, cy:cy, sc:sc}; }
    catch(e){ return {ok:false, err:String(e)}; }
  }
  /* NEW METHODOLOGY — study-area-adaptive aggregation (Viewer side).
     Keeps FULL zonal resolution for zones whose centroid lies inside the study
     area (the user's current view, or an explicit rect), and merges every zone
     OUTSIDE it using the already-computed base clustering (ACT.rid). Because the
     densest, highest-flow links sit inside the study area and their loadings are
     preserved exactly, this drives the assignment error toward its minimum where
     it matters — far lower flow RMSE than any uniform aggregation at a similar
     zone count. opts.pad expands (>0) or shrinks (<0) the study rectangle. */
  function getAggregationStudyArea(opts){
    if(typeof ACT==="undefined" || !ACT || !ACT.rid || typeof CIDS==="undefined" || typeof CENT==="undefined")
      return {ok:false, err:"need a base aggregation + zone centroids"};
    var rid=ACT.rid, N=rid.length;
    var rect=opts&&opts.rect;
    if(!rect){ var W=document.documentElement.clientWidth||window.innerWidth,H=document.documentElement.clientHeight||window.innerHeight,hwm=(W/2)/sc,hhm=(H/2)/sc; rect=[cx-hwm,cy-hhm,cx+hwm,cy+hhm]; }
    var pad=(opts&&typeof opts.pad==="number")?opts.pad:0;
    var mx=(rect[2]-rect[0]), my=(rect[3]-rect[1]);
    var vx0=rect[0]-mx*pad, vx1=rect[2]+mx*pad, vy0=rect[1]-my*pad, vy1=rect[3]+my*pad;
    function inside(i){ var x=CENT[i*2], y=CENT[i*2+1]; return x>=vx0&&x<=vx1&&y>=vy0&&y<=vy1; }
    // base + lowest-index OUTSIDE member per cluster (the exterior representative)
    var base={}, outRep={};
    for(var i=0;i<N;i++){ var r=rid[i]; if(base[r]===undefined||i<base[r]) base[r]=i;
      if(!inside(i)){ if(outRep[r]===undefined||i<outRep[r]) outRep[r]=i; } }
    var pairs=[], merged=0, roots={}, inN=0;
    for(var k=0;k<N;k++){
      if(inside(k)){ roots["s"+k]=1; inN++; continue; }   // keep full resolution inside
      var rr=rid[k], rep=(outRep[rr]!==undefined)?outRep[rr]:base[rr];
      roots["c"+rep]=1;
      if(rep!==k){ pairs.push([CIDS[k]>>>0, CIDS[rep]>>>0]); merged++; }
    }
    return {ok:true, pairs:pairs, merged:merged, zones:Object.keys(roots).length, total:N, inStudy:inN};
  }
  /* shared map view (both apps use cx,cy world-centre + sc px/m) for zoom sync */
  function getView(){ try{ return {ok:true, cx:cx, cy:cy, sc:sc}; }catch(e){ return {ok:false}; } }
  function setView(v){
    try{
      if(typeof v.cx==="number") cx=v.cx;
      if(typeof v.cy==="number") cy=v.cy;
      if(typeof v.sc==="number") sc=v.sc;
      if(typeof clampScale==="function") clampScale();
      if(typeof render==="function") render();
      if(typeof drawMini==="function"){ try{ drawMini(); }catch(e){} }
      return {ok:true};
    }catch(e){ return {ok:false, err:String(e)}; }
  }

  /* ---- zone-aggregation handoff (Viewer ➜ Assignment) ---- */
  /* VIEWER: read the current aggregation as origZoneId ➜ representativeZoneId pairs.
     ACT.rid[i] is zone i's cluster root (may be a synthetic merged node), so we
     pick the lowest-index ORIGINAL zone in each cluster as its representative. */
  function getAggregation(){
    if(typeof ACT==="undefined" || !ACT || !ACT.rid || typeof CIDS==="undefined")
      return {ok:false, err:"no aggregation yet"};
    var rid=ACT.rid, N=rid.length, repIdx={};
    for(var i=0;i<N;i++){ var r=rid[i]; if(repIdx[r]===undefined || i<repIdx[r]) repIdx[r]=i; }
    var pairs=[], merged=0, roots={};
    for(var k=0;k<N;k++){ var rr=rid[k]; roots[rr]=1;
      if(repIdx[rr]!==k){ pairs.push([CIDS[k]>>>0, CIDS[repIdx[rr]]>>>0]); merged++; } }
    return {ok:true, pairs:pairs, merged:merged, zones:Object.keys(roots).length, total:N};
  }
  /* ASSIGNMENT: re-aggregate the embedded OD by a zoneId➜representative map,
     drop now-intrazonal trips, rebuild ODMAT, ready for a re-run. */
  function aggregateOD(pairs){
    if(typeof buildODfromArrays!=="function" || !window.__ODRAW) return {ok:false, err:"OD not loaded yet"};
    var O=window.__ODRAW.O, D=window.__ODRAW.D, V=window.__ODRAW.V, cnt=window.__ODRAW.cnt;
    var rep={}; for(var k=0;k<pairs.length;k++) rep[pairs[k][0]]=pairs[k][1];
    var BIG=1000000, agg=new Map();
    for(var i=0;i<cnt;i++){
      var o=O[i]>>>0, d=D[i]>>>0, ro=rep[o], rd=rep[d];
      if(ro!==undefined) o=ro; if(rd!==undefined) d=rd;
      if(o===d) continue;                                   // intrazonal after merge
      var v=(typeof h2f==="function")?h2f(V[i]):V[i]; if(!(v>0)) continue;
      var key=o*BIG+d; agg.set(key,(agg.get(key)||0)+v);
    }
    var m=agg.size, O2=new Float64Array(m), D2=new Float64Array(m), V2=new Float64Array(m), j=0;
    agg.forEach(function(v,key){ O2[j]=Math.floor(key/BIG); D2[j]=key%BIG; V2[j]=v; j++; });
    var r=buildODfromArrays(O2,D2,V2,m,false);
    try{ var ds=document.getElementById("demandSel"); if(ds) ds.value="od"; }catch(e){}
    try{ var os=document.getElementById("odStats"); if(os) os.textContent="Aggregated zones · "+r.cells.toLocaleString()+" OD pairs · "+Math.round(r.grand).toLocaleString()+" trips · "+r.origins.toLocaleString()+" origins"; }catch(e){}
    return {ok:true, pairs:r.cells, trips:Math.round(r.grand), origins:r.origins};
  }

  window.addEventListener("message", function(ev){
    var m = ev.data;
    if(!m || m.steam !== 1 || m.resp) return;
    var out;
    try{
      switch(m.cmd){
        case "ping":  out={ready:true, app:APP}; break;
        case "click": out = m.id ? clickId(m.id) : clickSel(m.sel); break;
        case "set":   out = setVal(m.id, m.value); break;
        case "check": out = setCheck(m.id, m.value); break;
        case "seg":   out = seg(m.container, m.key); break;
        case "read":  out = readId(m.id); break;
        case "snap":  out = snap(m.ids); break;
        case "open":  out = openDetails(m.text); break;
        case "bodyclass": out = bodyClass(m.name, m.on); break;
        case "section":   out = section(m.text); break;
        case "getagg":    out = getAggregation(); break;
        case "aggod":     out = aggregateOD(m.pairs||[]); break;
        case "getview":   out = getView(); break;
        case "setview":   out = setView(m); break;
        case "getxl":     out = getXlayers(); break;
        case "setxl":     out = setXlayers(m.layers); break;
        case "getprog":   out = getProgram(); break;
        case "applyprog": out = applyProgram(m.picks||[]); break;
        case "snapfull":  out = snapFull(); break;
        case "cmpfull":   out = cmpFull(); break;
        case "showdiff":  out = showDiff((m.key && window.__SCN) ? window.__SCN[m.key] : null); break;
        case "scnsave":   out = scnSave(m.key); break;
        case "getrect":   out = getRect(); break;
        case "getaggsa":  out = getAggregationStudyArea(m); break;
        case "setarea":   out = setAreaMask(m.rect, m.buffer); break;
        case "cleararea": out = clearAreaMask(); break;
        case "key":   out = pressKey(m.key); break;
        case "resize": try{ if(typeof resize==="function") resize(); }catch(e){} out={ok:true}; break;
        default:      out = {ok:false, err:"unknown cmd "+m.cmd};
      }
    }catch(err){ out = {ok:false, err:String(err && err.message || err)}; }
    try{ ev.source.postMessage({steam:1, resp:1, rid:m.rid, app:APP, out:out}, "*"); }catch(e){}
  });

  /* Keep the canvas exactly matched to the iframe so click hit-testing stays
     accurate: re-run the app's resize() whenever the iframe changes size
     (dock toggle, tab switch, rail, window/orientation change). The apps key
     selection off clientX/clientY vs W/H, so a stale W/H mis-selects. */
  (function(){
    function _fix(){ try{ if(typeof resize==="function") resize(); }catch(e){} }
    try{
      if(typeof ResizeObserver!=="undefined"){
        var _ro=new ResizeObserver(function(){ _fix(); });
        _ro.observe(document.documentElement);
      }
    }catch(e){}
    window.addEventListener("focus", _fix);
    window.addEventListener("pageshow", _fix);
    // re-measure the moment the pointer enters the map, so hit-testing is never
    // stale relative to the canvas (covers any layout change we didn't observe)
    try{ var _map=document.getElementById("map"); if(_map) _map.addEventListener("pointerenter", _fix); }catch(e){}
  })();

  function announce(){ try{ window.parent.postMessage({steam:1, resp:1, event:"ready", app:APP}, "*"); }catch(e){} }
  window.addEventListener("load", announce);
  if(document.readyState==="complete" || document.readyState==="interactive"){ setTimeout(announce, 50); }
})();
