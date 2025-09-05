import { app, BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dgram from "dgram";
createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs")
    }
  });
  win.webContents.openDevTools();
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
ipcMain.handle("check-servers-status", async (event, servers) => {
  console.log(`--- Checking status for ${servers.length} servers ---
`);
  const promises = servers.map((server) => {
    const url = `http://${server.address}:8080/healthz`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2e3);
    return fetch(url, { signal: controller.signal }).then((res) => res.ok ? res.json() : Promise.reject()).then((data) => ({
      ...server,
      name: data.name || server.name,
      status: "online"
    })).catch(() => ({ ...server, status: "offline" })).finally(() => clearTimeout(timeout));
  });
  const results = await Promise.all(promises);
  console.log("--- Server status check finished ---");
  return results;
});
ipcMain.handle("check-one-server", async (event, ip) => {
  console.log(`Checking server at ${ip}...`);
  const url = `http://${ip}:8080/healthz`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2e3);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Status not OK: ${res.status}`);
    const data = await res.json();
    console.log(`Server at ${ip} is online.`);
    return { status: "online", ip, data };
  } catch (err) {
    console.log(`Server at ${ip} is offline or unreachable.`);
    return { status: "offline", ip };
  } finally {
    clearTimeout(timeout);
  }
});
ipcMain.handle("discover-servers", async (event, ip) => {
  const subnet = ip ? ip.split(".").slice(0, 3).join(".") : null;
  if (!subnet) {
    console.log("No valid IP provided for discovery.");
    return [];
  }
  console.log(`Starting discovery on subnet ${subnet}.0/24...`);
  const checkPromises = [];
  for (let i = 1; i < 255; i++) {
    const testIp = `${subnet}.${i}`;
    console.log(`Queueing check for ${testIp}`);
    checkPromises.push(
      (async () => {
        const url = `http://${testIp}:8080/healthz`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1e3);
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (res.ok) {
            const data = await res.json();
            console.log(`Discovered server at ${testIp}`);
            return { ip: testIp, data };
          }
        } catch (err) {
        } finally {
          clearTimeout(timeout);
        }
        return null;
      })()
    );
  }
  const results = await Promise.all(checkPromises);
  const foundServers = results.filter((r) => r !== null);
  console.log(`Discovery finished. Found ${foundServers.length} servers.`);
  return foundServers;
});
ipcMain.handle("end-session", async (event, url) => {
  try {
    const res = await fetch(`${url}/api/session/end`, { method: "POST" });
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    return { success: true };
  } catch (err) {
    console.error("End Session Error:", err);
    throw err;
  }
});
ipcMain.handle("suspend-server", async (event, serverAddress) => {
  try {
    const url = `http://${serverAddress}:8080/api/system/suspend`;
    console.log(`Sending suspend command to ${url}`);
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      throw new Error(`Server responded with status: ${res.status}`);
    }
    return { success: true };
  } catch (err) {
    console.error("Suspend Error:", err);
    throw err;
  }
});
ipcMain.handle("wake-on-lan", async (event, macAddress) => {
  try {
    const macBytes = macAddress.split(/:|\-/).map((part) => parseInt(part, 16));
    if (macBytes.length !== 6 || macBytes.some(isNaN)) {
      throw new Error("Invalid MAC address format.");
    }
    const magicPacket = Buffer.concat([
      Buffer.from([255, 255, 255, 255, 255, 255]),
      ...Array(16).fill(Buffer.from(macBytes))
    ]);
    const socket = dgram.createSocket("udp4");
    return new Promise((resolve, reject) => {
      socket.bind(() => {
        socket.setBroadcast(true);
        socket.send(magicPacket, 9, "255.255.255.255", (err) => {
          socket.close();
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });
    });
  } catch (err) {
    console.error("WoL Error:", err);
    throw err;
  }
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
