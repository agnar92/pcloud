// Electron renderer UI (webrtc.js ustawia preferencję kodeka wewnątrz startSession)
import { startSession, endSession, setVideoElement, onStats } from './webrtc.js';
import { loadServers, saveServer, scanPrefix24 } from './discovery.js';
import { GamepadStreamer, mountGamepadUI } from "./gamepad.js";

export function initUI() {
  // helpery
  const $ = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };
  const opt = (id) => document.getElementById(id) || null; // opcjonalne elementy (legacy)

  // wymagane elementy UI
  const v           = $('v');            setVideoElement(v);
  const panel       = $('panel');
  const gear        = $('gear');

  const codec    = $('codec');
  const audio    = $('audio');
  const fps      = $('fps');
  const width    = $('width');
  const height   = $('height');
  const resQuick = $('resQuick');
  const preset   = $('preset');
  const bitrate  = $('bitrate');
  const capture  = $('capture');

  const connectBtn = $('connect');
  const endBtn     = $('end');

  const statusEl = $('status');
  const statsEl  = $('stats');

  const fsBtn   = $('fsBtn');
  const exitBtn = $('exitBtn');

  // opcjonalne (legacy discover/scan/add) — mogą NIE istnieć
  const serverList  = opt('serverList');
  const serverInput = opt('serverInput');  // pole „Add server”
  const addServer   = opt('addServer');    // button „Add”
  const scanPrefix  = opt('scanPrefix');
  const scanPort    = opt('scanPort');
  const scanBtn     = opt('scanBtn');
  const scanLog     = opt('scanLog');
  const foundBox    = opt('found');

  const qs = new URLSearchParams(location.search);
  const LOCKED_SERVER = (qs.get('server') || '').replace(/\/+$/, '');

  // Panel toggle
  gear.onclick = () => panel.classList.toggle('open');

  const status = (s) => { statusEl.textContent = s; };

  // Recent servers (jeśli jest select)
  function refreshServers() {
    if (!serverList) return; // brak legacy elementów
    const arr = loadServers();
    serverList.innerHTML = '';

    const def = location.origin.replace(/\/$/, '');
    if (arr.length === 0) {
      const o = document.createElement('option');
      o.value = def;
      o.textContent = `${def} (this)`;
      serverList.appendChild(o);
    } else {
      const withLocked = LOCKED_SERVER && !arr.includes(LOCKED_SERVER)
        ? [LOCKED_SERVER, ...arr]
        : arr.slice();
      withLocked.forEach(u => {
        const o = document.createElement('option');
        o.value = u; o.textContent = u;
        serverList.appendChild(o);
      });
    }
  }
  refreshServers();

  function getServerFromUI() {
    if (LOCKED_SERVER) return LOCKED_SERVER; // priorytet – przyszło z Home
    if (serverList && serverList.value) return serverList.value.trim();

    if (serverInput && serverInput.value) {
      let u = serverInput.value.trim();
      if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
      const portStr = (scanPort && scanPort.value) ? scanPort.value : '8080';
      if (!/:\d+$/.test(u)) u = u.replace(/\/$/, '') + ':' + portStr;
      return u;
    }
    return '';
  }

  function applyLockedServerUI() {
    if (!LOCKED_SERVER) return;
    status(`Using ${LOCKED_SERVER}`);

    // wyłącz legacy discover/scan/add, jeśli istnieją
    ['serverList','serverInput','scanPrefix','scanPort','scanBtn','addServer']
      .forEach(id => { const el = opt(id); if (el) el.disabled = true; });

    const locked = opt('lockedServer'); // jeśli masz badge w HTML
    if (locked) locked.textContent = LOCKED_SERVER;
  }
  applyLockedServerUI();

  // Add server (tylko jeśli legacy przycisk istnieje)
  if (addServer) {
    addServer.onclick = () => {
      let u = (serverInput?.value || '').trim();
      if (!u) { status('Empty address'); return; }
      if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
      const portStr = (scanPort && scanPort.value) ? scanPort.value : '8080';
      if (!/:\d+$/.test(u)) u = u.replace(/\/$/, '') + ':' + portStr;
      saveServer(u); refreshServers(); status('Added ' + u);
    };
  }

  // Quick resolution picker
  resQuick.onchange = () => {
    const val = resQuick.value;
    if (!val) return;
    const [w, h] = val.split('x').map(x => parseInt(x, 10) | 0);
    width.value = w || 0; height.value = h || 0;
    resQuick.value = '';
  };

  // /24 scan (tylko jeśli legacy przyciski istnieją)
  if (scanBtn) {
    scanBtn.onclick = async () => {
      if (LOCKED_SERVER) return; // w trybie z Home pomijamy
      const prefix = (scanPrefix?.value || '').trim();
      const port = parseInt((scanPort?.value || '8080'), 10) | 0;
      if (!/^\d+\.\d+\.\d+$/.test(prefix)) { status('Invalid /24 prefix'); return; }
      if (scanLog) scanLog.textContent = 'Scanning...';
      if (foundBox) { foundBox.style.display = 'block'; foundBox.innerHTML = ''; }

      const found = await scanPrefix24(prefix, port, ({done,total}) => {
        if (scanLog) scanLog.textContent = `Scanned ${done}/${total}`;
      });

      if (foundBox) {
        found.forEach(u => {
          const div = document.createElement('div'); div.className='item';
          div.innerHTML = `<div>${u}<br><small>pc_cloud</small></div><button class="btn">Add</button>`;
          div.querySelector('button').onclick = ()=>{ saveServer(u); refreshServers(); status('Added ' + u); };
          foundBox.appendChild(div);
        });
      }
      if (scanLog) scanLog.textContent = 'Scan complete';
    };
  }

  // Connect
  connectBtn.onclick = async () => {
    const server = getServerFromUI();
    if (!server) { status('No server selected'); return; }
    // zapisz do „recent” tylko gdy mamy legacy listę (żeby nie krzyczeć o braku)
    if (serverList) { saveServer(server); refreshServers(); }

    // even W/H
    let W = parseInt(width.value||'0',10)|0;
    let H = parseInt(height.value||'0',10)|0;
    if (W>0 && (W&1)) W++;
    if (H>0 && (H&1)) H++;

    const cfg = {
      codec:   codec.value,
      audio:   audio.value !== '0',
      fps:     parseInt(fps.value||'60',10) || 60,
      width:   W, height: H,
      preset:  preset.value,
      bitrate: `${parseInt(bitrate.value||'20',10) || 20}M`,
      capture: (capture?.value||''),
      server
    };

    try {
      await startSession(server, cfg, msg => status(msg));
      panel.classList.remove('open');
    } catch (e) {
      status('Connect error: ' + (e?.message || e));
      console.error(e);
    }
  };

  // End
  endBtn.onclick = async () => {
    const server = getServerFromUI() || location.origin.replace(/\/$/,'');
    try { await endSession(server); } catch (_) {}
    status('Session ended');
  };

  // HUD
  fsBtn.onclick = async () => {
    try {
      if (!document.fullscreenElement)
        await document.documentElement.requestFullscreen({navigationUI:'hide'});
      else
        await document.exitFullscreen();
    } catch (_) {}
  };
  exitBtn.onclick = () => { window.close(); };

  // Display tweaks
  const fit = $('fit'),
        scale = $('scale'),
        scalev = $('scalev'),
        contrast = $('contrast'),
        contrastv = $('contrastv'),
        saturate = $('saturate'),
        saturatev = $('saturatev'),
        bright = $('bright'),
        brightv = $('brightv');

  function applyDisplay() {
    const sc = (+scale.value)/100; scalev.textContent = String(scale.value);
    contrastv.textContent = String(contrast.value);
    saturatev.textContent = String(saturate.value);
    brightv.textContent = String(bright.value);
    v.style.objectFit = fit.value;
    v.style.transform = `scale(${sc})`;
    v.style.filter = `contrast(${contrast.value}) saturate(${saturate.value}) brightness(${bright.value})`;
  }
  [fit, scale, contrast, saturate, bright].forEach(el => el?.addEventListener('input', applyDisplay));
  applyDisplay();

  // Stats -> HUD
  onStats(txt => { statsEl.textContent = txt; });

  // Start with panel open
  panel.classList.add('open');

  (function () {
  const toolbar = document.getElementById("gp-toolbar");
  if (!toolbar) return;

  const gp = new GamepadStreamer({ hz: 120, wsPath: "/input" });
  mountGamepadUI(toolbar, gp);

  // When you navigate to kiosk, pass the iframe/page URL so WS host is derived.
  // Example: your preload exposes onNavigate(route, url)
  window.cloud?.onNavigate?.(({ route, url }) => {
    if (route === "kiosk") {
      gp.setTargetFromURL(url);  // e.g., http://HOST:8080 => ws://HOST:8080/input
    } else {
      gp.stop();
    }
  });
})();
}
