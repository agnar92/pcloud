

export function loadServers(){
  try { return JSON.parse(localStorage.getItem('pccloud_servers')||'[]'); }
  catch { return []; }
}
export function saveServer(u){
  let arr = loadServers();
  if (!arr.includes(u)) { arr.unshift(u); arr = arr.slice(0,12); localStorage.setItem('pccloud_servers', JSON.stringify(arr)); }
}

// Simple /24 scanner (HTTP GET /healthz)
export async function scanPrefix24(prefix, port, progressCb){
  const total = 253; const hosts=[];
  for (let i=2;i<=254;i++) hosts.push(`http://${prefix}.${i}:${port}`);
  const found=[]; let idx=0, active=0, done=0;
  const limit = 32;
  return await new Promise(resolve => {
    function log(){ progressCb?.(done, hosts.length, found); }
    function probe(u){
      active++;
      const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),800);
      fetch(u+'/healthz',{mode:'cors',signal:ctrl.signal})
        .then(r=>r.ok?r.json():null).then(j=>{ if (j && j.ok) found.push(u); })
        .catch(()=>{})
        .finally(()=>{ clearTimeout(to); active--; done++; log(); loop(); });
    }
    function loop(){
      while (active<limit && idx<hosts.length) probe(hosts[idx++]);
      if (done>=hosts.length) resolve(found);
    }
    loop();
  });
}

// export async function findAliveIp(prefix) {
//   const ping = requier('ping');
//   // Quick sweep /24 to find the PC once it wakes
//   const ips = Array.from({length: 254}, (_, i) => `${prefix}${i+1}`);
//   const results = await Promise.all(ips.map(ip => ping.promise.probe(ip, { timeout: 1 })));
//   const alive = results.filter(r => r.alive).map(r => r.host);
//   // If you know last IP, check it first; otherwise return any alive (optional refine)
//   return alive;
// }

const fetchImpl = (...args) =>
  (global.fetch ? global.fetch(...args) : import('node-fetch').then(m => m.default(...args)));

async function fetchWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // const res = await fetchImpl(url, { method: 'GET', signal: ctrl.signal });
    const res = await fetch(url);
    console.log(res.status);
    return res && res.ok ? true : false; // HTTP 2xx == healthy
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function findFirstHealthyHost(prefix, port) {
  
  const  scanPrefix = "192.168.0."
  const  path = '/healthz'
  const  protocol = 'http'
  const  timeoutMs = 800
  const  concurrency = 64
  

  const ips = Array.from({ length: 254 }, (_, i) => `${scanPrefix}${i + 1}`);
  let index = 0;
  let winner = null;

  async function worker() {
    while (!winner) {
      const i = index++;
      if (i >= ips.length) break;
      const ip = ips[i];
      const url = `${protocol}://${ip}:${port}${path}`;
      // console.log(url);
      if (await fetchWithTimeout(url, timeoutMs)) {
        winner = ip;
        break;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return winner;
}
