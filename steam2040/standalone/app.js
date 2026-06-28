/* STEAM 2040 Studio — standalone app controller, copilot and exporters. */
import { decodeBlob, Model, FACILITY } from "./engine.js";
import { GLMap } from "./glmap.js";

// ---- colour ----------------------------------------------------------------
const VIR = (() => { const c = [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]], n = 256, L = new Uint8Array(n*3);
  for (let i=0;i<n;i++){ const t=i/(n-1)*(c.length-1), k=Math.min(c.length-2,t|0), f=t-k;
    for(let j=0;j<3;j++) L[i*3+j]=Math.round(c[k][j]+(c[k+1][j]-c[k][j])*f); } return L; })();
function vir(t){ t=Math.max(0,Math.min(1,t))*255|0; return [VIR[t*3],VIR[t*3+1],VIR[t*3+2]]; }
function rgbCss(a){ return `rgb(${a[0]},${a[1]},${a[2]})`; }
const CLASS_RGB={fwy:[202,0,32],ramp:[244,165,130],art:[5,113,176],coll:[146,197,222],local:[150,150,150],rural:[123,50,148],junc:[230,171,2]};
const CLASS_W={fwy:3,ramp:2,art:2.6,coll:1.6,local:1,rural:1.4,junc:1};
const LOS_RGB=[[26,150,65],[166,217,106],[255,255,191],[253,174,97],[215,25,28],[140,0,0]];
const LOD_MPP={local:12,junc:12,coll:40,rural:40,ramp:1e9,art:1e9,fwy:1e9};
const ISO_BANDS=[5,10,15,20,30];   // isochrone bands (minutes)

// ---- state -----------------------------------------------------------------
const S = { model:null, map:null, mode:"network", colorMode:"class", zoneAttr:null,
  highlight:null, ctx:{ lastZone:null, lastZones:null, lastLinks:null }, llm:null,
  diff:null, isoBands:null, _recs:null, snapshots:[], assigning:false };
const $ = id => document.getElementById(id);
function status(t, busy){ const el=$("status"); if(el){ el.textContent=t; el.classList.toggle("busy",!!busy); } }

// ---- toasts ----------------------------------------------------------------
function toast(msg, kind){ const host=$("toasts"); if(!host) return;
  const t=document.createElement("div"); t.className="toast"+(kind?" "+kind:""); t.textContent=msg;
  host.appendChild(t); requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{ t.classList.remove("show"); setTimeout(()=>t.remove(),250); }, 2600);
  while(host.children.length>4) host.removeChild(host.firstChild); }

// ---- legend (rich) ---------------------------------------------------------
function virGradientCss(stops=8){ const out=[]; for(let i=0;i<stops;i++){ const t=i/(stops-1); out.push(`${rgbCss(vir(t))} ${(t*100).toFixed(0)}%`); } return `linear-gradient(90deg,${out.join(",")})`; }
function fmtTick(v){ const a=Math.abs(v); if(a>=1e6)return (v/1e6).toFixed(1)+"M"; if(a>=1e3)return (v/1e3).toFixed(1)+"k"; if(a>0&&a<1)return v.toFixed(2); return Math.round(v).toLocaleString(); }
function legend(spec){
  if(typeof spec==="string") spec={title:spec,type:"text"};
  const el=$("legend"); if(!el||!spec) return;
  let html=`<div class="lg-title">${spec.title||""}</div>`;
  if(spec.type==="gradient"){
    html+=`<div class="lg-bar" style="background:${virGradientCss()}"></div>`+
      `<div class="lg-ticks"><span>${fmtTick(spec.min)}</span><span>${fmtTick(spec.mid)}</span><span>${fmtTick(spec.max)}</span></div>`;
  } else if(spec.type==="chips"){
    html+=`<div class="lg-chips">`+spec.items.map(it=>`<div class="lg-chip"><span class="lg-dot" style="background:${rgbCss(it.rgb)}"></span>${it.label}</div>`).join("")+`</div>`;
  }
  el.innerHTML=html;
}

// ---- robustness / accessibility / self-test --------------------------------
function STEAM_hasWebGL2(){ try{ const c=document.createElement("canvas"); return !!(window.WebGL2RenderingContext && c.getContext("webgl2")); }catch(_){ return false; } }
let STEAM_fatalShown=false;
function STEAM_fatal(title, message, hint, detail){
  if(STEAM_fatalShown) return; STEAM_fatalShown=true; try{ status("error"); }catch(_){}
  const el=$("errscreen"); if(!el){ alert(title+"\n\n"+message); return; }
  $("err-title").textContent=title||"Something went wrong"; $("err-msg").textContent=message||"An unexpected error occurred.";
  const dt=$("err-detail"); if(detail){ dt.textContent=detail; dt.hidden=false; } else { dt.hidden=true; }
  $("err-hint").textContent=hint||"Reload the page to try again."; el.classList.add("show");
  try{ el.querySelector("button").focus(); }catch(_){}
}
function STEAM_bootHint(e){ const msg=((e&&e.message)||"").toLowerCase();
  if(/atob|base64|character|invalid/.test(msg)) return "The embedded network data looks corrupt or truncated. Re-export the standalone file.";
  if(/decompress|gzip|stream/.test(msg)) return "The browser could not decompress the network. Use an up-to-date Chrome, Edge or Firefox.";
  if(/webgl/.test(msg)) return "The map could not initialise WebGL2. Enable hardware acceleration or try another browser.";
  if(/no road links/.test(msg)) return "Open a standalone file built from a network that contains road links.";
  return "Reload the page. If it persists, re-export the standalone file."; }
function STEAM_applyCapabilities(){ const m=S.model; if(!m) return; const notes=[];
  if(!m.hasZones){ const za=$("zoneAttr"); if(za){ za.disabled=true; za.title="No zones in this network"; }
    const ab=$("aggBtn"); if(ab){ ab.disabled=true; ab.title="No zones to aggregate"; }
    const at=$("aggTarget"), as=$("aggSpan"); if(at)at.disabled=true; if(as)as.disabled=true;
    const ak=$("aggKpi"); if(ak)ak.textContent="zones not available"; notes.push("zones"); }
  if(!m.hasOD){ const dm=$("demand"); if(dm){ for(const o of dm.options) if(o.value==="fixed"){ o.disabled=true; o.text+=" (none)"; } dm.value="gravity"; } }
  if(!m.canAssign("gravity") && !m.canAssign("fixed")){ const rb=$("runAssign"); if(rb){ rb.disabled=true; rb.title="Assignment needs zones / demand data"; } }
  if(notes.length) say("Note: this network has no "+notes.join(", ")+" data, so the related tools are disabled."); }
function STEAM_reducedMotion(){ try{ return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(_){ return false; } }
function STEAM_applyA11y(){ const cmd=$("cmd"); if(cmd){ try{ cmd.focus({preventScroll:true}); }catch(_){ cmd.focus(); } } }
function STEAM_clampField(id, lo, hi, dflt, label){ const el=$(id); if(!el) return dflt;
  let v=parseFloat(el.value), changed=false;
  if(!isFinite(v)){ v=dflt; changed=true; } if(v<lo){ v=lo; changed=true; } if(v>hi){ v=hi; changed=true; } v=Math.round(v);
  if(changed){ el.value=v; say(`Adjusted ${label} to ${v.toLocaleString()} (allowed ${lo.toLocaleString()}–${hi.toLocaleString()}).`); } return v; }
function STEAM_zoneOk(z){ if(!S.model.hasZones){ say("This network has no zones."); return false; }
  if(!isFinite(z)||z<0||z>=S.model.nZones){ say(`Zone ${z} is out of range (0–${(S.model.nZones-1).toLocaleString()}).`); return false; } return true; }
function STEAM_selftestRequested(){ try{ return /(?:^|[?&])selftest(?:=|&|$)/.test(location.search); }catch(_){ return false; } }
function STEAM_badge(pass, text){ const b=$("selftest"); if(!b) return; b.textContent=(pass?"SELF-TEST PASS · ":"SELF-TEST FAIL · ")+text; b.className="show "+(pass?"pass":"fail"); }
async function STEAM_runSelfTest(){
  const results=[]; const check=(name, ok, info)=>results.push({name,ok:!!ok,info:info||""});
  try{ const m=S.model;
    check("decode→model", !!m && m.nLinks>0, `${m?m.nLinks:0} links`);
    check("map has links", !!(S.map && S.map.nSeg>0), `${S.map?S.map.nSeg:0} segments`);
    if(m.canAssign("fixed") || m.canAssign("gravity")){
      const demand = m.hasOD ? "fixed" : "gravity";
      const sS=m.settings.originSample, sI=m.settings.fwIters; m.settings.originSample=20; m.settings.fwIters=2; m._odNodes=null;
      let err=null; try{ await m.assignProgressive("frankwolfe", demand, ()=>{}); }catch(e){ err=e; }
      m.settings.originSample=sS; m.settings.fwIters=sI; m._odNodes=null;
      check("tiny assignment", !err && !!m.result && m.result.volume.length===m.nLinks, err?err.message:"ok");
      if(m.hasZones){ const a=m.aggregate(Math.max(1,(m.nZones/2)|0),"coll",6000,["district"]); check("aggregate", !!a && a.nClusters>0, `${a.nClusters} clusters`); } else check("aggregate", true, "skipped");
      try{ const r=m.result; let csv="link,vc\n"; for(let i=0;i<Math.min(m.nLinks,50);i++) csv+=`${i},${r.vc[i].toFixed(3)}\n`; const blob=new Blob([csv],{type:"text/csv"}); check("export blob", blob.size>0, `${blob.size} bytes`); }catch(e){ check("export blob", false, e.message); }
    } else { check("tiny assignment", true, "skipped"); check("aggregate", true, "skipped"); check("export blob", true, "skipped"); }
  }catch(e){ check("self-test harness", false, e.message); }
  const pass=results.every(r=>r.ok);
  console.log("%cSTEAM 2040 SELF-TEST: "+(pass?"PASS":"FAIL"), "font-weight:bold;color:"+(pass?"#3fb950":"#f85149"));
  for(const r of results) console.log(`  [${r.ok?"PASS":"FAIL"}] ${r.name}${r.info?" — "+r.info:""}`);
  STEAM_badge(pass, results.filter(r=>!r.ok).map(r=>r.name).join(", ")||`${results.length} checks ok`); return pass;
}

// ---- boot ------------------------------------------------------------------
async function boot(){
  if(!STEAM_hasWebGL2()){
    STEAM_fatal("3D map unavailable","This browser or device could not create a WebGL2 context, which STEAM 2040 Studio needs to draw the network.","Try a recent Chrome, Edge or Firefox with hardware acceleration enabled.");
    return;
  }
  status("decoding network…", true);
  await tick();
  const decoded = await decodeBlob(window.STEAM_BLOB);
  S.model = new Model(decoded);
  window.STEAM = S;   // expose for power users / diagnostics
  S.map = new GLMap($("map")); S.map.onAfterRender = drawHud;
  S.map.resize();
  const m = S.model, off = m.s.geom_off, xy = m.s.geom_xy;
  S.map.setLinks(off, xy, m.h.bounds);
  applyLinkStyle("class");
  S.map.resetView();
  status(`${m.nLinks.toLocaleString()} links · ${m.nNodes.toLocaleString()} nodes · ${m.nZones.toLocaleString()} zones · ${(m.h.n_od||0).toLocaleString()} OD`);
  wire(); wireMobile(); STEAM_applyCapabilities(); setMode("network");
  const hint=$("hint"); if(hint){ hint.hidden=false; setTimeout(()=>{ if(!hint.hidden) hint.hidden=true; },14000); }
  toast("Network loaded — press ? for shortcuts.","good");
  if(STEAM_selftestRequested()) STEAM_runSelfTest();
}
const tick = () => new Promise(r=>setTimeout(r,16));

// ---- styling links ---------------------------------------------------------
function lodEncode(mpp){ if(!isFinite(mpp) || mpp>=4000) return 0;
  const n = Math.log(Math.max(mpp,0.5)/0.5) / Math.log(4000/0.5); return Math.max(1, Math.min(127, 1 + Math.round(n*126))); }
function applyLinkStyle(mode){
  S.colorMode = mode; const m=S.model, n=m.nLinks, r=m.result, b=new Uint8Array(n*5), lod=new Uint8Array(n);
  let vmax=1; if(r&&(mode==="volume")) vmax=Math.max(1,...sample(r.volume));
  let dmax=1; const diff=S.diff;
  if(mode==="diff"&&diff){ let mx=1; const st=Math.max(1,(diff.length/5000)|0); for(let i=0;i<diff.length;i+=st){ const a=Math.abs(diff[i]); if(a>mx)mx=a; } dmax=mx; }
  const iso=S.isoBands;
  const hi = S.highlight ? new Set(S.highlight) : null;
  for(let i=0;i<n;i++){ const c=m.className(i); let rgb,w;
    if(mode==="diff"&&diff){ const d=diff[i]; const t=Math.min(Math.abs(d)/dmax,1);
      if(Math.abs(d)<1){ rgb=[70,70,80]; w=0.8; }
      else if(d<0){ rgb=[40+(1-t)*60|0,160+t*60|0,40+(1-t)*40|0]; w=1+4*t; }
      else { rgb=[170+t*70|0,40+(1-t)*40|0,40+(1-t)*40|0]; w=1+4*t; } }
    else if(mode==="iso"&&iso){ const band=iso[i];
      if(band<0){ rgb=[40,44,55]; w=0.7; } else { const t=ISO_BANDS.length>1?band/(ISO_BANDS.length-1):0; rgb=vir(1-t); w=1.4+(1-t)*2; } }
    else if(mode==="class"||(!r&&(mode==="volume"||mode==="vc"||mode==="los"||mode==="speed"))){ rgb=CLASS_RGB[c]; w=CLASS_W[c]; }
    else if(mode==="volume"){ const t=r.volume[i]/vmax; rgb=vir(t); w=0.8+5*Math.sqrt(t); }
    else if(mode==="vc"){ const t=Math.min(r.vc[i],1.5)/1.5; rgb=vir(t); w=1+4*t; }
    else if(mode==="los"){ rgb=LOS_RGB[r.los[i]]; w=1.6; }
    else if(mode==="lanes"){ const t=Math.min(m.s.lanes[i],6)/6; rgb=vir(t); w=1+t*3; }
    else if(mode==="length"){ const t=Math.min(m.s.length[i],5000)/5000; rgb=vir(t); w=1.4; }
    else if(mode==="speed"){ const sp=r?m.s.length[i]/Math.max(r.ctime[i],1e-6)*3.6:0; const t=Math.min(sp,120)/120; rgb=r?vir(t):CLASS_RGB[c]; w=1.4; }
    else { rgb=CLASS_RGB[c]; w=CLASS_W[c]; }
    let arrow = (c==="fwy"||c==="art");
    if(hi){ if(hi.has(i)){ rgb=[255,220,40]; w=Math.max(w,3.5); arrow=true; } else { rgb=rgb.map(v=>v*0.45|0); w=Math.max(0.8,w*0.7); arrow=false; } }
    b[i*5]=rgb[0]; b[i*5+1]=rgb[1]; b[i*5+2]=rgb[2]; b[i*5+3]=255; b[i*5+4]=Math.max(1,Math.min(255,w*28))|0;
    lod[i] = (arrow?128:0) | lodEncode(LOD_MPP[c]);
  }
  S.map.setStyle(b); S.map.lodByLink=lod; S.map.setLodCodes(lod);
  updateLinkLegend(mode); updateSpark(mode);
}
function sample(arr){ const out=[]; const step=Math.max(1,(arr.length/5000)|0); for(let i=0;i<arr.length;i+=step) out.push(arr[i]); return out; }
function metricVals(mode){ const m=S.model,r=m.result,n=m.nLinks,out=new Float64Array(n);
  for(let i=0;i<n;i++){ switch(mode){
    case "volume": out[i]=r?r.volume[i]:0; break;
    case "vc": out[i]=r?r.vc[i]:0; break;
    case "lanes": out[i]=m.s.lanes[i]; break;
    case "length": out[i]=m.s.length[i]; break;
    case "speed": out[i]=r?m.s.length[i]/Math.max(r.ctime[i],1e-6)*3.6:0; break;
    default: out[i]=0; } } return out; }
function updateLinkLegend(mode){
  const m=S.model,r=m.result;
  if(mode==="diff"){ return legend("volume diff: green ↓ · red ↑ (before→after)"); }
  if(mode==="iso"){ return legend("travel-time bands: near→far"); }
  const noResult=!r&&(mode==="volume"||mode==="vc"||mode==="los"||mode==="speed");
  if(mode==="class"||noResult){
    const order=[["fwy","freeway"],["art","arterial"],["coll","collector"],["ramp","ramp"],["local","local"],["rural","rural"],["junc","junction"]];
    return legend({title:"Facility class",type:"chips",items:order.map(([k,l])=>({label:l,rgb:CLASS_RGB[k]}))});
  }
  if(mode==="los") return legend({title:"Level of service",type:"chips",items:"ABCDEF".split("").map((l,i)=>({label:"LOS "+l,rgb:LOS_RGB[i]}))});
  const v=metricVals(mode); let mx=0; for(let i=0;i<v.length;i++) if(v[i]>mx) mx=v[i];
  if(mode==="vc") mx=Math.max(mx,1.5);
  const titles={volume:"Volume (veh/day)",vc:"v/c ratio",lanes:"Lanes",length:"Length (m)",speed:"Congested speed (km/h)"};
  legend({title:titles[mode]||mode,type:"gradient",min:0,mid:mx/2,max:mx});
}
function drawSpark(vals,nbins=28){ const cv=$("spark"); if(!cv) return; const ctx=cv.getContext("2d"); const W=cv.width,H=cv.height; ctx.clearRect(0,0,W,H);
  let mx=0; for(let i=0;i<vals.length;i++) if(vals[i]>mx) mx=vals[i]; if(mx<=0) mx=1;
  const bins=new Float64Array(nbins); for(let i=0;i<vals.length;i++){ let bb=(vals[i]/mx*nbins)|0; if(bb>=nbins)bb=nbins-1; if(bb<0)bb=0; bins[bb]++; }
  let bmx=0; for(let i=0;i<nbins;i++) if(bins[i]>bmx) bmx=bins[i]; if(bmx<=0) bmx=1;
  const bw=W/nbins, pad=2; for(let i=0;i<nbins;i++){ const h=Math.round(bins[i]/bmx*(H-6)); ctx.fillStyle=rgbCss(vir(i/(nbins-1))); ctx.fillRect(i*bw+pad/2,H-h,bw-pad,h); } }
function updateSpark(mode){ const wrap=$("sparkWrap"),lbl=$("sparkLbl"); if(!wrap) return;
  const cont=["volume","vc","lanes","length","speed"].includes(mode); const r=S.model.result, ready=cont&&(["lanes","length"].includes(mode)||r);
  wrap.classList.toggle("on",!!ready); if(!ready) return;
  const names={volume:"Volume distribution",vc:"v/c distribution",lanes:"Lanes distribution",length:"Length distribution",speed:"Speed distribution"};
  if(lbl) lbl.textContent=names[mode]||"Distribution"; drawSpark(metricVals(mode)); }

// ---- styling zones ---------------------------------------------------------
function zoneValues(attr){ const m=S.model,s=m.s,z=m.nZones,v=new Float64Array(z);
  for(let i=0;i<z;i++){ switch(attr){
    case "population": v[i]=s.z_pop_tot[i]; break;
    case "jobs": v[i]=s.z_worker[i]; break;
    case "students": v[i]=s.z_student[i]; break;
    case "households": v[i]=s.z_hh[i]; break;
    case "retail": v[i]=s.z_retail_gfa[i]; break;
    case "office": v[i]=s.z_office_gfa[i]; break;
    case "industrial": v[i]=s.z_ind_gfa[i]; break;
    case "school": v[i]=s.z_school_gfa[i]; break;
    case "productions": v[i]=1.2*s.z_pop_tot[i]+0.9*s.z_worker[i]+0.7*s.z_student[i]; break;
    case "attractions": v[i]=(3*s.z_retail_gfa[i]+1.5*s.z_office_gfa[i]+0.6*s.z_ind_gfa[i]+2*s.z_school_gfa[i])/100; break;
    case "jobs-housing": v[i]=s.z_hh[i]>0?s.z_worker[i]/s.z_hh[i]:0; break;
    case "metro": v[i]=s.z_metro_access[i]; break;
    default: v[i]=s.z_pop_tot[i]; } }
  return v;
}
function showZones(attr, cluster){
  const m=S.model, zc=m.s.z_centroid, z=m.nZones, xy=new Float32Array(z*2), col=new Uint8Array(z*4), mag=new Float32Array(z).fill(1);
  for(let i=0;i<z;i++){ xy[i*2]=zc[i*2]; xy[i*2+1]=zc[i*2+1]; }
  if(cluster && m.aggregation){ const lab=m.aggregation.labels;
    for(let i=0;i<z;i++){ const l=lab[i]; if(l<0){ col[i*4+3]=0; continue;} const h=(l*2654435761)>>>0;
      col[i*4]=(h>>16)&255; col[i*4+1]=((h>>8)&255)|40; col[i*4+2]=(h&255)|40; col[i*4+3]=255; }
    legend(`zones by new cluster (${m.aggregation.nClusters} clusters)`);
  } else { const val=zoneValues(attr); let mx=1; for(let i=0;i<z;i++) if(val[i]>mx) mx=val[i];
    for(let i=0;i<z;i++){ if(zc[i*2]===0&&zc[i*2+1]===0){ col[i*4+3]=0; mag[i]=0; continue;} const t=val[i]/mx, rgb=vir(t);
      col[i*4]=rgb[0]; col[i*4+1]=rgb[1]; col[i*4+2]=rgb[2]; col[i*4+3]=255; mag[i]=t; }
    legend({title:`Zones · ${attr}`,type:"gradient",min:0,mid:mx/2,max:mx}); S.zoneAttr=attr;
    const wrap=$("sparkWrap"),lbl=$("sparkLbl"); if(wrap){ wrap.classList.add("on"); if(lbl)lbl.textContent=`${attr} distribution`; drawSpark(val); }
  }
  S.map.setDots(xy, col, mag); S.map.showDots=true; S.map.dotSize = cluster?4:6; S.map.render();
}

// ---- assignment ------------------------------------------------------------
async function runAssign(method, demand){
  const m=S.model; method=method||"frankwolfe"; demand=demand||"fixed";
  if(S.assigning){ m.abort=true; return; }            // toggle = stop
  if(!m.canAssign(demand)){
    if(m.canAssign("gravity") && demand!=="gravity"){ demand="gravity"; const ds=$("demand"); if(ds)ds.value="gravity"; say("No OD matrix — switched to gravity demand."); }
    else { status("assignment unavailable — this network has no "+(m.hasZones?"OD matrix":"zones")+"."); say("Assignment is unavailable: this network has no "+(m.hasZones?"OD matrix":"zones")+"."); return; }
  }
  S.assigning=true; const btn=$("runAssign"); if(btn){ btn.textContent="Stop"; btn.classList.add("stop"); }
  S.map.showDots=false;
  const t0=performance.now();
  await m.assignProgressive(method, demand, (k,K,g)=>{
    applyLinkStyle("volume"); S.map.render(); fillKPI(m.kpis());
    status(`assigning ${method}… iter ${k}/${K}`+(isFinite(g)?` · gap ${g.toExponential(2)}`:""), true);
  });
  const k=m.kpis(); fillKPI(k);
  status(`assigned (${method}) in ${((performance.now()-t0)/1000).toFixed(1)}s · gap ${isFinite(k.gap)?k.gap.toExponential(2):"–"} · ${k.over.toLocaleString()} links over capacity`);
  S.assigning=false; if(btn){ btn.textContent="Run assignment"; btn.classList.remove("stop"); }
  return k;
}
function fillKPI(k){ const f=(x)=>Number.isFinite(x)?Math.round(x).toLocaleString():"–"; const sp=(x)=>Number.isFinite(x)?x.toFixed(1):"–";
  $("kpi").innerHTML = !k ? "" : `
    <div><span>VMT (veh-km)</span><b>${f(k.vmt)}</b></div>
    <div><span>VHT (veh-h)</span><b>${f(k.vht)}</b></div>
    <div><span>Total delay (veh-h)</span><b>${f(k.delay)}</b></div>
    <div title="VMT-weighted speed with a ${sp(k.speedFloor)} km/h per-link display floor; equilibrium times are unchanged."><span>Network speed*</span><b>${sp(k.speed)} km/h</b></div>
    <div title="Honest VMT/VHT; collapses toward 0 under extreme oversaturation."><span>Avg speed (raw)</span><b>${sp(k.speedRaw)} km/h</b></div>
    <div title="VMT-weighted p15·median·p85 congested link speed."><span>Speed p15·50·85</span><b>${sp(k.p15)}·${sp(k.p50)}·${sp(k.p85)}</b></div>
    <div><span>Avg v/c</span><b>${Number.isFinite(k.avgVc)?k.avgVc.toFixed(2):"–"}</b></div>
    <div><span>Peak v/c</span><b>${Number.isFinite(k.peak)?k.peak.toFixed(1):"–"}</b></div>
    <div><span>Over capacity</span><b>${f(k.over)} (${Number.isFinite(k.overShare)?(k.overShare*100).toFixed(0):"–"}%)</b></div>
    <div><span>Lane-km over cap</span><b>${f(k.laneKmOver)}</b></div>
    <div><span>% VMT in LOS E/F</span><b>${Number.isFinite(k.pctVmtEF)?(k.pctVmtEF*100).toFixed(0):"–"}%</b></div>
    <div><span>Gap</span><b>${isFinite(k.gap)?k.gap.toExponential(1):"–"}</b></div>`;
}

// ---- workspaces ------------------------------------------------------------
function setMode(mode){ S.mode=mode; for(const el of document.querySelectorAll(".rail button")){ const on=el.dataset.m===mode; el.classList.toggle("on",on); if(el.dataset.m) el.setAttribute("aria-pressed", on?"true":"false"); }
  $("panel-network").hidden=mode!=="network"; $("panel-agg").hidden=mode!=="aggregation"; $("panel-assign").hidden=mode!=="assignment";
  $("paneltitle").textContent={network:"Network",aggregation:"Zone aggregation",assignment:"Assignment"}[mode];
  if(isMobile() && mode) openSheet(true); }

// ---- HUD overlay -----------------------------------------------------------
function drawHud(){}

// ---- wiring ----------------------------------------------------------------
function wire(){
  for(const el of document.querySelectorAll(".rail button[data-m]")) el.onclick=()=>setMode(el.dataset.m);
  const tb=$("themeBtn"); if(tb) tb.onclick=()=>{ const on=document.body.classList.toggle("light"); if(S.map)S.map.render(); toast(on?"Light theme on.":"Dark theme on."); };
  const hb=$("helpBtn"); if(hb) hb.onclick=()=>showHelp();
  const hc=$("hintClose"); if(hc) hc.onclick=()=>{ $("hint").hidden=true; };
  for(const b of document.querySelectorAll("#chips button")) b.onclick=()=>{ $("cmd").value=b.dataset.cmd; submit(); };
  window.addEventListener("keydown",onKey);
  $("runAssign").onclick=()=>runAssign($("method").value,$("demand").value);
  $("volvc").onclick=()=>{ const cur=S.colorMode==="vc"?"volume":"vc"; applyLinkStyle(cur);
    for(const b of $("volvc").children) b.classList.toggle("on", b.dataset.c===cur); };
  $("aggBtn").onclick=()=>{ if(!S.model.hasZones){ say("This network has no zones, so aggregation is unavailable."); return; }
    const tgt=STEAM_clampField("aggTarget",50,S.model.nZones,1500,"target zones"); const span=STEAM_clampField("aggSpan",100,200000,6000,"max span (m)"); if(tgt==null||span==null) return;
    const a=S.model.aggregate(tgt,$("aggBarrier").value,span,["district"]);
    $("aggKpi").textContent=`${(S.model.nZones).toLocaleString()} → ${a.nClusters.toLocaleString()} clusters · ${a.mergeEdges.length.toLocaleString()} merges`;
    showZones(null,true); };
  for(const el of document.querySelectorAll(".swatches button[data-style]")) el.onclick=async()=>{
    const md=el.dataset.style; if((md==="volume"||md==="vc")&&!S.model.result) await runAssign("frankwolfe",$("demand").value);
    S.map.showDots=false; applyLinkStyle(md); S.map.render();
    for(const b of document.querySelectorAll(".swatches button[data-style]")) b.classList.toggle("on",b===el); };
  $("zoneAttr").onchange=()=>{ const a=$("zoneAttr").value; if(!a){ S.map.showDots=false; applyLinkStyle(S.colorMode); S.map.render(); return; }
    S.map.showLinks=true; showZones(a,false); S.map.render(); toast(`Zones coloured by ${a}.`); };
  $("send").onclick=submit; $("cmd").addEventListener("keydown",e=>{ if(e.key==="Enter") submit(); });
  STEAM_applyA11y(); if(!STEAM_reducedMotion()) rotatePlaceholder();

  // ---- map interaction: unified multi-pointer (mouse + touch) --------------
  const c=$("map");
  const ptrs=new Map(); let ht=0, busy=false;
  let panId=null, lx=0, ly=0;
  let pinching=false, pinchDist=0;
  let lpTimer=null, lpFired=false;
  let lastTapT=0, lastTapX=0, lastTapY=0;
  let vX=0, vY=0, lastMoveT=0, momTimer=null;
  function inspect(cx,cy,e){ const i=S.map.pick(cx,cy); if(i<0) return -1; S.ctx.lastLinks=[i];
    if(e&&e.shiftKey){ doSelectLink(i); }
    else if(e&&e.altKey){ doIsochrone(S.model.s.node_a[i],true); }
    else say(`Selected link ${i} (${S.model.className(i)}, ${S.model.s.lanes[i]} ln, ${Math.round(S.model.s.length[i])} m).`); return i; }
  function clearLP(){ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } }
  function stopMom(){ if(momTimer){ cancelAnimationFrame(momTimer); momTimer=null; } vX=0; vY=0; }
  function startMom(){ if(Math.abs(vX)<0.4 && Math.abs(vY)<0.4) return;
    const step=()=>{ S.map.pan(vX,vY); vX*=0.92; vY*=0.92; if(Math.abs(vX)<0.2 && Math.abs(vY)<0.2){ momTimer=null; return; } momTimer=requestAnimationFrame(step); }; momTimer=requestAnimationFrame(step); }
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  c.addEventListener("pointerdown",e=>{
    if(e.pointerType!=="touch" && e.button===2){ inspect(...S.map._canvasXY(e.clientX,e.clientY),e); return; }
    if(e.pointerType!=="touch" && e.button!==0) return;
    stopMom(); c.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,startT:performance.now()});
    if(ptrs.size===1){ panId=e.pointerId; lx=e.clientX; ly=e.clientY; lastMoveT=performance.now(); vX=0; vY=0; lpFired=false; clearLP();
      if(e.pointerType==="touch"){ const px=e.clientX,py=e.clientY; lpTimer=setTimeout(()=>{ lpFired=true; panId=null; inspect(...S.map._canvasXY(px,py)); },500); } }
    else if(ptrs.size===2){ clearLP(); panId=null; pinching=true; const[a,b]=[...ptrs.values()]; pinchDist=dist(a,b); }
  });
  c.addEventListener("pointermove",e=>{ const p=ptrs.get(e.pointerId); if(p){ p.x=e.clientX; p.y=e.clientY; }
    if(pinching && ptrs.size>=2){ e.preventDefault(); const[a,b]=[...ptrs.values()]; const nd=dist(a,b);
      if(pinchDist>0 && nd>0){ S.map.zoomAtMidpoint(a.x,a.y,b.x,b.y, nd/pinchDist); } pinchDist=nd; return; }
    if(e.pointerId===panId && p){ if(lpTimer && Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>8) clearLP();
      const dx=e.clientX-lx, dy=e.clientY-ly; S.map.pan(dx,dy);
      const now=performance.now(), dt=Math.max(1,now-lastMoveT); vX=dx/dt*16; vY=dy/dt*16; lx=e.clientX; ly=e.clientY; lastMoveT=now; return; }
    if(e.pointerType!=="touch" && ptrs.size===0){ const now=performance.now(); if(now-ht<60||busy)return; ht=now;
      const [cx,cy]=S.map._canvasXY(e.clientX,e.clientY); const i=S.map.pick(cx,cy);
      if(i<0){ $("tip").hidden=true; return; } const m=S.model,r=m.result, cls=m.className(i);
      const tip=$("tip"); tip.hidden=false; tip.style.left=(cx+14)+"px"; tip.style.top=(cy+14)+"px";
      let rows=`<div class="tt-row"><span>Lanes</span><b>${m.s.lanes[i]}</b></div><div class="tt-row"><span>Length</span><b>${Math.round(m.s.length[i]).toLocaleString()} m</b></div>`;
      if(r){ rows+=`<div class="tt-row"><span>Volume</span><b>${Math.round(r.volume[i]).toLocaleString()}</b></div><div class="tt-row"><span>Capacity</span><b>${Math.round(r.cap[i]).toLocaleString()}</b></div><div class="tt-row"><span>v/c</span><b style="color:${rgbCss(vir(Math.min(r.vc[i],1.5)/1.5))}">${r.vc[i].toFixed(2)}</b></div><div class="tt-row"><span>LOS</span><b>${"ABCDEF"[r.los[i]]}</b></div>`; }
      tip.innerHTML=`<div class="tt-title"><span class="tt-chip" style="background:${rgbCss(CLASS_RGB[cls]||[150,150,150])}"></span>Link ${i} · ${cls}</div>${rows}`; }
  });
  function endPtr(e){ const p=ptrs.get(e.pointerId); const wasPan=(e.pointerId===panId); ptrs.delete(e.pointerId);
    try{ c.releasePointerCapture(e.pointerId); }catch(_){} clearLP();
    if(pinching){ if(ptrs.size<2) pinching=false; if(ptrs.size===1){ const[id,q]=[...ptrs.entries()][0]; panId=id; lx=q.x; ly=q.y; lastMoveT=performance.now(); vX=0; vY=0; } return; }
    if(wasPan){ panId=null;
      if(p && e.pointerType==="touch" && !lpFired){ const dur=performance.now()-p.startT, moved=Math.hypot(e.clientX-p.startX,e.clientY-p.startY);
        if(dur<300 && moved<12){ const now=performance.now(); if(now-lastTapT<300 && Math.hypot(e.clientX-lastTapX,e.clientY-lastTapY)<40){ S.map.zoomAtClient(e.clientX,e.clientY,1.9); lastTapT=0; } else { lastTapT=now; lastTapX=e.clientX; lastTapY=e.clientY; } return; } }
      startMom(); }
  }
  c.addEventListener("pointerup",endPtr); c.addEventListener("pointercancel",endPtr);
  c.addEventListener("contextmenu",e=>e.preventDefault());
  c.addEventListener("touchmove",e=>e.preventDefault(),{passive:false});
  c.addEventListener("gesturestart",e=>e.preventDefault());
  c.addEventListener("wheel",e=>{ e.preventDefault(); const [cx,cy]=S.map._canvasXY(e.clientX,e.clientY); S.map.zoomAt(cx,cy,Math.pow(1.0015,-e.deltaY)); },{passive:false});
  window.addEventListener("resize",()=>S.map.resize());
}

// ---- mobile / responsive ---------------------------------------------------
function isMobile(){ return window.matchMedia("(max-width:820px)").matches; }
function openSheet(open){ document.body.classList.toggle("sheet-open", open!==undefined?open:!document.body.classList.contains("sheet-open")); }
function wireMobile(){
  const fab=$("mFab"), handle=$("mHandle");
  if(fab) fab.onclick=()=>openSheet();
  if(handle){ handle.onclick=()=>openSheet(false); let sy=0,down=false;
    handle.addEventListener("pointerdown",e=>{ down=true; sy=e.clientY; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener("pointermove",e=>{ if(down && e.clientY-sy>50){ down=false; openSheet(false); } });
    handle.addEventListener("pointerup",()=>down=false); }
  const vv=window.visualViewport;
  const onVV=()=>{ if(!vv) return; const kb=Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--kb", kb+"px"); document.body.classList.toggle("kb-open", kb>80); };
  if(vv){ vv.addEventListener("resize",onVV); vv.addEventListener("scroll",onVV); onVV(); }
  $("cmd").addEventListener("blur",()=>{ document.documentElement.style.setProperty("--kb","0px"); document.body.classList.remove("kb-open"); });
  const resync=()=>{ if(S.map) S.map.resize(); };
  window.addEventListener("orientationchange",()=>setTimeout(resync,250));
  if(vv) vv.addEventListener("resize",resync);
  const c=$("map"); c.addEventListener("pointerdown",()=>{ if(isMobile() && document.body.classList.contains("sheet-open")) openSheet(false); });
}

// ---- keyboard shortcuts & help ---------------------------------------------
function onKey(e){ const tag=(e.target.tagName||"").toLowerCase(), typing=tag==="input"||tag==="textarea"||tag==="select";
  if(e.key==="/"&&!typing){ e.preventDefault(); $("cmd").focus(); return; }
  if(e.key==="Escape"){ if(typing){ $("cmd").blur(); } if(S.highlight){ S.highlight=null; if(S.colorMode)applyLinkStyle(S.colorMode); if(S.map)S.map.render(); toast("Cleared highlights."); } $("tip").hidden=true; return; }
  if(typing) return;
  if(e.key==="?"){ e.preventDefault(); showHelp(); return; }
  if(e.key==="1") setMode("network"); else if(e.key==="2") setMode("aggregation"); else if(e.key==="3") setMode("assignment"); }
function showHelp(){ doHelp(); toast("Help posted to the copilot."); }
const PLACEH=["colour zones by population","run an AM peak assignment","show me the worst congestion","recommend improvements","aggregate to 1500 zones","select-link 1234","isochrone from zone 200","connect ollama llama3.1"];
function rotatePlaceholder(){ let i=0; setInterval(()=>{ const el=$("cmd"); if(el) el.placeholder=PLACEH[i++%PLACEH.length]; },3500); }

// ---- copilot: fuzzy normalisation + multi-step planner ---------------------
function say(t, you){ const d=document.createElement("div"); d.className="msg"+(you?" you":""); d.textContent=t; $("chat").appendChild(d);
  while($("chat").children.length>6) $("chat").removeChild($("chat").firstChild); }
function lev(a,b){ if(a===b) return 0; const la=a.length, lb=b.length; if(!la) return lb; if(!lb) return la;
  let prev=new Array(lb+1); for(let j=0;j<=lb;j++) prev[j]=j;
  for(let i=1;i<=la;i++){ let cur=[i]; for(let j=1;j<=lb;j++){ const c=a[i-1]===b[j-1]?0:1; cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+c); } prev=cur; } return prev[lb]; }
const VOCAB="colour color links link roads zones zone by volume lanes length speed run assignment frank wolfe frankwolfe msa incremental freeflow free flow worst congestion congested over capacity recommend improvements improvement aggregate population jobs students households retail office industrial school productions attractions metro trips from to export map csv geojson shapefile correspondence summarise summarize summary overview explain stats statistics distribution districts find reset clear select isochrone catchment corridor path route screenline upgrade close reopen restore scenario snapshot compare help theme light dark show freeways arterials collectors ramps locals connect ollama claude".split(" ");
function normalizeCmd(t){
  return t.replace(/v\/c/g,"vc").replace(/free[-\s]?flow/g,"freeflow").replace(/frank[-\s]?wolfe/g,"frank-wolfe").replace(/select[-\s]?link/g,"select-link")
    .split(/\b/).map(tok=>{ if(!/^[a-z]{3,}$/.test(tok)) return tok; if(VOCAB.includes(tok)) return tok;
      let best=null,bd=99; for(const w of VOCAB){ const d=lev(tok,w); if(d<bd){bd=d;best=w;} } const tol=tok.length<=4?1:2; return (best&&bd<=tol)?best:tok; }).join("");
}
async function submit(){ const t=$("cmd").value.trim(); if(!t)return; $("cmd").value=""; say(t,true);
  const steps=planSteps(t);
  for(const step of steps){ try{ S._rawStep=step; await run(step); }catch(err){ say("⚠ "+err.message); }finally{ S._rawStep=null; } }
}
function planSteps(t){ const masks=[]; let s=t
    .replace(/\d[\d,]*\.?\d*/g, m=>{ masks.push(m); return ""+(masks.length-1)+""; })
    .replace(/"[^"]*"|'[^']*'/g, m=>{ masks.push(m); return ""+(masks.length-1)+""; });
  const parts=s.split(/\b(?:and then|then|after that|afterwards|next|followed by|finally|also|plus)\b|[;]|,(?=\s)/i)
    .map(p=>p.trim()).filter(Boolean).map(p=>p.replace(/(\d+)/g,(_,i)=>masks[+i]));
  return parts.length?parts:[t]; }
function num(t){ const m=t.match(/-?\d[\d,]*\.?\d*/); return m?+m[0].replace(/,/g,""):null; }

async function run(raw){
  let t=(raw||"").toLowerCase().trim(); if(!t) return;
  if(/^connect\b/.test(t)) return connectLLM(t);
  t=normalizeCmd(t);
  if(/\bhelp\b/.test(t)) return doHelp();
  let m;
  // colour links
  if((m=t.match(/colou?r links by (volume|vc|lanes|length|speed)/))){ const md=m[1]; if((md==="volume"||md==="vc"||md==="speed")&&!S.model.result)await runAssign("frankwolfe",$("demand").value); S.diff=null; S.isoBands=null; S.map.showDots=false; applyLinkStyle(md); return say(`Coloured links by ${m[1]}.`); }
  if(/worst congestion|most congested/.test(t)){ if(!S.model.result)await runAssign("frankwolfe",$("demand").value); const top=S.model.topCongested(15); if(!top.length)return say("No loaded links yet."); S.highlight=top.map(x=>x.i); S.ctx.lastLinks=S.highlight; S.map.showDots=false; applyLinkStyle("vc"); flyToLinks(S.highlight); return say(`Worst link: ${top[0].i} (${top[0].klass}) v/c ${top[0].vc.toFixed(2)}, LOS ${top[0].los}. Highlighted the top 15.`); }
  if(/over capacity|los f/.test(t)){ if(!S.model.result)await runAssign("frankwolfe",$("demand").value); const over=[]; for(let i=0;i<S.model.nLinks;i++) if(S.model.result.vc[i]>1) over.push(i); S.highlight=over.slice(0,400); applyLinkStyle("vc"); return say(`${over.length.toLocaleString()} links are over capacity (LOS F).`); }
  if((m=t.match(/show (?:only )?(freeways?|arterials?|collectors?|ramps?|locals?)/))){ const map={freeway:"fwy",arterial:"art",collector:"coll",ramp:"ramp",local:"local"}; const c=map[m[1].replace(/s$/,"")]; const ids=[]; for(let i=0;i<S.model.nLinks;i++) if(S.model.className(i)===c) ids.push(i); S.highlight=ids; applyLinkStyle("class"); return say(`Showing ${ids.length.toLocaleString()} ${m[1]}.`); }
  // colour zones
  if((m=t.match(/colou?r zones by ([a-z\- ]+)/))){ if(!S.model.hasZones)return say("This network has no zones."); const a=normAttr(m[1].trim()); S.map.showDots=true; S.map.showLinks=true; showZones(a,false); S.map.render(); return say(`Coloured zones by ${a}.`); }
  // run / methods
  if(/\brun\b|assign|equilibrium|frank|wolfe|freeflow|\bmsa\b|incremental/.test(t)){ let method="frankwolfe"; if(/freeflow|all.?or.?nothing/.test(t))method="freeflow"; else if(/\bmsa\b/.test(t))method="msa"; else if(/incremental/.test(t))method="incremental";
    if(/am peak|morning/.test(t))S.model.settings.periodFactor=0.1; else if(/24|daily/.test(t))S.model.settings.periodFactor=1; else if(/off.?peak/.test(t))S.model.settings.periodFactor=0.083;
    const sm=t.match(/sample\s+(\d+)/); if(sm){ let smp=+sm[1]; if(!isFinite(smp)||smp<1)smp=1; else if(smp>200000)smp=200000; if(smp!==+sm[1])say(`Sample size clamped to ${smp}.`); S.model.settings.originSample=smp; S.model._odNodes=null; }
    const demand=/gravity/.test(t)?"gravity":"fixed"; $("method").value=method; setMode("assignment"); await runAssign(method,demand); const k=S.model.kpis(); if(!k)return; return say(`Ran ${method}. VHT ${Math.round(k.vht).toLocaleString()}, network speed ${k.speed.toFixed(1)} km/h (raw ${k.speedRaw.toFixed(1)}, median ${k.p50.toFixed(1)}), ${k.over.toLocaleString()} links over capacity.`); }
  // recommend
  if(/recommend|improvement|where to (widen|add)/.test(t)){ if(!S.model.result)await runAssign("frankwolfe",$("demand").value); const recs=S.model.recommend(8); S._recs=recs; S.highlight=recs.map(r=>r.i); applyLinkStyle("vc"); flyToLinks(S.highlight); return say(recs.length?"Top fixes:\n"+recs.slice(0,5).map((r,i)=>`${i+1}. link ${r.i} (${r.klass}) v/c ${r.vc.toFixed(2)} · saves ${Math.round(r.saveVehH)} veh-h · BCR ${isFinite(r.bcr)?r.bcr.toFixed(2):"∞"}`).join("\n"):"No congested candidates to improve."); }
  if((m=t.match(/apply recommendation\s+(\d+)/))){ const r=(S._recs||[])[+m[1]-1]; if(!r)return say("Run 'recommend improvements' first."); const before=S.model.kpis().vht; S.model.upgradeLink(r.i,2); await runAssign(S.model.result.method,S.model.result.demand); const after=S.model.kpis().vht; return say(`Widened link ${r.i} by 2 lanes and re-assigned. VHT ${Math.round(before).toLocaleString()} → ${Math.round(after).toLocaleString()} (${Math.round(before-after).toLocaleString()} saved).`); }
  // scenario editing
  if((m=t.match(/add\s+(\d+)?\s*lanes?\s+to\s+link\s+(\d+)/))){ const nl=m[1]?+m[1]:1, id=+m[2]; S.model.addLanes(id,nl); return scenarioReassign(`Added ${nl} lane(s) to link ${id}.`); }
  if((m=t.match(/upgrade link\s+(\d+)\s*by\s*(\d+)/))){ S.model.upgradeLink(+m[1],+m[2]); if(S.model.result)await runAssign(S.model.result.method,S.model.result.demand); return say(`Upgraded link ${m[1]} by ${m[2]} lanes${S.model.result?" and re-assigned":""}.`); }
  if((m=t.match(/close\s+link\s+(\d+)/))){ const id=+m[1]; S.model.closeLink(id); return scenarioReassign(`Closed link ${id}.`); }
  if((m=t.match(/(?:reopen|restore)\s+link\s+(\d+)/))){ const id=+m[1]; S.model.restoreLink(id); return scenarioReassign(`Restored link ${id}.`); }
  if(/restore (?:all|network)|reset scenario/.test(t)){ S.model.restoreAll(); S.diff=null; if(S.model.result)await runAssign(S.model.result.method,S.model.result.demand); applyLinkStyle("vc"); return say("Restored all scenario edits and re-assigned."); }
  if(/show (?:the )?diff|before.?after|volume diff/.test(t)){ if(!S.diff) S.diff=S.model.volumeDiff(); if(!S.diff) return say("No baseline to diff. Make a scenario edit (e.g. 'close link 1234') first."); applyLinkStyle("diff"); S.map.showDots=false; return say("Showing the before/after volume diff (green ↓, red ↑)."); }
  // select-link
  if((m=t.match(/select-link\s+(\d+)/))||(/select-link/.test(t)&&S.ctx.lastLinks&&S.ctx.lastLinks.length)){ const id=m?+m[1]:S.ctx.lastLinks[0]; setMode("assignment"); return doSelectLink(id); }
  // isochrone / corridor / screenline
  if((m=t.match(/isochrone (?:from )?(?:zone\s+(\d+)|node\s+(\d+))/))||(/isochrone|catchment|reachable/.test(t)&&(m=t.match(/zone\s+(\d+)/)))){ const ff=/freeflow/.test(t); let node; if(m[2]!=null)node=+m[2]; else if(m[1]!=null){ if(!STEAM_zoneOk(+m[1]))return; node=S.model.zoneNode[+m[1]]; } if(node==null||node<0)return say("Pick a valid zone/node."); return doIsochrone(node,!ff); }
  if((m=t.match(/(?:corridor|path|route)\s+(?:from\s+)?zone\s+(\d+)\s+to\s+(?:zone\s+)?(\d+)/))){ const ff=/freeflow/.test(t); return doCorridor(+m[1],+m[2],!ff); }
  if((m=t.match(/screenline\s+(-?\d[\d.]*)[ ,]+(-?\d[\d.]*)[ ,]+(-?\d[\d.]*)[ ,]+(-?\d[\d.]*)/))){ return doScreenline(+m[1],+m[2],+m[3],+m[4]); }
  if(/clear (?:analysis|overlay|highlight)|^clear$/.test(t)){ clearAnalysis(); return say("Cleared the analysis overlay."); }
  if(/reset view|fit|zoom out/.test(t)){ S.highlight=null; S.diff=null; S.isoBands=null; S.map.showDots=!!S.zoneAttr&&S.map.showDots; applyLinkStyle(S.colorMode||"class"); S.map.resetView(); return say("Reset the view to fit the whole network."); }
  // aggregate
  if((m=t.match(/aggregate(?: to)?\s+(\d[\d,]*)\s*zones?/))){ if(!S.model.hasZones)return say("This network has no zones, so aggregation is unavailable."); let tgt=+m[1].replace(/,/g,""); if(!isFinite(tgt)||tgt<1)tgt=1; if(tgt>S.model.nZones)tgt=S.model.nZones; const bar=/freeway/.test(t)?"fwy":/arterial/.test(t)?"art":"coll"; const a=S.model.aggregate(tgt,bar,6000,["district"]); setMode("aggregation"); $("aggTarget").value=tgt; $("aggKpi").textContent=`${S.model.nZones.toLocaleString()} → ${a.nClusters.toLocaleString()} clusters`; showZones(null,true); S.map.render(); return say(`Aggregated to ${a.nClusters.toLocaleString()} clusters (no merge crosses a ${bar} or exceeds 6 km).`); }
  // interrogate zones
  if((m=t.match(/population of zone\s+(\d+)/))){ if(!STEAM_zoneOk(+m[1]))return; return say(`Zone ${m[1]} population: ${S.model.s.z_pop_tot[+m[1]].toLocaleString()}.`); }
  if((m=t.match(/jobs in zone\s+(\d+)/))){ if(!STEAM_zoneOk(+m[1]))return; return say(`Zone ${m[1]} jobs: ${S.model.s.z_worker[+m[1]].toLocaleString()}.`); }
  if((m=t.match(/zoom to zone\s+(\d+)/))){ if(!STEAM_zoneOk(+m[1]))return; const z=+m[1],zc=S.model.s.z_centroid; S.ctx.lastZone=z; S.map.flyTo(zc[z*2],zc[z*2+1],0.04); return say(`Zoomed to zone ${z}.`); }
  if((m=t.match(/top\s+(\d+)\s+zones by (\w+)/))){ if(!S.model.hasZones)return say("This network has no zones."); const k=+m[1],a=normAttr(m[2]),val=zoneValues(a); const idx=[...Array(S.model.nZones).keys()].sort((x,y)=>val[y]-val[x]).slice(0,k); S.ctx.lastZones=idx; return say(`Top ${k} zones by ${a}: `+idx.map(i=>`#${i} (${Math.round(val[i]).toLocaleString()})`).join(", ")); }
  if((m=t.match(/stats?(?: of| for)? ([a-z\- ]+)/))&&/stat|distribution/.test(t)){ if(!S.model.hasZones)return say("This network has no zones."); const a=normAttr(m[1].trim()),v=zoneValues(a),arr=Array.from(v).filter(x=>isFinite(x)),so=arr.slice().sort((x,y)=>x-y),nn=so.length,sum=arr.reduce((s,x)=>s+x,0),f=x=>Math.round(x).toLocaleString(); return say(`${a}: min ${f(so[0]||0)} · median ${f(so[nn>>1]||0)} · mean ${f(nn?sum/nn:0)} · max ${f(so[nn-1]||0)} · total ${f(sum)} (${nn.toLocaleString()} zones).`); }
  if((m=t.match(/find district\s+(\d+)/))){ if(!S.model.hasZones||!S.model.s.z_district)return say("No district data."); const dist=+m[1],s=S.model.s,hits=[]; for(let z=0;z<S.model.nZones;z++) if(s.z_district[z]===dist) hits.push(z); if(!hits.length)return say(`No zones in district ${dist}.`); S.ctx.lastZones=hits; const zc=s.z_centroid; let sx=0,sy=0,nn=0; for(const z of hits){ if(zc[z*2]||zc[z*2+1]){sx+=zc[z*2];sy+=zc[z*2+1];nn++;} } if(nn)S.map.flyTo(sx/nn,sy/nn,0.02); return say(`District ${dist}: ${hits.length} zones.`); }
  if(/list districts/.test(t)){ if(!S.model.hasZones||!S.model.s.z_district)return say("No district data."); const s=S.model.s,counts=new Map(); for(let z=0;z<S.model.nZones;z++){ const d=s.z_district[z]; counts.set(d,(counts.get(d)||0)+1); } const arr=[...counts.entries()].sort((a,b)=>a[0]-b[0]); return say(`${arr.length} districts: `+arr.slice(0,20).map(([d,n])=>`#${d} (${n})`).join(", ")+(arr.length>20?" …":"")); }
  // snapshot / compare
  if(/snapshot|save scenario/.test(t)){ const k=S.model.result?S.model.kpis():null; if(!k)return say("Run an assignment first."); const name="scenario "+(S.snapshots.length+1); S.snapshots.push({name,k}); return say(`Saved snapshot "${name}" (VHT ${Math.round(k.vht).toLocaleString()}, over-cap ${k.over.toLocaleString()}).`); }
  if(/\bcompare\b/.test(t)){ const cur=S.model.result?S.model.kpis():null; if(!cur)return say("Run an assignment first."); const prev=S.snapshots[S.snapshots.length-1]; if(!prev)return say("No snapshot to compare — say 'snapshot' after an assignment."); const d=(a,b)=>{ const x=b-a; return (x>=0?"+":"")+Math.round(x).toLocaleString(); }; return say(`Current vs "${prev.name}":\n• VHT ${Math.round(prev.k.vht).toLocaleString()} → ${Math.round(cur.vht).toLocaleString()} (${d(prev.k.vht,cur.vht)})\n• Network speed ${prev.k.speed.toFixed(1)} → ${cur.speed.toFixed(1)} km/h\n• Over capacity ${prev.k.over.toLocaleString()} → ${cur.over.toLocaleString()} (${d(prev.k.over,cur.over)})`); }
  // explain / summarise
  if(/\bexplain\b/.test(t)){ if(/los|service/.test(t))return say("LOS grades a road A–F from v/c: A free-flowing (v/c<0.6) to F gridlock (v/c≥1.0)."); if(/bpr/.test(t))return say("BPR: travel time = free-flow × (1 + 0.15·(vol/cap)^4) — time rises sharply near capacity."); if(/gap/.test(t))return say("Relative gap measures closeness to user equilibrium; smaller is more converged. Frank-Wolfe stops at gap < 1e-3."); if(/aggregat/.test(t))return say("Aggregation merges nearby same-district zones, never crossing the chosen barrier class or spanning more than 6 km, until it reaches your target count."); return say("v/c is volume ÷ capacity. Below 1.0 the link is within capacity; at 1.0 saturated; above 1.0 over capacity. It drives the colour scale and LOS."); }
  if(/summari[sz]e|overview|\bsummary\b/.test(t)){ const m2=S.model,k=m2.result?m2.kpis():null; let lk=0; for(let i=0;i<m2.nLinks;i++) lk+=m2.s.lanes[i]*m2.s.length[i]/1000; const cls={}; for(let i=0;i<m2.nLinks;i++){ const c=m2.className(i); cls[c]=(cls[c]||0)+1; } const top=Object.entries(cls).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c} ${n.toLocaleString()}`).join(", "); const lines=[`Network: ${m2.nLinks.toLocaleString()} links, ${m2.nNodes.toLocaleString()} nodes, ${m2.nZones.toLocaleString()} zones, ${(m2.h.n_od||0).toLocaleString()} OD pairs.`,`Lane-km ${Math.round(lk).toLocaleString()} · classes: ${top}.`]; if(k)lines.push(`Assignment (${m2.result.method}): VHT ${Math.round(k.vht).toLocaleString()}, network speed ${k.speed.toFixed(1)} km/h, ${k.over.toLocaleString()} links over capacity.`); else lines.push("No assignment yet — say 'run frank-wolfe'."); return say(lines.join("\n")); }
  // interrogate matrix
  if((m=t.match(/trips from zone\s+(\d+)\s+to\s+(\d+)/))){ if(!S.model.hasOD)return say("This network has no OD matrix loaded."); const o=+m[1],d=+m[2]; let tr=0; const s=S.model.s; for(let k=0;k<S.model.h.n_od;k++) if(s.od_o[k]===o&&s.od_d[k]===d){tr=s.od_t[k];break;} return say(`Trips ${o}→${d}: ${tr.toFixed(1)} per day.`); }
  if((m=t.match(/trips from zone\s+(\d+)/))){ if(!S.model.hasOD)return say("This network has no OD matrix loaded."); const o=+m[1],s=S.model.s; let tot=0; for(let k=0;k<S.model.h.n_od;k++) if(s.od_o[k]===o) tot+=s.od_t[k]; return say(`Zone ${o} produces ${Math.round(tot).toLocaleString()} trips/day.`); }
  if((m=t.match(/trips to zone\s+(\d+)/))){ if(!S.model.hasOD)return say("This network has no OD matrix loaded."); const d=+m[1],s=S.model.s; let tot=0; for(let k=0;k<S.model.h.n_od;k++) if(s.od_d[k]===d) tot+=s.od_t[k]; return say(`Zone ${d} attracts ${Math.round(tot).toLocaleString()} trips/day.`); }
  // interrogate network
  if(/how many links/.test(t)) return say(`${S.model.nLinks.toLocaleString()} road links, ${S.model.nNodes.toLocaleString()} nodes.`);
  if(/how many zones/.test(t)) return say(`${S.model.nZones.toLocaleString()} zones.`);
  if(/total lane.?km/.test(t)){ let lk=0; for(let i=0;i<S.model.nLinks;i++) lk+=S.model.s.lanes[i]*S.model.s.length[i]/1000; return say(`Total lane-km: ${Math.round(lk).toLocaleString()}.`); }
  // exports
  if(/export link/.test(t)) return exportLinksCSV();
  if(/export the correspondence|export correspondence/.test(t)) return exportCorrespondence();
  if(/export.*geojson/.test(t)) return exportGeoJSON();
  if(/export.*shapefile/.test(t)) return exportShapefile();
  if(/export the map|export map/.test(t)) return exportMapPNG();
  // theme
  if(/light theme/.test(t)){ document.body.classList.add("light"); if(S.map)S.map.render(); return say("Light theme on."); }
  if(/dark theme/.test(t)){ document.body.classList.remove("light"); if(S.map)S.map.render(); return say("Dark theme on."); }
  // LLM agent fallback
  if(S.llm) return llmAgent(S._rawStep!=null?S._rawStep:raw);
  return notRecognised(t);
}
function notRecognised(t){
  const probe=[["colour zones by population","population jobs colour zones"],["run frank-wolfe assignment","run assignment frankwolfe equilibrium"],["show the worst congestion","congestion worst congested"],["recommend improvements","recommend improvement widen"],["aggregate to 1500 zones","aggregate cluster zones"],["summarise the network","summary overview network"],["select-link 1234","select link trace flows"],["isochrone from zone 200","isochrone catchment reachable"],["export link results csv","export csv download"]];
  const toks=t.split(/\s+/); const sugg=[];
  for(const[phrase,kw] of probe){ const kws=kw.split(" "); let s=0; for(const tk of toks){ let bs=0; for(const w of kws){ const d=lev(tk,w); const sc=d<=2?1-d/(w.length+1):0; if(sc>bs)bs=sc; } s+=bs; } if(s>0) sugg.push([s,phrase]); }
  sugg.sort((a,b)=>b[0]-a[0]);
  if(sugg.length && sugg[0][0]>=0.9) return say("Not sure I got that. Did you mean:\n"+sugg.slice(0,3).map(s=>"• "+s[1]).join("\n")+"\n(or type 'help')");
  return doHelp(true);
}
function doHelp(full){ return say((full?"I didn't catch that.\n":"")+[
  "Copilot — I tolerate typos/synonyms and multi-step requests (use 'then', 'and', commas):",
  "MAPS  · colour links by volume / vc / los / speed / lanes · colour zones by population/jobs/…",
  "ASSIGN· run frank-wolfe (or msa / incremental / free-flow) · for the am peak · gravity · sample 800",
  "DIAG  · worst congestion · over capacity · summarise · explain v/c · explain los",
  "PLAN  · recommend improvements · apply recommendation 1 · upgrade link 4312 by 2 lanes · snapshot · compare",
  "SCEN  · add 2 lanes to link 1234 · close link 1234 · reopen link 1234 · show diff · restore all",
  "ANALYSE· select-link 1234 · isochrone from zone 200 · corridor zone 10 to 250 · screenline x1 y1 x2 y2 · clear",
  "ZONES · population of zone 120 · top 10 zones by jobs · stats of population · list districts · find district 7 · zoom to zone 200",
  "DEMAND· trips from zone 200 · trips to zone 55 · trips from zone 12 to 34",
  "AGGR  · aggregate to 1500 zones · export correspondence / geojson / shapefile",
  "LLM   · connect ollama llama3.1 · connect claude <key>"].join("\n")); }
function normAttr(a){ a=a.trim(); const map={pop:"population",population:"population",jobs:"jobs",workers:"jobs",students:"students",household:"households",households:"households",retail:"retail",office:"office",industrial:"industrial",school:"school",productions:"productions",attractions:"attractions","jobs-housing":"jobs-housing","jobs housing":"jobs-housing",metro:"metro","metro access":"metro",density:"population"}; return map[a]||a; }
function flyToLinks(ids){ if(!ids||!ids.length)return; const xy=S.model.s.geom_xy,off=S.model.s.geom_off; let sx=0,sy=0,nn=0; for(const i of ids){ const k=off[i]; sx+=xy[k*2]; sy+=xy[k*2+1]; nn++; } S.map.flyTo(sx/nn,sy/nn); }

// ---- analysis controllers --------------------------------------------------
async function doSelectLink(linkId){ const m=S.model; if(!m.result){ say("Running an assignment first to trace flows."); await runAssign("frankwolfe",$("demand").value); }
  status("tracing select-link…",true); await tick(); const sl=m.selectLink(linkId,{congested:true}); S.diff=null; S.isoBands=null;
  S.highlight=sl.contributing.length?sl.contributing:[linkId]; S.ctx.lastLinks=[linkId]; applyLinkStyle(S.colorMode==="diff"||S.colorMode==="iso"?"vc":S.colorMode); flyToLinks([linkId]); S.map.showDots=false; S.map.render(); status("");
  const fl=sl.topFlows.slice(0,5).map(f=>`zone ${f.oZone>=0?f.oZone:"?"}→${f.dZone>=0?f.dZone:"?"} ${Math.round(f.trips)}`).join(", ");
  return say(`Select-link ${linkId}: ${Math.round(sl.through).toLocaleString()} trips traverse it (${(sl.share*100).toFixed(1)}% of sampled demand) over ${sl.contributing.length.toLocaleString()} links. Top flows: ${fl||"(none)"}.`); }
async function scenarioReassign(label){ const m=S.model; if(!m.result){ say("Running a base assignment first."); await runAssign("frankwolfe",$("demand").value); } m.snapshotVolume();
  const method=m.result?m.result.method:"frankwolfe", demand=m.result?m.result.demand:$("demand").value; await runAssign(method,demand);
  S.diff=m.volumeDiff(); S.isoBands=null; S.highlight=null; applyLinkStyle("diff"); S.map.showDots=false; S.map.render();
  for(const b of document.querySelectorAll(".swatches button[data-style]")) b.classList.remove("on");
  let up=0,dn=0; for(let i=0;i<S.diff.length;i++){ if(S.diff[i]>1)up++; else if(S.diff[i]<-1)dn++; }
  return say(`${label} Re-assigned; volume diff: ${dn.toLocaleString()} links lighter (green), ${up.toLocaleString()} heavier (red).`); }
async function doIsochrone(srcNode, congested){ const m=S.model; status("computing isochrone…",true); await tick(); const iso=m.isochrone(srcNode,ISO_BANDS,congested!==false);
  S.isoBands=iso.band; S.diff=null; S.highlight=null; applyLinkStyle("iso"); S.map.showDots=false; const nx=m.s.node_xy; S.map.flyTo(nx[srcNode*2],nx[srcNode*2+1]); S.map.render(); status("");
  return say(`Isochrone from node ${srcNode} (${congested!==false&&m.result?"congested":"free-flow"}). Links reachable — `+iso.counts.map((c,k)=>`≤${ISO_BANDS[k]}m: ${c.toLocaleString()}`).join(" · ")+"."); }
async function doCorridor(zoneA, zoneB, congested){ const m=S.model; if(congested&&!m.result){ say("No assignment yet; routing at free-flow."); congested=false; } const cor=m.corridor(zoneA,zoneB,congested); if(!cor)return say(`No path found between zone ${zoneA} and zone ${zoneB}.`);
  S.highlight=cor.links; S.ctx.lastLinks=cor.links; S.diff=null; S.isoBands=null; applyLinkStyle(S.colorMode==="diff"||S.colorMode==="iso"?"class":S.colorMode); flyToLinks(cor.links); S.map.showDots=false; S.map.render();
  return say(`Corridor zone ${zoneA}→${zoneB} (${cor.congested?"congested":"free-flow"}): ${cor.distKm.toFixed(1)} km, ${cor.timeMin.toFixed(1)} min over ${cor.links.length} links.`); }
async function doScreenline(x1,y1,x2,y2){ const m=S.model; const r=m.screenline(x1,y1,x2,y2); S.highlight=r.links; S.ctx.lastLinks=r.links; S.diff=null; S.isoBands=null; applyLinkStyle(m.result?"volume":"class"); flyToLinks(r.links); S.map.showDots=false; S.map.render();
  return say(`Screenline crosses ${r.count.toLocaleString()} links${m.result?` carrying ${Math.round(r.volume).toLocaleString()} veh`:" (run an assignment for volumes)"}.`); }
function clearAnalysis(){ S.diff=null; S.isoBands=null; S.highlight=null; applyLinkStyle("class"); S.map.render(); }

// ---- LLM connect + tool-calling agent --------------------------------------
function connectLLM(t){ let m;
  if((m=t.match(/connect ollama\s+(\S+)(?:\s*\|\s*(\S+))?/))){ const host=(m[2]||"http://localhost:11434").replace(/\/+$/,"").replace(/\/v1.*$/,"").replace(/\/api\/.*$/,"");
    S.llm={type:"ollama",model:m[1],host,url:host+"/v1/chat/completions",apiChat:host+"/api/chat"}; return say(`Connected to local Ollama (${m[1]}) at ${host}. Tool-calling agent active; offline planner stays as fallback. If calls fail from file://, start Ollama with OLLAMA_ORIGINS=*.`); }
  if((m=t.match(/connect claude\s+(\S+)/))){ S.llm={type:"openai",model:"claude",url:"https://api.anthropic.com/v1/messages",key:m[1],jsonOnly:true}; return say("Connected to Claude (Anthropic API). Agent uses JSON tool protocol."); }
  if((m=t.match(/connect ai\s+(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)/))){ S.llm={type:"openai",url:m[1],key:m[2],model:m[3]}; return say(`Connected to ${m[3]}. Tool-calling agent active.`); }
  return say("Usage: connect ollama llama3.1 [| http://host:11434] · connect claude <key> · connect ai <url> | <key> | <model>"); }
function _ensureResult(){ if(!S.model.result) return runAssign("frankwolfe",$("demand").value); }
function _fmt(n){ return Math.round(n).toLocaleString(); }
const TOOLS=[
  { name:"colourLinks", description:"Recolour links by an attribute (class, volume, vc, los, lanes, length, speed). Auto-runs assignment if needed.", parameters:{type:"object",properties:{mode:{type:"string"}},required:["mode"]},
    async run(a){ const md=a.mode==="v/c"?"vc":a.mode; if(["volume","vc","speed","los"].includes(md)) await _ensureResult(); S.map.showDots=false; S.map.showLinks=true; applyLinkStyle(md); S.map.render(); return `Coloured links by ${md}.`; } },
  { name:"colourZones", description:"Colour zones by a land-use attribute (population, jobs, students, households, retail, office, industrial, school, productions, attractions, jobs-housing, metro).", parameters:{type:"object",properties:{attr:{type:"string"}},required:["attr"]},
    run(a){ if(!S.model.hasZones) return "No zones in this network."; const at=normAttr(String(a.attr).toLowerCase()); S.map.showDots=true; S.map.showLinks=true; showZones(at,false); S.map.render(); return `Coloured zones by ${at}.`; } },
  { name:"runAssignment", description:"Run a traffic assignment (frankwolfe, msa, incremental, freeflow; demand fixed|gravity; period am|daily|offpeak).", parameters:{type:"object",properties:{method:{type:"string"},demand:{type:"string"},period:{type:"string"},sample:{type:"integer"}},required:[]},
    async run(a){ const method=a.method||"frankwolfe", demand=a.demand||"fixed"; if(a.period==="am")S.model.settings.periodFactor=0.1; else if(a.period==="daily")S.model.settings.periodFactor=1; else if(a.period==="offpeak")S.model.settings.periodFactor=0.083; if(a.sample){S.model.settings.originSample=+a.sample; S.model._odNodes=null;} $("method").value=method; setMode("assignment"); await runAssign(method,demand); const k=S.model.kpis(); return k?`Ran ${method}/${demand}. VHT ${_fmt(k.vht)}, network speed ${k.speed.toFixed(1)} km/h, ${_fmt(k.over)} over capacity, gap ${isFinite(k.gap)?k.gap.toExponential(2):"–"}.`:"Assignment unavailable."; } },
  { name:"networkSummary", description:"Report network size and current KPIs.", parameters:{type:"object",properties:{},required:[]},
    run(){ const m=S.model,k=m.kpis(); let s=`${m.nLinks.toLocaleString()} links · ${m.nNodes.toLocaleString()} nodes · ${m.nZones.toLocaleString()} zones · ${(m.h.n_od||0).toLocaleString()} OD.`; if(k)s+=` VHT ${_fmt(k.vht)}, network speed ${k.speed.toFixed(1)} km/h, ${_fmt(k.over)} over capacity.`; else s+=" Not yet assigned."; return s; } },
  { name:"topCongested", description:"Highlight the most congested links.", parameters:{type:"object",properties:{n:{type:"integer"}},required:[]},
    async run(a){ await _ensureResult(); const top=S.model.topCongested(a.n||15); S.highlight=top.map(x=>x.i); S.ctx.lastLinks=S.highlight; S.map.showDots=false; applyLinkStyle("vc"); flyToLinks(S.highlight); return top.length?`Top ${top.length} highlighted. Worst: link ${top[0].i} (${top[0].klass}) v/c ${top[0].vc.toFixed(2)}.`:"No loaded links."; } },
  { name:"recommend", description:"Rank lane-widening projects by benefit-cost ratio.", parameters:{type:"object",properties:{n:{type:"integer"}},required:[]},
    async run(a){ await _ensureResult(); const recs=S.model.recommend(a.n||8); S._recs=recs; S.highlight=recs.map(r=>r.i); applyLinkStyle("vc"); flyToLinks(S.highlight); return recs.length?"Top fixes: "+recs.slice(0,5).map((r,i)=>`#${i+1} link ${r.i} BCR ${isFinite(r.bcr)?r.bcr.toFixed(2):"∞"}`).join("; "):"No candidates."; } },
  { name:"aggregate", description:"Aggregate zones to a target count (barrier fwy|art|coll).", parameters:{type:"object",properties:{target:{type:"integer"},barrier:{type:"string"}},required:["target"]},
    run(a){ if(!S.model.hasZones) return "No zones."; const tgt=+a.target,bar=a.barrier||"coll"; const r=S.model.aggregate(tgt,bar,6000,["district"]); setMode("aggregation"); $("aggTarget").value=tgt; $("aggKpi").textContent=`${S.model.nZones.toLocaleString()} → ${r.nClusters.toLocaleString()} clusters`; showZones(null,true); S.map.render(); return `Aggregated to ${r.nClusters.toLocaleString()} clusters.`; } },
  { name:"selectLink", description:"Trace which OD flows traverse a link.", parameters:{type:"object",properties:{link:{type:"integer"}},required:["link"]}, async run(a){ await doSelectLink(+a.link); return `Select-link ${a.link} done.`; } },
  { name:"scenario", description:"Edit the network then re-assign with a before/after diff. action: addLanes|close|reopen|restore.", parameters:{type:"object",properties:{action:{type:"string"},link:{type:"integer"},lanes:{type:"integer"}},required:["action"]},
    async run(a){ const id=+a.link; if(a.action==="addLanes"){ S.model.addLanes(id,a.lanes||1); await scenarioReassign(`Added ${a.lanes||1} lane(s) to link ${id}.`);} else if(a.action==="close"){ S.model.closeLink(id); await scenarioReassign(`Closed link ${id}.`);} else if(a.action==="reopen"){ S.model.restoreLink(id); await scenarioReassign(`Reopened link ${id}.`);} else { S.model.restoreAll(); if(S.model.result) await runAssign(S.model.result.method,S.model.result.demand);} return `Scenario ${a.action} done.`; } },
  { name:"isochrone", description:"Travel-time bands from a zone.", parameters:{type:"object",properties:{zone:{type:"integer"}},required:["zone"]}, async run(a){ const nd=S.model.zoneNode[+a.zone]; if(nd==null||nd<0)return "Invalid zone."; await doIsochrone(nd,true); return `Isochrone from zone ${a.zone} done.`; } },
  { name:"corridor", description:"Shortest path between two zones.", parameters:{type:"object",properties:{from:{type:"integer"},to:{type:"integer"}},required:["from","to"]}, async run(a){ await doCorridor(+a.from,+a.to,!!S.model.result); return `Corridor ${a.from}->${a.to} done.`; } },
  { name:"interrogateZone", description:"Demographics + trip ends for a zone.", parameters:{type:"object",properties:{zone:{type:"integer"}},required:["zone"]},
    run(a){ const z=+a.zone,s=S.model.s; if(!S.model.hasZones||z<0||z>=S.model.nZones) return `Zone ${z} unavailable.`; let prod=0,attr=0; if(S.model.hasOD) for(let k=0;k<S.model.h.n_od;k++){ if(s.od_o[k]===z)prod+=s.od_t[k]; if(s.od_d[k]===z)attr+=s.od_t[k]; } S.ctx.lastZone=z; return `Zone ${z}: pop ${_fmt(s.z_pop_tot[z])}, jobs ${_fmt(s.z_worker[z])}, students ${_fmt(s.z_student[z])}. Produces ${_fmt(prod)} trips/day, attracts ${_fmt(attr)}.`; } },
  { name:"zoomTo", description:"Fly to a zone.", parameters:{type:"object",properties:{zone:{type:"integer"}},required:["zone"]}, run(a){ const z=+a.zone,zc=S.model.s.z_centroid; if(!S.model.hasZones||z<0||z>=S.model.nZones)return `Zone ${z} unavailable.`; S.ctx.lastZone=z; S.map.flyTo(zc[z*2],zc[z*2+1],0.04); return `Zoomed to zone ${z}.`; } },
  { name:"clearHighlight", description:"Clear highlights/overlays.", parameters:{type:"object",properties:{},required:[]}, run(){ clearAnalysis(); return "Cleared."; } },
  { name:"export", description:"Export data (links, correspondence, geojson, shapefile, map).", parameters:{type:"object",properties:{kind:{type:"string"}},required:["kind"]},
    run(a){ ({links:exportLinksCSV,correspondence:exportCorrespondence,geojson:exportGeoJSON,shapefile:exportShapefile,map:exportMapPNG}[a.kind]||(()=>say("Unknown export.")))(); return `Triggered ${a.kind} export.`; } },
  { name:"plan", description:"Run a free-text command through the deterministic planner.", parameters:{type:"object",properties:{command:{type:"string"}},required:["command"]}, async run(a){ await planOnly(String(a.command)); return `Ran: "${a.command}".`; } },
];
const TOOL_MAP=Object.fromEntries(TOOLS.map(t=>[t.name,t]));
function toolSpecs(){ return TOOLS.map(t=>({type:"function",function:{name:t.name,description:t.description,parameters:t.parameters}})); }
function agentSystemPrompt(){ const m=S.model, assigned=!!m.result;
  const cat=TOOLS.map(t=>`- ${t.name}(${Object.keys(t.parameters.properties||{}).join(", ")}): ${t.description}`).join("\n");
  return `You are the copilot agent inside STEAM 2040 Studio, a travel-demand model of Abu Dhabi (2040). `+
`The network has ${m.nLinks.toLocaleString()} links, ${m.nNodes.toLocaleString()} nodes, ${m.nZones.toLocaleString()} zones, ${(m.h.n_od||0).toLocaleString()} OD pairs. Assignment ${assigned?"HAS":"has NOT"} run.\n`+
`Drive the app by calling tools, observe results, then either call more tools or finish with a concise answer. Prefer the most specific tool; use plan() only as a last resort.\n\nTOOLS:\n${cat}\n\n`+
`If your endpoint lacks native tool calls, reply with EXACTLY ONE JSON object:\n  call: {"tool":"<name>","args":{...}}\n  finish: {"final":"<message>"}\nDo not wrap JSON in prose.`; }
function extractJSON(text){ if(!text) return null; let s=text.replace(/```(?:json)?/gi,"").trim(); const i=s.indexOf("{"); if(i<0)return null;
  let depth=0,inStr=false,esc=false; for(let j=i;j<s.length;j++){ const ch=s[j];
    if(inStr){ if(esc)esc=false; else if(ch==="\\")esc=true; else if(ch==='"')inStr=false; }
    else if(ch==='"')inStr=true; else if(ch==="{")depth++; else if(ch==="}"){ depth--; if(depth===0){ try{ return JSON.parse(s.slice(i,j+1)); }catch(e){ return null; } } } } return null; }
async function agentTurn(messages){ const native=S.llm.type==="ollama"&&S.llm.apiChat&&!S.llm.jsonOnly;
  if(native){ let res; try{ res=await fetch(S.llm.apiChat,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:S.llm.model,messages,tools:toolSpecs(),stream:false})}); }catch(e){ throw new Error("net:"+e.message); }
    if(!res.ok) throw new Error("http:"+res.status); const j=await res.json(); const msg=j.message||{};
    const tc=(msg.tool_calls||[]).map(c=>({name:c.function?.name,args:typeof c.function?.arguments==="string"?(extractJSON(c.function.arguments)||{}):(c.function?.arguments||{})}));
    if(tc.length) return {toolCalls:tc,text:msg.content||"",raw:msg};
    const parsed=extractJSON(msg.content); if(parsed&&parsed.tool) return {toolCalls:[{name:parsed.tool,args:parsed.args||{}}],text:""};
    return {toolCalls:[],text:(parsed&&parsed.final)||msg.content||""}; }
  const headers={"Content-Type":"application/json"}; if(S.llm.key) headers.Authorization="Bearer "+S.llm.key;
  let res; try{ res=await fetch(S.llm.url,{method:"POST",headers,body:JSON.stringify({model:S.llm.model,messages,stream:false,temperature:0})}); }catch(e){ throw new Error("net:"+e.message); }
  if(!res.ok) throw new Error("http:"+res.status); const j=await res.json();
  const content=j.choices?.[0]?.message?.content || j.message?.content || j.content?.[0]?.text || "";
  const parsed=extractJSON(content); if(parsed&&parsed.tool) return {toolCalls:[{name:parsed.tool,args:parsed.args||{}}],text:""};
  return {toolCalls:[],text:(parsed&&parsed.final)||content||""}; }
async function llmAgent(userText){ const MAX=6, native=S.llm.type==="ollama"&&S.llm.apiChat&&!S.llm.jsonOnly;
  const messages=[{role:"system",content:agentSystemPrompt()},{role:"user",content:userText}]; const transcript=[];
  S._agentBusy=true; status("agent thinking…",true);
  try{ for(let step=0;step<MAX;step++){ let turn;
      try{ turn=await agentTurn(messages); }catch(e){ say(`LLM unreachable (${e.message}); using offline planner.`); await planOnly(userText); return; }
      if(turn.toolCalls&&turn.toolCalls.length){ if(native&&turn.raw) messages.push(turn.raw); else messages.push({role:"assistant",content:JSON.stringify({tool:turn.toolCalls[0].name,args:turn.toolCalls[0].args})});
        for(const call of turn.toolCalls){ const tool=TOOL_MAP[call.name]; let obs;
          if(!tool){ obs=`Error: unknown tool "${call.name}".`; } else { status(`agent: ${call.name}…`,true); try{ obs=await tool.run(call.args||{}); }catch(err){ obs="Error: "+err.message; } }
          transcript.push(`▸ ${call.name} → ${obs}`); say(`▸ ${call.name} — ${obs}`);
          if(native) messages.push({role:"tool",name:call.name,content:obs}); else messages.push({role:"user",content:`Observation from ${call.name}: ${obs}`}); }
        continue; }
      const final=(turn.text||"").trim(); if(final){ say(final); return; }
      if(step===0){ say("LLM returned nothing actionable; using offline planner."); await planOnly(userText); return; }
      say("(agent finished.)"); return; }
    say("Agent reached its step limit. Actions:\n"+(transcript.join("\n")||"(none)"));
  } finally { S._agentBusy=false; status(""); } }
async function planOnly(step){ const saved=S.llm; S.llm=null; try{ S._rawStep=step; await run(step); } finally{ S.llm=saved; S._rawStep=null; } }
// offline shim used when no LLM is connected but old code paths call llmAnswer
async function llmAnswer(t){ return llmAgent(t); }

// ---- exporters -------------------------------------------------------------
function download(name, blob){ const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function exportLinksCSV(){ const m=S.model,r=m.result; if(!r) return say("Run an assignment first."); let out="link,class,lanes,length_m,capacity,volume,vc,los\n";
  const rows=[]; for(let i=0;i<m.nLinks;i++) rows.push(`${i},${m.className(i)},${m.s.lanes[i]},${m.s.length[i].toFixed(1)},${r.cap[i].toFixed(0)},${r.volume[i].toFixed(1)},${r.vc[i].toFixed(3)},${"ABCDEF"[r.los[i]]}`);
  download("link_results.csv", new Blob([out+rows.join("\n")],{type:"text/csv"})); say("Exported link results CSV."); toast("link_results.csv downloaded.","good"); }
function exportCorrespondence(){ const m=S.model; if(!m.aggregation) return say("Aggregate first."); let out="old_zone,new_zone\n",rows=[];
  for(let i=0;i<m.nZones;i++) if(m.aggregation.labels[i]>=0) rows.push(`${i},${m.aggregation.labels[i]}`); download("correspondence.csv",new Blob([out+rows.join("\n")],{type:"text/csv"})); say("Exported correspondence CSV."); toast("correspondence.csv downloaded.","good"); }
function clusterHulls(){ const m=S.model,lab=m.aggregation.labels,zc=m.s.z_centroid; const groups=new Map();
  for(let i=0;i<m.nZones;i++){ const l=lab[i]; if(l<0)continue; let a=groups.get(l); if(!a)groups.set(l,a=[]); a.push([zc[i*2],zc[i*2+1]]); }
  const feats=[]; for(const[id,pts] of groups){ const ring=hull(pts); feats.push({id,n:pts.length,ring}); } return feats; }
function hull(pts){ if(pts.length<3) return pts.slice(); const p=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]); const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[]; for(const q of p){ while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop(); lo.push(q);} const up=[]; for(let i=p.length-1;i>=0;i--){ const q=p[i]; while(up.length>=2&&cross(up[up.length-2],up[up.length-1],q)<=0)up.pop(); up.push(q);} lo.pop(); up.pop(); return lo.concat(up); }
function exportGeoJSON(){ const m=S.model; if(!m.aggregation) return say("Aggregate first."); const [ox,oy]=worldOrigin();
  const feats=clusterHulls().map(f=>({type:"Feature",properties:{new_zone:f.id,n_zones:f.n},geometry:{type:"Polygon",coordinates:[f.ring.map(([x,y])=>[x+ox,y+oy]).concat([[f.ring[0][0]+ox,f.ring[0][1]+oy]])]}}));
  download("clusters.geojson",new Blob([JSON.stringify({type:"FeatureCollection",features:feats})],{type:"application/geo+json"})); say(`Exported ${feats.length} cluster polygons as GeoJSON.`); toast("clusters.geojson downloaded.","good"); }
function worldOrigin(){ return window.STEAM_ORIGIN||[0,0]; }
function exportMapPNG(){ S.map.render(); $("map").toBlob(b=>{ download("map.png",b); say("Exported the map as PNG."); toast("map.png downloaded.","good"); }); }

// shapefile (zipped .shp/.shx/.dbf/.prj) written byte-for-byte in the browser
async function exportShapefile(){ const m=S.model; if(!m.aggregation) return say("Aggregate first."); const feats=clusterHulls(); const [ox,oy]=worldOrigin();
  const {shp,shx,dbf}=buildShapefile(feats.map(f=>({id:f.id,n:f.n,ring:f.ring.map(([x,y])=>[x+ox,y+oy])})));
  const prj='PROJCS["WGS_1984_UTM_Zone_40N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["Central_Meridian",57.0],UNIT["Meter",1.0]]';
  const zip=makeZip([["clusters.shp",shp],["clusters.shx",shx],["clusters.dbf",dbf],["clusters.prj",new TextEncoder().encode(prj)]]);
  download("clusters_shapefile.zip", new Blob([zip],{type:"application/zip"})); say(`Exported ${feats.length} clusters as a zipped ESRI shapefile (UTM 40N).`); toast("clusters_shapefile.zip downloaded.","good"); }

function buildShapefile(feats){
  const recs=feats.map(f=>{ let ring=f.ring.slice(); if(signedArea(ring)>0) ring=ring.reverse(); ring=ring.concat([ring[0]]); return {id:f.id,n:f.n,ring}; });
  const recBodies=[]; let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
  for(const r of recs){ for(const[x,y] of r.ring){ xmin=Math.min(xmin,x);ymin=Math.min(ymin,y);xmax=Math.max(xmax,x);ymax=Math.max(ymax,y);} }
  for(const r of recs){ const np=r.ring.length; const contentBytes=4+32+4+4+4+np*16; const buf=new ArrayBuffer(contentBytes); const dv=new DataView(buf); let o=0;
    dv.setInt32(o,5,true);o+=4; dv.setFloat64(o,bb(r.ring,0,Math.min),true);o+=8; dv.setFloat64(o,bb(r.ring,1,Math.min),true);o+=8; dv.setFloat64(o,bb(r.ring,0,Math.max),true);o+=8; dv.setFloat64(o,bb(r.ring,1,Math.max),true);o+=8;
    dv.setInt32(o,1,true);o+=4; dv.setInt32(o,np,true);o+=4; dv.setInt32(o,0,true);o+=4;
    for(const[x,y] of r.ring){ dv.setFloat64(o,x,true);o+=8; dv.setFloat64(o,y,true);o+=8; } recBodies.push(new Uint8Array(buf)); }
  let shpLen=100; for(const b of recBodies) shpLen+=8+b.length;
  const shp=new Uint8Array(shpLen), shx=new Uint8Array(100+recBodies.length*8); const sd=new DataView(shp.buffer), xd=new DataView(shx.buffer);
  sd.setInt32(0,9994); sd.setInt32(24,shpLen/2); sd.setInt32(28,1000,true); sd.setInt32(32,5,true);
  sd.setFloat64(36,xmin,true);sd.setFloat64(44,ymin,true);sd.setFloat64(52,xmax,true);sd.setFloat64(60,ymax,true);
  xd.setInt32(0,9994); xd.setInt32(24,(100+recBodies.length*8)/2); xd.setInt32(28,1000,true); xd.setInt32(32,5,true);
  xd.setFloat64(36,xmin,true);xd.setFloat64(44,ymin,true);xd.setFloat64(52,xmax,true);xd.setFloat64(60,ymax,true);
  let pos=100; for(let i=0;i<recBodies.length;i++){ const b=recBodies[i]; sd.setInt32(pos,i+1); sd.setInt32(pos+4,b.length/2); shp.set(b,pos+8);
    xd.setInt32(100+i*8,pos/2); xd.setInt32(100+i*8+4,b.length/2); pos+=8+b.length; }
  const nRec=recs.length, hdrLen=32+32*2+1, recLen=1+10+6; const dbf=new Uint8Array(hdrLen+nRec*recLen+1); const dd=new DataView(dbf.buffer);
  dbf[0]=3; const now=new Date(); dbf[1]=now.getFullYear()-1900; dbf[2]=now.getMonth()+1; dbf[3]=now.getDate();
  dd.setInt32(4,nRec,true); dd.setInt16(8,hdrLen,true); dd.setInt16(10,recLen,true);
  writeField(dbf,32,"new_zone",78,10); writeField(dbf,64,"n_zones",78,6); dbf[hdrLen-1]=0x0d;
  let p=hdrLen; for(const r of recs){ dbf[p++]=0x20; p=writeNum(dbf,p,r.id,10); p=writeNum(dbf,p,r.n,6); } dbf[p]=0x1a;
  return {shp,shx,dbf};
}
function bb(ring,ax,fn){ let v=fn===Math.min?Infinity:-Infinity; for(const pt of ring) v=fn(v,pt[ax]); return v; }
function signedArea(r){ let s=0; for(let i=0;i<r.length;i++){ const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length]; s+=x1*y2-x2*y1; } return s/2; }
function writeField(buf,off,name,type,len){ for(let i=0;i<11;i++) buf[off+i]= i<name.length?name.charCodeAt(i):0; buf[off+11]=type; buf[off+16]=len; }
function writeNum(buf,p,val,len){ const s=String(Math.round(val)).slice(0,len).padStart(len," "); for(let i=0;i<len;i++) buf[p+i]=s.charCodeAt(i); return p+len; }

function makeZip(files){ const enc=new TextEncoder(); const parts=[],central=[]; let offset=0;
  for(const[name,data] of files){ const nb=enc.encode(name); const crc=crc32(data); const lh=new Uint8Array(30+nb.length); const d=new DataView(lh.buffer);
    d.setUint32(0,0x04034b50,true); d.setUint16(4,20,true); d.setUint16(6,0,true); d.setUint16(8,0,true); d.setUint16(10,0,true); d.setUint16(12,0,true);
    d.setUint32(14,crc,true); d.setUint32(18,data.length,true); d.setUint32(22,data.length,true); d.setUint16(26,nb.length,true); d.setUint16(28,0,true); lh.set(nb,30);
    parts.push(lh,data); const ch=new Uint8Array(46+nb.length); const c=new DataView(ch.buffer);
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true); c.setUint16(28,nb.length,true); c.setUint32(42,offset,true); ch.set(nb,46);
    central.push(ch); offset+=lh.length+data.length; }
  let cs=0; for(const c of central) cs+=c.length; const end=new Uint8Array(22); const e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,cs,true); e.setUint32(16,offset,true);
  const all=parts.concat(central,[end]); let len=0; for(const p of all) len+=p.length; const out=new Uint8Array(len); let o=0; for(const p of all){ out.set(p,o); o+=p.length; } return out; }
const CRCT=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; t[n]=c>>>0;} return t; })();
function crc32(d){ let c=0xffffffff; for(let i=0;i<d.length;i++) c=CRCT[(c^d[i])&0xff]^(c>>>8); return (c^0xffffffff)>>>0; }

// ---- global error boundary -------------------------------------------------
window.addEventListener("error", e=>{ STEAM_fatal("Something went wrong",(e&&e.error&&e.error.message)||e.message||"An unexpected error occurred.","Reload the page to start over."); });
window.addEventListener("unhandledrejection", e=>{ const r=e&&e.reason; STEAM_fatal("Something went wrong",(r&&r.message)||String(r||"A background task failed."),"Reload the page to try again."); });
boot().catch(e=>{ console.error(e); STEAM_fatal("Could not start STEAM 2040 Studio",(e&&e.message)||"Unknown error while loading the network.",STEAM_bootHint(e)); });
