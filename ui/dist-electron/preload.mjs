"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  },
  checkServer: async (ip2) => {
    return await electron.ipcRenderer.invoke("check-one-server", ip2);
  },
  discoverServers: async () => {
    return await electron.ipcRenderer.invoke("discover-servers", ip);
  },
  wakeOnLan: async (mac2) => {
    return await electron.ipcRenderer.invoke("wake-on-lan", mac2);
  },
  endSession: async (url) => {
    return await electron.ipcRenderer.invoke("end-session", url);
  },
  checkServersStatus: async (servers) => {
    return await electron.ipcRenderer.invoke("check-servers-status", servers);
  },
  suspendSystem: async () => {
    return await electron.ipcRenderer.invoke("suspend-system");
  },
  pingLocalhost: async () => {
    return await electron.ipcRenderer.invoke("ping-local-network", mac);
  }
  // You can expose other APTs you need here.
  // ...
});
