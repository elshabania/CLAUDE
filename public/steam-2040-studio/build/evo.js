/* STEAM 2040 Studio — Network Evolution (2025 → 2040) analysis, injected into
   the Viewer so it can reuse the shapefile parsers (dbfHeader/fieldBytes/
   parseShp/toNum) and the live map transform (cx,cy,sc,W,H,DPR). It compares
   two horizon-year networks from ONE uploaded shapefile, finds the upgrades
   (new roads + widenings + type upgrades), groups them into corridors, and
   draws them as a coloured overlay over the map. Benefit appraisal lives in
   the Assignment app and consumes STEAMEvo.corridorLinks(). */
(function(){
  "use strict";
  var KINDCOL={ new:"#39d353", widen:"#38bdf8", typeup:"#fbbf24" };
  var KINDLBL={ new:"new road", widen:"widening", typeup:"type upgrade" };
  var CLSN=["fwy/expr","arterial","collector","local/rural"];
  function clsOf(t){ if(t<10)return 0; if(t<20)return 1; if(t<30)return 2; return 3; }
  var E={ data:null, sel:-1, overlay:null, octx:null, raf:0, _lastKey:"" };

  // the shapefile parsers are private to NetBuild — use its public handles
  function num(buf,base,fld){ var s=NetBuild.fieldBytes(buf,base,fld); return NetBuild.toNum(s); }

  /* parse one shapefile (already in window.__NETBUF) into per-link year attrs +
     geometry, then diff yearA→yearB. Road links only (LTYPE in [0,45)). */
  E.analyze=function(yearA,yearB,onProg){
    yearA=yearA||2025; yearB=yearB||2040;
    if(!window.__NETBUF || !window.__NETBUF.dbf || !window.__NETBUF.shp)
      return {ok:false, err:"Load the network shapefile first (Load panel), then run me again."};
    try{
      var dbf=window.__NETBUF.dbf, shpBuf=window.__NETBUF.shp;
      var hd=NetBuild.dbfHeader(dbf), byName={}; for(var fi=0;fi<hd.fields.length;fi++) byName[hd.fields[fi].name]=hd.fields[fi];
      function F(n){ return byName[n]; }
      var need=["A","B","LINK_"+yearA,"LTYPE_"+yearA,"LANE_"+yearA,"LINK_"+yearB,"LTYPE_"+yearB,"LANE_"+yearB];
      for(var ni=0;ni<need.length;ni++) if(!F(need[ni])) return {ok:false, err:"Shapefile is missing field "+need[ni]+" — needs LINK_/LTYPE_/LANE_ for "+yearA+" and "+yearB+"."};
      var shapes=NetBuild.parseShp(shpBuf);
      var N=Math.min(shapes.length, hd.nRec);
      var ups=[];                      // upgrade links {A,B,kind,cls,pts,lenM,laneAdd}
      var nNew=0,nWiden=0,nType=0, in25=0,in40=0;
      var aF=F("A"),bF=F("B"), lA=F("LINK_"+yearA),tA=F("LTYPE_"+yearA),nA=F("LANE_"+yearA),
          lB=F("LINK_"+yearB),tB=F("LTYPE_"+yearB),nB=F("LANE_"+yearB);
      for(var i=0;i<N;i++){
        var base=hd.hdrLen+i*hd.recLen;
        var li_B = num(dbf,base,lB)===1, t_B=num(dbf,base,tB);
        if(t_B===null) t_B=99;
        var isRoadB = li_B && t_B>=0 && t_B<45;
        var li_A = num(dbf,base,lA)===1, t_A=num(dbf,base,tA); if(t_A===null) t_A=99;
        var isRoadA = li_A && t_A>=0 && t_A<45;
        if(isRoadA) in25++;
        if(!isRoadB) continue; in40++;
        var n_A=num(dbf,base,nA)||0, n_B=num(dbf,base,nB)||0;
        var kind=null;
        if(!isRoadA) kind="new";
        else if(n_B>n_A) kind="widen";
        else if(t_B<t_A) kind="typeup";
        else continue;
        if(kind==="new")nNew++; else if(kind==="widen")nWiden++; else nType++;
        var a=num(dbf,base,aF)|0, b=num(dbf,base,bF)|0;
        var pts=shapes[i]||[];
        // length in world units (metres) from the polyline
        var lenM=0; for(var p=2;p<pts.length;p+=2){ var ddx=pts[p]-pts[p-2], ddy=pts[p+1]-pts[p-1]; lenM+=Math.sqrt(ddx*ddx+ddy*ddy); }
        var laneAdd = kind==="widen" ? (n_B-n_A) : (kind==="new" ? n_B : 1);
        ups.push({A:a,B:b,kind:kind,cls:clsOf(t_B),pts:pts,lenM:lenM,laneAdd:laneAdd});
        if(onProg && (i&8191)===0) onProg(i,N);
      }
      // group into corridors: union upgrade links that share a node AND have the
      // same kind AND same class (so distinct schemes don't merge at junctions)
      var parent=new Int32Array(ups.length); for(var u=0;u<ups.length;u++) parent[u]=u;
      function find(x){ var r=x; while(parent[r]!==r)r=parent[r]; while(parent[x]!==r){ var nx=parent[x]; parent[x]=r; x=nx; } return r; }
      function uni(p,q){ var rp=find(p),rq=find(q); if(rp!==rq)parent[rp]=rq; }
      var nodeMap=new Map();
      for(var k=0;k<ups.length;k++){ var L=ups[k];
        for(var e=0;e<2;e++){ var nd=e?L.B:L.A; var arr=nodeMap.get(nd); if(!arr){arr=[];nodeMap.set(nd,arr);} arr.push(k); } }
      for(var k2=0;k2<ups.length;k2++){ var L2=ups[k2];
        for(var e2=0;e2<2;e2++){ var nd2=e2?L2.B:L2.A; var arr2=nodeMap.get(nd2);
          for(var z=0;z<arr2.length;z++){ var j=arr2[z];
            if(j>k2 && ups[j].kind===L2.kind && ups[j].cls===L2.cls) uni(k2,j); } } }
      var groups=new Map();
      for(var g=0;g<ups.length;g++){ var root=find(g); var arr3=groups.get(root); if(!arr3){arr3=[];groups.set(root,arr3);} arr3.push(g); }
      var corridors=[];
      groups.forEach(function(idxs){
        var first=ups[idxs[0]], lenM=0, laneKm=0, nodes={};
        var mnx=1e18,mny=1e18,mxx=-1e18,mxy=-1e18;
        for(var c=0;c<idxs.length;c++){ var L=ups[idxs[c]]; lenM+=L.lenM; laneKm+=(L.lenM/1000)*Math.max(1,L.laneAdd);
          nodes[L.A]=1; nodes[L.B]=1;
          for(var pp=0;pp<L.pts.length;pp+=2){ var x=L.pts[pp],y=L.pts[pp+1];
            if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; } }
        corridors.push({ links:idxs, kind:first.kind, cls:first.cls, n:idxs.length,
          lenKm:lenM/1000, laneKm:laneKm, bb:[mnx,mny,mxx,mxy],
          cx:(mnx+mxx)/2, cy:(mny+mxy)/2 });
      });
      // rank corridors by lane-km (scheme size) so the biggest schemes lead
      corridors.sort(function(a,b){ return b.laneKm-a.laneKm; });
      E.data={ ups:ups, corridors:corridors, yearA:yearA, yearB:yearB,
        stats:{ in25:in25, in40:in40, nUp:ups.length, nNew:nNew, nWiden:nWiden, nType:nType, nCorr:corridors.length } };
      E.sel=-1; E._ensureOverlay(); E._start();
      return {ok:true, stats:E.data.stats};
    }catch(err){ return {ok:false, err:String(err&&err.message||err)}; }
  };

  /* rebuild the displayed base network for a horizon year (reuses the importer) */
  E.openYear=function(year){
    if(!window.__NETBUF) return {ok:false, err:"Load the shapefile first."};
    try{
      var cmid=+((document.getElementById("loadCmid")||{}).value)||6000;
      var res=NetBuild.buildNetwork(window.__NETBUF.shp, window.__NETBUF.dbf, window.__NETBUF.prj||"", {year:year, cmid:cmid});
      applyNetwork(res); reinit();
      var sub=document.querySelector("h1 small"); if(sub) sub.textContent=year+" network · "+res.stats.roads.toLocaleString()+" road links";
      if(typeof render==="function") render();
      return {ok:true, roads:res.stats.roads, year:year};
    }catch(err){ return {ok:false, err:String(err&&err.message||err)}; }
  };

  E.summary=function(limit){
    if(!E.data) return {ok:false};
    limit=limit||20;
    var cs=E.data.corridors.slice(0,limit).map(function(c,i){
      return { id:i, kind:c.kind, kindLbl:KINDLBL[c.kind], cls:CLSN[c.cls], n:c.n,
        lenKm:+c.lenKm.toFixed(2), laneKm:+c.laneKm.toFixed(2) }; });
    return { ok:true, stats:E.data.stats, top:cs, total:E.data.corridors.length };
  };

  /* link endpoints (A,B node pairs) for a corridor — consumed by the Assignment
     app's benefit appraisal to add the scheme onto the 2025 base. */
  E.corridorLinks=function(id){
    if(!E.data||!E.data.corridors[id]) return null;
    var c=E.data.corridors[id], out=[];
    for(var i=0;i<c.links.length;i++){ var L=E.data.ups[c.links[i]]; out.push([L.A,L.B,L.kind,L.laneAdd]); }
    return out;
  };
  /* ALL upgrade link node-pairs grouped — used to synthesise the 2025 base
     (remove/downgrade every upgrade) in the assignment graph. */
  E.allUpgradeLinks=function(){
    if(!E.data) return null;
    return E.data.ups.map(function(L){ return [L.A,L.B,L.kind,L.laneAdd]; });
  };

  E.show=function(id, zoom){
    if(!E.data) return {ok:false};
    E.sel=(id==null?-1:id|0);
    if(zoom!==false && E.sel>=0 && E.data.corridors[E.sel]){
      var c=E.data.corridors[E.sel], b=c.bb, pad=0.18;
      var bw=Math.max(400,(b[2]-b[0])), bh=Math.max(400,(b[3]-b[1]));
      try{ cx=c.cx; cy=c.cy; sc=Math.min(W/(bw*(1+pad)), H/(bh*(1+pad))); if(typeof clampScale==="function")clampScale(); if(typeof render==="function")render(); }catch(e){}
    }
    return {ok:true, sel:E.sel};
  };
  E.clear=function(){ E.sel=-1; E._stop(); if(E.overlay){ E.overlay.style.display="none"; } return {ok:true}; };

  /* ---------- overlay canvas (decoupled from the app's own render) ---------- */
  E._ensureOverlay=function(){
    if(E.overlay) { E.overlay.style.display="block"; return; }
    var cv=document.createElement("canvas");
    cv.id="evoOverlay";
    cv.style.cssText="position:fixed;left:0;top:0;pointer-events:none;z-index:6";
    document.body.appendChild(cv);
    E.overlay=cv; E.octx=cv.getContext("2d");
  };
  E._start=function(){ if(E.raf) return; var loop=function(){ E.raf=requestAnimationFrame(loop); E._draw(); }; E.raf=requestAnimationFrame(loop); };
  E._stop=function(){ if(E.raf){ cancelAnimationFrame(E.raf); E.raf=0; } };
  E._draw=function(){
    if(!E.data||!E.overlay) return;
    var dpr=(typeof DPR!=="undefined"?DPR:1), w=W, h=H;
    if(E.overlay.width!==Math.round(w*dpr)||E.overlay.height!==Math.round(h*dpr)){
      E.overlay.width=Math.round(w*dpr); E.overlay.height=Math.round(h*dpr);
      E.overlay.style.width=w+"px"; E.overlay.style.height=h+"px";
    }
    var key=cx+"|"+cy+"|"+sc+"|"+w+"|"+h+"|"+E.sel;
    if(key===E._lastKey) return;            // nothing moved — skip redraw
    E._lastKey=key;
    var t=E.octx; t.setTransform(dpr,0,0,dpr,0,0); t.clearRect(0,0,w,h);
    var hw=w/2,hh=h/2, ups=E.data.ups, cors=E.data.corridors;
    var vx0=cx-hw/sc, vx1=cx+hw/sc, vy0=cy-hh/sc, vy1=cy+hh/sc;
    t.lineCap="round"; t.lineJoin="round";
    function drawLink(L,wd){ var pts=L.pts; if(pts.length<4) return;
      t.beginPath(); t.moveTo((pts[0]-cx)*sc+hw, hh-(pts[1]-cy)*sc);
      for(var p=2;p<pts.length;p+=2) t.lineTo((pts[p]-cx)*sc+hw, hh-(pts[p+1]-cy)*sc);
      t.lineWidth=wd; t.stroke(); }
    // 1) all upgrades, faint, coloured by kind (cull by corridor bbox)
    t.globalAlpha=0.55;
    for(var ci=0;ci<cors.length;ci++){ var c=cors[ci], b=c.bb;
      if(b[2]<vx0||b[0]>vx1||b[3]<vy0||b[1]>vy1) continue;
      if(ci===E.sel) continue;
      t.strokeStyle=KINDCOL[c.kind]||"#9aa";
      for(var k=0;k<c.links.length;k++) drawLink(ups[c.links[k]], Math.min(Math.max(1.1, sc*8), 4));
    }
    // 2) selected corridor, bright with a halo
    if(E.sel>=0 && cors[E.sel]){ var sc2=cors[E.sel];
      t.globalAlpha=1;
      t.strokeStyle="#ffffff"; for(var s1=0;s1<sc2.links.length;s1++) drawLink(ups[sc2.links[s1]], Math.min(Math.max(3.4,sc*14),9));
      t.strokeStyle=KINDCOL[sc2.kind]||"#fff"; for(var s2=0;s2<sc2.links.length;s2++) drawLink(ups[sc2.links[s2]], Math.min(Math.max(1.8,sc*9),5));
    }
    t.globalAlpha=1;
  };

  window.STEAMEvo=E;
})();
