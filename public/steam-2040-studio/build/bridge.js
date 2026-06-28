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
        case "key":   out = pressKey(m.key); break;
        default:      out = {ok:false, err:"unknown cmd "+m.cmd};
      }
    }catch(err){ out = {ok:false, err:String(err && err.message || err)}; }
    try{ ev.source.postMessage({steam:1, resp:1, rid:m.rid, app:APP, out:out}, "*"); }catch(e){}
  });

  function announce(){ try{ window.parent.postMessage({steam:1, resp:1, event:"ready", app:APP}, "*"); }catch(e){} }
  window.addEventListener("load", announce);
  if(document.readyState==="complete" || document.readyState==="interactive"){ setTimeout(announce, 50); }
})();
