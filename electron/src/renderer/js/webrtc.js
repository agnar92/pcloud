let pc = null;
let videoEl = null;
let statsCb = null;
let inputDC = null;

// ---- public API ------------------------------------------------------------

export function setVideoElement(el){ videoEl = el; }

export function onStats(cb){ statsCb = cb; }

export async function startSession(server, cfg, status) {
  if (pc) { try { pc.close(); } catch(_) {} pc = null; }

  pc = new RTCPeerConnection();
  pc.addTransceiver('video', {direction:'recvonly'});
  pc.addTransceiver('audio', {direction:'recvonly'});

  pc.ontrack = ev => {
    if (ev.track.kind === 'video' && videoEl) {
      videoEl.srcObject = ev.streams[0];
    }
  };

  // DataChannel for input
  inputDC = pc.createDataChannel('input', {ordered:true});
  inputDC.onopen  = () => status?.('Input channel open');
  inputDC.onerror = e  => console.warn('input dc error', e);

  // Prefer codec (best-effort)
  try {
    const tx = pc.getTransceivers().find(t=>t.receiver?.track?.kind==='video');
    const caps = RTCRtpReceiver.getCapabilities('video');
    const wanted = caps?.codecs?.filter(c => (c.mimeType||'').toLowerCase().includes(cfg.codec)) || [];
    const rest   = caps?.codecs?.filter(c => !wanted.includes(c)) || [];
    if (wanted.length) await tx.setCodecPreferences([...wanted, ...rest]);
  } catch(_) {}

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const res = await fetch(server+'/api/session/offer', {
    method:'POST', mode:'cors',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      sdp: offer.sdp, type: offer.type,
      codec: cfg.codec, audio: !!cfg.audio,
      fps: cfg.fps, width: cfg.width, height: cfg.height,
      preset: cfg.preset, bitrate: cfg.bitrate,
      capture: cfg.capture
    })
  });
  if (!res.ok) throw new Error(`offer failed ${res.status}: ${await res.text().catch(()=> '')}`);
  const ans = await res.json();
  await pc.setRemoteDescription(ans);

  attachInputsRD(); // absolute mouse + keys + wheel + gamepad
  status?.('Connected to '+server);

  // Stats 1 Hz
  let lastFrames=0, lastTs=performance.now();
  const t = setInterval(async () => {
    if (!pc) { clearInterval(t); return; }
    let out = '';
    const r = await pc.getStats();
    r.forEach(rep => {
      if (rep.type==='inbound-rtp' && rep.kind==='video') {
        const now = performance.now(), fd = rep.framesDecoded ?? 0;
        const dt = (now-lastTs)/1000;
        let fps = '-';
        if (dt>0.25) { fps = ((fd-lastFrames)/dt).toFixed(1); lastFrames=fd; lastTs=now; }
        const br = Math.round((rep.bytesReceived||0)/1024);
        out = `fps:${rep.framesPerSecond ?? fps}  jitter:${Math.round((rep.jitter||0)*1000)}ms  br:${br}kB`;
      }
    });
    statsCb?.(out || 'fps:- jitter:- br:-kB');
  }, 1000);
}

export async function endSession(server) {
  try { await fetch(server+'/api/session/end', {method:'POST', mode:'cors'}); } catch(_) {}
  try { pc && pc.close(); } catch(_) {}
  pc = null;
  if (videoEl?.srcObject) {
    videoEl.srcObject.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
  }
}

// ---- inputs (remote-desktop absolute) -------------------------------------

function send(type, payload){
  if (inputDC && inputDC.readyState === 'open') {
    inputDC.send(JSON.stringify({t:type, ...payload, ts:performance.now()}));
  }
}

// Map page mouse coords to normalized video coords [0..1] inside displayed video rect.
function mapMouseToVideo(e) {
  if (!videoEl) return {x:0, y:0, inside:false};
  const rect = videoEl.getBoundingClientRect();
  const relX = e.clientX - rect.left;
  const relY = e.clientY - rect.top;

  // Intrinsic video size (fallback to 16:9 if not ready yet)
  const vw = videoEl.videoWidth  || 1920;
  const vh = videoEl.videoHeight || 1080;
  const ar = vw / vh;

  // Object-fit aware displayed content box inside rect
  const rw = rect.width, rh = rect.height;
  let dispW, dispH, offX = 0, offY = 0;
  const fit = getComputedStyle(videoEl).objectFit || 'contain';

  if (fit === 'contain' || fit === 'scale-down') {
    if (rw / rh > ar) { dispH = rh; dispW = rh * ar; offX = (rw - dispW)/2; }
    else              { dispW = rw; dispH = rw / ar; offY = (rh - dispH)/2; }
  } else if (fit === 'cover') {
    if (rw / rh > ar) { dispW = rw; dispH = rw / ar; offY = (rh - dispH)/2; }
    else              { dispH = rh; dispW = rh * ar; offX = (rw - dispW)/2; }
  } else { // fill
    dispW = rw; dispH = rh;
  }

  const x = (relX - offX) / dispW;
  const y = (relY - offY) / dispH;
  const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;

  // clamp
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), inside };
}

// Throttle mousemove via rAF (send last sample only)
let lastMove = null, rafPending = false;
function onMouseMove(e){
  lastMove = e;
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!lastMove) return;
      const m = mapMouseToVideo(lastMove);
      send('mmoveAbs', {x:m.x, y:m.y, inside:m.inside?1:0});
      lastMove = null;
    });
  }
}

function onMouseDown(e){
  const m = mapMouseToVideo(e);
  send('mdown', {b:e.button, x:m.x, y:m.y});
}
function onMouseUp(e){
  const m = mapMouseToVideo(e);
  send('mup', {b:e.button, x:m.x, y:m.y});
}
function onWheel(e){
  // do NOT preventDefault globally; allow page scroll when panel open
  send('mwheel', {dx:e.deltaX, dy:e.deltaY});
}

function onKeyDown(e){
  if (!e.repeat) send('kdown', {k:e.code});
}
function onKeyUp(e){
  send('kup', {k:e.code});
}

let inputsBound = false;
function attachInputsRD(){
  if (inputsBound || !videoEl) return;
  inputsBound = true;

  videoEl.style.cursor = 'default';  // ensure visible cursor

  // Mouse & wheel on the video element
  videoEl.addEventListener('mousemove', onMouseMove);
  videoEl.addEventListener('mousedown', onMouseDown);
  videoEl.addEventListener('mouseup',   onMouseUp);
  videoEl.addEventListener('wheel',     onWheel, {passive:true});

  // Keyboard on window
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  // Gamepad loop (120Hz by rAF, send only changes)
  let lastPad = '';
  function gpStep(){
    const pads = navigator.getGamepads?.() || [];
    const p = pads[0];
    if (p) {
      const msg = {
        id: p.id, index: p.index,
        axes: Array.from(p.axes).map(x=>+x.toFixed(3)),
        buttons: p.buttons.map(b => b.pressed?1:0)
      };
      const s = JSON.stringify(msg);
      if (s !== lastPad) { send('gp', msg); lastPad = s; }
    }
    requestAnimationFrame(gpStep);
  }
  requestAnimationFrame(gpStep);
}
