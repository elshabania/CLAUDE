/* STEAM 2040 Studio — Network Evolution, injected into the Viewer.
   The 2025+2040 road network (geometry + per-year LINK/LTYPE/LANE) is BAKED
   into the page as a gzipped binary (id="evo-data"), so no upload is needed.
   Provides a 2040 / 2025 / Differences view toggle that renders on a dedicated
   overlay (reusing the live map transform cx,cy,sc,W,H,DPR), plus the upgrade
   diff + corridor grouping. Corridor link node-pairs feed the benefit appraisal. */
(function(){
  "use strict";
  var KINDCOL={ new:"#39d353", widen:"#38bdf8", typeup:"#fbbf24" };
  var KINDLBL={ new:"new road", widen:"widening", typeup:"type upgrade" };
  // class styles matched to the Viewer's own LAYERS palette
  var CLS={ fwy:{c:"#ffb454",wm:26,b:.75,mx:7,a:.95}, ramp:{c:"#d98e4a",wm:12,b:.42,mx:4.5,a:.85},
            art:{c:"#8fc1e3",wm:16,b:.5,mx:5,a:.85}, coll:{c:"#5e7ca3",wm:10,b:.38,mx:4,a:.75},
            rural:{c:"#4d7d5f",wm:9,b:.35,mx:4,a:.75}, local:{c:"#3f5170",wm:7,b:.28,mx:3.5,a:.55},
            junc:{c:"#6b5a35",wm:6,b:.3,mx:3,a:.6} };
  function classKey(t){ try{ return NetBuild.classify(t)||"local"; }catch(e){ return "local"; } }
  function clsBucket(t){ if(t<10)return 0; if(t<20)return 1; if(t<30)return 2; return 3; }
  function num(buf,base,fld){ return NetBuild.toNum(NetBuild.fieldBytes(buf,base,fld)); }

  var E={ links:null, corridors:null, sel:-1, mode:"off", overlay:null, octx:null, raf:0, _lastKey:"", data:null, _loading:false, ui:null };

  /* ---- decode the baked gzipped binary into the link table ---- */
  async function gunzip(u8){
    var ds=new DecompressionStream("gzip");
    var blob=new Blob([u8]); var stream=blob.stream().pipeThrough(ds);
    var ab=await new Response(stream).arrayBuffer(); return new Uint8Array(ab);
  }
  E.loadBaked=async function(){
    if(E.links) return true; if(E._loading) return false; E._loading=true;
    try{
      var el=document.getElementById("evo-data"); if(!el) { E._loading=false; return false; }
      var b64=el.textContent.trim(); var bin=atob(b64); var raw=new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++) raw[i]=bin.charCodeAt(i);
      var bytes=await gunzip(raw);
      var dv=new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var p=0, n=dv.getUint32(p,true); p+=4;
      var AA=new Int32Array(n),BB=new Int32Array(n),FL=new Uint8Array(n),N25=new Uint8Array(n),N40=new Uint8Array(n),T25=new Int16Array(n),T40=new Int16Array(n);
      var pts=new Array(n), bb=new Float32Array(n*4);
      for(var k=0;k<n;k++){
        AA[k]=dv.getInt32(p,true);p+=4; BB[k]=dv.getInt32(p,true);p+=4;
        FL[k]=dv.getUint8(p);p+=1; N25[k]=dv.getUint8(p);p+=1; N40[k]=dv.getUint8(p);p+=1;
        T25[k]=dv.getInt16(p,true);p+=2; T40[k]=dv.getInt16(p,true);p+=2;
        var np=dv.getUint16(p,true);p+=2; var arr=new Float64Array(np*2);
        var mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18;
        for(var q=0;q<np;q++){ var x=dv.getInt32(p,true);p+=4; var y=dv.getInt32(p,true);p+=4; arr[q*2]=x; arr[q*2+1]=y;
          if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; }
        pts[k]=arr; bb[k*4]=mnx; bb[k*4+1]=mny; bb[k*4+2]=mxx; bb[k*4+3]=mxy;
      }
      E.links={ n:n, A:AA, B:BB, FL:FL, N25:N25, N40:N40, T25:T25, T40:T40, pts:pts, bb:bb };
      E._loading=false; return true;
    }catch(err){ E._loading=false; E._err=String(err); return false; }
  };

  /* ---- upgrade diff + corridor grouping (works on the baked link table) ---- */
  E.computeDiff=function(){
    if(!E.links) return null; var L=E.links;
    var in25=0,in40=0, cand=[], minor=[];
    for(var i=0;i<L.n;i++){ var r25=(L.FL[i]&1), r40=(L.FL[i]&2); if(r25)in25++; if(!r40)continue; in40++;
      var kind=null; if(!r25)kind="new"; else if(L.N40[i]>L.N25[i])kind="widen"; else if(L.T40[i]<L.T25[i])kind="typeup"; else continue;
      var pts=L.pts[i], lenM=0; for(var q=2;q<pts.length;q+=2){ var dx=pts[q]-pts[q-2],dy=pts[q+1]-pts[q-1]; lenM+=Math.sqrt(dx*dx+dy*dy); }
      var ck=classKey(L.T40[i]);
      var rec={i:i, A:L.A[i], B:L.B[i], kind:kind, cls:ck, lenM:lenM, laneAdd:(kind==="widen"?(L.N40[i]-L.N25[i]):(kind==="new"?L.N40[i]:1))};
      // majors seed corridors; changed links of the other classes (interchange
      // slip roads / turning loops are often coded collector or local) can only
      // ATTACH to a nearby major scheme — they never form corridors themselves
      if(ck==="fwy"||ck==="ramp"||ck==="junc") cand.push(rec); else minor.push(rec);
    }
    // union rule among majors: same-kind+class chains form the mainlines, and
    // any touching ramp / junction / signal element glues onto its improvement
    var parent=new Int32Array(cand.length); for(var u=0;u<cand.length;u++)parent[u]=u;
    function find(x){ var r=x; while(parent[r]!==r)r=parent[r]; while(parent[x]!==r){var nx=parent[x];parent[x]=r;x=nx;} return r; }
    function uni(a,b){ var ra=find(a),rb=find(b); if(ra!==rb)parent[ra]=rb; }
    var nm=new Map();
    for(var k=0;k<cand.length;k++){ for(var e=0;e<2;e++){ var nd=e?cand[k].B:cand[k].A; var a=nm.get(nd); if(!a){a=[];nm.set(nd,a);} a.push(k); } }
    for(var k2=0;k2<cand.length;k2++){ for(var e2=0;e2<2;e2++){ var a2=nm.get(e2?cand[k2].B:cand[k2].A);
      for(var z=0;z<a2.length;z++){ var j=a2[z]; if(j<=k2) continue;
        var glue = (cand[j].kind===cand[k2].kind && cand[j].cls===cand[k2].cls)
                || cand[j].cls==="ramp"||cand[j].cls==="junc"||cand[k2].cls==="ramp"||cand[k2].cls==="junc";
        if(glue) uni(k2,j); } } }
    // corridors = major groups that contain mainline/ramp content
    var grp=new Map();
    for(var g=0;g<cand.length;g++){ var rt=find(g); var a3=grp.get(rt); if(!a3){a3=[];grp.set(rt,a3);} a3.push(g); }
    var groups=[];
    grp.forEach(function(idxs){
      for(var c0=0;c0<idxs.length;c0++){ var cl0=cand[idxs[c0]].cls;
        if(cl0==="fwy"||cl0==="ramp"){ groups.push(idxs.map(function(x){ return cand[x]; })); return; } }
    });
    // attach minor-class changed links within 2 connections of a corridor —
    // this pulls in the interchange's slip roads and turning loops without
    // chaining whole arterial/collector corridors into the scheme
    var owner=new Map();
    for(var gi=0;gi<groups.length;gi++){ var G=groups[gi];
      for(var m0=0;m0<G.length;m0++){ owner.set(G[m0].A,gi); owner.set(G[m0].B,gi); } }
    var HOPS=2, attached=new Int32Array(minor.length); for(i=0;i<minor.length;i++) attached[i]=-1;
    for(var hop=0;hop<HOPS;hop++){
      var added=false;
      for(var mi=0;mi<minor.length;mi++){ if(attached[mi]>=0) continue; var M=minor[mi];
        var o=owner.get(M.A); if(o===undefined) o=owner.get(M.B);
        if(o!==undefined){ attached[mi]=o; groups[o].push(M); owner.set(M.A,o); owner.set(M.B,o); added=true; } }
      if(!added) break;
    }
    // finalise corridors + the kept upgrade-link list
    var ups=[], cors=[], nNew=0,nWiden=0,nType=0;
    for(var gi2=0;gi2<groups.length;gi2++){ var idur=groups[gi2];
      var links=[], lenM2=0,laneKm=0,mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18;
      var nRamp=0,nJunc=0,nMinor=0, kindKm={}, fwyKm=0, rampKm=0;
      for(var c=0;c<idur.length;c++){ var U=idur[c];
        links.push(ups.length); ups.push(U);
        if(U.kind==="new")nNew++; else if(U.kind==="widen")nWiden++; else nType++;
        lenM2+=U.lenM; var lk=(U.lenM/1000)*Math.max(1,U.laneAdd); laneKm+=lk;
        kindKm[U.kind]=(kindKm[U.kind]||0)+lk;
        if(U.cls==="fwy") fwyKm+=lk; else if(U.cls==="ramp"){ rampKm+=lk; nRamp++; }
        else if(U.cls==="junc") nJunc++; else nMinor++;
        var b=L.bb, li=U.i*4; if(b[li]<mnx)mnx=b[li]; if(b[li+1]<mny)mny=b[li+1]; if(b[li+2]>mxx)mxx=b[li+2]; if(b[li+3]>mxy)mxy=b[li+3]; }
      var kind="new",bestKm=-1; for(var kk in kindKm){ if(kindKm[kk]>bestKm){bestKm=kindKm[kk];kind=kk;} }
      cors.push({ links:links, kind:kind, cls:(fwyKm>=rampKm?"fwy":"ramp"), n:links.length, nRamp:nRamp, nJunc:nJunc, nMinor:nMinor,
        lenKm:lenM2/1000, laneKm:laneKm, bb:[mnx,mny,mxx,mxy], cx:(mnx+mxx)/2, cy:(mny+mxy)/2 });
    }
    cors.sort(function(a,b){ return b.laneKm-a.laneKm; });
    E.ups=ups; E.corridors=cors;
    E.data={ corridors:cors, stats:{ in25:in25, in40:in40, nUp:ups.length, nNew:nNew, nWiden:nWiden, nType:nType, nCorr:cors.length } };
    return E.data;
  };

  /* ---- public API ---- */
  E.ready=async function(){ if(!(await E.loadBaked())) return {ok:false, err:E._err||"baked network not found"};
    if(!E.data) E.computeDiff(); E._ensureUI(); return {ok:true, stats:E.data.stats}; };
  E.analyze=async function(){ var r=await E.ready(); if(!r.ok) return r; E.setMode("diff"); return {ok:true, stats:E.data.stats}; };
  E.summary=function(limit){ if(!E.data) return {ok:false}; limit=limit||25;
    var CLSN={fwy:"freeway/expressway", ramp:"ramp/interchange"};
    return { ok:true, stats:E.data.stats, total:E.corridors.length,
      top:E.corridors.slice(0,limit).map(function(c,i){ return { id:i, kind:c.kind, kindLbl:KINDLBL[c.kind], cls:CLSN[c.cls]||c.cls, n:c.n, nRamp:c.nRamp||0, nJunc:c.nJunc||0, nMinor:c.nMinor||0, lenKm:+c.lenKm.toFixed(2), laneKm:+c.laneKm.toFixed(2) }; }) }; };
  E.corridorLinks=function(id){ if(!E.corridors||!E.corridors[id])return null;
    return E.corridors[id].links.map(function(k){ var U=E.ups[k]; return [U.A,U.B,U.kind,U.laneAdd]; }); };
  /* all major upgrade links [A,B,kind,lanes2025,lanes2040,ltype2025] — feeds the
     Assignment app's do-something-vs-2025 benefit appraisal */
  E.upgradeLinks=function(){ if(!E.ups||!E.links)return null; var L=E.links;
    return E.ups.map(function(U){ return [U.A,U.B,U.kind,L.N25[U.i],L.N40[U.i],L.T25[U.i]]; }); };
  E.show=function(id, zoom){ if(!E.corridors)return {ok:false}; E.sel=(id==null?-1:id|0); if(E.mode==="off")E.setMode("diff");
    if(zoom!==false && E.sel>=0 && E.corridors[E.sel]){ var c=E.corridors[E.sel], b=c.bb;
      var bw=Math.max(400,b[2]-b[0]), bh=Math.max(400,b[3]-b[1]);
      try{ cx=c.cx; cy=c.cy; sc=Math.min(W/(bw*1.3), H/(bh*1.3)); if(typeof clampScale==="function")clampScale(); if(typeof render==="function")render(); }catch(e){} }
    E._lastKey=""; return {ok:true, sel:E.sel}; };

  E.setMode=async function(mode){
    if(mode!=="off"){ var r=await E.ready(); if(!r.ok) return r; }
    E.mode=mode; E._lastKey="";
    if(mode!=="diff") E._hideCard&&E._hideCard();
    if(mode==="off"){ if(E.overlay)E.overlay.style.display="none"; E._stop(); }
    else { E._ensureOverlay(); E.overlay.style.display="block"; E._start(); }
    E._syncUI();
    if(typeof render==="function") render();
    return {ok:true, mode:mode, stats:E.data?E.data.stats:null};
  };

  /* ---- toggle UI (in the Viewer) ---- */
  E._ensureUI=function(){
    if(E.ui) return;
    // hover/active styling can't be done inline — inject a tiny stylesheet
    try{ var st=document.createElement("style"); st.textContent=
      "#evoBar{position:fixed;top:54px;left:50%;transform:translateX(-50%);z-index:9;display:flex;gap:3px;"
      +"background:rgba(13,20,34,.92);border:1px solid #2d4a74;border-radius:999px;padding:4px;"
      +"backdrop-filter:blur(6px);box-shadow:0 6px 20px rgba(0,0,0,.45);font:600 12px system-ui,sans-serif}"
      +"#evoBar button{cursor:pointer;border:0;border-radius:999px;padding:5px 12px;color:#cfe0f5;"
      +"background:transparent;font:inherit;transition:background .15s,color .15s}"
      +"#evoBar button:hover{background:#16324f;color:#fff}"
      +"#evoBar button.on{background:#1d4368;color:#fff}"
      +"#evoBar button.on:hover{background:#255480}"
      +"#evoBar .sep{width:1px;background:#2d4a74;margin:3px 2px}"
      +"#evoBar button.rank{color:#ffd60a}"
      +"#evoBar button.rank:hover{background:#3a3110;color:#ffe14d}";
      document.head.appendChild(st); }catch(e){}
    var bar=document.createElement("div"); bar.id="evoBar";
    var defs=[["off","2040 (full)"],["b2040","2040 roads"],["b2025","2025 roads"],["diff","Differences"]];
    bar._btns={};
    defs.forEach(function(d){ var b=document.createElement("button"); b.textContent=d[1];
      b.title = d[0]==="off" ? "The full 2040 model view (native styling, all layers)"
              : d[0]==="diff" ? "2025→2040 upgrades coloured by kind over a faint 2040 base"
              : "The "+(d[0]==="b2025"?"2025":"2040")+" road network, class-coloured for a like-for-like compare";
      b.onclick=function(){ E.setMode(d[0]); }; bar.appendChild(b); bar._btns[d[0]]=b; });
    // rank the 2040 improvements: hands off to the copilot's corridor appraisal
    var sep=document.createElement("div"); sep.className="sep"; bar.appendChild(sep);
    var rb=document.createElement("button"); rb.className="rank"; rb.textContent="★ Rank improvements";
    rb.title="Appraise the top 2025→2040 corridors: add each to the 2025 base, assign the 2040 demand, and rank by veh-h saved per lane-km";
    rb.onclick=function(){ try{ window.parent.postMessage({steam:1, resp:1, event:"evorank", app:"viewer"}, "*"); }catch(e){} };
    bar.appendChild(rb);
    document.body.appendChild(bar); E.ui=bar; E._syncUI();
  };
  E._syncUI=function(){ if(!E.ui)return; var m=E.mode;
    for(var k in E.ui._btns) E.ui._btns[k].classList.toggle("on", k===m); };

  /* ---- overlay rendering ---- */
  E._ensureOverlay=function(){ if(E.overlay){ E.overlay.style.display="block"; return; }
    var cv=document.createElement("canvas"); cv.id="evoOverlay";
    cv.style.cssText="position:fixed;left:0;top:0;pointer-events:none";
    // sit directly ABOVE the map canvas but BELOW every native control (zoom
    // buttons, scale bar, header/footer, minimap) so the app's own UI and
    // landmarks stay visible in the 2025/2040/Differences views
    var map=document.getElementById("map");
    if(map && map.parentNode) map.insertAdjacentElement("afterend", cv);
    else document.body.appendChild(cv);
    E.overlay=cv; E.octx=cv.getContext("2d"); };
  E._start=function(){ if(E.raf)return; var loop=function(){ E.raf=requestAnimationFrame(loop); E._draw(); }; E.raf=requestAnimationFrame(loop); };
  E._stop=function(){ if(E.raf){ cancelAnimationFrame(E.raf); E.raf=0; } };
  E._bg=function(){ try{ if(typeof THEME!=="undefined"&&THEME&&THEME.mapBg) return THEME.mapBg; }catch(e){} return "#0a0e16"; };
  E._draw=function(){
    if(!E.links||!E.overlay||E.mode==="off") return;
    var dpr=(typeof DPR!=="undefined"?DPR:1), w=W, h=H;
    if(E.overlay.width!==Math.round(w*dpr)||E.overlay.height!==Math.round(h*dpr)){
      E.overlay.width=Math.round(w*dpr); E.overlay.height=Math.round(h*dpr); E.overlay.style.width=w+"px"; E.overlay.style.height=h+"px"; }
    var key=E.mode+"|"+cx+"|"+cy+"|"+sc+"|"+w+"|"+h+"|"+E.sel; if(key===E._lastKey)return; E._lastKey=key;
    var t=E.octx; t.setTransform(dpr,0,0,dpr,0,0); t.fillStyle=E._bg(); t.fillRect(0,0,w,h);
    var hw=w/2,hh=h/2, L=E.links, bb=L.bb;
    var vx0=cx-hw/sc, vx1=cx+hw/sc, vy0=cy-hh/sc, vy1=cy+hh/sc;
    t.lineCap="round"; t.lineJoin="round";
    function stroke(i,wd){ var p=L.pts[i]; if(p.length<4)return; t.beginPath(); t.moveTo((p[0]-cx)*sc+hw, hh-(p[1]-cy)*sc);
      for(var q=2;q<p.length;q+=2) t.lineTo((p[q]-cx)*sc+hw, hh-(p[q+1]-cy)*sc); t.lineWidth=wd; t.stroke(); }
    var diff=(E.mode==="diff"), yearBit=(E.mode==="b2025")?1:2, useT25=(E.mode==="b2025");
    // base network for the chosen year (or faint full-2040 under the diff)
    for(var i=0;i<L.n;i++){ var lb=i*4; if(bb[lb+2]<vx0||bb[lb]>vx1||bb[lb+3]<vy0||bb[lb+1]>vy1) continue;
      if(diff){ if(!(L.FL[i]&2))continue; t.strokeStyle="#33415c"; t.globalAlpha=.5; stroke(i, Math.min(Math.max(.5,sc*7),3)); }
      else { if(!(L.FL[i]&yearBit))continue; var st=CLS[classKey(useT25?L.T25[i]:L.T40[i])]||CLS.local;
        t.strokeStyle=st.c; t.globalAlpha=st.a; stroke(i, Math.min(Math.max(st.b, st.wm*sc), st.mx)); } }
    // diff: colour each upgrade link by ITS kind (a corridor can now mix its
    // mainline with attached ramps/junction links), selected corridor haloed
    if(diff && E.corridors){ t.globalAlpha=.9;
      var wd0=Math.min(Math.max(1.1,sc*8),4);
      for(var ci=0;ci<E.corridors.length;ci++){ var c=E.corridors[ci], cb=c.bb;
        if(cb[2]<vx0||cb[0]>vx1||cb[3]<vy0||cb[1]>vy1) continue; if(ci===E.sel)continue;
        for(var z=0;z<c.links.length;z++){ var U0=E.ups[c.links[z]];
          t.strokeStyle=KINDCOL[U0.kind]||"#9aa"; stroke(U0.i, wd0); } }
      if(E.sel>=0 && E.corridors[E.sel]){ var s2=E.corridors[E.sel]; t.globalAlpha=1;
        t.strokeStyle="#ffffff"; for(var a=0;a<s2.links.length;a++) stroke(E.ups[s2.links[a]].i, Math.min(Math.max(3.4,sc*14),9));
        var wd1=Math.min(Math.max(1.8,sc*9),5);
        for(var a2=0;a2<s2.links.length;a2++){ var U1=E.ups[s2.links[a2]];
          t.strokeStyle=KINDCOL[U1.kind]||"#fff"; stroke(U1.i, wd1); } } }
    t.globalAlpha=1;
  };

  /* ---- project selection on the map (Differences view) ---- */
  E.pick=function(px0,py0){
    if(!E.corridors) return -1;
    var wx=cx+(px0-W/2)/sc, wy=cy-(py0-H/2)/sc, tol=12/sc, t2=tol*tol;
    var best=-1, bd=t2;
    for(var ci=0;ci<E.corridors.length;ci++){ var c=E.corridors[ci], b=c.bb;
      if(wx<b[0]-tol||wx>b[2]+tol||wy<b[1]-tol||wy>b[3]+tol) continue;
      for(var z=0;z<c.links.length;z++){ var p=E.links.pts[E.ups[c.links[z]].i];
        for(var q=2;q<p.length;q+=2){
          var x1=p[q-2],y1=p[q-1],x2=p[q],y2=p[q+1], dx=x2-x1,dy=y2-y1;
          var L2=dx*dx+dy*dy, t=L2>0?Math.max(0,Math.min(1,((wx-x1)*dx+(wy-y1)*dy)/L2)):0;
          var qx=x1+t*dx-wx, qy=y1+t*dy-wy, dd=qx*qx+qy*qy;
          if(dd<bd){ bd=dd; best=ci; } } } }
    return best;
  };
  E._card=null;
  E._hideCard=function(){ if(E._card) E._card.style.display="none"; };
  E._showCard=function(id){
    var c=E.corridors[id]; if(!c) return;
    if(!E._card){
      var d=document.createElement("div"); d.id="evoCard";
      d.style.cssText="position:fixed;top:104px;left:50%;transform:translateX(-50%);z-index:9;"
        +"background:rgba(13,20,34,.95);border:1px solid #2d4a74;border-radius:12px;padding:10px 12px;"
        +"box-shadow:0 8px 26px rgba(0,0,0,.5);font:12px system-ui,sans-serif;color:#d7e1f2;max-width:430px";
      document.body.appendChild(d); E._card=d;
    }
    var lbl={new:"new road",widen:"widening",typeup:"type upgrade"}[c.kind]||c.kind;
    var cls=c.cls==="fwy"?"freeway/expressway":"ramp/interchange";
    var bits=[]; if(c.nRamp)bits.push(c.nRamp+" ramp"); if(c.nJunc)bits.push(c.nJunc+" signal");
    if(c.nMinor)bits.push(c.nMinor+" slip/approach");
    E._card.innerHTML='<b style="color:#ffd60a">Project '+(id+1)+'</b> · '+lbl+' · '+cls
      +'<br><span style="color:#9fb0c8">'+c.n+' links · '+c.lenKm.toFixed(1)+' km · '
      +c.laneKm.toFixed(1)+' lane-km'+(bits.length?' · incl. '+bits.join(" + "):"")+'</span>'
      +'<div style="margin-top:8px;display:flex;gap:6px">'
      +'<button id="evoEvalBtn" style="cursor:pointer;border:0;border-radius:8px;padding:6px 12px;background:#ffd60a;color:#0b1018;font-weight:700;font:inherit">★ Evaluate benefits</button>'
      +'<button id="evoCardX" style="cursor:pointer;border:1px solid #2d4a74;border-radius:8px;padding:6px 10px;background:#0e1626;color:#9fb0c8;font:inherit">✕</button></div>';
    E._card.style.display="block";
    document.getElementById("evoEvalBtn").onclick=function(){
      try{ window.parent.postMessage({steam:1, resp:1, event:"evoeval", id:id, app:"viewer"}, "*"); }catch(e){} };
    document.getElementById("evoCardX").onclick=function(){ E.sel=-1; E._lastKey=""; E._hideCard(); };
  };
  (function(){
    var downX=0, downY=0;
    function arm(){
      var map=document.getElementById("map"); if(!map) return;
      map.addEventListener("pointerdown",function(e){ downX=e.clientX; downY=e.clientY; },true);
      map.addEventListener("click",function(e){
        if(E.mode!=="diff") return;
        if(Math.hypot(e.clientX-downX,e.clientY-downY)>5) return;   // that was a pan
        var id=E.pick(e.clientX,e.clientY);
        if(id>=0){ E.sel=id; E._lastKey=""; E._showCard(id); e.stopImmediatePropagation(); e.preventDefault(); }
        else { E.sel=-1; E._lastKey=""; E._hideCard(); }
      },true);
    }
    if(document.readyState!=="loading") arm(); else document.addEventListener("DOMContentLoaded",arm);
  })();

  window.STEAMEvo=E;
  // show the view toggle as soon as the Viewer is ready (data decodes lazily on
  // first use), so 2040 / 2025 / Differences is always one click away
  try{ if(document.readyState!=="loading") E._ensureUI(); else document.addEventListener("DOMContentLoaded", E._ensureUI); }catch(e){}
})();
