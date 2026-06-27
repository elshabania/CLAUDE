/* STEAM 2040 Studio front-end controller. Wires the rail, workspaces, control
   panels, copilot and the binary results WebSocket. UI buttons and the copilot
   both emit the same typed commands to /command. */
(function () {
  const STEAM = window.STEAM;
  const $ = sel => document.querySelector(sel);

  const map = new STEAM.Map($('#map'), $('#minimap'));
  const copilot = new STEAM.Copilot($('#copilotLog'), onCopilotResults);
  let workspace = 'network';
  let lastKpis = null, lastGap = null;

  // ---- command dispatch ---------------------------------------------------
  async function cmd(command, params = {}) {
    const r = await fetch('/command', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, params })
    }).then(r => r.json());
    if (!r.ok) { toast(r.error || 'command failed', true); throw new Error(r.error); }
    return r.result;
  }

  async function loadGeometry() {
    const g = await fetch('/geometry').then(r => r.json());
    if (!g.links.length) { setStatus('no network loaded'); return; }
    map.setGeometry(g);
    setStatus(`${g.links.length.toLocaleString()} links · ${(g.zones||[]).length} zones`);
    drawLegend();
  }

  // ---- WebSocket binary results ------------------------------------------
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/results`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send('hello');
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') { handleEvent(JSON.parse(ev.data)); return; }
      decodeResult(ev.data);
    };
    ws.onclose = () => setTimeout(connectWS, 1500);
  }

  function decodeResult(buf) {
    const dv = new DataView(buf);
    const n = dv.getInt32(0, true);
    let off = 4;
    const volume = new Float32Array(buf, off, n); off += n * 4;
    const vc = new Float32Array(buf, off, n); off += n * 4;
    const los = new Int8Array(buf, off, n);
    map.setResult({ volume, vc, los });
    map.computeVolMax();
    if (workspace === 'assignment' && map.mode === 'class') map.setMode('volume');
    map.draw();
  }

  function handleEvent(ev) {
    if (ev.type === 'progress') {
      if (ev.gap != null) { setStatus(`${ev.method.toUpperCase()} iter ${ev.iter}/${ev.total}, gap ${(ev.gap*100).toFixed(2)}%`); }
      else if (ev.iter) setStatus(`${ev.method.toUpperCase()} step ${ev.iter}/${ev.total}`);
    } else if (ev.type === 'result_meta') {
      lastKpis = ev.kpis; renderKpis(ev.kpis);
      if (ev.kpis.final_gap != null) { /* gap chart updated via run result */ }
      if (ev.histogram) { /* available for panel charts */ window._hist = ev.histogram; }
    }
  }

  // ---- KPI strip ----------------------------------------------------------
  function renderKpis(k) {
    const strip = $('#kpis');
    strip.classList.remove('hidden');
    const items = [
      ['VHT', fmt(k.vht), 'veh·h'], ['VMT', fmt(k.vmt), 'veh·km'],
      ['Avg spd', k.avg_speed_kmh.toFixed(1), 'km/h'],
      ['Avg v/c', k.avg_vc.toFixed(2), ''],
      ['Over cap', k.over_capacity, 'links'],
      ['Delay', fmt(k.delay_veh_h), 'veh·h'],
    ];
    if (k.final_gap != null) items.push(['Gap', (k.final_gap*100).toFixed(2)+'%', `it ${k.iterations}`]);
    strip.innerHTML = items.map(([key, v, u]) =>
      `<div class="kpi"><div class="v">${v}</div><div class="k">${key} ${u}</div></div>`).join('');
  }

  // ---- legend -------------------------------------------------------------
  function drawLegend() {
    const el = $('#legend');
    if (workspace === 'network' || map.mode === 'class') {
      const cls = [['fwy','#e0524a'],['ramp','#e0884a'],['art','#c8a24a'],
        ['coll','#6f8fb8'],['rural','#7c9a6f'],['local','#566784']];
      el.innerHTML = '<b>Facility class</b>' + cls.map(([c,col]) =>
        `<div class="row" style="gap:6px"><span style="width:14px;height:3px;background:${col};display:inline-block"></span>${c}</div>`).join('');
    } else if (map.mode === 'los' || map.mode === 'vc') {
      const labels = ['A','B','C','D','E','F'];
      el.innerHTML = '<b>Level of service (v/c)</b><div class="row" style="gap:2px">' +
        labels.map((l,i)=>`<span style="flex:1;text-align:center;background:${STEAM.palette.los(i)};color:#000;border-radius:3px">${l}</span>`).join('') + '</div>';
    } else if (map.mode === 'volume') {
      let grad = ''; for (let i=0;i<=10;i++) grad += STEAM.palette.volume(i/10)+(i<10?',':'');
      el.innerHTML = `<b>Volume (veh/h)</b><div class="bar" style="background:linear-gradient(90deg,${grad})"></div><div class="ticks"><span>0</span><span>${fmt(map._volMax||0)}</span></div>`;
    } else if (map.mode === 'diff') {
      el.innerHTML = `<b>Scenario diff</b><div class="bar" style="background:linear-gradient(90deg,${STEAM.palette.diff(-1)},#0000,${STEAM.palette.diff(1)})"></div><div class="ticks"><span>less</span><span>more</span></div>`;
    }
  }

  // ---- workspaces / panels ------------------------------------------------
  const PANELS = {
    network: () => `
      <div class="section"><h4>Data</h4>
        <button class="action" data-cmd="load_demo">Load demo network</button>
        <div class="row full"><input id="netPath" type="text" placeholder="network .shp or .csv path"></div>
        <button class="action secondary" id="loadNet">Load network file</button>
        <div class="row full"><input id="zonePath" type="text" placeholder="land-use CSV path"></div>
        <button class="action secondary" id="loadZones">Load zones</button>
        <div class="row full"><input id="odPath" type="text" placeholder="OD long CSV path"></div>
        <button class="action secondary" id="loadOd">Load OD matrix</button>
      </div>
      <div class="section"><h4>View</h4>
        <button class="action secondary" data-cmd="fit_view">Fit view</button>
      </div>`,
    aggregation: () => `
      <div class="section"><h4>Targets</h4>
        <div class="row"><label>Target zones</label><input id="aggTarget" type="number" value="1500"></div>
        <div class="row"><label>Max span (km)</label><input id="aggSpan" type="number" value="6"></div>
        <div class="row"><label>Barrier</label>
          <select id="aggBarrier"><option value="fwy">freeways</option><option value="art">arterials+</option><option value="coll" selected>collectors+</option></select></div>
        <button class="action" id="runAgg">Aggregate zones</button>
      </div>
      <div class="section"><h4>Result</h4><div id="aggStats" class="cmd">run aggregation to see stats</div></div>`,
    assignment: () => `
      <div class="section"><h4>Demand</h4>
        <div class="row"><label>Source</label>
          <select id="asgDemand"><option value="od">OD matrix</option><option value="gravity">land-use gravity</option><option value="ones">all-ones</option></select></div>
        <div class="row"><label>Period</label>
          <select id="asgPeriod"><option value="am_peak">AM peak</option><option value="off_peak">off-peak</option><option value="daily">24-hour</option></select></div>
        <button class="action secondary" id="buildGrav">Build gravity demand</button>
      </div>
      <div class="section"><h4>Method</h4>
        <div class="seg" id="asgMethod">
          <button data-m="aon">Free-flow</button><button data-m="bpr">Incr BPR</button>
          <button data-m="msa">MSA</button><button data-m="fw" class="on">Frank-Wolfe</button></div>
        <button class="action" id="runAsg">Run assignment</button>
      </div>
      <div class="section"><h4>Display</h4>
        <div class="seg" id="colourBy">
          <button data-mode="volume" class="on">Volume</button><button data-mode="vc">v/c</button>
          <button data-mode="los">LOS</button><button data-mode="diff">Diff</button></div>
      </div>
      <div class="section"><h4>v/c distribution</h4><canvas id="histCanvas" style="width:100%;height:80px"></canvas></div>
      <div class="section"><button class="action secondary" data-cmd="export_link">Export link CSV</button></div>`
  };

  function setWorkspace(ws) {
    workspace = ws;
    document.querySelectorAll('.rail-btn[data-ws]').forEach(b =>
      b.classList.toggle('active', b.dataset.ws === ws));
    $('#wsTitle').textContent = ws[0].toUpperCase() + ws.slice(1);
    $('#panelBody').innerHTML = PANELS[ws]();
    $('#spark').classList.toggle('hidden', ws !== 'assignment');
    bindPanel(ws);
    drawLegend();
  }

  function bindPanel(ws) {
    document.querySelectorAll('[data-cmd]').forEach(b => b.onclick = async () => {
      const c = b.dataset.cmd;
      if (c === 'load_demo') { await cmd('load_demo'); await loadGeometry(); toast('demo network loaded'); }
      else if (c === 'fit_view') { map.fit(); }
      else if (c === 'export_link') { const r = await cmd('export', { what:'link_csv', path:'link_results.csv' }); toast('exported '+r.path); }
    });
    if (ws === 'network') {
      $('#loadNet').onclick = async () => { await cmd('load_network', { path: $('#netPath').value }); await loadGeometry(); toast('network loaded'); };
      $('#loadZones').onclick = async () => { const r = await cmd('load_zones', { path: $('#zonePath').value }); await loadGeometry(); toast(`${r.n_routable} routable zones`); };
      $('#loadOd').onclick = async () => { const r = await cmd('load_matrix', { path: $('#odPath').value }); toast(`${fmt(r.total_trips)} trips`); };
    }
    if (ws === 'aggregation') {
      $('#runAgg').onclick = async () => {
        const r = await cmd('aggregate', { target:+$('#aggTarget').value,
          barrier:$('#aggBarrier').value, max_span_m:+$('#aggSpan').value*1000 });
        $('#aggStats').textContent = `${r.stats.zones_before} → ${r.stats.zones_after} zones, max size ${r.stats.max_cluster_size}, ${r.qa_flags.length} QA flags`;
        toast('aggregation complete');
      };
    }
    if (ws === 'assignment') {
      let method = 'fw';
      document.querySelectorAll('#asgMethod button').forEach(b => b.onclick = () => {
        document.querySelectorAll('#asgMethod button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); method = b.dataset.m;
      });
      document.querySelectorAll('#colourBy button').forEach(b => b.onclick = () => {
        document.querySelectorAll('#colourBy button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); map.setMode(b.dataset.mode); cmd('colour_by',{mode:b.dataset.mode}); drawLegend();
      });
      $('#buildGrav').onclick = async () => { const r = await cmd('build_gravity_demand', {}); toast(`${fmt(r.total_productions)} productions`); };
      $('#runAsg').onclick = async () => {
        const res = await cmd('run_assignment', { method,
          demand: $('#asgDemand').value, period: $('#asgPeriod').value });
        lastGap = res.gap_history;
        STEAM.sparkline($('#spark'), res.gap_history);
        if (window._hist) STEAM.histogram($('#histCanvas'), window._hist.counts, window._hist.edges);
        toast(`${method.toUpperCase()}: VHT ${fmt(res.kpis.vht)}`);
      };
    }
  }

  // ---- copilot result side-effects ---------------------------------------
  async function onCopilotResults(r) {
    // refresh geometry/legend after data-changing commands
    const changed = r.commands.some(c =>
      ['load_demo','load_network','load_zones','run_assignment','colour_by','aggregate'].includes(c.command));
    if (r.commands.some(c => ['load_demo','load_network','load_zones'].includes(c.command)))
      await loadGeometry();
    const colour = r.commands.find(c => c.command === 'colour_by');
    if (colour) { map.setMode(colour.params.mode); drawLegend(); }
    const asg = r.results.find(x => x.command === 'run_assignment' && x.result);
    if (asg) { lastGap = asg.result.gap_history; STEAM.sparkline($('#spark'), lastGap||[]); }
    const ws = r.commands.find(c => c.command === 'goto_workspace');
    if (ws) setWorkspace(ws.params.name);
  }

  // ---- chrome: theme, help, rail, copilot form ---------------------------
  const THEMES = ['dark', 'light', 'contrast'];
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    document.documentElement.setAttribute('data-theme', next);
    map.draw(); toast('theme: ' + next);
  };
  $('#helpBtn').onclick = () => $('#help').classList.remove('hidden');
  $('#helpClose').onclick = () => $('#help').classList.add('hidden');
  $('#panelToggle').onclick = () => $('#panel').classList.toggle('collapsed');
  document.querySelectorAll('.rail-btn[data-ws]').forEach(b =>
    b.onclick = () => setWorkspace(b.dataset.ws));
  $('#copilotForm').onsubmit = e => {
    e.preventDefault();
    const v = $('#copilotInput').value.trim();
    if (v) copilot.ask(v); $('#copilotInput').value = '';
  };
  map.onHover(i => {
    if (i < 0 || !map.geom) { setStatus(lastKpis ? statusFromKpis() : 'ready'); return; }
    const L = map.geom.links[i];
    let s = `link ${L.id} · ${L.class} · ${L.lanes} ln`;
    if (map.result) {
      const vc = map.result.vc[i];
      s += ` · vol ${fmt(map.result.volume[i])} · v/c ${vc.toFixed(2)} · LOS ${'ABCDEF'[map.result.los[i]]}`;
    }
    setStatus(s);
  });

  // ---- helpers ------------------------------------------------------------
  function statusFromKpis() { return `VHT ${fmt(lastKpis.vht)} · over-cap ${lastKpis.over_capacity}`; }
  function setStatus(s) { $('#status').textContent = s; }
  function toast(msg, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  function fmt(n) { n = +n; return Math.abs(n) >= 1e6 ? (n/1e6).toFixed(2)+'M'
    : Math.abs(n) >= 1e3 ? (n/1e3).toFixed(1)+'k' : n.toFixed(0); }

  // ---- boot ---------------------------------------------------------------
  setWorkspace('network');
  connectWS();
  loadGeometry();
  copilot.add('ai', 'Welcome to STEAM 2040 Studio. Type <span class="cmd">load the demo network</span> to begin, then ask me to run an assignment.');
})();
