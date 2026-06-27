/* Copilot panel: sends plain language to /copilot, logs the parsed commands
   and the backend narration. */
const STEAM = (window.STEAM = window.STEAM || {});

STEAM.Copilot = class {
  constructor(logEl, onResults) {
    this.log = logEl;
    this.onResults = onResults;
  }
  add(cls, html) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.innerHTML = html;
    this.log.appendChild(d);
    this.log.scrollTop = this.log.scrollHeight;
    return d;
  }
  async ask(text) {
    this.add('me', '› ' + escapeHtml(text));
    const thinking = this.add('ai', '…');
    try {
      const r = await fetch('/copilot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      }).then(r => r.json());
      if (!r.ok) { thinking.innerHTML = '✕ ' + (r.error || 'could not interpret'); return r; }
      const cmds = (r.commands || []).map(c =>
        `${c.command}(${JSON.stringify(c.params)})`).join('  ·  ');
      thinking.innerHTML = `<span class="cmd">${escapeHtml(cmds)}</span><br>` +
        escapeHtml(r.narration || 'done');
      if (this.onResults) this.onResults(r);
      return r;
    } catch (e) {
      thinking.innerHTML = '✕ ' + e.message;
    }
  }
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
