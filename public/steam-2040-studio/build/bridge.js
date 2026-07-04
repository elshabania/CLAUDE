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
    // link-level agreement: share of links whose flow moved ≤1% / ≤5% of its
    // baseline (1 / 5 veh floor so empty links don't dominate), the standard
    // GEH<5 share, and the p95 relative error on carrying links (≥50 veh)
    var w1=0, w5=0, geh=0, g2=0, gehN=0, maxGeh=0, rel=[];
    for(j=0;j<n;j++){ gg=idx[j]; var f0=F[gg]||0, a0=A[gg]||0, ad0=Math.abs(a0-f0);
      if(ad0<=Math.max(0.01*f0,1)) w1++;
      if(ad0<=Math.max(0.05*f0,5)) w5++;
      var s0=f0+a0, gv=(s0>0)?Math.sqrt(2*ad0*ad0/s0):0;
      if(s0>0){ gehN++; if(gv<5) geh++; }
      if(gv<2) g2++;
      if(gv>maxGeh) maxGeh=gv;
      if(f0>=50) rel.push(ad0/f0);
    }
    rel.sort(function(a,b){ return a-b; });
    var p95=rel.length ? 100*rel[Math.floor(rel.length*0.95)] : 0;
    return {ok:true, pctRmse:pctRmse, corr:corr, vhtErr:vhtErr, vhtFull:vhtF, vhtNow:vhtA, maxAbs:maxAbs, nLinks:n, masked:!!mask,
            pctW1:100*w1/n, pctW5:100*w5/n, geh5:(gehN?100*geh/gehN:0), pctG2:100*g2/n, maxGeh:maxGeh, p95pct:p95, nCarry:rel.length};
  }
  /* sparse per-link Δ (current flows − full snapshot) for baking preloaded
     difference plots: links with |Δ| ≥ minAbs, their baseline flow, and the
     p95 |Δ| colour scale the live Δ plot would use. */
  function exportDiff(minAbs){
    if(!window.__FULLVOL || typeof baseVol==="undefined" || !baseVol) return {ok:false, err:"no comparison"};
    var F=window.__FULLVOL, A=baseVol;
    var M=(typeof GLINK!=="undefined"&&GLINK.m)?GLINK.m:Math.min(F.length,A.length);
    var t=(typeof minAbs==="number"&&minAbs>0)?minAbs:0.5;
    var idx=[], dv=[], fv=[], ad=[], g, d;
    for(g=0; g<M; g++){ d=(A[g]||0)-(F[g]||0); if(d){ ad.push(Math.abs(d)); }
      if(Math.abs(d)>=t){ idx.push(g); dv.push(d); fv.push(F[g]||0); } }
    ad.sort(function(a,b){ return a-b; });
    var dmax=ad.length ? Math.max(1, ad[Math.floor(ad.length*0.95)]) : 1;
    return {ok:true, m:M, n:idx.length, nNonZero:ad.length, idx:idx, dv:dv, fv:fv, dmax:dmax};
  }
  /* display a BAKED difference plot: sparse Δ + per-link baseline denominators
     arrive from the container (no assignment run needed). Same rendering state
     showDiff sets, so the Δ-filter slider works unchanged. */
  function showBaked(m){
    try{
      if(typeof GLINK==="undefined" || !GLINK || !GLINK.m) return {ok:false, err:"no network"};
      var M=GLINK.m, ix=m.idx, dv=m.dv, fv=m.fv;
      if(!ix || !ix.length) return {ok:false, err:"empty baked diff"};
      DIFF=new Float64Array(M);
      var den=new Float64Array(M);
      for(var j=0;j<ix.length;j++){ var g=ix[j]; if(g<M){ DIFF[g]=dv[j]; den[g]=fv?(fv[j]||0):0; } }
      DIFFMAX=(typeof m.dmax==="number"&&m.dmax>0)?m.dmax:1;
      window.__DIFFDEN=den;
      MODE="diff";
      try{ document.querySelectorAll("#modeSeg button,#miniMode button").forEach(function(x){ x.classList.toggle("on", x.dataset.m==="diff"); }); }catch(e){}
      if(typeof render==="function") render();
      return {ok:true, n:ix.length};
    }catch(e){ return {ok:false, err:String(e)}; }
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
    window.__DIFFDEN = window.__FULLVOL;        // %-filter denominator = baseline flows
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
    // group the OUTSIDE members per cluster; each group's representative is the
    // member nearest the group's mean centroid (least loading shift)
    var groupsOut=new Map(), inN=0;
    for(var i=0;i<N;i++){
      if(inside(i)){ inN++; continue; }
      var r=rid[i]; var g=groupsOut.get(r); if(!g){g=[];groupsOut.set(r,g);} g.push(i);
    }
    var pairs=[], merged=0, outZones=0;
    groupsOut.forEach(function(g){
      outZones++;
      if(g.length<2) return;
      var sx=0,sy=0;
      for(var q=0;q<g.length;q++){ sx+=CENT[g[q]*2]; sy+=CENT[g[q]*2+1]; }
      var mx2=sx/g.length, my2=sy/g.length, rep=g[0], bd=Infinity;
      for(q=0;q<g.length;q++){ var dx=CENT[g[q]*2]-mx2, dy=CENT[g[q]*2+1]-my2, d=dx*dx+dy*dy;
        if(d<bd){ bd=d; rep=g[q]; } }
      for(q=0;q<g.length;q++){ if(g[q]!==rep){ pairs.push([CIDS[g[q]]>>>0, CIDS[rep]>>>0]); merged++; } }
    });
    return {ok:true, pairs:pairs, merged:merged, zones:inN+outZones, total:N, inStudy:inN};
  }
  /* CUSTOM SPATIAL AGGREGATIONS (Viewer side) — proximity-first methods built
     directly on the zone centroids, independent of the app's own M1-M5:
       nn     — single-linkage agglomerative (Kruskal): the two CLOSEST zones
                merge first, then the next closest, until the target count.
                This is literally "aggregate zones next to each other first".
       grid   — square spatial cells: only co-located zones can merge; the cell
                size is solved so the occupied-cell count hits the target.
       kmeans — Lloyd's k-means on centroids: k compact, convex-ish clusters.
     Returns the same pairs format as getAggregation ([zoneId, repId]). */
  /* the shared spatial-clustering engine: every mode fills a union-find over
     the N zones. All operate on centroids only, so they need no app UI state. */
  function spatialCluster(mode, target, WGT){
    var N=CIDS.length;
    target=Math.max(50, Math.min(N, (target|0) || Math.round(N*0.55)));
    // normalised positive coords so grid keys stay valid for negative eastings
    var xs=new Float64Array(N), ys=new Float64Array(N), mnx=Infinity, mny=Infinity;
    for(var i=0;i<N;i++){ var x=CENT[i*2], y=CENT[i*2+1]; if(x<mnx)mnx=x; if(y<mny)mny=y; }
    for(i=0;i<N;i++){ xs[i]=CENT[i*2]-mnx; ys[i]=CENT[i*2+1]-mny; }
    var comp=new Int32Array(N); for(i=0;i<N;i++) comp[i]=i;
    function find(p){ var r=p; while(comp[r]!==r)r=comp[r]; while(comp[p]!==r){ var nx=comp[p]; comp[p]=r; p=nx; } return r; }
    var clusters=N;
    function uni(a,b){ var ra=find(a), rb=find(b); if(ra!==rb){ comp[ra]=rb; clusters--; return true; } return false; }
    var KEY=1<<20, c, i2;
    function mergeByCell(keyOf){          // all zones in a cell merge together
      var firstIn=new Map();
      for(var q=0;q<N;q++){ var key=keyOf(q); var f0=firstIn.get(key);
        if(f0===undefined) firstIn.set(key,q); else uni(q,f0); } }
    function bisectCell(occOf){           // solve cell size so occupied ≈ target
      var mxx=0,mxy=0; for(var q=0;q<N;q++){ if(xs[q]>mxx)mxx=xs[q]; if(ys[q]>mxy)mxy=ys[q]; }
      var lo=100, hi=Math.max(mxx,mxy)||1;
      for(var bi=0;bi<32;bi++){ var mid=Math.sqrt(lo*hi); if(occOf(mid)>target) lo=mid; else hi=mid; }
      return hi; }
    function occCount(keyAt){ return function(s){ var st=new Set(); for(var q=0;q<N;q++) st.add(keyAt(q,s)); return st.size; }; }
    /* cluster-level greedy rounds shared by nn / ward / bal / nnd. rad0/grow
       set the distance-band schedule: small bands keep distance dominant and
       let the cost function only ORDER merges within a band. */
    function clusterRounds(pickEdges, rad0, grow){
      var rad=rad0||2500, GR=grow||2;
      while(clusters>target && rad<800000){
        // current cluster reps, centroids and sizes. With zone weights (trip
        // ends) the centroid is DEMAND-weighted — merge distance is measured
        // between centres of demand, not centres of geometry.
        var roots=new Map();
        for(var q=0;q<N;q++){ var r=find(q); var o=roots.get(r);
          if(!o){ o={sx:0,sy:0,sw:0,n:0,rep:r}; roots.set(r,o); }
          var wq=WGT?Math.max(WGT[q],1e-9):1;
          o.sx+=xs[q]*wq; o.sy+=ys[q]*wq; o.sw+=wq; o.n++; }
        var reps=[], RX=[], RY=[], RN=[], RW=[];
        roots.forEach(function(o){ reps.push(o.rep); RX.push(o.sx/o.sw); RY.push(o.sy/o.sw); RN.push(o.n); RW.push(o.sw); });
        var g=new Map(), cell=rad;
        for(i2=0;i2<reps.length;i2++){ var kk=Math.floor(RX[i2]/cell)*KEY+Math.floor(RY[i2]/cell);
          var a0=g.get(kk); if(!a0){a0=[];g.set(kk,a0);} a0.push(i2); }
        var r2=rad*rad, edges=[];
        for(i2=0;i2<reps.length;i2++){
          var gx=Math.floor(RX[i2]/cell), gy=Math.floor(RY[i2]/cell);
          for(var ox=-1;ox<=1;ox++) for(var oy=-1;oy<=1;oy++){
            var lst=g.get((gx+ox)*KEY+(gy+oy)); if(!lst) continue;
            for(var w=0;w<lst.length;w++){ var j=lst[w]; if(j<=i2) continue;
              var ddx=RX[i2]-RX[j], ddy=RY[i2]-RY[j], dd=ddx*ddx+ddy*ddy;
              if(dd<=r2) edges.push([pickEdges(dd,RN[i2],RN[j],RW[i2],RW[j]), i2, j]); } }
        }
        edges.sort(function(a,b){ return a[0]-b[0]; });
        var didMerge=false;
        for(var e2=0;e2<edges.length && clusters>target;e2++){
          if(uni(reps[edges[e2][1]], reps[edges[e2][2]])) didMerge=true; }
        if(!didMerge || clusters>target) rad*=GR;   // widen the neighbourhood
      }
    }
    if(mode==="grid"){
      var sG=bisectCell(occCount(function(q,s){ return Math.floor(xs[q]/s)*KEY+Math.floor(ys[q]/s); }));
      mergeByCell(function(q){ return Math.floor(xs[q]/sG)*KEY+Math.floor(ys[q]/sG); });
    } else if(mode==="hex"){
      // pointy-top hex binning: offset every other row by half a cell
      function hexKey(q,s){ var row=Math.floor(ys[q]/(0.866*s)); var xo=xs[q]-(row&1)*(s/2); return row*KEY+Math.floor(xo/s); }
      var sH=bisectCell(occCount(hexKey));
      mergeByCell(function(q){ return hexKey(q,sH); });
    } else if(mode==="quad" || mode==="qtd"){
      // quadtree: keep splitting the "fullest" cell until ~target non-empty
      // leaves. quad measures fullness by ZONE COUNT; qtd by TRIP-END DEMAND,
      // so cells shrink exactly where the demand is — centroid displacement is
      // bounded by the cell size, made smallest where moving trips hurts most.
      var byDemand=(mode==="qtd" && WGT);
      function leafScore(L){ if(!byDemand) return L.z.length;
        var s=0; for(var q3=0;q3<L.z.length;q3++) s+=WGT[L.z[q3]]; return s; }
      var mxq=0,myq=0; for(i=0;i<N;i++){ if(xs[i]>mxq)mxq=xs[i]; if(ys[i]>myq)myq=ys[i]; }
      var all=[]; for(i=0;i<N;i++) all.push(i);
      var leaves=[{x0:0,y0:0,x1:mxq+1,y1:myq+1,z:all}];
      leaves[0].sc=leafScore(leaves[0]);
      while(leaves.length<target){
        var bi2=-1,bn=-1; for(i2=0;i2<leaves.length;i2++){ var Li=leaves[i2];
          if(!Li.done && Li.z.length>1 && Li.sc>bn){ bn=Li.sc; bi2=i2; } }
        if(bi2<0) break;                              // nothing splittable left
        var Lf=leaves[bi2], mx2=(Lf.x0+Lf.x1)/2, my2=(Lf.y0+Lf.y1)/2, subs=[[],[],[],[]];
        for(var w2=0;w2<Lf.z.length;w2++){ var zz=Lf.z[w2];
          subs[(xs[zz]>=mx2?1:0)+(ys[zz]>=my2?2:0)].push(zz); }
        var news=[]; for(var s4=0;s4<4;s4++){ if(!subs[s4].length) continue;
          news.push({ x0:(s4&1)?mx2:Lf.x0, x1:(s4&1)?Lf.x1:mx2, y0:(s4&2)?my2:Lf.y0, y1:(s4&2)?Lf.y1:my2, z:subs[s4] }); }
        if(news.length<=1){ Lf.done=true; continue; }     // co-located points: unsplittable
        for(var n4=0;n4<news.length;n4++) news[n4].sc=leafScore(news[n4]);
        leaves.splice(bi2,1); leaves.push.apply(leaves,news);
      }
      for(i2=0;i2<leaves.length;i2++){ var zl=leaves[i2].z; for(var w3=1;w3<zl.length;w3++) uni(zl[w3],zl[0]); }
    } else if(mode==="kmeans"){
      var k=target, cxs=new Float64Array(k), cys=new Float64Array(k), asg=new Int32Array(N);
      var stride=N/k; for(c=0;c<k;c++){ var z0=Math.min(N-1,Math.floor(c*stride)); cxs[c]=xs[z0]; cys[c]=ys[z0]; }
      for(var itr=0;itr<8;itr++){
        for(i=0;i<N;i++){ var bd=Infinity,bc=0; for(c=0;c<k;c++){ var dx=xs[i]-cxs[c],dy=ys[i]-cys[c],d=dx*dx+dy*dy; if(d<bd){bd=d;bc=c;} } asg[i]=bc; }
        var sx=new Float64Array(k), sy=new Float64Array(k), cnt=new Int32Array(k);
        for(i=0;i<N;i++){ sx[asg[i]]+=xs[i]; sy[asg[i]]+=ys[i]; cnt[asg[i]]++; }
        for(c=0;c<k;c++){ if(cnt[c]){ cxs[c]=sx[c]/cnt[c]; cys[c]=sy[c]/cnt[c]; } }
      }
      var rep0=new Int32Array(k); for(c=0;c<k;c++) rep0[c]=-1;
      for(i=0;i<N;i++){ var cc=asg[i]; if(rep0[cc]<0) rep0[cc]=i; else uni(i,rep0[cc]); }
    } else if(mode==="kcenter"){
      // farthest-point sampling: seeds guarantee even COVERAGE (minimax radius),
      // then every zone joins its nearest seed
      var k2t=target, dmin=new Float64Array(N), near=new Int32Array(N);
      // start at the zone nearest the mean centre
      var mx3=0,my3=0; for(i=0;i<N;i++){ mx3+=xs[i]; my3+=ys[i]; } mx3/=N; my3/=N;
      var s0=0,bd0=Infinity; for(i=0;i<N;i++){ var dx0=xs[i]-mx3,dy0=ys[i]-my3,d0=dx0*dx0+dy0*dy0; if(d0<bd0){bd0=d0;s0=i;} }
      for(i=0;i<N;i++){ var dxs=xs[i]-xs[s0],dys=ys[i]-ys[s0]; dmin[i]=dxs*dxs+dys*dys; near[i]=s0; }
      for(var sIdx=1;sIdx<k2t;sIdx++){
        var far=0,fd=-1; for(i=0;i<N;i++){ if(dmin[i]>fd){fd=dmin[i];far=i;} }
        if(fd<=0) break;
        for(i=0;i<N;i++){ var dxf=xs[i]-xs[far],dyf=ys[i]-ys[far],df=dxf*dxf+dyf*dyf; if(df<dmin[i]){ dmin[i]=df; near[i]=far; } }
      }
      for(i=0;i<N;i++) if(near[i]!==i) uni(i,near[i]);
    } else if(mode==="ring"){
      // classic sketch-planning: distance rings around the activity centre ×
      // angular sectors; ring breaks at equal-count quantiles. Because zones
      // concentrate in the city, many cells are empty — adapt R,S upward until
      // the OCCUPIED cell count reaches the target.
      var mx4=0,my4=0; for(i=0;i<N;i++){ mx4+=xs[i]; my4+=ys[i]; } mx4/=N; my4/=N;
      var rr=new Float64Array(N), order2=[];
      for(i=0;i<N;i++){ var dx4=xs[i]-mx4,dy4=ys[i]-my4; rr[i]=Math.sqrt(dx4*dx4+dy4*dy4); order2.push(i); }
      order2.sort(function(a,b){ return rr[a]-rr[b]; });
      var R=Math.max(2,Math.round(Math.sqrt(target/6))), S=Math.max(4,Math.ceil(target/R));
      var ringOf=new Int32Array(N);
      function ringKey(q){ var ang=Math.atan2(ys[q]-my4,xs[q]-mx4);
        var sec=Math.min(S-1,Math.floor((ang+Math.PI)/(2*Math.PI)*S)); return ringOf[q]*KEY+sec; }
      for(var ad=0;ad<6;ad++){
        for(i=0;i<N;i++) ringOf[order2[i]]=Math.min(R-1,Math.floor(i*R/N));
        var occ2=new Set(); for(i=0;i<N;i++) occ2.add(ringKey(i));
        if(occ2.size>=target*0.97 || R>=N) break;
        var f2=Math.sqrt(target/Math.max(1,occ2.size));
        R=Math.max(R+1,Math.round(R*f2)); S=Math.max(S+1,Math.round(S*f2));
      }
      mergeByCell(ringKey);
    } else if(mode==="ward"){
      // variance-minimising greedy: merge the pair with the smallest Ward cost
      // d^2 * (na*nb)/(na+nb) — compact AND size-balanced clusters
      clusterRounds(function(dd,na,nb){ return dd*na*nb/(na+nb); });
    } else if(mode==="bal"){
      // size-balancing: distance scaled UP by the joint size, so small clusters
      // pair with small/near neighbours first and zone sizes stay even
      clusterRounds(function(dd,na,nb){ return dd*(na+nb); });
    } else if(mode==="nnd"){
      // DEMAND-weighted adjacent-first: trip ends are the cluster mass, so the
      // merge cost d^2 * (wa*wb)/(wa+wb) IS the squared trip-displacement of
      // the merge — high-demand zones keep their own loading points. Distance
      // stays DOMINANT via tight bands (350 m start, ×1.6): demand only orders
      // merges within a band, so nothing gets dragged kilometres away.
      clusterRounds(function(dd,na,nb,wa,wb){ return dd*wa*wb/(wa+wb); }, 350, 1.6);
    } else {   // "nn" — closest pairs merge first (single-linkage, adjacency-first)
      clusterRounds(function(dd){ return dd; });
    }
    return { N:N, find:find, clusters:clusters };
  }
  /* pick each cluster's representative as the member NEAREST the cluster's
     mean centroid — the merged demand then loads as close as possible to
     where the member zones actually load, minimising the loading shift */
  function bestRepPairs(find, N, WGT){
    var groups2=new Map();
    for(var i=0;i<N;i++){ var r=find(i); var g=groups2.get(r); if(!g){g=[];groups2.set(r,g);} g.push(i); }
    var pairs=[], merged=0, zones=0;
    groups2.forEach(function(g){
      zones++;
      if(g.length<2) return;
      // representative = member nearest the cluster's DEMAND-weighted mean, so
      // the trips that must relocate travel the least distance possible
      var sx=0,sy=0,sw=0;
      for(var q=0;q<g.length;q++){ var wq=WGT?Math.max(WGT[g[q]],1e-9):1;
        sx+=CENT[g[q]*2]*wq; sy+=CENT[g[q]*2+1]*wq; sw+=wq; }
      var mx2=sx/sw, my2=sy/sw, rep=g[0], bd=Infinity;
      for(q=0;q<g.length;q++){ var dx=CENT[g[q]*2]-mx2, dy=CENT[g[q]*2+1]-my2, d=dx*dx+dy*dy;
        if(d<bd){ bd=d; rep=g[q]; } }
      for(q=0;q<g.length;q++){ if(g[q]!==rep){ pairs.push([CIDS[g[q]]>>>0, CIDS[rep]>>>0]); merged++; } }
    });
    return {pairs:pairs, merged:merged, zones:zones};
  }
  function aggCustom(opts){
    if(typeof CENT==="undefined" || typeof CIDS==="undefined" || !CIDS.length)
      return {ok:false, err:"no zone centroids"};
    var mode=(opts&&opts.mode)||"nn", target=(opts&&opts.target)|0;
    // optional per-zone trip-end weights (from the Assignment's OD): id-keyed
    var W=null;
    if(opts && opts.wid && opts.w && opts.wid.length){
      var wm=new Map(); for(var k2=0;k2<opts.wid.length;k2++) wm.set(opts.wid[k2]>>>0, opts.w[k2]);
      W=new Float64Array(CIDS.length);
      for(var i2=0;i2<CIDS.length;i2++) W[i2]=wm.get(CIDS[i2]>>>0)||0;
    }
    var scr=spatialCluster(mode,target,W);
    var rp=bestRepPairs(scr.find, scr.N, W);
    return {ok:true, pairs:rp.pairs, merged:rp.merged, zones:rp.zones, total:scr.N, mode:mode, target:target, weighted:!!W};
  }
  /* run a custom method as a FIRST-CLASS viewer aggregation: build the same
     merge forest the app's own methods produce and finalise through assemble(),
     so zone drawing, stats, exports and the assignment handoff all work. */
  var CUSTLBL={ nn:"NN · adjacent-first", nnd:"NND · demand-weighted", qtd:"QTD · demand quadtree", gehx:"GEHX · exact-guard", ward:"WARD · variance-minimising", kmeans:"KM · k-means compact",
                kcenter:"KC · k-center coverage", grid:"GRID · square cells", hex:"HEX · hexagonal cells",
                quad:"QT · quadtree adaptive", bal:"BAL · size-balanced", ring:"RING · rings × sectors" };
  /* GEHX in the Viewer dropdown: same 2-stage algorithm as the Assignment's
     gehAgg, computed from the ferried zone→attachment-node + trip-end table
     (window.__GEHDATA). Returns a union-find like spatialCluster does. */
  function gehClusterViewer(target){
    var D=window.__GEHDATA; if(!D) return null;
    var N=CIDS.length, comp=new Int32Array(N), i;
    for(i=0;i<N;i++) comp[i]=i;
    function find(p){ var r=p; while(comp[r]!==r)r=comp[r]; while(comp[p]!==r){ var nx=comp[p]; comp[p]=r; p=nx; } return r; }
    var clusters=N;
    function uni(a,b){ var ra=find(a), rb=find(b); if(ra!==rb){ comp[ra]=rb; clusters--; return true; } return false; }
    var nd=new Int32Array(N).fill(-1), w=new Float64Array(N);
    for(i=0;i<N;i++){ var e=D.map.get(CIDS[i]>>>0); if(e){ nd[i]=e[0]; w[i]=e[1]; } }
    // stage 1 — same attachment node (merge into the highest-demand member)
    var byNode=new Map();
    for(i=0;i<N;i++){ if(nd[i]<0) continue; var a=byNode.get(nd[i]); if(!a){a=[];byNode.set(nd[i],a);} a.push(i); }
    byNode.forEach(function(a){ if(a.length<2) return;
      var r0=a[0]; a.forEach(function(z){ if(w[z]>w[r0]) r0=z; });
      a.forEach(function(z){ if(z!==r0) uni(z,r0); });
    });
    // stage 2 — cheapest-damage-first: moves priced trips × distance to the
    // nearest survivor, spent via a lazy-greedy heap (same policy as the
    // Assignment-side gehAgg; OD-pair and volume penalties live there — the
    // Viewer has only the ferried trip-end totals)
    if(target>0 && clusters>target){
      var CELL=3000, KEY2=1<<20, grid=new Map();
      function gk(x,y){ return Math.floor(x/CELL)*KEY2+Math.floor(y/CELL); }
      var alive=new Set(); for(i=0;i<N;i++) if(find(i)===i) alive.add(i);
      alive.forEach(function(z){ var k=gk(CENT[z*2],CENT[z*2+1]); var a=grid.get(k); if(!a){a=new Set();grid.set(k,a);} a.add(z); });
      function bestTarget(zq){
        var x0=CENT[zq*2], y0=CENT[zq*2+1];
        var gx=Math.floor(x0/CELL), gy=Math.floor(y0/CELL), best=-1, bd=Infinity, found=-1;
        function consider(z3){ if(z3===zq) return;
          var dx=CENT[z3*2]-x0, dy=CENT[z3*2+1]-y0, dd=dx*dx+dy*dy;
          if(dd<bd){ bd=dd; best=z3; } }
        var c0=grid.get(gx*KEY2+gy);
        if(c0&&c0.size&&!(c0.size===1&&c0.has(zq))){ found=0; c0.forEach(consider); }
        for(var ring=1; ring<=30 && (found<0 || ring<=found+1); ring++){
          for(var ox=-ring;ox<=ring;ox++) for(var oy=-ring;oy<=ring;oy++){
            if(Math.max(Math.abs(ox),Math.abs(oy))!==ring) continue;
            var cs=grid.get((gx+ox)*KEY2+(gy+oy)); if(!cs||!cs.size) continue;
            if(found<0) found=ring;
            cs.forEach(consider);
          }
        }
        return best<0?null:{t:best, cost:0};
      }
      // smallest trip-ends first, nearest surviving target — the policy the
      // offline variant race confirmed optimal (damage-priced orderings and
      // penalty-steered targets all scored worse under the exact protocol)
      var order=Array.from(alive).sort(function(a,b){ return w[a]-w[b]; });
      for(var q4=0; q4<order.length && clusters>target; q4++){
        var zq=order[q4]; if(!alive.has(zq) || find(zq)!==zq) continue;
        var bt=bestTarget(zq); if(!bt) continue;
        uni(zq,bt.t); alive.delete(zq);
        var sq=grid.get(gk(CENT[zq*2],CENT[zq*2+1])); if(sq) sq.delete(zq);
      }
    }
    return {N:N, find:find, clusters:clusters};
  }
  function runCustomAgg(mode){
    try{
      if(typeof assemble!=="function" || typeof CENT==="undefined") return {ok:false, err:"viewer not ready"};
      var N=CIDS.length;
      var target=+(((document.getElementById("maxZoneSel")||{}).value))||Math.round(N*0.55);
      var scr;
      if(mode==="gehx"){
        scr=gehClusterViewer(target);
        if(!scr){   // no ferried data yet — ask the container to fetch it, then re-run
          try{ window.parent.postMessage({steam:1,resp:1,event:"needgeh"},"*"); }catch(e){}
          try{ agglbl.textContent="GEHX — fetching assignment data…"; }catch(e){}
          return {ok:false, err:"fetching assignment data"};
        }
      } else scr=spatialCluster(mode,target);
      var find=scr.find;
      // assemble()'s forest convention: par[i] < 0 marks a root
      var MAXT=N*2, px=new Float64Array(MAXT), py=new Float64Array(MAXT), par=new Int32Array(MAXT);
      par.fill(-1);
      var i;
      for(i=0;i<N;i++){ px[i]=CENT[i*2]; py[i]=CENT[i*2+1]; }
      var T=N, groups=new Map();
      for(i=0;i<N;i++){ var r=find(i); var g=groups.get(r); if(!g){g=[];groups.set(r,g);} g.push(i); }
      groups.forEach(function(g){
        if(g.length<2) return;
        var cur=g[0], sx=px[g[0]], sy=py[g[0]], n=1;
        for(var q=1;q<g.length;q++){ var c=T++; sx+=px[g[q]]; sy+=py[g[q]]; n++;
          par[cur]=c; par[g[q]]=c; px[c]=sx/n; py[c]=sy/n; cur=c; }
      });
      ACT=assemble(px,py,par,T);
      var mg=0, MG=ACT.centMerged; if(MG) for(var m2=0;m2<MG.length;m2++) mg+=MG[m2];
      try{ agglbl.textContent="whole model · "+ACT.zones.toLocaleString()+" zones ("+mg.toLocaleString()+" merged) · "+(CUSTLBL[mode]||mode);
           netstatsEl.textContent=ACT.zones.toLocaleString()+" centroids · "+ACT.nconn.toLocaleString()+" connections"; }catch(e){}
      try{ shadeCache.key=null; }catch(e){}
      if(typeof render==="function") render();
      return {ok:true, zones:ACT.zones, merged:mg};
    }catch(err){ return {ok:false, err:String(err&&err.message||err)}; }
  }
  // registry the app's applyAggregation() dispatches through
  try{ window.__CUSTAGG={ modes:CUSTLBL, run:runCustomAgg }; }catch(e){}
  /* display an EXPLICIT merge list as the viewer's zone aggregation — the
     exact pairs a scored/preloaded configuration used (any family, incl. the
     Assignment-side GEHX), so the Zones view shows that method's zone system */
  function applyPairsViewer(pairs, label){
    try{
      if(typeof assemble!=="function" || typeof CENT==="undefined") return {ok:false, err:"viewer not ready"};
      if(!pairs || !pairs.length) return {ok:false, err:"no merge pairs"};
      var N=CIDS.length, idToIdx=new Map(), i;
      for(i=0;i<N;i++) idToIdx.set(CIDS[i]>>>0, i);
      var MAXT=N*2, px=new Float64Array(MAXT), py=new Float64Array(MAXT), par=new Int32Array(MAXT);
      par.fill(-1);
      for(i=0;i<N;i++){ px[i]=CENT[i*2]; py[i]=CENT[i*2+1]; }
      var groups=new Map(), missed=0;
      for(i=0;i<pairs.length;i++){
        var m0=idToIdx.get(pairs[i][0]>>>0), r0=idToIdx.get(pairs[i][1]>>>0);
        if(m0===undefined||r0===undefined){ missed++; continue; }
        var g=groups.get(r0); if(!g){ g=[r0]; groups.set(r0,g); }
        g.push(m0);
      }
      var T=N;
      groups.forEach(function(g){
        if(g.length<2) return;
        var cur=g[0], sx=px[g[0]], sy=py[g[0]], n=1;
        for(var q=1;q<g.length;q++){ var c=T++; sx+=px[g[q]]; sy+=py[g[q]]; n++;
          par[cur]=c; par[g[q]]=c; px[c]=sx/n; py[c]=sy/n; cur=c; }
      });
      ACT=assemble(px,py,par,T);
      var mg=0, MG=ACT.centMerged; if(MG) for(var m2=0;m2<MG.length;m2++) mg+=MG[m2];
      try{ agglbl.textContent="whole model · "+ACT.zones.toLocaleString()+" zones ("+mg.toLocaleString()+" merged) · "+(label||"preloaded configuration");
           netstatsEl.textContent=ACT.zones.toLocaleString()+" centroids · "+ACT.nconn.toLocaleString()+" connections"; }catch(e){}
      try{ shadeCache.key=null; }catch(e){}
      if(typeof render==="function") render();
      return {ok:true, zones:ACT.zones, merged:mg, missed:missed};
    }catch(err){ return {ok:false, err:String(err&&err.message||err)}; }
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
    var rid=ACT.rid, N=rid.length;
    var rp=bestRepPairs(function(i){ return rid[i]; }, N);
    return {ok:true, pairs:rp.pairs, merged:rp.merged, zones:rp.zones, total:N};
  }
  /* ASSIGNMENT: re-aggregate the embedded OD by a zoneId➜representative map,
     drop now-intrazonal trips, rebuild ODMAT, ready for a re-run. */
  function aggregateOD(pairs, sampleN){
    if(typeof buildODfromArrays!=="function" || !window.__ODRAW) return {ok:false, err:"OD not loaded yet"};
    var O=window.__ODRAW.O, D=window.__ODRAW.D, V=window.__ODRAW.V, cnt=window.__ODRAW.cnt;
    var rep={}; for(var k=0;k<pairs.length;k++) rep[pairs[k][0]]=pairs[k][1];
    // optional deterministic origin PRE-SAMPLE applied to BOTH matrices, so the
    // baseline and the aggregated run assign the IDENTICAL physical trips —
    // no origin-sampling mismatch pollutes the comparison
    var oSel=null;
    if(sampleN>0){
      var oSeen=new Set(); for(var s5=0;s5<cnt;s5++) oSeen.add(O[s5]>>>0);
      var oArr=Array.from(oSeen); oArr.sort(function(a,b){ return a-b; });
      if(sampleN<oArr.length){ oSel=new Set(); var st5=oArr.length/sampleN;
        for(var s6=0;s6<sampleN;s6++) oSel.add(oArr[Math.floor(s6*st5)]); }
    }
    var BIG=1000000, agg=new Map();
    // build BOTH: the aggregated matrix AND a demand-MATCHED full-zone matrix
    // that excludes the trips the aggregation internalises, so the baseline can
    // assign exactly the same demand and the comparison measures pure routing/
    // loading error, not the missing intrazonal trips.
    var FO=[], FD=[], FV=[], dropped=0, kept=0;
    for(var i=0;i<cnt;i++){
      var o0=O[i]>>>0, d0=D[i]>>>0;
      if(oSel && !oSel.has(o0)) continue;
      var ro=rep[o0], rd=rep[d0];
      var o=(ro!==undefined)?ro:o0, d=(rd!==undefined)?rd:d0;
      var v=(typeof h2f==="function")?h2f(V[i]):V[i]; if(!(v>0)) continue;
      if(o===d){ dropped+=v; continue; }                   // intrazonal after merge
      kept+=v;
      var key=o*BIG+d; agg.set(key,(agg.get(key)||0)+v);
      FO.push(o0); FD.push(d0); FV.push(v);
    }
    var m=agg.size, O2=new Float64Array(m), D2=new Float64Array(m), V2=new Float64Array(m), j=0;
    agg.forEach(function(v2,key){ O2[j]=Math.floor(key/BIG); D2[j]=key%BIG; V2[j]=v2; j++; });
    window.__ODAGG={O:O2,D:D2,V:V2,m:m};
    window.__ODFILT={O:Float64Array.from(FO),D:Float64Array.from(FD),V:Float64Array.from(FV),m:FO.length};
    // CONNECTOR RE-DIMENSIONING: a representative zone now loads several zones'
    // demand through its own centroid connectors. Scale those connectors'
    // capacity by the demand ratio (standard practice when aggregating zones);
    // without it the aggregated equilibrium bottlenecks artificially at the
    // connectors and BPR time explodes. Applied only while the AGGREGATED
    // matrix is live (odBase toggles it), never to the matched baseline.
    window.__AGGPAIRS=pairs.length?pairs:null;
    window.__AGGCAPF_P=null;                   // (re)built lazily once GRAPH exists
    window.__AGGCAPF=buildAggCapf();           // aggod leaves the aggregated matrix live
    var r=buildODfromArrays(O2,D2,V2,m,false);
    try{ var ds=document.getElementById("demandSel"); if(ds) ds.value="od"; }catch(e){}
    var lbl = pairs.length ? "Aggregated zones" : "Full zones";
    try{ var os=document.getElementById("odStats"); if(os) os.textContent=lbl+" · "+r.cells.toLocaleString()+" OD pairs · "+Math.round(r.grand).toLocaleString()+" trips · "+r.origins.toLocaleString()+" origins"; }catch(e){}
    return {ok:true, pairs:r.cells, trips:Math.round(r.grand), origins:r.origins,
            internalised:Math.round(dropped), keptTrips:Math.round(kept)};
  }
  /* per-zone trip ends (origins + destinations summed) from the raw OD — the
     demand weights the viewer's spatial clustering uses to keep high-demand
     zones unmerged and to place cluster representatives at demand centres */
  function odEnds(){
    if(!window.__ODRAW) return {ok:false, err:"OD not loaded yet"};
    var R=window.__ODRAW, w=new Map();
    for(var i=0;i<R.cnt;i++){
      var v=(typeof h2f==="function")?h2f(R.V[i]):R.V[i];
      if(!(v>0)) continue;
      var o=R.O[i]>>>0, d=R.D[i]>>>0;
      w.set(o,(w.get(o)||0)+v); w.set(d,(w.get(d)||0)+v);
    }
    var wid=[], wv=[];
    w.forEach(function(val,id){ wid.push(id); wv.push(val); });
    return {ok:true, wid:wid, w:wv, n:wid.length};
  }
  /* build the per-link access-capacity map from the per-rep factors: zones
     attach to the network at GRAPH.znode[zone], so the ACCESS capacity of a
     representative that absorbed other zones' demand is the capacity of the
     real links incident to its attachment node. Needs GRAPH (any prior run). */
  function buildAggCapf(){
    var prs=window.__AGGPAIRS;
    if(!prs || typeof GRAPH==="undefined" || !GRAPH || !GRAPH.znode || !window.__ODRAW || typeof zoneIdIndex!=="function") return null;
    if(window.__AGGCAPF_P) return window.__AGGCAPF_P;
    var idx0=zoneIdIndex(), zn0=GRAPH.znode, R=window.__ODRAW;
    function nodeOf(id){ var zi=idx0.get(id); return (zi===undefined)?-1:zn0[zi]; }
    var ends=new Map(), i;
    for(i=0;i<R.cnt;i++){ var v=(typeof h2f==="function")?h2f(R.V[i]):R.V[i]; if(!(v>0)) continue;
      var o=R.O[i]>>>0, d=R.D[i]>>>0; ends.set(o,(ends.get(o)||0)+v); ends.set(d,(ends.get(d)||0)+v); }
    var rep=new Map();
    for(i=0;i<prs.length;i++) rep.set(prs[i][0]>>>0, prs[i][1]>>>0);
    // demand attached to each NODE before vs after aggregation — the factor is
    // per node, so merges that keep the same attachment node stay EXACTLY 1
    // (nothing relocated) and only genuinely moved demand earns capacity. The
    // OD and pairs speak zone IDs; znode is indexed by zone INDEX (zoneIdIndex).
    var before=new Map(), after=new Map();
    ends.forEach(function(w,z){
      var n0=nodeOf(z); if(n0<0) return;
      before.set(n0,(before.get(n0)||0)+w);
      var n1=nodeOf(rep.has(z)?rep.get(z):z); if(n1<0) return;
      after.set(n1,(after.get(n1)||0)+w);
    });
    var capf=new Map(), head=GRAPH.head, elink=GRAPH.elink;
    after.forEach(function(a,n){
      var b=before.get(n)||0;
      var f=(b>0)?Math.min(10,Math.max(1,a/b)):(a>0?10:1);
      if(!(f>1.001)) return;
      for(var e=head[n]; e<head[n+1]; e++){
        var g=elink[e], cur=capf.get(g)||1; if(f>cur) capf.set(g,f);
      }
    });
    if(!capf.size) return null;
    window.__AGGCAPF_P=capf;
    return capf;
  }
  /* GEHX · exact-guard aggregation (Assignment side — needs GRAPH.znode).
     Stage 1: merge zones that share a network ATTACHMENT NODE — their demand
     already loads at the identical node, so the assignment is provably
     unchanged (GEH exactly 0 on every link). Stage 2 (only if the target
     demands more): smallest trip-end zones first into the nearest surviving
     zone — the policy an offline variant race confirmed optimal (damage-
     priced orderings and penalty-steered targets all scored worse under the
     exact demand-matched protocol; "net" targets by road distance instead of
     euclidean and is available via the variant option). Moving w trips can
     worsen any link by at most w, so maxW reports the exposure. */
  function gehAgg(target, variant){
    if(typeof GRAPH==="undefined" || !GRAPH || !GRAPH.znode) return {ok:false, err:"run an assignment first (the network graph is needed)"};
    if(!window.__ODRAW || typeof zoneIdIndex!=="function") return {ok:false, err:"OD not loaded yet"};
    target=target|0;
    // znode is indexed by zone INDEX; the OD (and merge pairs) speak zone IDs —
    // zoneIdIndex() is the app's id → index map. Everything below stays in ID
    // space and translates only to look up the attachment node.
    var idx=zoneIdIndex(), zn0=GRAPH.znode, NX=GRAPH.nodeX, NY=GRAPH.nodeY;
    function nodeOf(id){ var zi=idx.get(id); return (zi===undefined)?-1:zn0[zi]; }
    var zn=nodeOf;
    var R=window.__ODRAW, ends=new Map(), i;
    for(i=0;i<R.cnt;i++){ var v=(typeof h2f==="function")?h2f(R.V[i]):R.V[i]; if(!(v>0)) continue;
      var o=R.O[i]>>>0, d=R.D[i]>>>0; ends.set(o,(ends.get(o)||0)+v); ends.set(d,(ends.get(d)||0)+v); }
    var zs=[];
    idx.forEach(function(zi,id){ if(zn0[zi]>=0) zs.push(id); });
    var alive=new Set(zs), rep=new Map(), exact=0, soft=0, maxW=0;
    // stage 1 — same attachment node (rep = the member with the most demand)
    var byNode=new Map();
    zs.forEach(function(z2){ var a=byNode.get(zn(z2)); if(!a){a=[];byNode.set(zn(z2),a);} a.push(z2); });
    byNode.forEach(function(a){ if(a.length<2) return;
      var r0=a[0], bw=-1;
      a.forEach(function(z2){ var w=ends.get(z2)||0; if(w>bw){bw=w;r0=z2;} });
      a.forEach(function(z2){ if(z2!==r0){ rep.set(z2,r0); alive.delete(z2); exact++; } });
    });
    // stage 2 — variant-selectable merge policy (raced offline, best is the
    // default). Move ORDER: "w" = smallest trip-ends first (a zero-demand
    // move is free — it cannot change any link); "wd" = lazy-greedy heap on
    // trips × distance. TARGET choice: nearest survivor, optionally penalised
    // for mutual o-d demand (those trips internalise and vanish from every
    // link between the pair) and for the GEH<5 slack of the target's
    // attachment node (a link carrying V veh tolerates ≈ 5·√V of shift);
    // "hop" prefers topologically-near targets (≤4 network hops), "cap"
    // refuses targets whose slack the move would exceed (unless forced).
    var movedTrips=0;
    var VAR=(typeof variant==="string"&&variant)||window.__GEHXVAR||"o";
    var usePen=(VAR!=="o"&&VAR!=="net"), useHop=(VAR==="hop"), useCap=(VAR==="cap"), useNet=(VAR==="net");
    var heapOrder=(VAR==="wd"||VAR==="cap");
    if(target>0 && alive.size>target){
      var CELL=3000, KEY2=1<<20, grid=new Map();
      function gk(x,y){ return Math.floor(x/CELL)*KEY2+Math.floor(y/CELL); }
      alive.forEach(function(z2){ var k=gk(NX[zn(z2)],NY[zn(z2)]); var a=grid.get(k); if(!a){a=new Set();grid.set(k,a);} a.add(z2); });
      // mutual OD demand for the likely movers — one pass over the raw OD
      var byEnds=Array.from(alive).sort(function(a,b){ return (ends.get(a)||0)-(ends.get(b)||0); });
      var movers=new Set(byEnds.slice(0, Math.min(byEnds.length, (alive.size-target)*3+50)));
      var partners=new Map(); movers.forEach(function(z2){ partners.set(z2,new Map()); });
      for(i=0;i<R.cnt;i++){ var vv=(typeof h2f==="function")?h2f(R.V[i]):R.V[i]; if(!(vv>0)) continue;
        var oo=R.O[i]>>>0, dd0=R.D[i]>>>0;
        var mo=partners.get(oo); if(mo) mo.set(dd0,(mo.get(dd0)||0)+vv);
        var md=partners.get(dd0); if(md) md.set(oo,(md.get(oo)||0)+vv); }
      // GEH<5 slack of a node = 5·√(strongest incident link volume) — only
      // meaningful when a run's flows exist; otherwise neutral
      var haveVol=(typeof baseVol!=="undefined" && baseVol && GRAPH.head && GRAPH.elink);
      var slackCache=new Map();
      function slackAt(node){
        if(!haveVol || node<0) return Infinity;
        var s=slackCache.get(node);
        if(s===undefined){
          var vmax=0;
          for(var e0=GRAPH.head[node]; e0<GRAPH.head[node+1]; e0++){
            var L0=GRAPH.elink[e0]; if(L0>=0 && baseVol[L0]>vmax) vmax=baseVol[L0]; }
          s=5*Math.sqrt(Math.max(vmax,25)); slackCache.set(node,s);
        }
        return s;
      }
      // ≤4-hop neighbourhood of a node, for topology-preferring targets
      function hopsFrom(node){
        var m=new Map(); if(node<0) return m;
        m.set(node,0); var fr=[node];
        for(var h=1;h<=4;h++){ var nx=[];
          for(var q2=0;q2<fr.length;q2++){ var n0=fr[q2];
            for(var e1=GRAPH.head[n0]; e1<GRAPH.head[n0+1]; e1++){ var n1=GRAPH.to[e1];
              if(!m.has(n1)){ m.set(n1,h); nx.push(n1); } } }
          fr=nx; if(m.size>4000) break;
        }
        return m;
      }
      // best target for zq among the nearest survivors (first occupied ring
      // +1), scored per the active variant
      function bestTarget(zq){
        var x0=NX[zn(zq)], y0=NY[zn(zq)], wq=ends.get(zq)||0, pm=partners.get(zq);
        var gx=Math.floor(x0/CELL), gy=Math.floor(y0/CELL);
        var hopMap=useHop?hopsFrom(zn(zq)):null;
        var best=-1, bs=Infinity, bestU=-1, bsU=Infinity, found=-1;
        function consider(z3){
          if(z3===zq) return;
          var dx=NX[zn(z3)]-x0, dy=NY[zn(z3)]-y0, dd=dx*dx+dy*dy;
          var sc=Math.sqrt(dd);
          if(usePen){
            var mut=pm?(pm.get(z3)||0):0, wt=ends.get(z3)||0;
            var sk=slackAt(zn(z3));
            sc*=(1+4*mut/(wq+wt+1))*(1+(sk===Infinity?0:Math.pow(wq/sk,2)));
          }
          if(useHop&&hopMap){ var hh=hopMap.get(zn(z3)); sc*=(hh===undefined?2:(0.5+hh/4)); }
          if(sc<bsU){ bsU=sc; bestU=z3; }                        // unconstrained fallback
          if(useCap && wq>slackAt(zn(z3))) return;               // hard slack cap
          if(sc<bs){ bs=sc; best=z3; }
        }
        var c0=grid.get(gx*KEY2+gy);
        if(c0&&c0.size&&!(c0.size===1&&c0.has(zq))){ found=0; c0.forEach(consider); }
        for(var ring=1; ring<=30 && (found<0 || ring<=found+1); ring++){
          for(var ox=-ring;ox<=ring;ox++) for(var oy=-ring;oy<=ring;oy++){
            if(Math.max(Math.abs(ox),Math.abs(oy))!==ring) continue;   // shell only
            var cs=grid.get((gx+ox)*KEY2+(gy+oy)); if(!cs||!cs.size) continue;
            if(found<0) found=ring;
            cs.forEach(consider);
          }
        }
        if(best<0){ best=bestU; bs=bsU; }                        // every target capped → forced
        // cost = trips × penalised distance: a zero-demand zone is FREE to
        // move (its merge cannot change any link), so it always goes first —
        // distance enters its cost only as a nearest-first tiebreak
        return best<0?null:{t:best, cost:wq*bs + bs*1e-6};
      }
      // network-distance-nearest surviving zone: bounded Dijkstra in METRES
      // from the mover's attachment node over the road graph — euclidean
      // nearest can jump a river or freeway barrier that the traffic cannot
      var nodeAlive=null;
      if(useNet){ nodeAlive=new Map();
        alive.forEach(function(z2){ var n=zn(z2); var s=nodeAlive.get(n); if(!s){s=new Set();nodeAlive.set(n,s);} s.add(z2); });
      }
      function netTarget(zq){
        var src=zn(zq); if(src<0) return null;
        var dist=new Map(); dist.set(src,0);
        var pq=[[0,src]];
        function qpush(c,n){ pq.push([c,n]); var a2=pq.length-1; while(a2>0){ var p2=(a2-1)>>1; if(pq[p2][0]<=pq[a2][0]) break; var t2=pq[p2]; pq[p2]=pq[a2]; pq[a2]=t2; a2=p2; } }
        function qpop(){ var top=pq[0], last=pq.pop(); if(pq.length){ pq[0]=last; var a2=0; for(;;){ var l2=2*a2+1, r3=l2+1, s3=a2; if(l2<pq.length&&pq[l2][0]<pq[s3][0])s3=l2; if(r3<pq.length&&pq[r3][0]<pq[s3][0])s3=r3; if(s3===a2)break; var t3=pq[a2];pq[a2]=pq[s3];pq[s3]=t3;a2=s3; } } return top; }
        var settled=0;
        while(pq.length){
          var tp=qpop(), d0=tp[0], n0=tp[1];
          var cd=dist.get(n0); if(cd!==undefined && d0>cd+1e-9) continue;   // stale
          var s0=nodeAlive.get(n0);
          if(s0){ var hit=-1; s0.forEach(function(z3){ if(hit<0&&z3!==zq) hit=z3; }); if(hit>=0) return {t:hit, cost:d0}; }
          if(d0>15000 || ++settled>40000) break;
          for(var e1=GRAPH.head[n0]; e1<GRAPH.head[n0+1]; e1++){
            var L1=GRAPH.elink[e1]; if(L1<0) continue;
            var n1=GRAPH.to[e1], nd=d0+Math.max(5,GRAPH.ELEN[L1]||30);
            var cur=dist.get(n1);
            if(cur===undefined||nd<cur){ dist.set(n1,nd); qpush(nd,n1); }
          }
        }
        return null;   // nothing reachable within 15 km of road — fall back to euclidean
      }
      function doMerge(zq2, t2){
        rep.set(zq2,t2); alive.delete(zq2); soft++;
        var wq2=ends.get(zq2)||0; if(wq2>maxW) maxW=wq2; movedTrips+=wq2;
        var sq=grid.get(gk(NX[zn(zq2)],NY[zn(zq2)])); if(sq) sq.delete(zq2);
        if(nodeAlive){ var s5=nodeAlive.get(zn(zq2)); if(s5){ s5.delete(zq2); if(!s5.size) nodeAlive.delete(zn(zq2)); } }
      }
      if(heapOrder){
        // lazy-greedy min-heap of [cost, zone]
        var hp=[];
        function hpush(c,z2){ hp.push([c,z2]); var a2=hp.length-1; while(a2>0){ var p2=(a2-1)>>1; if(hp[p2][0]<=hp[a2][0]) break; var t2=hp[p2]; hp[p2]=hp[a2]; hp[a2]=t2; a2=p2; } }
        function hpop(){ var top=hp[0], last=hp.pop(); if(hp.length){ hp[0]=last; var a2=0; for(;;){ var l2=2*a2+1, r3=l2+1, s3=a2; if(l2<hp.length&&hp[l2][0]<hp[s3][0])s3=l2; if(r3<hp.length&&hp[r3][0]<hp[s3][0])s3=r3; if(s3===a2)break; var t3=hp[a2];hp[a2]=hp[s3];hp[s3]=t3;a2=s3; } } return top; }
        alive.forEach(function(z2){ var bt0=bestTarget(z2); if(bt0) hpush(bt0.cost, z2); });
        var guard=alive.size*40;
        while(alive.size>target && hp.length && guard-->0){
          var top=hpop(), zq2=top[1];
          if(!alive.has(zq2)) continue;
          var bt=bestTarget(zq2); if(!bt) continue;
          // survivors changed since this entry was priced — re-queue if beaten
          if(hp.length && bt.cost>hp[0][0]*1.000001){ hpush(bt.cost, zq2); continue; }
          doMerge(zq2, bt.t);
        }
      } else {
        // smallest trip-ends first (free zero-demand moves lead by definition)
        for(var q3=0; q3<byEnds.length && alive.size>target; q3++){
          var zq3=byEnds[q3]; if(!alive.has(zq3)) continue;
          var bt3=useNet ? (netTarget(zq3)||bestTarget(zq3)) : bestTarget(zq3);
          if(!bt3) continue;
          doMerge(zq3, bt3.t);
        }
      }
    }
    // resolve representative chains to their surviving roots
    var pairs=[];
    rep.forEach(function(r1,mem){
      var r2=r1, hop=0; while(rep.has(r2) && hop++<50) r2=rep.get(r2);
      pairs.push([mem, r2]);
    });
    return {ok:true, pairs:pairs, merged:pairs.length, zones:alive.size, total:zs.length,
            exact:exact, soft:soft, maxW:Math.round(maxW), moved:Math.round(movedTrips),
            variant:VAR, guaranteed:(soft===0), guardZones:zs.length-exact};
  }
  /* zone attachment-node + trip-end table for the Viewer's GEHX dropdown mode:
     the Viewer has no graph, so the container ferries this across once. */
  function gehData(){
    if(!window.__ODRAW || typeof zoneIdIndex!=="function") return {ok:false, err:"OD not loaded yet"};
    if(typeof GRAPH==="undefined" || !GRAPH || !GRAPH.znode) return {ok:false, err:"graph unavailable"};
    var idx=zoneIdIndex(), zn=GRAPH.znode, R=window.__ODRAW;
    var ends=new Map(), i;
    for(i=0;i<R.cnt;i++){ var v=(typeof h2f==="function")?h2f(R.V[i]):R.V[i]; if(!(v>0)) continue;
      var o=R.O[i]>>>0, d=R.D[i]>>>0; ends.set(o,(ends.get(o)||0)+v); ends.set(d,(ends.get(d)||0)+v); }
    var ids=[], nd=[], w=[];
    idx.forEach(function(zi,id){ if(zn[zi]<0) return;
      ids.push(id); nd.push(zn[zi]); w.push(ends.get(id)||0); });
    return {ok:true, ids:ids, nd:nd, w:w, n:ids.length};
  }
  /* switch the live OD between the stored matrices: the MATCHED full-zone
     baseline ("filt"), the aggregated one ("agg"), or the original raw ("full") */
  function odBase(which){
    if(typeof buildODfromArrays!=="function") return {ok:false, err:"no builder"};
    var src2 = which==="filt" ? window.__ODFILT : which==="agg" ? window.__ODAGG : null;
    // access re-dimensioning belongs ONLY to the aggregated zone system
    window.__AGGCAPF = (which==="agg") ? buildAggCapf() : null;
    if(which==="full"){
      if(!window.__ODRAW) return {ok:false, err:"no raw OD"};
      var W0=window.__ODRAW, r0=buildODfromArrays(W0.O,W0.D,W0.V,W0.cnt,true);
      return {ok:true, which:"full", pairs:r0.cells, origins:r0.origins};
    }
    if(!src2) return {ok:false, err:"no stored matrix "+which};
    var r=buildODfromArrays(src2.O,src2.D,src2.V,src2.m,false);
    try{ var ds=document.getElementById("demandSel"); if(ds) ds.value="od"; }catch(e){}
    return {ok:true, which:which, pairs:r.cells, trips:Math.round(r.grand), origins:r.origins};
  }

  /* ---- corridor benefit appraisal (Assignment side) ----
     Build a per-link 2025-base capacity factor over the 2040 GLINK:
       factor = (lanes25 * cap(class25)) / (lanes40 * cap(class40))
     so a NEW link (lanes25=0) ≈ absent, a WIDENING / TYPE-UPGRADE drops to its
     2025 capacity. apprSet then restores one corridor to 2040 (factor 1) for the
     "do-something" run; the difference in VHT is that corridor's benefit. */
  function apprInit(ups){
    if(typeof GLINK==="undefined" || !GLINK) return {ok:false, err:"network not built"};
    // key = A*1e9+B: exact while node ids ≤ 9e6 (this network's max is ~6.3e6,
    // so the key stays below 2^53 and decodes uniquely — no collisions)
    var m=GLINK.m, A=GLINK.A, B=GLINK.B, BIG=1e9;
    var ab=new Map(); for(var g=0; g<m; g++){ ab.set(A[g]*BIG+B[g], g); ab.set(B[g]*BIG+A[g], g); }
    var fac=new Float32Array(m); for(var i=0;i<m;i++) fac[i]=1;
    var matched=0, miss=0;
    function cap25(t){ try{ return classCap(ltClass(t)); }catch(e){ return null; } }
    for(var k=0;k<ups.length;k++){ var u=ups[k]; var key=u[0]*BIG+u[1]; var g=ab.get(key);
      if(g===undefined){ miss++; continue; } matched++;
      var n25=u[3]||0, n40=u[4]||0, t25=u[5];
      // new road absent in 2025 → very low capacity (the v/c clamp keeps it from
      // exploding while still strongly deterring use); widening/type-upgrade →
      // its 2025 capacity = (lanes25*cap(class25)) / (lanes40*cap(class40))
      if(n25<=0){ fac[g]=0.03; continue; }
      var c25=cap25(t25), c40; try{ c40=classCap(GLINK.cls[g]); }catch(e){ c40=null; }
      var f=(c25&&c40&&n40>0) ? (n25*c25)/(n40*c40) : (n40>0? n25/n40 : 1);
      if(!(f>0)) f=0.05; if(f>1) f=1; fac[g]=f;
    }
    window.__APPRBASE=fac; window.__APPRAB=ab;
    window.__APPRCLAMP=4;                                     // bound v/c during appraisal
    return {ok:true, matched:matched, missing:miss, links:ups.length};
  }
  function apprSet(restore){
    if(!window.__APPRBASE) return {ok:false, err:"appraisal not initialised"};
    var fac=window.__APPRBASE.slice(), ab=window.__APPRAB, BIG=1e9, n=0;
    if(restore){ for(var i=0;i<restore.length;i++){ var g=ab.get(restore[i][0]*BIG+restore[i][1]); if(g!==undefined){ fac[g]=1; n++; } } }
    window.__YEARCAPF=fac; return {ok:true, restored:n};
  }
  function apprClear(){ window.__YEARCAPF=null; window.__APPRCLAMP=null; return {ok:true}; }
  function apprMetrics(){ var bm=(typeof baseMet!=="undefined")?baseMet:null; return {ok:!!bm, vht:bm?bm.vht:0, vmt:bm?bm.vmt:0, over:bm?bm.over:0}; }

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
        case "getval": (function(){ var el=$(m.id); out = el ? {ok:true, value:(el.value!==undefined?el.value:null)} : {ok:false, err:"no element"}; })(); break;
        case "open":  out = openDetails(m.text); break;
        case "bodyclass": out = bodyClass(m.name, m.on); break;
        case "section":   out = section(m.text); break;
        case "getagg":    out = getAggregation(); break;
        case "aggod":     out = aggregateOD(m.pairs||[], m.sampleN|0); break;
        case "odbase":    out = odBase(m.which); break;
        case "getview":   out = getView(); break;
        case "setview":   out = setView(m); break;
        case "getxl":     out = getXlayers(); break;
        case "setxl":     out = setXlayers(m.layers); break;
        case "getprog":   out = getProgram(); break;
        case "applyprog": out = applyProgram(m.picks||[]); break;
        case "snapfull":  out = snapFull(); break;
        case "cmpfull":   out = cmpFull(); break;
        case "expdiff":   out = exportDiff(m.minAbs); break;
        case "showbaked": out = showBaked(m); break;
        case "odends":    out = odEnds(); break;
        case "vdfcap":    window.__APPRCLAMP=(m.v>0)?m.v:null; out={ok:true, cap:window.__APPRCLAMP}; break;
        case "gehagg":    out = gehAgg(m.target, m.variant); break;
        case "gehdata":   out = gehData(); break;
        case "showdiff":  out = showDiff((m.key && window.__SCN) ? window.__SCN[m.key] : null); break;
        case "scnsave":   out = scnSave(m.key); break;
        case "getrect":   out = getRect(); break;
        case "getaggsa":  out = getAggregationStudyArea(m); break;
        case "getaggcustom": out = aggCustom(m); break;
        case "applypairs":   out = applyPairsViewer(m.pairs, m.label); break;
        case "setgehdata": {
          var gm=new Map();
          for(var gq=0; gq<(m.ids||[]).length; gq++) gm.set(m.ids[gq]>>>0, [m.nd[gq], m.w[gq]]);
          window.__GEHDATA={map:gm, n:gm.size};
          var rerun=null;
          try{ if(typeof METHOD!=="undefined" && METHOD==="gehx" && window.__CUSTAGG) rerun=window.__CUSTAGG.run("gehx"); }catch(e){}
          out={ok:true, n:gm.size, rerun:rerun&&rerun.ok?rerun.zones:null};
          break;
        }
        case "setarea":   out = setAreaMask(m.rect, m.buffer); break;
        case "cleararea": out = clearAreaMask(); break;
        case "evoready":   out = window.STEAMEvo ? STEAMEvo.ready() : {ok:false, err:"evolution module not loaded"}; break;
        case "evoanalyze": out = window.STEAMEvo ? STEAMEvo.analyze() : {ok:false, err:"evolution module not loaded"}; break;
        case "evomode":    out = window.STEAMEvo ? STEAMEvo.setMode(m.mode) : {ok:false, err:"evolution module not loaded"}; break;
        case "evolist":    out = window.STEAMEvo ? STEAMEvo.summary(m.limit) : {ok:false}; break;
        case "evoshow":    out = window.STEAMEvo ? STEAMEvo.show(m.id, m.zoom) : {ok:false}; break;
        case "evoups":     out = window.STEAMEvo ? {ok:true, ups:STEAMEvo.upgradeLinks()} : {ok:false}; break;
        case "evocorlinks":out = window.STEAMEvo ? {ok:true, links:STEAMEvo.corridorLinks(m.id)} : {ok:false}; break;
        case "evosel":     out = window.STEAMEvo ? {ok:true, sel:STEAMEvo.sel} : {ok:false}; break;
        case "apprinit":   out = apprInit(m.ups||[]); break;
        case "apprset":    out = apprSet(m.restore||[]); break;
        case "apprclear":  out = apprClear(); break;
        case "metrics":    out = apprMetrics(); break;
        case "key":   out = pressKey(m.key); break;
        case "resize": try{ if(typeof resize==="function") resize(); }catch(e){} out={ok:true}; break;
        default:      out = {ok:false, err:"unknown cmd "+m.cmd};
      }
    }catch(err){ out = {ok:false, err:String(err && err.message || err)}; }
    // out may be a Promise (async evolution commands) — resolve before replying
    Promise.resolve(out).then(function(o){
      try{ ev.source.postMessage({steam:1, resp:1, rid:m.rid, app:APP, out:o}, "*"); }catch(e){}
    }, function(e){ try{ ev.source.postMessage({steam:1, resp:1, rid:m.rid, app:APP, out:{ok:false, err:String(e)}}, "*"); }catch(_){} });
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

  /* Δ-plot filter bar (Assignment only): hide differences below a chosen
     threshold — absolute vehicles or % of the baseline flow — via a slider.
     Visible only while the map is in difference mode. */
  if(APP==="assign") (function(){
    var bar=null, slider=null, valEl=null, modeSel=null;
    function fmtV(v){ return v>=1000 ? (v/1000).toFixed(1)+"k" : String(Math.round(v)); }
    function apply(){
      var m=modeSel.value, v=+slider.value;
      window.__DIFFMIN = v>0 ? {m:m, v:v} : null;
      valEl.textContent = v>0 ? (m==="geh" ? "GEH ≥ "+v : m==="pct" ? "≥ "+v+"%" : "≥ "+fmtV(v)+" veh") : "off";
      try{ if(typeof render==="function") render(); }catch(e){}
    }
    function configSlider(){
      if(modeSel.value==="geh"){ slider.max=20; slider.step=0.5; }
      else if(modeSel.value==="pct"){ slider.max=100; slider.step=1; }
      else { var mx=Math.max(10, Math.ceil((typeof DIFFMAX!=="undefined"?DIFFMAX:1000)*1.5));
        slider.max=mx; slider.step=Math.max(1, Math.round(mx/200)); }
      slider.value=0; apply();
    }
    function build(){
      if(bar) return;
      var st=document.createElement("style"); st.textContent=
        "#diffFilter{position:fixed;bottom:46px;left:50%;transform:translateX(-50%);z-index:8;display:none;"
        +"align-items:center;gap:8px;background:rgba(13,20,34,.94);border:1px solid #2d4a74;border-radius:999px;"
        +"padding:6px 14px;font:12px system-ui,sans-serif;color:#c9d7ee;box-shadow:0 6px 20px rgba(0,0,0,.45)}"
        +"#diffFilter select{background:#0e1626;color:#c9d7ee;border:1px solid #2d4a74;border-radius:6px;padding:2px 4px;font:inherit}"
        +"#diffFilter input[type=range]{width:150px;accent-color:#7df9ff}"
        +"#diffFilter .dfv{min-width:64px;color:#7df9ff;font-weight:700}";
      document.head.appendChild(st);
      bar=document.createElement("div"); bar.id="diffFilter";
      bar.innerHTML='<span>Hide Δ below</span>'
        +'<select id="dfMode"><option value="geh" selected>GEH</option><option value="abs">veh</option><option value="pct">% of base</option></select>'
        +'<input id="dfRange" type="range" min="0" max="1000" step="1" value="0">'
        +'<span class="dfv" id="dfVal">off</span>';
      document.body.appendChild(bar);
      slider=bar.querySelector("#dfRange"); valEl=bar.querySelector("#dfVal"); modeSel=bar.querySelector("#dfMode");
      slider.addEventListener("input",apply);
      modeSel.addEventListener("change",configSlider);
    }
    var wasDiff=false;
    setInterval(function(){
      var isDiff = (typeof MODE!=="undefined" && MODE==="diff");
      if(isDiff && !bar) build();
      if(bar) bar.style.display = isDiff ? "flex" : "none";
      if(isDiff && !wasDiff && bar) configSlider();     // re-scale to this Δ's range
      wasDiff=isDiff;
    }, 350);
  })();

  function announce(){ try{ window.parent.postMessage({steam:1, resp:1, event:"ready", app:APP}, "*"); }catch(e){} }
  window.addEventListener("load", announce);
  if(document.readyState==="complete" || document.readyState==="interactive"){ setTimeout(announce, 50); }
})();
