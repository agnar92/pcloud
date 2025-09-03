const storeKey = 'pccloud_profiles';
const openKey  = 'pccloud_open_ids';
const pairKey = 'pccloud_pairs';

function loadProfiles(){ try { return JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch { return []; } }
function saveProfiles(arr){ localStorage.setItem(storeKey, JSON.stringify(arr)); }

function loadOpen(){ try { return new Set(JSON.parse(localStorage.getItem(openKey) || '[]')); } catch { return new Set(); } }
function saveOpen(set){ localStorage.setItem(openKey, JSON.stringify(Array.from(set))); }


function loadPairs(){ try { return JSON.parse(localStorage.getItem(pairKey)||'[]'); } catch { return []; } }
function savePairs(arr){ localStorage.setItem(pairKey, JSON.stringify(arr)); }

function macNorm(m){ return (m||'').toUpperCase().replace(/[^0-9A-F]/g,'').match(/.{1,2}/g)?.join(':') || ''; }

async function importPairFile(){
  const txt = await window.pairing.openFile();
  if (!txt) return null;
  let obj = null;
  try { obj = JSON.parse(txt); } catch { alert('Invalid pairing file'); return null; }
  if (!obj || !obj.device_id || !obj.broker) { alert('Missing fields in pairing file'); return null; }
  const pairs = loadPairs(); pairs.unshift(obj); savePairs(pairs);
  return obj;
}

// Stub „czekaj na hosta”: dopóki nie masz brokera, sprawdzamy healthz co 2s na znanym IP (jeśli masz)
async function waitForHostOnline({ip, port=8080, timeoutMs=120000, onTick=()=>{}}){
  const start = Date.now();
  while (Date.now() - start < timeoutMs){
    try {
      const r = await fetch(`http://${ip}:${port}/healthz`, { cache:'no-store' });
      const j = await r.json().catch(()=>null);
      if (j && (j.ok || j.status==='ok' || j.healthy)) return true;
    } catch {}
    onTick();
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}


async function fetchWithTimeout(url, ms=800){
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, mode:'cors' }); }
  finally { clearTimeout(t); }
}
async function health(ip, port){
  if (!ip) return false;
  try { const r = await fetchWithTimeout(`http://${ip}:${port}/healthz`, 1000);
        const j = await r.json().catch(()=>null);
        return !!(j && (j.ok || j.status==='ok' || j.healthy)); }
  catch { return false; }
}
// Scan /24s to warm ARP if needed, then resolve
async function smartResolve(mac, port, onProgress=()=>{}){
  let ip = await window.native.resolveMac(mac).catch(()=>null);
  if (ip) return ip;
  const prefixes = await window.native.getPrefixes().catch(()=>[]);
  console.log(prefixes)
  const { findFirstHealthyHost } = await import('./discovery.js');
  for (const pref of prefixes) {
    onProgress(`Scanning ${pref}.0/24…`);
    // await scanPrefix24(pref, port, (done,total)=>onProgress(`Scanning ${pref}.0/24 ${done}/${total}`));
    ip = await findFirstHealthyHost(pref, port);
    // ip = await window.native.resolveMac(mac).catch(()=>null);
    if (ip) return ip;
  }
  return null;
}

// helpers
function updateProfile(idx, patch){
  const arr = loadProfiles();
  arr[idx] = { ...arr[idx], ...patch };
  saveProfiles(arr);
  return arr[idx];
}
function debounce(fn, ms=250){ let id; return (...a)=>{ clearTimeout(id); id=setTimeout(()=>fn(...a), ms); }; }

const openSet = loadOpen();

function render(){
  const list = document.getElementById('list');
  const arr = loadProfiles();
  const pairs = loadPairs();
  list.innerHTML = '';

  // Najpierw sparowane (stały tunel)
  pairs.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="row">
        <div><strong>${p.name || 'Paired host'}</strong>
          <span class="small">ID: ${p.device_id}</span>
          <span class="pill">${p.broker}</span>
        </div>
        <div class="right">
          <button class="btn" data-act="wol">WoL</button>
          <button class="btn primary" data-act="wait">Wait & Connect</button>
          <button class="btn warn" data-act="delpair">Delete</button>
        </div>
      </div>
      <div class="small" id="pairStatus-${idx}">Idle</div>
    `;
    const statusEl = div.querySelector(`#pairStatus-${idx}`);
    div.querySelector('[data-act="wol"]').onclick = async () => {
      if (!p.mac) { alert('No MAC in pairing file/profile'); return; }
      try { await window.native.wolSend(p.mac); statusEl.textContent = 'WoL sent. Waiting…'; }
      catch(e){ statusEl.textContent = 'WoL error: '+e.message; }
    };
    div.querySelector('[data-act="wait"]').onclick = async () => {
      statusEl.textContent = 'Waiting for host…';
      // Jeśli masz znane IP (z poprzednich połączeń), użyj stuba healthz,
      // docelowo zamienisz to na brokerowy waitForHostOnlineViaBroker.
      const ok = p.ip
        ? await waitForHostOnline({ ip:p.ip, port:p.port||8080, onTick:()=> statusEl.textContent+='.' })
        : false;
      if (!ok) { statusEl.textContent = 'Host not yet online (broker soon will replace this)'; return; }
      const port = p.port || 8080;
      await window.native.openKiosk(`http://${p.ip}:${port}`);
    };
    div.querySelector('[data-act="delpair"]').onclick = () => {
      const ps = loadPairs(); ps.splice(idx,1); savePairs(ps); render();
    };
    list.appendChild(div);
  });

  arr.forEach((p, idx) => {
    const isOpen = openSet.has(p.id);
    const div = document.createElement('div'); div.className = 'card';

    const onlineDot = `<span class="dot ${p.online ? 'ok' : ''}"></span>`;
    const pillText  = p.resolving ? 'resolving…' : (p.ip || 'unknown');

    // header row
    div.innerHTML = `
      <div class="row hdr" data-idx="${idx}">
        <div><strong>${p.name}</strong> <span class="small">${p.mac}</span>
          <span class="pill">${onlineDot}${pillText}${p.port?':'+p.port:''}</span>
        </div>
        <div class="right">
          <button class="btn" data-act="wol">WoL</button>
          <button class="btn" data-act="resolve">Resolve</button>
          <button class="btn primary" data-act="open">Open</button>
          <button class="btn warn" data-act="del">Delete</button>
        </div>
      </div>
      <div class="cfg" style="display:${isOpen?'block':'none'}">
        <div class="row"><label style="width:90px">Name</label>
          <input class="input" id="name-${p.id}" value="${p.name ?? ''}" placeholder="PC name">
        </div>
        <div class="row"><label style="width:90px">MAC</label>
          <input class="input" id="mac-${p.id}" value="${p.mac ?? ''}" placeholder="AA:BB:CC:DD:EE:FF">
        </div>
        <div class="row"><label style="width:90px">Port</label>
          <input class="input" id="port-${p.id}" value="${p.port ?? 8080}">
        </div>
        <div class="row"><label style="width:90px">IP (override)</label>
          <input class="input" id="ip-${p.id}" value="${p.ip ?? ''}" placeholder="auto">
        </div>
        <div class="small" id="cfgmsg-${p.id}">Edit fields — saved automatically</div>
      </div>
    `;

    // toggle open when clicking header (not the buttons)
    div.querySelector('.hdr').onclick = (e) => {
      if (e.target.closest('.btn')) return;
      const cfg = div.querySelector('.cfg');
      const on = cfg.style.display !== 'none';
      cfg.style.display = on ? 'none' : 'block';
      if (on) openSet.delete(p.id); else openSet.add(p.id);
      saveOpen(openSet);
    };

    const setMsg = (txt)=>{ const el=div.querySelector(`#cfgmsg-${p.id}`); if (el) el.textContent = txt; };

    // inline editors (auto-save)
    const nameEl = div.querySelector(`#name-${p.id}`);
    const macEl  = div.querySelector(`#mac-${p.id}`);
    const portEl = div.querySelector(`#port-${p.id}`);
    const ipEl   = div.querySelector(`#ip-${p.id}`);

    const saveName = debounce(() => {
      const v = (nameEl.value||'').trim() || 'PC';
      updateProfile(idx, { name: v }); render();
    });
    const saveMac = debounce(async () => {
      const v = macNorm(macEl.value);
      macEl.value = v;
      if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(v)) { setMsg('Invalid MAC'); return; }
      // change MAC -> clear IP/online
      updateProfile(idx, { mac: v, ip: null, online: false });
      setMsg('MAC updated, resolving…');
      // attempt quick resolve in background
      const found = await window.native.resolveMac(v).catch(()=>null);
      if (found) {
        const ok = await health(found, p.port || 8080);
        updateProfile(idx, { ip: found, online: ok });
        setMsg(ok ? `Resolved ${found} • Online` : `Resolved ${found} • Offline`);
        render();
      } else setMsg('MAC saved • IP not found yet');
    });
    const savePort = debounce(async () => {
      let v = parseInt(portEl.value,10) || 8080;
      if (v<1 || v>65535) v = 8080;
      portEl.value = v;
      updateProfile(idx, { port: v });
      // re-check health if IP known
      const arr2 = loadProfiles(); const cur = arr2[idx];
      if (cur.ip) {
        const ok = await health(cur.ip, v);
        updateProfile(idx, { online: ok });
        setMsg(ok ? 'Port updated • Online' : 'Port updated • Offline');
        render();
      }
    });
    const saveIp = debounce(async () => {
      const v = (ipEl.value||'').trim();
      const val = v || null; // empty means auto
      updateProfile(idx, { ip: val });
      const arr2 = loadProfiles(); const cur = arr2[idx];
      const ok = await health(cur.ip, cur.port || 8080);
      updateProfile(idx, { online: ok });
      setMsg(val ? (ok ? 'IP set • Online' : 'IP set • Offline') : 'IP cleared (auto)');
      render();
    });

    nameEl.addEventListener('input', saveName);
    macEl.addEventListener('blur', saveMac);
    macEl.addEventListener('input', ()=>{ /* live normalize hint */ });
    portEl.addEventListener('input', savePort);
    ipEl.addEventListener('input', saveIp);

    // actions
    const actResolve = async (showAlerts=false) => {
      updateProfile(idx, { resolving: true }); render();
      const port = p.port || 8080;
      let found = null;
      for (let attempt=1; attempt<=9; attempt++){
        const msg = (t)=>console.log(`[resolve ${attempt}]`, t);
        found = await smartResolve(p.mac, port, msg);
        if (found) break;
        await new Promise(r=>setTimeout(r, 5000));
      }
      const patched = updateProfile(idx, { ip: found || p.ip || null, resolving: false });
      patched.online = await health(patched.ip, port);
      updateProfile(idx, { online: patched.online });
      setMsg(found ? (patched.online ? `Resolved ${found} • Online` : `Resolved ${found} • Offline`) : 'IP not found');
      render();
      if (showAlerts && !found) alert('IP not found yet. Try WoL or ensure the PC is online.');
      return found;
    };

    div.querySelector('[data-act="wol"]').onclick = async (e) => {
      try { await window.native.wolSend(p.mac); } catch(e){ console.error(e); }
      setTimeout(() => actResolve(false), 2500);
      e.stopPropagation();
    };
    div.querySelector('[data-act="resolve"]').onclick = (e) => { actResolve(true); e.stopPropagation(); };
    div.querySelector('[data-act="open"]').onclick = async (e) => {
      let host = p.ip;
      if (!host) host = await window.native.resolveMac(p.mac).catch(()=>null);
      if (!host) host = await actResolve(true);
      if (!host) return;
      const port = p.port || 8080;
      await window.native.openKiosk(`http://${host}:${port}`);
      e.stopPropagation();
    };
    div.querySelector('[data-act="del"]').onclick = (e) => {
      const arr2 = loadProfiles(); arr2.splice(idx,1); saveProfiles(arr2); render();
      e.stopPropagation();
    };

    list.appendChild(div);
  });
}

async function refreshOnline(){
  const arr = loadProfiles();
  for (let i=0;i<arr.length;i++){
    const p = arr[i]; const port = p.port || 8080;
    if (!p.ip) { try { p.ip = await window.native.resolveMac(p.mac); } catch {} saveProfiles(arr); }
    p.online = await health(p.ip, port); saveProfiles(arr); render();
  }
}

function setupAdd(){
  const toggle = document.getElementById('toggleAdd');
  const box = document.getElementById('addBox');
  const addBtn = document.getElementById('addBtn');
  const msg = document.getElementById('addMsg');


  toggle.onclick = () => { box.style.display = box.style.display==='block' ? 'none' : 'block'; };

  addBtn.onclick = async () => {
    const name = (document.getElementById('addName').value || '').trim() || 'PC';
    const macIn = (document.getElementById('addMac').value || '').trim();
    const port = parseInt(document.getElementById('addPort').value,10) || 8080;
    const mac = macNorm(macIn);
    if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(mac)) { msg.textContent = 'Invalid MAC'; return; }

    msg.textContent = 'Resolving MAC…';
    let ip = await window.native.resolveMac(mac).catch(()=>null);
    if (!ip) ip = await smartResolve(mac, port, (t)=> msg.textContent = t);
    msg.textContent = ip ? `Found IP ${ip}` : 'IP not found (yet)';

    const prof = { id: crypto.randomUUID(), name, mac, ip, port, online: false };
    const arr = loadProfiles(); arr.unshift(prof); saveProfiles(arr);
    openSet.add(prof.id); saveOpen(openSet); // auto-unfold new profile
    render();

    const ok = await health(ip, port);
    if (ok) {
      const arr2 = loadProfiles(); arr2[0].online = true; saveProfiles(arr2); render();
      msg.textContent = `Saved • Online`;
    } else {
      msg.textContent = `Saved • Offline (try WoL)`;
    }
  };
}

(function setupPairingUI(){
  const btn = document.getElementById('pairImport');
  const msg = document.getElementById('pairMsg');
  if (btn) btn.onclick = async () => {
    const p = await importPairFile();
    if (p) { msg.textContent = 'Paired. You can WoL and Wait & Connect now.'; render(); }
  };
})();

render();
setupAdd();
refreshOnline();

// background re-resolve every 30s for unknown IPs
setInterval(() => {
  const arr = loadProfiles();
  arr.forEach(async (p, idx) => {
    if (!p.ip && !p.resolving) {
      updateProfile(idx, { resolving: true }); render();
      const found = await window.native.resolveMac(p.mac).catch(()=>null);
      updateProfile(idx, { ip: found || null, resolving: false });
      render();
    }
  });
}, 30000);
