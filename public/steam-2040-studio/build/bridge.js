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
  /* accordion apps: reveal the panel and open exactly one <details class="sec"> by summary text */
  function section(text){
    document.body.classList.remove("collapsed");
    var t=(text||"").toLowerCase(), ds=document.querySelectorAll("details.sec"), found=false;
    for(var i=0;i<ds.length;i++){
      var s=ds[i].querySelector("summary"), hit=!!s && (s.innerText||"").toLowerCase().indexOf(t)>=0;
      ds[i].open=hit; if(hit){ found=true; try{ s.scrollIntoView({block:"nearest"}); }catch(e){} }
    }
    return {ok:found};
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
