// src/main/main.js
const { app, BrowserWindow, globalShortcut, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs').promises;

const isDev = process.argv.includes('--dev') || !app.isPackaged;

let ipcRegistered = false;

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow () {
  if (ipcRegistered) return;      // <-- chroni przed drugą rejestracją
  ipcRegistered = true;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    show: false,
    kiosk: process.argv.includes('--kiosk'),
    fullscreen: process.argv.includes('--fullscreen'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: true
    }
  });

  win.webContents.toggleDevTools();

  win.webContents.on('will-navigate', (e, url) => {
    const allowed = url.startsWith('file://');
    if (!allowed) e.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.once('ready-to-show', () => win.show());

  // Startujemy od Home
  win.loadFile(path.join(__dirname, '..', 'renderer', 'home.html'));

  globalShortcut.register('CommandOrControl+Shift+I', () => win.webContents.toggleDevTools());
  globalShortcut.register('CommandOrControl+R', () => win.webContents.reloadIgnoringCache());
  globalShortcut.register('F11', () => win.setFullScreen(!win.isFullScreen()));
  globalShortcut.register('F12', () => win.webContents.toggleDevTools());

  // IPC: kiosk przejście
  ipcMain.handle('app:openKiosk', (evt, serverUrl) => {
    const w = BrowserWindow.fromWebContents(evt.sender);
    return w.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), {
      query: { server: serverUrl, readonly: '1' }
    });
  });

  // IPC: WoL
  ipcMain.handle('net:wol', async (_evt, mac) => {
    const macClean = (mac || '').replace(/[^0-9A-F]/gi, '').toUpperCase();
    if (macClean.length !== 12) throw new Error('Invalid MAC');
    const macBuf = Buffer.from(macClean, 'hex');
    const packet = Buffer.alloc(6 + 16 * 6, 0xff);
    for (let i = 0; i < 16; i++) macBuf.copy(packet, 6 + i * 6);

    await new Promise((resolve, reject) => {
      const sock = dgram.createSocket('udp4');
      sock.once('error', (e) => { try { sock.close(); } catch(_){} reject(e); });
      sock.bind(() => {
        try { sock.setBroadcast(true); } catch (_) {}
        sock.send(packet, 9, '255.255.255.255', (err) => {
          try { sock.close(); } catch(_) {}
          if (err) reject(err); else resolve();
        });
      });
    });
    return true;
  });

  ipcMain.handle('pair:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import pairing file',
      filters: [{ name: 'PCloud Pair', extensions: ['pcloud-pair','json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths?.length) return null;
    const txt = await fs.readFile(filePaths[0], 'utf-8');
    return txt;
  });

  // IPC: resolve MAC -> IP (ARP)
  ipcMain.handle('net:resolveMac', async (_evt, mac) => {
    const macNorm = (mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');
    if (macNorm.length !== 12) throw new Error('Invalid MAC');

    function parseArp(text){
      const ips = [];
      const macRe = /([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/gi;
      const ipRe  = /(\d{1,3}\.){3}\d{1,3}/g;
      for (const ln of text.split(/\r?\n/)) {
        const m = (ln.toLowerCase().match(macRe) || [])[0];
        const ip = (ln.match(ipRe) || [])[0];
        if (m && ip) {
          const cand = m.replace(/[^0-9a-f]/g,'');
          if (cand === macNorm) ips.push(ip);
        }
      }
      return ips;
    }
    const run = (cmd) => new Promise(res => exec(cmd, { windowsHide:true }, (_e, out, err) => res(out||err||'')));

    let out = '';
    if (process.platform === 'win32') out = await run('arp -a');
    else if (process.platform === 'darwin') out = await run('arp -an');
    else out = (await run('ip neigh show')) + '\n' + (await run('arp -an'));

    const ips = parseArp(out);
    return ips[0] || null;
  });

  ipcMain.handle('net:getPrefixes', async () => {
    const nets = os.networkInterfaces();
    const out = new Set();
    for (const ifname of Object.keys(nets)) {
      for (const n of nets[ifname] || []) {
        if (n.family === 'IPv4' && !n.internal) {
          const m = /^(\d+\.\d+\.\d+)\.\d+$/.exec(n.address);
          if (m) out.add(m[1]);
        }
      }
    }
    return Array.from(out);
  });


}

app.whenReady().then(() => {
  app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors,BlockInsecurePrivateNetworkRequests');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
  app.commandLine.appendSwitch("enable-features", "UseOzonePlatform,WaylandWindowDecorations,VaapiVideoDecoder");
  app.commandLine.appendSwitch("ozone-platform", "wayland");
  app.commandLine.appendSwitch("use-gl", "egl");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-zero-copy");
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
