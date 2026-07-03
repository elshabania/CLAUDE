#!/usr/bin/env python3
import re, sys, pathlib

UP = pathlib.Path("/root/.claude/uploads/30055bac-83bd-59e3-8e5d-fb45647ff03f")
SCRATCH = pathlib.Path("/tmp/claude-0/-home-user-CLAUDE/30055bac-83bd-59e3-8e5d-fb45647ff03f/scratchpad")
OUT = pathlib.Path("/home/user/CLAUDE/public/steam-2040-studio/index.html")

VIEWER = UP / "d499b594-STEAM_2040_Network_Viewer_1.html"
ASSIGN = UP / "5e3e8081-STEAM_2040_Assignment_1.html"
ENDTOK = "__STEAM_ES__"

import base64
bridge = (SCRATCH / "bridge.js").read_text(encoding="utf-8")
evo = (SCRATCH / "evo.js").read_text(encoding="utf-8")
# baked 2025+2040 road network (gzipped binary), embedded so the Viewer can
# render the year toggle + differences with no upload
_evogz = SCRATCH / "evo-data.gz"
evodata_b64 = base64.b64encode(_evogz.read_bytes()).decode("ascii") if _evogz.exists() else ""
container = (SCRATCH / "container.html").read_text(encoding="utf-8")

ENDRE = re.compile(r"</script\s*>", re.IGNORECASE)

# Several glyphs are written as literal \uXXXX in HTML text in the original
# files, so they render as the raw escape (e.g. "✕"). Convert every
# \uXXXX that is NOT preceded by a backslash to the real character — valid
# both in HTML text and inside JS string/regex literals.
UESC = re.compile(r"(?<!\\)\\u([0-9a-fA-F]{4})")
def unescape_glyphs(s):
    return UESC.sub(lambda m: chr(int(m.group(1), 16)), s)

# CSS injected so the Studio rail can declutter each app (map-first by default,
# panels revealed contextually).
OVERRIDE = {
 "viewer": """
  /* Studio: full-bleed map, never a scrollbar. A scrollbar shrinks the client
     width below window.innerWidth, which skews pointer hit-testing (the cursor
     selects an offset link/zone). Keeping the page unscrollable guarantees
     innerWidth === clientWidth === canvas width. */
  html,body{overflow:hidden!important;margin:0!important}
  /* Studio: hide bulky panels until a rail tool is chosen */
  body.studio-hide-agg #agg{display:none!important}
  body.studio-hide-layers #chips,body.studio-hide-layers #dissctl{display:none!important}
  /* dock the aggregation panel to the left as a compact, scrollable side
     panel so it never covers the network (desktop); mobile keeps its sheet */
  @media(min-width:641px){
    #agg{left:12px!important;right:auto!important;transform:none!important;
      top:96px!important;bottom:auto!important;max-height:calc(100% - 124px)!important;
      width:360px!important;max-width:44vw!important;overflow-y:auto;overflow-x:hidden;
      align-items:stretch!important}
    #agg #aggticks,#agg input[type=range]{width:auto!important}
  }
  /* remove the header/footer gradient wash over the map */
  header{background:none!important}
  footer{background:none!important}
 """,
 "assign": """
  /* Studio: full-bleed map, never a scrollbar (see viewer note) — a scrollbar
     would shrink the client width vs window.innerWidth and offset selection. */
  html,body{overflow:hidden!important;margin:0!important}
  /* Studio: the rail controls panels, so hide the in-app panel toggles */
  #panelOpen,#panelToggle{display:none!important}
  /* declutter: the rail labels the section; drop the verbose footer note */
  #note{display:none!important}
  details.sec{margin-bottom:0!important}
  /* remove the header/footer gradient wash over the map */
  header{background:none!important}
  footer{background:none!important}
 """,
}
def _rep(src, old, new, label):
    assert old in src, "rec-engine anchor missing: " + label
    return src.replace(old, new, 1)

# Enhance the Assignment's recommendation engine: budget cap + benefit-cost
# (BCR) prioritisation, including a budget-constrained marginal-BCR program
# builder. Runs on the RAW source (anchors contain \uXXXX) before glyph fixup.
def patch_recengine(src):
    # SPEED: fewer equilibrium iterations + fewer sampled origins per evaluation
    src = _rep(src, 'return {origins, demandFor:od.demandFor, iters:deep?4:3};',
                    'return {origins, demandFor:od.demandFor, iters:deep?3:2};', "evalSample iters")
    src = _rep(src, 'const deep=document.getElementById("solveDepth").value==="deep"; const cap=deep?400:250;',
                    'const deep=document.getElementById("solveDepth").value==="deep"; const cap=deep?350:150;', "evalSample cap")
    # SPEED: reassign fewer candidates (the analytical pre-screen already ranks them)
    src = _rep(src, 'const EVALN=greedy?(deep?16:12):(deep?28:20);',
                    'const EVALN=greedy?(deep?14:10):(deep?22:14);', "EVALN")

    # 1) UI: budget + rank-by controls in the "Recommend & solve" section
    src = _rep(src,
      '<label><input type="checkbox" id="solveGreedy"> build program (greedy)</label></div>',
      '<label><input type="checkbox" id="solveGreedy"> build program (greedy)</label></div>'
      '\n      <div class="row"><label title="cap on total lane-km of upgrades (0 = no cap)">Budget '
      '<select id="budgetSel"><option value="0">none</option><option value="20">20</option>'
      '<option value="50" selected>50</option><option value="100">100</option>'
      '<option value="200">200</option><option value="500">500</option></select> lane-km</label> '
      '<label title="ranking / selection objective — benefit per lane-km is a cost-effectiveness (BCR-proxy) measure">Rank by <select id="rankBySel">'
      '<option value="bcr" selected>benefit / lane-km</option><option value="vht">VHT saved</option></select></label></div>',
      "UI budget row")
    # subtitle
    src = _rep(src, 'reassigns &amp; measures VHT saved',
                    'reassigns; ranks by benefit/cost', "subtitle")
    # 2) read BUDGET + RANKBY
    src = _rep(src,
      'const greedy=document.getElementById("solveGreedy").checked; let cands=candidatesFromRECS();',
      'const greedy=document.getElementById("solveGreedy").checked; let cands=candidatesFromRECS();'
      ' const BUDGET=+((document.getElementById("budgetSel")||{}).value)||0;'
      ' const RANKBY=((document.getElementById("rankBySel")||{}).value)||"bcr";',
      "budget read")
    # 3) non-greedy: rank by chosen objective
    src = _rep(src,
      'SOLUTIONS.sort((a,b)=>b.dvht-a.dvht); PROGRAM=null; renderSolutions(baseQuick);',
      'SOLUTIONS.sort((a,b)=>RANKBY==="bcr"?(b.bcr-a.bcr):(b.dvht-a.dvht)); PROGRAM=null; renderSolutions(baseQuick);',
      "nongreedy sort")
    # 4) greedy: track cost, allow more picks (budget caps depth)
    src = _rep(src,
      'PROGRAM={picks:[], up:new Map(), extras:[]}; let prevVHT=baseQuick; const maxPicks=document.getElementById("solveDepth").value==="deep"?6:4; let remaining=cands.slice();',
      'PROGRAM={picks:[], up:new Map(), extras:[], cost:0}; let prevVHT=baseQuick; const maxPicks=document.getElementById("solveDepth").value==="deep"?8:6; let remaining=cands.slice();',
      "greedy init")
    src = _rep(src, 'let bi=-1,bv=-1,bvht=0,r=0;',
                    'let bi=-1,bScore=-1,bv=0,bvht=0,bcost=0,r=0;'
                    ' const _lim=Math.min(remaining.length,(document.getElementById("solveDepth").value==="deep"?8:5));', "greedy bestvars")
    # greedy: only reassign the top-_lim remaining candidates (by analytical
    # benefit) each step instead of every one — big speedup, same picks.
    src = _rep(src, 'if(r<remaining.length) setTimeout(ev,0);',
                    'if(r<_lim) setTimeout(ev,0);', "greedy step limit")
    # 5) greedy pick: best marginal BCR (or VHT) among candidates that fit budget
    src = _rep(src,
      'const vht=quickAssignVHT({upgrades:up,extras:ex,draft:null},S); const dv=prevVHT-vht; if(dv>bv){bv=dv;bi=r;bvht=vht;} r++;',
      'const vht=quickAssignVHT({upgrades:up,extras:ex,draft:null},S); const dv=prevVHT-vht;'
      ' const mc=candCost(c); const fits=(BUDGET<=0)||(PROGRAM.cost+mc<=BUDGET);'
      ' const sc2=(RANKBY==="bcr")?(dv/Math.max(0.01,mc)):dv;'
      ' if(fits&&dv>0&&sc2>bScore){bScore=sc2;bv=dv;bi=r;bvht=vht;bcost=mc;} r++;',
      "greedy pick")
    # 6) greedy commit: accumulate cost
    src = _rep(src,
      'PROGRAM.picks.push(Object.assign({},c,{stepSaved:bv})); prevVHT=bvht;',
      'PROGRAM.cost+=bcost; PROGRAM.picks.push(Object.assign({},c,{stepSaved:bv,stepCost:bcost})); prevVHT=bvht;',
      "greedy commit")
    # 7) finishGreedy: header, per-step BCR, total, neutral empty message
    src = _rep(src, 'No intervention reduced VHT under this demand.',
                    'No intervention reduced VHT within the budget.', "empty msg")
    src = _rep(src,
      'h.textContent="Greedy program \\u00b7 base VHT "+fmtN(baseQuick)+":";',
      'var _bud=+((document.getElementById("budgetSel")||{}).value)||0;'
      ' h.textContent="Budget-optimised program \\u00b7 base VHT "+fmtN(baseQuick)+(_bud>0?" \\u00b7 budget "+_bud+" lane-km":"")+":";',
      "greedy header")
    src = _rep(src,
      'el.innerHTML="<b>Step "+(i+1)+": "+p.type+"</b> \\u00b7 corridor "+p.rank+"<br>+"+fmtN(p.stepSaved)+" veh-h (cum "+fmtN(cum)+", "+(baseQuick>0?(100*cum/baseQuick).toFixed(1):0)+"%)";',
      'el.innerHTML="<b>Step "+(i+1)+": "+p.type+"</b> \\u00b7 corridor "+p.rank+"<br>+"+fmtN(p.stepSaved)+" veh-h (cum "+fmtN(cum)+", "+(baseQuick>0?(100*cum/baseQuick).toFixed(1):0)+"%) \\u00b7 "+(p.stepCost||0).toFixed(1)+" lane-km \\u00b7 BCR "+(p.stepCost>0?(p.stepSaved/p.stepCost).toFixed(0):"\\u221e");',
      "greedy step line")
    src = _rep(src,
      'const a=document.createElement("button"); a.className="sbtn go"; a.textContent="Load program into scenario"; a.style.marginTop="6px";',
      'const tot=document.createElement("div"); tot.className="dim"; tot.style.fontSize="10px"; tot.style.marginTop="4px";'
      ' tot.textContent="Total \\u00b7 "+fmtN(cum)+" veh-h saved \\u00b7 "+(PROGRAM.cost||0).toFixed(1)+" lane-km \\u00b7 program BCR "+((PROGRAM.cost>0)?(cum/PROGRAM.cost).toFixed(0):"\\u221e"); box.appendChild(tot);'
      ' const a=document.createElement("button"); a.className="sbtn go"; a.textContent="Load program into scenario"; a.style.marginTop="6px";',
      "greedy total")
    # 8) renderSolutions header reflects the objective
    src = _rep(src,
      'h.textContent="Ranked by VHT saved (measured by reassignment) \\u00b7 base "+fmtN(baseQuick)+":";',
      'var _rb=((document.getElementById("rankBySel")||{}).value)||"bcr";'
      ' h.textContent=(_rb==="bcr"?"Ranked by benefit per lane-km (cost-effectiveness)":"Ranked by VHT saved")+" \\u00b7 base "+fmtN(baseQuick)+":";',
      "rendersol header")
    return src

# Per-app source tweaks applied before embedding (clarity fixes + Studio hooks).
def tweak(src, appid):
    if appid == "assign":
        src = patch_recengine(src)        # before glyph unescape (anchors have \uXXXX)
    src = unescape_glyphs(src)
    if appid == "assign":
        # brighten the faint base-network colour so the map reads clearly at rest
        src = src.replace('baseLink:"#46587e"', 'baseLink:"#8298cd"')
        # the embedded OD matrix is gzip but the app ships no pako decompressor,
        # so it always fell back to the all-ones test. Decode with the browser's
        # native DecompressionStream instead (same approach the Viewer uses) so
        # the real OD demand loads — fully offline, no external library.
        assert 'function loadEmbeddedOD(){' in src
        src = src.replace('function loadEmbeddedOD(){',
                          'async function loadEmbeddedOD(){', 1)
        src = src.replace(
            '  if(typeof pako==="undefined"){ setStatus("Embedded OD present but decompressor missing."); return; }',
            '  if(typeof DecompressionStream==="undefined"){ setStatus("Embedded OD present but this browser can\'t gunzip."); return; }', 1)
        assert 'const bytes=pako.ungzip(raw); const buf=bytes.slice().buffer;' in src
        src = src.replace(
            'const bytes=pako.ungzip(raw); const buf=bytes.slice().buffer;',
            'const _ds=new DecompressionStream("gzip"); const _ab=await new Response(new Blob([raw]).stream().pipeThrough(_ds)).arrayBuffer(); const bytes=new Uint8Array(_ab); const buf=bytes.slice().buffer;', 1)
        # keep the decoded O,D,V arrays so the zone-aggregation handoff can
        # re-aggregate the matrix in place (Studio feature)
        src = src.replace(
            'const r=buildODfromArrays(O,D,V,cnt,true);',
            'try{ window.__ODRAW={O:O,D:D,V:V,cnt:cnt}; }catch(_){} const r=buildODfromArrays(O,D,V,cnt,true);', 1)
        # UNIFIED VISUALISATION: draw the base (un-assigned) network and the
        # centroids EXACTLY like the Network Viewer — same per-class colour,
        # alpha, zoom-scaled width (min(max(b,wm*sc),mx)) and the gold centroid
        # dots. Assigned links still render volume/V-C/LOS on top.
        VSTYLE = ('const VSTYLE={'
          'local:{col:"#3f5170",a:.55,wm:7,b:.28,mx:3.5,minS:.004},'
          'junc:{col:"#6b5a35",a:.6,wm:6,b:.3,mx:3,minS:.006},'
          'rural:{col:"#4d7d5f",a:.75,wm:9,b:.35,mx:4,minS:0},'
          'coll:{col:"#5e7ca3",a:.75,wm:10,b:.38,mx:4,minS:.002},'
          'art:{col:"#8fc1e3",a:.85,wm:16,b:.5,mx:5,minS:0},'
          'ramp:{col:"#d98e4a",a:.85,wm:12,b:.42,mx:4.5,minS:0},'
          'fwy:{col:"#ffb454",a:.95,wm:26,b:.75,mx:7,minS:0}};\n')
        assert 'function render(){' in src
        src = src.replace('function render(){', VSTYLE + 'function render(){', 1)
        # results view = assignment done AND viewing volume/V-C/LOS: de-emphasise
        # the base classification + centroids + extra layers to read results.
        assert 'const diff=(MODE==="diff" && DIFF);' in src
        src = src.replace('const diff=(MODE==="diff" && DIFF);',
            'const diff=(MODE==="diff" && DIFF); var RESULTSVIEW=((assignDone&&(MODE==="vol"||MODE==="vc"||MODE==="los"))||MODE==="diff");', 1)
        # diff mode: dim the unchanged links further so the Δ reads clearly
        src = src.replace('lw=Math.max(.4,base*.5); t.globalAlpha=.25;',
                          'lw=Math.max(.35,base*.45); t.globalAlpha=.10;', 1)
        # base link branch -> faint when showing results/diff, else viewer per-class style
        assert 'else { col=THEME.baseLink; lw=Math.max(.55,base*.7); t.globalAlpha=assignDone?.5:.8; }' in src
        src = src.replace(
            'else { col=THEME.baseLink; lw=Math.max(.55,base*.7); t.globalAlpha=assignDone?.5:.8; }',
            'else { if(RESULTSVIEW){ col=THEME.baseLink; lw=Math.max(.45,base*.55); t.globalAlpha=.16; } '
            'else { var vs=VSTYLE[c]; if(vs&&sc<vs.minS) continue; '
            'col=vs?vs.col:THEME.baseLink; lw=vs?Math.min(Math.max(vs.b,vs.wm*sc),vs.mx):Math.max(.55,base*.7); '
            't.globalAlpha=vs?vs.a:.8; } }', 1)
        # draw the extra layers transferred from the Viewer (connectors / walk /
        # PnR / PT) with the Viewer's exact palette, then the centroids.
        XLDRAW = ('if(window.__XLAYERS&&!RESULTSVIEW){var _XC={'
          'walk:{c:"#45c07a",a:.7,wm:5,b:.3,mx:2.5,minS:.003,dash:[4,4]},'
          'pt:{c:"#a78bfa",a:.95,wm:14,b:.65,mx:5.5,minS:0},'
          'conn:{c:"#ff453a",a:.7,wm:5,b:.45,mx:3,minS:0},'
          'pnr:{c:"#f472b6",a:.95,wm:10,b:.7,mx:4,minS:0}};'
          'for(var _lk in _XC){var _ld=window.__XLAYERS[_lk],_lc=_XC[_lk];if(!_ld||sc<_lc.minS)continue;'
          'var _lxy=_ld.xy,_lof=_ld.off,_lbb=_ld.bb;t.strokeStyle=_lc.c;t.globalAlpha=_lc.a;'
          't.lineWidth=Math.min(Math.max(_lc.b,_lc.wm*sc),_lc.mx);t.setLineDash(_lc.dash||[]);'
          't.lineCap="round";t.lineJoin="round";t.beginPath();'
          'for(var _li=0;_li<_ld.n;_li++){var _lb=_li*4;'
          'if(_lbb[_lb+2]<vx0||_lbb[_lb]>vx1||_lbb[_lb+3]<vy0||_lbb[_lb+1]>vy1)continue;'
          'var _lj=_lof[_li],_le=_lof[_li+1];t.moveTo((_lxy[_lj*2]-cx)*sc+hw,hh-(_lxy[_lj*2+1]-cy)*sc);'
          'for(_lj++;_lj<_le;_lj++)t.lineTo((_lxy[_lj*2]-cx)*sc+hw,hh-(_lxy[_lj*2+1]-cy)*sc);}'
          't.stroke();}t.setLineDash([]);t.globalAlpha=1;}\n  ')
        # draw centroids (gold dots) exactly like the Viewer, before overlays/legend
        CENTDRAW = (XLDRAW + 'if(!RESULTSVIEW){var _cr=Math.min(Math.max(2.2,26*sc),6); t.globalAlpha=1; t.setLineDash([]);'
          'for(var _i=0;_i<N0;_i++){ var _x=(CENT[_i*2]-cx)*sc+hw, _y=hh-(CENT[_i*2+1]-cy)*sc;'
          ' if(_x<-8||_x>W+8||_y<-8||_y>H+8) continue;'
          ' t.beginPath(); t.arc(_x,_y,_cr,0,6.2832); t.fillStyle="#ffd60a"; t.fill();'
          ' t.lineWidth=Math.max(.8,_cr*.3); t.strokeStyle="#5c4a00"; t.stroke(); } t.globalAlpha=1;}\n  ')
        assert src.count('drawSelScreen(t);') >= 1
        src = src.replace('drawSelScreen(t);', CENTDRAW + 'drawSelScreen(t);', 1)
        # SPEED (exact): the original acc-init queries demandMap.get(u) for EVERY
        # settled node (~120k per origin) although only ~3.4k carry demand. Zero
        # the array with a memset and write just the demand entries instead. The
        # per-entry arithmetic keeps the original left-to-right op order
        # (v*GROWTH*scale), so assigned flows are bit-identical. Also folds in
        # the demand-preserving origin-sample scale (window.__ODSCALE).
        assert 'for(let k=0;k<no;k++){ const u=order[k]; acc[u]= (demandMap ? (demandMap.get(u)||0) : destw[u])*GROWTH; }' in src
        src = src.replace('for(let k=0;k<no;k++){ const u=order[k]; acc[u]= (demandMap ? (demandMap.get(u)||0) : destw[u])*GROWTH; }',
            'const _ods=(window.__ODSCALE||1); acc.fill(0);\n'
            '  if(demandMap){ demandMap.forEach((v,nd)=>{ if(nd<acc.length) acc[nd]=v*GROWTH*_ods; }); }\n'
            '  else { if(!S.destList){ const _dl=[]; for(let _n=0;_n<destw.length;_n++) if(destw[_n]>0) _dl.push(_n); S.destList=_dl; }\n'
            '    const _dl=S.destList; for(let _q=0;_q<_dl.length;_q++){ const _nd=_dl[_q]; acc[_nd]=destw[_nd]*GROWTH*_ods; } }', 1)
        assert 'return {origins:[...ODMAT.byOrigNode.keys()], demandFor:nd=>ODMAT.byOrigNode.get(nd)}; }' in src
        src = src.replace(
            'return {origins:[...ODMAT.byOrigNode.keys()], demandFor:nd=>ODMAT.byOrigNode.get(nd)}; }',
            'window.__ODSCALE=1; let _ok=[...ODMAT.byOrigNode.keys()]; let _s=+document.getElementById("sampleSel").value||0;'
            ' if(_s>0&&_s<_ok.length){ const _st=_ok.length/_s, _o=[]; for(let _i=0;_i<_s;_i++) _o.push(_ok[Math.floor(_i*_st)]);'
            ' if(window.__ODTOTAL==null){ let _t=0; ODMAT.byOrigNode.forEach(function(m){ m.forEach(function(v){ _t+=v; }); }); window.__ODTOTAL=_t; }'
            ' let _sd=0; _o.forEach(function(nd){ const m=ODMAT.byOrigNode.get(nd); if(m) m.forEach(function(v){ _sd+=v; }); });'
            ' window.__ODSCALE=_sd>0?(window.__ODTOTAL/_sd):1; _ok=_o; }'
            ' return {origins:_ok, demandFor:nd=>ODMAT.byOrigNode.get(nd)}; }', 1)
        assert 'return {origins,demandFor:()=>null};' in src
        src = src.replace('return {origins,demandFor:()=>null};',
                          'window.__ODSCALE=1; return {origins,demandFor:()=>null};', 1)
        # HIGHLIGHT the inspected/selected link in BLUE (was white), and add a
        # live blue highlight for the link under the cursor while reading volumes.
        assert 'let RECS=null, RECSET=null, SELG=-1, RESULT="base";' in src
        src = src.replace('let RECS=null, RECSET=null, SELG=-1, RESULT="base";',
                          'let RECS=null, RECSET=null, SELG=-1, HOVG=-1, RESULT="base";', 1)
        assert 'if(SELG>=0){ t.globalAlpha=1; strokeLink(SELG,"#ffffff",2.6); }' in src
        src = src.replace('if(SELG>=0){ t.globalAlpha=1; strokeLink(SELG,"#ffffff",2.6); }',
                          'if(HOVG>=0&&HOVG!==SELG){ t.globalAlpha=1; strokeLink(HOVG,"#0a1a2e",5.4); strokeLink(HOVG,"#2f9bff",2.6); }'
                          ' if(SELG>=0){ t.globalAlpha=1; strokeLink(SELG,"#0a1a2e",6.4); strokeLink(SELG,"#3aa6ff",3.0); }', 1)
        assert 'const hit=nearestLink(e.clientX,e.clientY); if(hit)showTip(hit,e.clientX,e.clientY); else hideTip(); return;' in src
        src = src.replace('const hit=nearestLink(e.clientX,e.clientY); if(hit)showTip(hit,e.clientX,e.clientY); else hideTip(); return;',
                          'const hit=nearestLink(e.clientX,e.clientY); const _hg=hit?GLINK.gindex[hit.c][hit.i]:-1;'
                          ' if(_hg!==HOVG){ HOVG=_hg; render(); } if(hit)showTip(hit,e.clientX,e.clientY); else hideTip(); return;', 1)
        assert 'function hideTip(){ zTip.style.display="none"; }' in src
        src = src.replace('function hideTip(){ zTip.style.display="none"; }',
                          'function hideTip(){ zTip.style.display="none"; if(HOVG!==-1){ HOVG=-1; if(typeof render==="function") render(); } }', 1)
        # DIFFERENCE-PLOT FILTER: hide links whose |delta| falls below a
        # user-chosen threshold (absolute veh, or % of the baseline flow via
        # window.__DIFFDEN) so big differences stand out. The slider UI lives
        # in the injected bridge; filtered links draw like the near-zero case.
        # (anchor is the Δ-clarity-restyled dim branch produced by the earlier patch)
        assert 'if(diff){ const dv=gi?DIFF[gi[i]]:0; if(Math.abs(dv)<1e-6){ col=THEME.baseLink; lw=Math.max(.35,base*.45); t.globalAlpha=.10; }' in src
        src = src.replace('if(diff){ const dv=gi?DIFF[gi[i]]:0; if(Math.abs(dv)<1e-6){ col=THEME.baseLink; lw=Math.max(.35,base*.45); t.globalAlpha=.10; }',
            'if(diff){ const dv=gi?DIFF[gi[i]]:0; var _fm=window.__DIFFMIN, _adv=Math.abs(dv), _hide=false;'
            ' if(_fm&&_fm.v>0&&_adv>=1e-6){ if(_fm.m==="pct"||_fm.m==="geh"){'
            ' var _dn=(window.__DIFFDEN&&gi)?Math.abs(window.__DIFFDEN[gi[i]]):((typeof baseVol!=="undefined"&&baseVol&&gi)?Math.abs(baseVol[gi[i]]):0);'
            ' if(_fm.m==="geh"){ var _s=2*_dn+dv; _hide=(_s<=0)||Math.sqrt(2*_adv*_adv/_s)<_fm.v; }'
            ' else { _hide=(100*_adv/Math.max(1,_dn))<_fm.v; } } else { _hide=_adv<_fm.v; } }'
            ' if(_adv<1e-6||_hide){ col=THEME.baseLink; lw=Math.max(.35,base*.45); t.globalAlpha=.10; }', 1)
        # BENEFIT APPRAISAL: clamp v/c in the BPR curve while appraising, so the
        # heavily-cut 2025 base (2040 demand on missing freeways) stays bounded
        # instead of exploding through v/c^4. Off (null) for normal assignments.
        assert 'function linkTime(g,vol){ const x=vol[g]/GRAPH.ECAP[g]; return GRAPH.EFF[g]*(1+PARAMS.alpha*Math.pow(x,PARAMS.beta)); }' in src
        src = src.replace('function linkTime(g,vol){ const x=vol[g]/GRAPH.ECAP[g]; return GRAPH.EFF[g]*(1+PARAMS.alpha*Math.pow(x,PARAMS.beta)); }',
                          'function linkTime(g,vol){ var x=vol[g]/GRAPH.ECAP[g]; if(window.__APPRCLAMP&&x>window.__APPRCLAMP)x=window.__APPRCLAMP; return GRAPH.EFF[g]*(1+PARAMS.alpha*Math.pow(x,PARAMS.beta)); }', 1)
        # BENEFIT APPRAISAL: let a per-link year-capacity factor (window.__YEARCAPF)
        # scale link capacity, so the engine can assign a 2025-base / do-something
        # network without rebuilding GLINK (factor ~0 = link absent that year).
        assert 'ELN[g]=Math.min(255,lanes); ECAP[g]=Math.max(1,lanes)*classCap(GLINK.cls[g]); }' in src
        src = src.replace('ELN[g]=Math.min(255,lanes); ECAP[g]=Math.max(1,lanes)*classCap(GLINK.cls[g]); }',
                          'ELN[g]=Math.min(255,lanes); ECAP[g]=Math.max(1,lanes)*classCap(GLINK.cls[g]);'
                          ' if(window.__YEARCAPF){ var _yf=window.__YEARCAPF[g]; if(_yf!==undefined) ECAP[g]=Math.max(0.5, ECAP[g]*_yf); } }', 1)
    # SELECTION ACCURACY (both apps): size the canvas to the document CLIENT box,
    # which excludes any scrollbar. window.innerWidth includes the scrollbar, so
    # using it makes W wider than the painted canvas and skews hit-testing — the
    # cursor then selects an offset link/zone. clientWidth matches the canvas.
    if 'W=window.innerWidth||document.documentElement.clientWidth;' in src:
        src = src.replace('W=window.innerWidth||document.documentElement.clientWidth;',
                          'W=document.documentElement.clientWidth||window.innerWidth;', 1)
        src = src.replace('H=window.innerHeight||document.documentElement.clientHeight;',
                          'H=document.documentElement.clientHeight||window.innerHeight;', 1)
    # CUSTOM AGGREGATION METHODS (viewer): nine proximity-first spatial methods
    # become first-class in the Zones method dropdown. The algorithms live in
    # the injected bridge (window.__CUSTAGG); the app dispatches to them from
    # applyAggregation and shows the "keep at most N zones" target control.
    if appid == "viewer":
        assert '<option value="demand">Intrazonal demand</option>' in src
        src = src.replace('<option value="demand">Intrazonal demand</option>',
            '<option value="demand">Intrazonal demand</option>\n'
            '      <option value="nn">NN · Adjacent-first (nearest pairs)</option>\n'
            '      <option value="nnd">NND · Demand-weighted adjacent</option>\n      <option value="qtd">QTD · Demand quadtree</option>\n'
            '      <option value="ward">WARD · Variance-minimising</option>\n'
            '      <option value="kmeans">KM · K-means compact</option>\n'
            '      <option value="kcenter">KC · K-center coverage</option>\n'
            '      <option value="grid">GRID · Square cells</option>\n'
            '      <option value="hex">HEX · Hexagonal cells</option>\n'
            '      <option value="quad">QT · Quadtree adaptive</option>\n'
            '      <option value="bal">BAL · Size-balanced</option>\n'
            '      <option value="ring">RING · Rings × sectors</option>', 1)
        assert 'function applyAggregation(){' in src
        src = src.replace('function applyAggregation(){',
            'function applyAggregation(){\n'
            '  if(window.__CUSTAGG && window.__CUSTAGG.modes[METHOD]){ window.__CUSTAGG.run(METHOD); return; }', 1)
        assert 'const M=METHOD, isM=(M==="m1"||M==="m2"||M==="m3"||M==="m4"||M==="m5");' in src
        src = src.replace('const M=METHOD, isM=(M==="m1"||M==="m2"||M==="m3"||M==="m4"||M==="m5");',
            'const M=METHOD, isCust=!!(window.__CUSTAGG&&window.__CUSTAGG.modes[M]), isM=(M==="m1"||M==="m2"||M==="m3"||M==="m4"||M==="m5");', 1)
        assert 'document.getElementById("methodparams").style.display=isM?"flex":"none";' in src
        src = src.replace('document.getElementById("methodparams").style.display=isM?"flex":"none";',
            'document.getElementById("methodparams").style.display=(isM||isCust)?"flex":"none";', 1)
        assert 'document.getElementById("zonetgtwrap").style.display=(isM&&!odMethod)?"":"none";' in src
        src = src.replace('document.getElementById("zonetgtwrap").style.display=(isM&&!odMethod)?"":"none";',
            'document.getElementById("zonetgtwrap").style.display=((isM||isCust)&&!odMethod)?"":"none";', 1)
    # NETWORK EVOLUTION (viewer): stash the uploaded shapefile buffers so the
    # evolution module can rebuild a second horizon year and diff it.
    if 'const year=+(document.getElementById("loadYear").value||2040);' in src:
        src = src.replace('const year=+(document.getElementById("loadYear").value||2040);',
                          'window.__NETBUF={shp:shpB,dbf:dbfB,prj:prjT};'
                          ' const year=+(document.getElementById("loadYear").value||2040);', 1)
    css = OVERRIDE.get(appid)
    if css:
        style = "<style>/* STEAM Studio overrides */" + css + "</style>\n</head>"
        m = list(re.finditer(r"</head\s*>", src, re.IGNORECASE))
        if m:
            i = m[-1].start(); src = src[:i] + style + src[m[-1].end():]
    # start each app map-first (panels hidden) so the Studio rail reveals them
    if appid == "viewer":
        src = src.replace("<body>", '<body class="studio-hide-agg studio-hide-layers">', 1)
    elif appid == "assign":
        src = src.replace("<body>", '<body class="collapsed">', 1)
    return src

def prep(path, appid):
    src = path.read_text(encoding="utf-8")
    src = tweak(src, appid)
    # sanity: count real closing script tags
    n = len(ENDRE.findall(src))
    # inject the bridge just before the LAST </body>
    inj = "<script>\n" + bridge.replace("__APPID__", appid) + "\n</script>\n"
    # the Network Evolution module is viewer-only (reuses the shapefile parsers
    # and the live map transform); inject the baked dual-year network + module
    if appid == "viewer":
        if evodata_b64:
            inj += '<script type="application/octet-stream" id="evo-data">' + evodata_b64 + "</script>\n"
        inj += "<script>\n" + evo + "\n</script>\n"
    matches = list(re.finditer(r"</body\s*>", src, re.IGNORECASE))
    if not matches:
        raise SystemExit(f"no </body> in {path.name}")
    idx = matches[-1].start()
    src = src[:idx] + inj + src[idx:]
    # neutralise every </script> so it can live inside an octet-stream block
    src = ENDRE.sub(ENDTOK, src)
    assert ENDTOK in src and "</script" not in src.lower(), "tokenisation failed"
    print(f"  {path.name}: {n} script-close tags, injected bridge as '{appid}', {len(src):,} chars")
    return src

print("Preparing embedded apps:")
v = prep(VIEWER, "viewer")
a = prep(ASSIGN, "assign")

blocks = (
    f'<script type="application/octet-stream" id="src-viewer">{v}</script>\n'
    f'<script type="application/octet-stream" id="src-assign">{a}</script>\n'
)

# baked sparse Δ plots for the preloaded aggregation comparison (optional)
diff_file = SCRATCH / "preload-diff.gz"
if diff_file.exists():
    import base64 as _b64
    diff_b64 = _b64.b64encode(diff_file.read_bytes()).decode("ascii")
    blocks += f'<script type="application/octet-stream" id="preload-diff">{diff_b64}</script>\n'
    print(f"  baked preload-diff.gz: {diff_file.stat().st_size/1e6:.2f} MB gzip → {len(diff_b64)/1e6:.2f} MB base64")

if "<!--APP_SOURCES-->" not in container:
    raise SystemExit("container missing <!--APP_SOURCES--> marker")
out = container.replace("<!--APP_SOURCES-->", blocks)

# bake the preloaded whole-network aggregation comparison (if generated)
PRELOAD_TOKEN = "var PRELOAD_AGG=null; /*__PRELOAD_AGG__*/"
if PRELOAD_TOKEN not in out:
    raise SystemExit("container missing PRELOAD_AGG token")
pre_file = SCRATCH / "preload-agg.json"
if pre_file.exists():
    import json as _json
    pre = _json.loads(pre_file.read_text(encoding="utf-8"))
    for r in pre.get("results", []):          # trim generator-only noise
        r.pop("merged", None)
    pre_js = _json.dumps(pre, separators=(",", ":"))
    assert "</" not in pre_js.replace("<\\/", ""), "preload JSON must not close the script tag"
    out = out.replace(PRELOAD_TOKEN, "var PRELOAD_AGG=" + pre_js + ";")
    print(f"  baked preload-agg.json: {len(pre.get('results', []))} configs, {len(pre_js):,} chars")
else:
    print("  (no preload-agg.json — PRELOAD_AGG stays null)")

# final guard: the only literal </script> left must be the container's own
# closing tags (octet-stream payloads are tokenised). Just write it.
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(out, encoding="utf-8")
print(f"\nWrote {OUT}  ({len(out):,} chars, {OUT.stat().st_size/1e6:.1f} MB)")
