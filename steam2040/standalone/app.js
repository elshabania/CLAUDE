/* STEAM 2040 Studio — standalone app controller, copilot and exporters. */
import { decodeBlob, Model, FACILITY } from "./engine.js";
import { GLMap } from "./glmap.js";

// ---- colour ----------------------------------------------------------------
const VIR = (() => { const c = [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]], n = 256, L = new Uint8Array(n*3);
  for (let i=0;i<n;i++){ const t=i/(n-1)*(c.length-1), k=Math.min(c.length-2,t|0), f=t-k;
    for(let j=0;j<3;j++) L[i*3+j]=Math.round(c[k][j]+(c[k+1][j]-c[k][j])*f); } return L; })();
function vir(t){ t=Math.max(0,Math.min(1,t))*255|0; return [VIR[t*3],VIR[t*3+1],VIR[t*3+2]]; }
const CLASS_RGB={fwy:[202,0,32],ramp:[244,165,130],art:[5,113,176],coll:[146,197,222],local:[150,150,150],rural:[123,50,148],junc:[230,171,2]};
const CLASS_W={fwy:3,ramp:2,art:2.6,coll:1.6,local:1,rural:1.4,junc:1};
const LOS_RGB=[[26,150,65],[166,217,106],[255,255,191],[253,174,97],[215,25,28],[140,0,0]];
const LOD_MPP={local:12,junc:12,coll:40,rural:40,ramp:1e9,art:1e9,fwy:1e9};

// ---- state -----------------------------------------------------------------
const S = { model:null, map:null, mode:"network", colorMode:"class", zoneAttr:null,
  highlight:null, ctx:{ lastZone:null, lastZones:null, lastLinks:null }, llm:null };
const $ = id => document.getElementById(id);
function status(t, busy){ $("status").textContent=t; $("status").classList.toggle("busy",!!busy); }
function legend(t){ $("legend").textContent=t; }

// ---- boot ------------------------------------------------------------------
async function boot(){
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
  status(`${m.nLinks.toLocaleString()} links · ${m.nNodes.toLocaleString()} nodes · ${m.nZones.toLocaleString()} zones · ${m.h.n_od.toLocaleString()} OD`);
  wire(); setMode("network");
}
const tick = () => new Promise(r=>setTimeout(r,16));

// ---- styling links ---------------------------------------------------------
function applyLinkStyle(mode){
  S.colorMode = mode; const m=S.model, n=m.nLinks, r=m.result, b=new Uint8Array(n*5);
  let vmax=1; if(r&&(mode==="volume")) vmax=Math.max(1,...sample(r.volume));
  const hi = S.highlight ? new Set(S.highlight) : null;
  for(let i=0;i<n;i++){ const c=m.className(i); let rgb,w;
    if(mode==="class"||(!r&&(mode==="volume"||mode==="vc"||mode==="los"))){ rgb=CLASS_RGB[c]; w=CLASS_W[c]; }
    else if(mode==="volume"){ const t=r.volume[i]/vmax; rgb=vir(t); w=0.8+5*Math.sqrt(t); }
    else if(mode==="vc"){ const t=Math.min(r.vc[i],1.5)/1.5; rgb=vir(t); w=1+4*t; }
    else if(mode==="los"){ rgb=LOS_RGB[r.los[i]]; w=1.6; }
    else if(mode==="lanes"){ const t=Math.min(m.s.lanes[i],6)/6; rgb=vir(t); w=1+t*3; }
    else if(mode==="length"){ const t=Math.min(m.s.length[i],5000)/5000; rgb=vir(t); w=1.4; }
    else if(mode==="speed"){ const sp=r?m.s.length[i]/Math.max(r.ctime[i],1e-6)*3.6:0; const t=Math.min(sp,120)/120; rgb=r?vir(t):CLASS_RGB[c]; w=1.4; }
    else { rgb=CLASS_RGB[c]; w=CLASS_W[c]; }
    let draw = 255;
    // LOD: hide minor classes when zoomed out (handled per-frame would need re-render; keep simple: always draw)
    if(hi){ if(hi.has(i)){ rgb=[255,220,40]; w=Math.max(w,3.5); } else { rgb=rgb.map(v=>v*0.45|0); w=Math.max(0.8,w*0.7); } }
    b[i*5]=rgb[0]; b[i*5+1]=rgb[1]; b[i*5+2]=rgb[2]; b[i*5+3]=255; b[i*5+4]=Math.max(1,Math.min(255,w*28))|0;
  }
  S.map.setStyle(b);
  legend({class:"facility class",volume:"volume: low→high (viridis)",vc:"v/c ratio (viridis)",los:"level of service A–F",
    lanes:"lanes (viridis)",length:"length (viridis)",speed:"congested speed (viridis)"}[mode]||mode);
}
function sample(arr){ const out=[]; const step=Math.max(1,(arr.length/5000)|0); for(let i=0;i<arr.length;i+=step) out.push(arr[i]); return out; }

// ---- styling zones ---------------------------------------------------------
function zoneValues(attr){ const m=S.model,s=m.s,z=m.nZones,v=new Float64Array(z);
  const g=(f)=>s["z_"+f];
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
  const m=S.model, zc=m.s.z_centroid, z=m.nZones, xy=new Float32Array(z*2), col=new Uint8Array(z*4);
  for(let i=0;i<z;i++){ xy[i*2]=zc[i*2]; xy[i*2+1]=zc[i*2+1]; }
  if(cluster && m.aggregation){ const lab=m.aggregation.labels;
    for(let i=0;i<z;i++){ const l=lab[i]; if(l<0){ col[i*4+3]=0; continue;} const h=(l*2654435761)>>>0;
      col[i*4]=(h>>16)&255; col[i*4+1]=((h>>8)&255)|40; col[i*4+2]=(h&255)|40; col[i*4+3]=255; }
    legend(`zones by new cluster (${m.aggregation.nClusters} clusters)`);
  } else { const val=zoneValues(attr); let mx=1; for(let i=0;i<z;i++) if(val[i]>mx) mx=val[i];
    for(let i=0;i<z;i++){ if(zc[i*2]===0&&zc[i*2+1]===0){ col[i*4+3]=0; continue;} const t=val[i]/mx, rgb=vir(t);
      col[i*4]=rgb[0]; col[i*4+1]=rgb[1]; col[i*4+2]=rgb[2]; col[i*4+3]=255; }
    legend(`zones by ${attr} (viridis)`); S.zoneAttr=attr;
  }
  S.map.setDots(xy, col); S.map.showDots=true; S.map.dotSize = cluster?4:6; S.map.render();
}

// ---- assignment ------------------------------------------------------------
async function runAssign(method, demand){
  const m=S.model; method=method||"frankwolfe"; demand=demand||"fixed";
  if(S.assigning){ m.abort=true; return; }            // toggle = stop
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
function fillKPI(k){ const f=(x)=>Math.round(x).toLocaleString();
  $("kpi").innerHTML = !k ? "" : `
    <div><span>VHT</span><b>${f(k.vht)}</b></div><div><span>VMT</span><b>${f(k.vmt)}</b></div>
    <div><span>Avg speed</span><b>${k.speed.toFixed(1)} km/h</b></div><div><span>Avg v/c</span><b>${k.avgVc.toFixed(2)}</b></div>
    <div><span>Over capacity</span><b>${f(k.over)} (${(k.overShare*100).toFixed(0)}%)</b></div>
    <div><span>Gap</span><b>${isFinite(k.gap)?k.gap.toExponential(1):"–"}</b></div>`;
}

// ---- workspaces ------------------------------------------------------------
function setMode(mode){ S.mode=mode; for(const el of document.querySelectorAll(".rail button")) el.classList.toggle("on",el.dataset.m===mode);
  $("panel-network").hidden=mode!=="network"; $("panel-agg").hidden=mode!=="aggregation"; $("panel-assign").hidden=mode!=="assignment";
  $("paneltitle").textContent={network:"Network",aggregation:"Zone aggregation",assignment:"Assignment"}[mode]; }

// ---- HUD overlay (highlight labels) ---------------------------------------
function drawHud(){}

// ---- wiring ----------------------------------------------------------------
function wire(){
  for(const el of document.querySelectorAll(".rail button")) el.onclick=()=>setMode(el.dataset.m);
  $("runAssign").onclick=()=>runAssign($("method").value,$("demand").value);
  $("volvc").onclick=()=>{ const cur=S.colorMode==="vc"?"volume":"vc"; applyLinkStyle(cur);
    for(const b of $("volvc").children) b.classList.toggle("on", b.dataset.c===cur); };
  $("aggBtn").onclick=()=>{ const a=S.model.aggregate(+$("aggTarget").value,$("aggBarrier").value,+$("aggSpan").value,["district"]);
    $("aggKpi").textContent=`${(S.model.nZones).toLocaleString()} → ${a.nClusters.toLocaleString()} clusters · ${a.mergeEdges.length.toLocaleString()} merges`;
    showZones(null,true); };
  // colour-links swatches
  for(const el of document.querySelectorAll(".swatches button[data-style]")) el.onclick=async()=>{
    const md=el.dataset.style;
    if((md==="volume"||md==="vc")&&!S.model.result) await runAssign("frankwolfe",$("demand").value);
    S.map.showDots=false; applyLinkStyle(md); S.map.render();
    for(const b of document.querySelectorAll(".swatches button[data-style]")) b.classList.toggle("on",b===el); };
  // colour-zones select
  $("zoneAttr").onchange=()=>{ const a=$("zoneAttr").value; if(!a){ S.map.showDots=false; applyLinkStyle(S.colorMode); S.map.render(); return; }
    S.map.showLinks=true; showZones(a,false); S.map.render(); };
  // copilot
  $("send").onclick=submit; $("cmd").addEventListener("keydown",e=>{ if(e.key==="Enter") submit(); });
  rotatePlaceholder();
  // map interaction
  const c=$("map"); let drag=false,lx=0,ly=0,ht=0,busy=false;
  c.addEventListener("pointerdown",e=>{ if(e.button===2){ const i=S.map.pick(e.offsetX,e.offsetY); if(i>=0){ S.ctx.lastLinks=[i]; say(`Selected link ${i} (${S.model.className(i)}, ${S.model.s.lanes[i]} ln, ${Math.round(S.model.s.length[i])} m).`);} return;} drag=true; lx=e.clientX; ly=e.clientY; c.setPointerCapture(e.pointerId); });
  c.addEventListener("pointerup",()=>drag=false); c.addEventListener("contextmenu",e=>e.preventDefault());
  c.addEventListener("pointermove",async e=>{ if(drag){ S.map.pan(e.clientX-lx,e.clientY-ly); lx=e.clientX; ly=e.clientY; return;}
    const now=performance.now(); if(now-ht<60||busy)return; ht=now; const i=S.map.pick(e.offsetX,e.offsetY);
    if(i<0){ $("tip").hidden=true; return;} const m=S.model,r=m.result; $("tip").hidden=false; $("tip").style.left=(e.offsetX+14)+"px"; $("tip").style.top=(e.offsetY+14)+"px";
    $("tip").innerHTML=`<b>Link ${i}</b> · ${m.className(i)} · ${m.s.lanes[i]} ln · ${Math.round(m.s.length[i])} m`+(r?`<br>vol ${Math.round(r.volume[i])} / cap ${Math.round(r.cap[i])} · v/c ${r.vc[i].toFixed(2)} · LOS ${"ABCDEF"[r.los[i]]}`:""); });
  c.addEventListener("wheel",e=>{ e.preventDefault(); S.map.zoomAt(e.offsetX,e.offsetY,Math.pow(1.0015,-e.deltaY)); },{passive:false});
  window.addEventListener("resize",()=>S.map.resize());
}
const PLACEH=["colour zones by population","run an AM peak assignment","show me the worst congestion","recommend improvements","aggregate to 1500 zones","trips from zone 200","connect ollama llama3.1"];
function rotatePlaceholder(){ let i=0; setInterval(()=>{ $("cmd").placeholder=PLACEH[i++%PLACEH.length]; },3500); }

// ---- copilot ---------------------------------------------------------------
function say(t, you){ const d=document.createElement("div"); d.className="msg"+(you?" you":""); d.textContent=t; $("chat").appendChild(d);
  while($("chat").children.length>6) $("chat").removeChild($("chat").firstChild); }
async function submit(){ const t=$("cmd").value.trim(); if(!t)return; $("cmd").value=""; say(t,true);
  const steps=t.split(/\bthen\b|\band then\b|;|\balso\b/i).map(s=>s.trim()).filter(Boolean);
  for(const step of steps){ try{ await run(step); }catch(err){ say("⚠ "+err.message); } }
}
function num(t){ const m=t.match(/-?\d[\d,]*/); return m?+m[0].replace(/,/g,""):null; }
async function run(t){
  t=t.toLowerCase();
  // LLM connect
  if(/^connect /.test(t)) return connectLLM(t);
  if(/\bhelp\b/.test(t)) return say("Try: colour links by volume · run frank-wolfe · show the worst congestion · recommend improvements · aggregate to 1500 zones · population of zone 120 · trips from zone 200 · export link results csv");
  // colour links
  let m;
  if((m=t.match(/colou?r links by (volume|v\/c|vc|lanes|length|speed)/))){ const md=m[1]==="v/c"?"vc":m[1]; if((md==="volume"||md==="vc"||md==="speed")&&!S.model.result)await runAssign("frankwolfe",$("demand").value); S.map.showDots=false; applyLinkStyle(md); return say(`Coloured links by ${m[1]}.`); }
  if(/worst congestion|most congested/.test(t)){ if(!S.model.result)await runAssign("frankwolfe",$("demand").value); const top=S.model.topCongested(15); S.highlight=top.map(x=>x.i); S.ctx.lastLinks=S.highlight; S.map.showDots=false; applyLinkStyle("vc"); flyToLinks(S.highlight); return say(`Worst link: ${top[0].i} (${top[0].klass}) v/c ${top[0].vc.toFixed(2)}, LOS ${top[0].los}. Highlighted the top 15.`); }
  if(/over capacity|los f/.test(t)){ if(!S.model.result)await runAssign("frankwolfe",$("demand").value); const over=[]; for(let i=0;i<S.model.nLinks;i++) if(S.model.result.vc[i]>1) over.push(i); S.highlight=over.slice(0,400); applyLinkStyle("vc"); return say(`${over.length.toLocaleString()} links are over capacity (LOS F).`); }
  if((m=t.match(/show (?:only )?(freeways?|arterials?|collectors?|ramps?|locals?)/))){ const map={freeway:"fwy",arterial:"art",collector:"coll",ramp:"ramp",local:"local"}; const c=map[m[1].replace(/s$/,"")]; const ids=[]; for(let i=0;i<S.model.nLinks;i++) if(S.model.className(i)===c) ids.push(i); S.highlight=ids; applyLinkStyle("class"); return say(`Showing ${ids.length.toLocaleString()} ${m[1]}.`); }
  // colour zones
  if((m=t.match(/colou?r zones by ([a-z\- ]+)/))){ const a=normAttr(m[1].trim()); S.map.showDots=true; S.map.showLinks=true; showZones(a,false); S.map.render(); return say(`Coloured zones by ${a}.`); }
  // run / methods
  if(/\brun\b|assign|equilibrium|frank|wolfe|free.?flow|\bmsa\b|incremental/.test(t)){ let method="frankwolfe"; if(/free.?flow|all.?or.?nothing/.test(t))method="freeflow"; else if(/\bmsa\b/.test(t))method="msa"; else if(/incremental/.test(t))method="incremental";
    if(/am peak/.test(t))S.model.settings.periodFactor=0.1; else if(/24|daily/.test(t))S.model.settings.periodFactor=1; else if(/off.?peak/.test(t))S.model.settings.periodFactor=0.083;
    const sm=t.match(/sample\s+(\d+)/); if(sm)S.model.settings.originSample=+sm[1];
    const demand=/gravity/.test(t)?"gravity":"fixed"; $("method").value=method; setMode("assignment"); await runAssign(method,demand); const k=S.model.kpis(); return say(`Ran ${method}. VHT ${Math.round(k.vht).toLocaleString()}, avg speed ${k.speed.toFixed(1)} km/h, ${k.over.toLocaleString()} links over capacity.`); }
  // recommend
  if(/recommend|improvement|where to (widen|add)/.test(t)){ if(!S.model.result)await runAssign("frankwolfe",$("demand").value); const recs=S.model.recommend(8); S._recs=recs; S.highlight=recs.map(r=>r.i); applyLinkStyle("vc"); flyToLinks(S.highlight); return say("Top fixes:\n"+recs.slice(0,5).map((r,i)=>`${i+1}. link ${r.i} (${r.klass}) v/c ${r.vc.toFixed(2)} · saves ${Math.round(r.saveVehH)} veh-h · BCR ${isFinite(r.bcr)?r.bcr.toFixed(2):"∞"}`).join("\n")); }
  if((m=t.match(/apply recommendation\s+(\d+)/))){ const r=(S._recs||[])[+m[1]-1]; if(!r)return say("Run 'recommend improvements' first."); const before=S.model.kpis().vht; S.model.upgradeLink(r.i,2); await runAssign(S.model.result.method,S.model.result.demand); const after=S.model.kpis().vht; return say(`Widened link ${r.i} by 2 lanes and re-assigned. VHT ${Math.round(before).toLocaleString()} → ${Math.round(after).toLocaleString()} (${Math.round(before-after).toLocaleString()} saved).`); }
  if((m=t.match(/upgrade link\s+(\d+)\s*by\s*(\d+)/))){ S.model.upgradeLink(+m[1],+m[2]); if(S.model.result)await runAssign(S.model.result.method,S.model.result.demand); return say(`Upgraded link ${m[1]} by ${m[2]} lanes${S.model.result?" and re-assigned":""}.`); }
  // aggregate
  if((m=t.match(/aggregate(?: to)?\s+(\d[\d,]*)\s*zones?/))){ const tgt=+m[1].replace(/,/g,""); const bar=/freeway/.test(t)?"fwy":/arterial/.test(t)?"art":"coll"; const a=S.model.aggregate(tgt,bar,6000,["district"]); setMode("aggregation"); $("aggTarget").value=tgt; $("aggKpi").textContent=`${S.model.nZones.toLocaleString()} → ${a.nClusters.toLocaleString()} clusters`; showZones(null,true); S.map.render(); return say(`Aggregated to ${a.nClusters.toLocaleString()} clusters (no merge crosses a ${bar} or exceeds 6 km).`); }
  // interrogate zones
  if((m=t.match(/population of zone\s+(\d+)/))) return say(`Zone ${m[1]} population: ${S.model.s.z_pop_tot[+m[1]].toLocaleString()}.`);
  if((m=t.match(/jobs in zone\s+(\d+)/))) return say(`Zone ${m[1]} jobs: ${S.model.s.z_worker[+m[1]].toLocaleString()}.`);
  if((m=t.match(/zoom to zone\s+(\d+)/))){ const z=+m[1],zc=S.model.s.z_centroid; S.ctx.lastZone=z; S.map.flyTo(zc[z*2],zc[z*2+1],S.map.scale*0+0.04); return say(`Zoomed to zone ${z}.`); }
  if((m=t.match(/top\s+(\d+)\s+zones by (\w+)/))){ const k=+m[1],a=normAttr(m[2]),val=zoneValues(a); const idx=[...Array(S.model.nZones).keys()].sort((x,y)=>val[y]-val[x]).slice(0,k); S.ctx.lastZones=idx; return say(`Top ${k} zones by ${a}: `+idx.map(i=>`#${i} (${Math.round(val[i]).toLocaleString()})`).join(", ")); }
  // interrogate matrix
  if((m=t.match(/trips from zone\s+(\d+)\s+to\s+(\d+)/))){ const o=+m[1],d=+m[2]; let tr=0; const s=S.model.s; for(let k=0;k<S.model.h.n_od;k++) if(s.od_o[k]===o&&s.od_d[k]===d){tr=s.od_t[k];break;} return say(`Trips ${o}→${d}: ${tr.toFixed(1)} per day.`); }
  if((m=t.match(/trips from zone\s+(\d+)/))){ const o=+m[1],s=S.model.s; let tot=0; for(let k=0;k<S.model.h.n_od;k++) if(s.od_o[k]===o) tot+=s.od_t[k]; return say(`Zone ${o} produces ${Math.round(tot).toLocaleString()} trips/day.`); }
  if((m=t.match(/trips to zone\s+(\d+)/))){ const d=+m[1],s=S.model.s; let tot=0; for(let k=0;k<S.model.h.n_od;k++) if(s.od_d[k]===d) tot+=s.od_t[k]; return say(`Zone ${d} attracts ${Math.round(tot).toLocaleString()} trips/day.`); }
  // interrogate network
  if(/how many links/.test(t)) return say(`${S.model.nLinks.toLocaleString()} road links, ${S.model.nNodes.toLocaleString()} nodes.`);
  if(/how many zones/.test(t)) return say(`${S.model.nZones.toLocaleString()} zones.`);
  if(/total lane.?km/.test(t)){ let lk=0; for(let i=0;i<S.model.nLinks;i++) lk+=S.model.s.lanes[i]*S.model.s.length[i]/1000; return say(`Total lane-km: ${Math.round(lk).toLocaleString()}.`); }
  if(/connectivity/.test(t)) return say("Connectivity check runs in the full engine; the standalone shows the loaded network.");
  // exports
  if(/export link/.test(t)) return exportLinksCSV();
  if(/export the correspondence|export correspondence/.test(t)) return exportCorrespondence();
  if(/export.*geojson/.test(t)) return exportGeoJSON();
  if(/export.*shapefile/.test(t)) return exportShapefile();
  if(/export the map|export map/.test(t)) return exportMapPNG();
  // theme
  if(/light theme/.test(t)){ document.body.classList.add("light"); return say("Light theme on."); }
  if(/dark theme/.test(t)){ document.body.classList.remove("light"); return say("Dark theme on."); }
  // LLM fallback
  if(S.llm) return llmAnswer(t);
  return say("I didn't recognise that. Type 'help' for examples.");
}
function normAttr(a){ a=a.trim(); const map={pop:"population",population:"population",jobs:"jobs",workers:"jobs",students:"students",household:"households",households:"households",retail:"retail",office:"office",industrial:"industrial",school:"school",productions:"productions",attractions:"attractions","jobs-housing":"jobs-housing","jobs housing":"jobs-housing",metro:"metro","metro access":"metro",density:"population"}; return map[a]||a; }
function flyToLinks(ids){ if(!ids||!ids.length)return; const xy=S.model.s.geom_xy,off=S.model.s.geom_off; let sx=0,sy=0,nn=0; for(const i of ids){ const k=off[i]; sx+=xy[k*2]; sy+=xy[k*2+1]; nn++; } S.map.flyTo(sx/nn,sy/nn); }

// ---- LLM connect -----------------------------------------------------------
function connectLLM(t){
  let m;
  if((m=t.match(/connect ollama\s+(\S+)(?:\s*\|\s*(\S+))?/))){ S.llm={type:"ollama",model:m[1],url:m[2]||"http://localhost:11434/v1/chat/completions"}; return say(`Connected to local Ollama (${m[1]}). Offline planner stays as fallback.`); }
  if((m=t.match(/connect claude\s+(\S+)/))){ S.llm={type:"openai",model:"claude",url:"https://api.anthropic.com/v1/messages",key:m[1]}; return say("Connected to Claude (Anthropic API)."); }
  if((m=t.match(/connect ai\s+(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)/))){ S.llm={type:"openai",url:m[1],key:m[2],model:m[3]}; return say(`Connected to ${m[3]}.`); }
  return say("Usage: connect ollama llama3.1 · connect claude <key> · connect ai <url> | <key> | <model>");
}
async function llmAnswer(t){
  try{ const sys="You are the copilot inside STEAM 2040 Studio, an Abu Dhabi transport model. Answer briefly.";
    let res;
    if(S.llm.type==="ollama"){ res=await fetch(S.llm.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:S.llm.model,messages:[{role:"system",content:sys},{role:"user",content:t}],stream:false})}); const j=await res.json(); return say(j.choices?.[0]?.message?.content||j.message?.content||"(no reply)"); }
    res=await fetch(S.llm.url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+S.llm.key},body:JSON.stringify({model:S.llm.model,messages:[{role:"system",content:sys},{role:"user",content:t}]})}); const j=await res.json(); return say(j.choices?.[0]?.message?.content||"(no reply)");
  }catch(e){ return say("LLM unreachable; using offline planner. ("+e.message+")"); }
}

// ---- exporters -------------------------------------------------------------
function download(name, blob){ const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function exportLinksCSV(){ const m=S.model,r=m.result; if(!r) return say("Run an assignment first."); let out="link,class,lanes,length_m,capacity,volume,vc,los\n";
  const rows=[]; for(let i=0;i<m.nLinks;i++) rows.push(`${i},${m.className(i)},${m.s.lanes[i]},${m.s.length[i].toFixed(1)},${r.cap[i].toFixed(0)},${r.volume[i].toFixed(1)},${r.vc[i].toFixed(3)},${"ABCDEF"[r.los[i]]}`);
  download("link_results.csv", new Blob([out+rows.join("\n")],{type:"text/csv"})); say("Exported link results CSV."); }
function exportCorrespondence(){ const m=S.model; if(!m.aggregation) return say("Aggregate first."); let out="old_zone,new_zone\n",rows=[];
  for(let i=0;i<m.nZones;i++) if(m.aggregation.labels[i]>=0) rows.push(`${i},${m.aggregation.labels[i]}`); download("correspondence.csv",new Blob([out+rows.join("\n")],{type:"text/csv"})); say("Exported correspondence CSV."); }
function clusterHulls(){ const m=S.model,lab=m.aggregation.labels,zc=m.s.z_centroid,xmin=0,ymin=0; const groups=new Map();
  for(let i=0;i<m.nZones;i++){ const l=lab[i]; if(l<0)continue; let a=groups.get(l); if(!a)groups.set(l,a=[]); a.push([zc[i*2],zc[i*2+1]]); }
  const feats=[]; for(const[id,pts] of groups){ const ring=hull(pts); feats.push({id,n:pts.length,ring}); } return feats; }
function hull(pts){ if(pts.length<3) return pts.slice(); const p=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]); const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[]; for(const q of p){ while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop(); lo.push(q);} const up=[]; for(let i=p.length-1;i>=0;i--){ const q=p[i]; while(up.length>=2&&cross(up[up.length-2],up[up.length-1],q)<=0)up.pop(); up.push(q);} lo.pop(); up.pop(); return lo.concat(up); }
function exportGeoJSON(){ const m=S.model; if(!m.aggregation) return say("Aggregate first."); const [ox,oy]=worldOrigin();
  const feats=clusterHulls().map(f=>({type:"Feature",properties:{new_zone:f.id,n_zones:f.n},geometry:{type:"Polygon",coordinates:[f.ring.map(([x,y])=>[x+ox,y+oy]).concat([[f.ring[0][0]+ox,f.ring[0][1]+oy]])]}}));
  download("clusters.geojson",new Blob([JSON.stringify({type:"FeatureCollection",features:feats})],{type:"application/geo+json"})); say(`Exported ${feats.length} cluster polygons as GeoJSON.`); }
function worldOrigin(){ return window.STEAM_ORIGIN||[0,0]; }
function exportMapPNG(){ S.map.render(); $("map").toBlob(b=>{ download("map.png",b); say("Exported the map as PNG."); }); }

// shapefile (zipped .shp/.shx/.dbf/.prj) written byte-for-byte in the browser
async function exportShapefile(){ const m=S.model; if(!m.aggregation) return say("Aggregate first."); const feats=clusterHulls(); const [ox,oy]=worldOrigin();
  const {shp,shx,dbf}=buildShapefile(feats.map(f=>({id:f.id,n:f.n,ring:f.ring.map(([x,y])=>[x+ox,y+oy])})));
  const prj='PROJCS["WGS_1984_UTM_Zone_40N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["Central_Meridian",57.0],UNIT["Meter",1.0]]';
  const zip=makeZip([["clusters.shp",shp],["clusters.shx",shx],["clusters.dbf",dbf],["clusters.prj",new TextEncoder().encode(prj)]]);
  download("clusters_shapefile.zip", new Blob([zip],{type:"application/zip"})); say(`Exported ${feats.length} clusters as a zipped ESRI shapefile (UTM 40N).`); }

function buildShapefile(feats){
  // polygon shapefile; rings clockwise (ESRI outer-ring orientation)
  const recs=feats.map(f=>{ let ring=f.ring.slice(); if(signedArea(ring)>0) ring=ring.reverse(); ring=ring.concat([ring[0]]); return {id:f.id,n:f.n,ring}; });
  let total=100; const recHdr=8, recBodies=[];
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
  for(const r of recs){ for(const[x,y] of r.ring){ xmin=Math.min(xmin,x);ymin=Math.min(ymin,y);xmax=Math.max(xmax,x);ymax=Math.max(ymax,y);} }
  const offsets=[];
  for(const r of recs){ const np=r.ring.length; const len=44+ (4) + np*16; // content length bytes (poly: 4 shapetype +32 bbox +4 numparts +4 numpoints +4*parts + 16*points)
    const contentBytes=4+32+4+4+4+np*16; const buf=new ArrayBuffer(contentBytes); const dv=new DataView(buf); let o=0;
    dv.setInt32(o,5,true);o+=4; dv.setFloat64(o,bb(r.ring,0,Math.min),true);o+=8; dv.setFloat64(o,bb(r.ring,1,Math.min),true);o+=8; dv.setFloat64(o,bb(r.ring,0,Math.max),true);o+=8; dv.setFloat64(o,bb(r.ring,1,Math.max),true);o+=8;
    dv.setInt32(o,1,true);o+=4; dv.setInt32(o,np,true);o+=4; dv.setInt32(o,0,true);o+=4;
    for(const[x,y] of r.ring){ dv.setFloat64(o,x,true);o+=8; dv.setFloat64(o,y,true);o+=8; }
    recBodies.push(new Uint8Array(buf)); }
  // assemble .shp + .shx
  let shpLen=100; for(const b of recBodies) shpLen+=8+b.length;
  const shp=new Uint8Array(shpLen), shx=new Uint8Array(100+recBodies.length*8); const sd=new DataView(shp.buffer), xd=new DataView(shx.buffer);
  sd.setInt32(0,9994); sd.setInt32(24,shpLen/2); sd.setInt32(28,1000,true); sd.setInt32(32,5,true);
  sd.setFloat64(36,xmin,true);sd.setFloat64(44,ymin,true);sd.setFloat64(52,xmax,true);sd.setFloat64(60,ymax,true);
  xd.setInt32(0,9994); xd.setInt32(24,(100+recBodies.length*8)/2); xd.setInt32(28,1000,true); xd.setInt32(32,5,true);
  xd.setFloat64(36,xmin,true);xd.setFloat64(44,ymin,true);xd.setFloat64(52,xmax,true);xd.setFloat64(60,ymax,true);
  let pos=100; for(let i=0;i<recBodies.length;i++){ const b=recBodies[i]; sd.setInt32(pos,i+1); sd.setInt32(pos+4,b.length/2); shp.set(b,pos+8);
    xd.setInt32(100+i*8,pos/2); xd.setInt32(100+i*8+4,b.length/2); pos+=8+b.length; }
  // .dbf: fields new_zone (N 10), n_zones (N 6)
  const nRec=recs.length, hdrLen=32+32*2+1, recLen=1+10+6; const dbf=new Uint8Array(hdrLen+nRec*recLen+1); const dd=new DataView(dbf.buffer);
  dbf[0]=3; const now=new Date(); dbf[1]=now.getFullYear()-1900; dbf[2]=now.getMonth()+1; dbf[3]=now.getDate();
  dd.setInt32(4,nRec,true); dd.setInt16(8,hdrLen,true); dd.setInt16(10,recLen,true);
  writeField(dbf,32,"new_zone",78,10); writeField(dbf,64,"n_zones",78,6); dbf[hdrLen-1]=0x0d;
  let p=hdrLen; for(const r of recs){ dbf[p++]=0x20; p=writeNum(dbf,p,r.id,10); p=writeNum(dbf,p,r.n,6); } dbf[p]=0x1a;
  return {shp,shx,dbf};
}
function bb(ring,ax,fn){ let v=fn===Math.min?Infinity:-Infinity; for(const pt of ring) v=fn(v,pt[ax]); return v; }
function signedArea(r){ let s=0; for(let i=0;i<r.length;i++){ const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length]; s+=x1*y2-x2*y1; } return s/2; }
function writeField(buf,off,name,type,len){ for(let i=0;i<11;i++) buf[off+i]= i<name.length?name.charCodeAt(i):0; buf[off+11]=type; buf[off+16]=len; buf[off+17]=type===78?0:0; }
function writeNum(buf,p,val,len){ const s=String(Math.round(val)).slice(0,len).padStart(len," "); for(let i=0;i<len;i++) buf[p+i]=s.charCodeAt(i); return p+len; }

// minimal ZIP (store, no compression) with CRC32
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

boot().catch(e=>{ status("error: "+e.message); console.error(e); });
