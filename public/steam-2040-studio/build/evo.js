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
    if(!E.links) return null; var L=E.links, ups=[];
    var nNew=0,nWiden=0,nType=0,in25=0,in40=0;
    for(var i=0;i<L.n;i++){ var r25=(L.FL[i]&1), r40=(L.FL[i]&2); if(r25)in25++; if(!r40)continue; in40++;
      // MAJOR corridor improvements + interchanges only: freeways/expressways and
      // ramps. Skip connectors, local, collector and arterial upgrades.
      var ck=classKey(L.T40[i]); if(ck!=="fwy"&&ck!=="ramp") continue;
      var kind=null; if(!r25)kind="new"; else if(L.N40[i]>L.N25[i])kind="widen"; else if(L.T40[i]<L.T25[i])kind="typeup"; else continue;
      if(kind==="new")nNew++; else if(kind==="widen")nWiden++; else nType++;
      var pts=L.pts[i], lenM=0; for(var q=2;q<pts.length;q+=2){ var dx=pts[q]-pts[q-2],dy=pts[q+1]-pts[q-1]; lenM+=Math.sqrt(dx*dx+dy*dy); }
      ups.push({i:i, A:L.A[i], B:L.B[i], kind:kind, cls:ck, lenM:lenM, laneAdd:(kind==="widen"?(L.N40[i]-L.N25[i]):(kind==="new"?L.N40[i]:1))});
    }
    // union contiguous upgrades of same kind + class
    var parent=new Int32Array(ups.length); for(var u=0;u<ups.length;u++)parent[u]=u;
    function find(x){ var r=x; while(parent[r]!==r)r=parent[r]; while(parent[x]!==r){var nx=parent[x];parent[x]=r;x=nx;} return r; }
    function uni(a,b){ var ra=find(a),rb=find(b); if(ra!==rb)parent[ra]=rb; }
    var nm=new Map();
    for(var k=0;k<ups.length;k++){ for(var e=0;e<2;e++){ var nd=e?ups[k].B:ups[k].A; var a=nm.get(nd); if(!a){a=[];nm.set(nd,a);} a.push(k); } }
    for(var k2=0;k2<ups.length;k2++){ for(var e2=0;e2<2;e2++){ var nd2=e2?ups[k2].B:ups[k2].A; var a2=nm.get(nd2);
      for(var z=0;z<a2.length;z++){ var j=a2[z]; if(j>k2 && ups[j].kind===ups[k2].kind && ups[j].cls===ups[k2].cls) uni(k2,j); } } }
    var grp=new Map();
    for(var g=0;g<ups.length;g++){ var rt=find(g); var a3=grp.get(rt); if(!a3){a3=[];grp.set(rt,a3);} a3.push(g); }
    var cors=[];
    grp.forEach(function(idxs){ var f=ups[idxs[0]], lenM=0,laneKm=0,mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18;
      for(var c=0;c<idxs.length;c++){ var U=ups[idxs[c]]; lenM+=U.lenM; laneKm+=(U.lenM/1000)*Math.max(1,U.laneAdd);
        var b=E.links.bb, li=U.i*4; if(b[li]<mnx)mnx=b[li]; if(b[li+1]<mny)mny=b[li+1]; if(b[li+2]>mxx)mxx=b[li+2]; if(b[li+3]>mxy)mxy=b[li+3]; }
      cors.push({ links:idxs, kind:f.kind, cls:f.cls, n:idxs.length, lenKm:lenM/1000, laneKm:laneKm,
        bb:[mnx,mny,mxx,mxy], cx:(mnx+mxx)/2, cy:(mny+mxy)/2 }); });
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
      top:E.corridors.slice(0,limit).map(function(c,i){ return { id:i, kind:c.kind, kindLbl:KINDLBL[c.kind], cls:CLSN[c.cls]||c.cls, n:c.n, lenKm:+c.lenKm.toFixed(2), laneKm:+c.laneKm.toFixed(2) }; }) }; };
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
      +"#evoBar button.on:hover{background:#255480}";
      document.head.appendChild(st); }catch(e){}
    var bar=document.createElement("div"); bar.id="evoBar";
    var defs=[["off","2040 (full)"],["b2040","2040 roads"],["b2025","2025 roads"],["diff","Differences"]];
    bar._btns={};
    defs.forEach(function(d){ var b=document.createElement("button"); b.textContent=d[1];
      b.title = d[0]==="off" ? "The full 2040 model view (native styling, all layers)"
              : d[0]==="diff" ? "2025→2040 upgrades coloured by kind over a faint 2040 base"
              : "The "+(d[0]==="b2025"?"2025":"2040")+" road network, class-coloured for a like-for-like compare";
      b.onclick=function(){ E.setMode(d[0]); }; bar.appendChild(b); bar._btns[d[0]]=b; });
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
    // diff: colour the upgrades by kind, selected corridor haloed
    if(diff && E.corridors){ t.globalAlpha=.9;
      for(var ci=0;ci<E.corridors.length;ci++){ var c=E.corridors[ci], cb=c.bb;
        if(cb[2]<vx0||cb[0]>vx1||cb[3]<vy0||cb[1]>vy1) continue; if(ci===E.sel)continue;
        t.strokeStyle=KINDCOL[c.kind]||"#9aa"; for(var z=0;z<c.links.length;z++) stroke(E.ups[c.links[z]].i, Math.min(Math.max(1.1,sc*8),4)); }
      if(E.sel>=0 && E.corridors[E.sel]){ var s2=E.corridors[E.sel]; t.globalAlpha=1;
        t.strokeStyle="#ffffff"; for(var a=0;a<s2.links.length;a++) stroke(E.ups[s2.links[a]].i, Math.min(Math.max(3.4,sc*14),9));
        t.strokeStyle=KINDCOL[s2.kind]||"#fff"; for(var a2=0;a2<s2.links.length;a2++) stroke(E.ups[s2.links[a2]].i, Math.min(Math.max(1.8,sc*9),5)); } }
    t.globalAlpha=1;
  };

  window.STEAMEvo=E;
  // show the view toggle as soon as the Viewer is ready (data decodes lazily on
  // first use), so 2040 / 2025 / Differences is always one click away
  try{ if(document.readyState!=="loading") E._ensureUI(); else document.addEventListener("DOMContentLoaded", E._ensureUI); }catch(e){}
})();
