let pc = null;
let videoEl = null;
let statsCb = null;
let inputDC = null;

// ---- public API ------------------------------------------------------------

// export function setvideoElement(el) { videoEl = el; }

export function onStats(cb) { statsCb = cb; }

export async function startSession(server, cfg, status, el) {
  videoEl = el;
  if (pc) {
    await endSession(server);
  }

  pc = new RTCPeerConnection({ iceServers: [] });
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  pc.ontrack = ev => {
    if (ev.track.kind === 'video' && videoEl) {
      videoEl.srcObject = ev.streams[0];
    }
    if (ev.track.kind === 'audio') {
      const audioEl = document.getElementById('audio');
      if (audioEl) {
        audioEl.srcObject = ev.streams[0];
        audioEl.play();
        console.log(audioEl.srcObject);
      }
    }

  };


  // DataChannel for input
  inputDC = pc.createDataChannel('input', { ordered: true, maxRetransmits: 0 }); // Use unreliable for low latency
  inputDC.onopen = () => status?.('Input channel open');
  inputDC.onerror = e => console.warn('input dc error', e);
  inputDC.onerror = e => {
    console.warn('input dc error', e);
    status?.(`Input channel error: ${e.message}`);
  };

  // Prefer codec (best-effort)
  try {
    const tx = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video');
    const caps = RTCRtpReceiver.getCapabilities('video');
    const wanted = caps?.codecs?.filter(c => (c.mimeType || '').toLowerCase().includes(cfg.codec)) || [];
    const rest = caps?.codecs?.filter(c => !wanted.includes(c)) || [];
    if (wanted.length) await tx.setCodecPreferences([...wanted, ...rest]);
  } catch (_) { /* empty */ }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const res = await fetch(server + '/api/session/offer', {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sdp: offer.sdp, type: offer.type,
      codec: cfg.codec, audio: !!cfg.audio,
      fps: cfg.fps, width: cfg.width, height: cfg.height,
      preset: cfg.preset, bitrate: cfg.bitrate,
      capture: cfg.capture
    })
  });
  if (!res.ok) throw new Error(`offer failed ${res.status}: ${await res.text().catch(() => '')}`);
  const ans = await res.json();
  await pc.setRemoteDescription(ans);

  attachInputsRD(); // absolute mouse + keys + wheel + gamepad
  status?.('Connected to ' + server);

  let lastStats = {
    timestamp: performance.now(),
    bytesReceived: 0,
    framesDecoded: 0,
    packetsReceived: 0,
    packetsLost: 0,
    framesDropped: 0,
  };

  const t = setInterval(async () => {
    if (!pc) return clearInterval(t);

    const reports = await pc.getStats();
    let videoReport = null;
    reports.forEach(rep => {
      if (rep.type === 'inbound-rtp' && rep.kind === 'video') {
        videoReport = rep;
      }
    });

    if (!videoReport) return;

    const now = performance.now();
    const dt = (now - lastStats.timestamp) / 1000; // time delta in seconds

    if (dt === 0) return;

    // --- Calculate FPS ---
    const framesDecoded = videoReport.framesDecoded || 0;
    const fps = ((framesDecoded - lastStats.framesDecoded) / dt).toFixed(1);

    // --- Calculate Bitrate ---
    const bytesReceived = videoReport.bytesReceived || 0;
    const bitrate = (bytesReceived - lastStats.bytesReceived) * 8 / dt; // bits per second
    const br = (bitrate / 1_000_000).toFixed(2); // Mbps

    // --- Calculate Packet Loss ---
    const packetsReceived = videoReport.packetsReceived || 0;
    const packetsLost = videoReport.packetsLost || 0;
    const deltaPacketsReceived = packetsReceived - lastStats.packetsReceived;
    const deltaPacketsLost = packetsLost - lastStats.packetsLost;
    let packetLossPercentage = 0;
    const totalDeltaPackets = deltaPacketsReceived + deltaPacketsLost;
    if (totalDeltaPackets > 0) {
      packetLossPercentage = (deltaPacketsLost / totalDeltaPackets) * 100;
    }

    // --- Calculate Frames Dropped ---
    const framesDropped = videoReport.framesDropped || 0;
    const deltaFramesDropped = framesDropped - lastStats.framesDropped;

    // --- Update lastStats for the next interval ---
    lastStats = {
      timestamp: now,
      bytesReceived: bytesReceived,
      framesDecoded: framesDecoded,
      packetsReceived: packetsReceived,
      packetsLost: packetsLost,
      framesDropped: framesDropped,
    };

    // --- Format Output String ---
    const jitter = Math.round((videoReport.jitter || 0) * 1000);
    const pl = packetLossPercentage.toFixed(2);
    const out = `fps: ${fps} | br: ${br} Mbps | jitter: ${jitter}ms | loss: ${pl}% | dropped: ${deltaFramesDropped}`;
    statsCb?.(out);
  }, 1000);
}

export async function endSession(server) {
  try { await fetch(server + '/api/session/end', { method: 'POST', mode: 'cors' }); } catch (_) { /* empty */ }
  try { pc && pc.close(); } catch (_) { /* empty */ }
  pc = null;
  if (videoEl?.srcObject) {
    console.log("Stopping video tracks");

    videoEl.srcObject.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
  }
}

// ---- inputs (remote-desktop absolute) -------------------------------------

function send(type, payload) {
  if (inputDC && inputDC.readyState === 'open') {
    // Note: The 'gp' event is now sent from here, not the separate gamepad.js streamer
    inputDC.send(JSON.stringify({ t: type, ...payload, ts: performance.now() }));
  }
}

function mapMouseToVideo(e) {
  if (!videoEl) return { x: 0, y: 0, inside: false };
  const rect = videoEl.getBoundingClientRect();
  const relX = e.clientX - rect.left;
  const relY = e.clientY - rect.top;

  const vw = videoEl.videoWidth || 1920;
  const vh = videoEl.videoHeight || 1080;
  const ar = vw / vh;

  const rw = rect.width, rh = rect.height;
  let dispW, dispH, offX = 0, offY = 0;
  const fit = getComputedStyle(videoEl).objectFit || 'contain';

  if (fit === 'contain' || fit === 'scale-down') {
    if (rw / rh > ar) { dispH = rh; dispW = rh * ar; offX = (rw - dispW) / 2; }
    else { dispW = rw; dispH = rw / ar; offY = (rh - dispH) / 2; }
  } else if (fit === 'cover') {
    if (rw / rh > ar) { dispW = rw; dispH = rw / ar; offY = (rh - dispH) / 2; }
    else { dispH = rh; dispW = rh * ar; offX = (rw - dispW) / 2; }
  } else {
    dispW = rw; dispH = rh;
  }

  const x = (relX - offX) / dispW;
  const y = (relY - offY) / dispH;
  const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;

  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), inside };
}

let lastMove = null, rafPending = false;
function onMouseMove(e) {
  lastMove = e;
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!lastMove) return;
      const m = mapMouseToVideo(lastMove);
      send('mmoveAbs', { x: m.x, y: m.y, inside: m.inside ? 1 : 0 });
      lastMove = null;
    });
  }
}

function onMouseDown(e) {
  const m = mapMouseToVideo(e);
  send('mdown', { b: e.button, x: m.x, y: m.y });
}
function onMouseUp(e) {
  const m = mapMouseToVideo(e);
  send('mup', { b: e.button, x: m.x, y: m.y });
}
function onWheel(e) {
  send('mwheel', { dx: e.deltaX, dy: e.deltaY });
}

function onKeyDown(e) {
  if (!e.repeat) send('kdown', { k: e.code });
  e.preventDefault(); // Prevent default browser actions for keys
}
function onKeyUp(e) {
  send('kup', { k: e.code });
  e.preventDefault();
}

let inputsBound = false;
function attachInputsRD() {
  if (inputsBound || !videoEl) return;
  inputsBound = true;

  videoEl.style.cursor = 'none';

  videoEl.addEventListener('mousemove', onMouseMove);
  videoEl.addEventListener('mousedown', onMouseDown);
  videoEl.addEventListener('mouseup', onMouseUp);
  videoEl.addEventListener('wheel', onWheel, { passive: false }); // passive:false to allow preventDefault
  videoEl.addEventListener('contextmenu', e => e.preventDefault()); // Disable right-click menu

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let lastPad = '';
  function gpStep() {
    const pads = navigator.getGamepads?.() || [];
    const p = pads[0];
    if (p) {
      const msg = {
        id: p.id, index: p.index,
        axes: Array.from(p.axes).map(x => +x.toFixed(3)),
        buttons: p.buttons.map(b => b.pressed ? 1 : 0)
      };
      const s = JSON.stringify(msg);
      if (s !== lastPad) { send('gp', msg); lastPad = s; }
    }
    requestAnimationFrame(gpStep);
  }
  requestAnimationFrame(gpStep);
}
