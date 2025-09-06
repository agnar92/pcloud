export class GamepadStreamer {
  constructor(opts = {}) {
    this.ws = null;
    this.timer = 0;
    this.hz = opts.hz || 120;
    this.padIndex = 0;
    this.originAxes = null;
    this.targetUrl = "";
    this.wsPath = opts.wsPath || "/input";
    this.statusCb = opts.onStatus || (()=>{});
    this.errorCb = opts.onError || (()=>{});
    this.logCb = opts.onLog || (()=>{});
  }
  setTargetFromURL(kioskUrl) { this.targetUrl = kioskUrl || ""; }
  setHz(hz) { this.hz = Math.max(15, Math.min(240, +hz || 120)); if (this.timer) this.start(); }
  setPadIndex(i) { this.padIndex = +i || 0; }
  recalibrate() { const p = (navigator.getGamepads?.()||[])[this.padIndex]; if (p) this.originAxes = p.axes.slice(); }
  _wsURL() {
    if (!this.targetUrl) return "";
    try { const u = new URL(this.targetUrl); const scheme = u.protocol === "https:" ? "wss:" : "ws:"; return `${scheme}//${u.host}${this.wsPath}`; }
    catch { return ""; }
  }
  _normalizeAxes(axes) {
    if (!this.originAxes) return axes.slice();
    const out = axes.slice(); for (let i=0;i<out.length;i++) out[i] = +(out[i] - this.originAxes[i]).toFixed(4); return out;
  }
  _snapshot(pad) {
    return { type:"pad", id: pad.id, index: pad.index, ts: performance.now(),
      axes: this._normalizeAxes(pad.axes),
      buttons: pad.buttons.map((b,i)=>({ i, pressed:b.pressed, val:+b.value.toFixed(4) })) };
  }
  start() {
    this.stop();
    const url = this._wsURL();
    if (!url) { this.errorCb("Brak poprawnego URL serwera (kiosk nie ustawiony?)"); return; }
    try { this.ws = new WebSocket(url); } catch(e) { this.errorCb("WS error: "+e.message); return; }
    this.ws.onopen = () => this.statusCb("connected");
    this.ws.onclose = () => this.statusCb("disconnected");
    this.ws.onerror = () => this.statusCb("error");
    const interval = 1000 / this.hz;
    this.timer = window.setInterval(() => {
      const p = (navigator.getGamepads?.()||[])[this.padIndex];
      if (!p) return;
      const snap = this._snapshot(p);
      if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify(snap)); } catch{ /* empty */ } }
      this.logCb(snap);
    }, interval);
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = 0; } if (this.ws) { try{this.ws.close();}catch{ /* empty */ } this.ws=null; } this.statusCb("stopped"); }
}

export function mountGamepadUI(root, streamer) {
  root.innerHTML = `<div class="gp-row">
    <button id="gp-start">Start Pad</button>
    <button id="gp-stop">Stop</button>
    <label>Hz <input id="gp-hz" type="number" min="15" max="240" value="${streamer.hz}" /></label>
    <label>Pad <select id="gp-index"></select></label>
    <button id="gp-recal">Recal</button>
    <span id="gp-status" class="gp-status">stopped</span>
  </div>`;
  const $ = (s)=>root.querySelector(s);
  const idx = $("#gp-index");
  function refreshPads(){
    idx.innerHTML=""; const pads = navigator.getGamepads?.()||[];
    for (let i=0;i<pads.length;i++){ const p=pads[i]; if(!p) continue; const opt=document.createElement("option"); opt.value=String(i); opt.textContent=`#${i} ${p.id}`; idx.appendChild(opt); }
    idx.value = String(streamer.padIndex);
  }
  window.addEventListener("gamepadconnected", refreshPads);
  window.addEventListener("gamepaddisconnected", refreshPads);
  setInterval(refreshPads,1000); refreshPads();
  $("#gp-start").onclick = ()=> streamer.start();
  $("#gp-stop").onclick = ()=> streamer.stop();
  $("#gp-hz").onchange = (e)=> streamer.setHz(+e.target.value);
  idx.onchange = (e)=> streamer.setPadIndex(+e.target.value);
  $("#gp-recal").onclick = ()=> streamer.recalibrate();
  streamer.statusCb = (s)=> { $("#gp-status").textContent = s; };
}
