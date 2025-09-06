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
  checkServer: async (ip) => {
    return await electron.ipcRenderer.invoke("check-one-server", ip);
  },
  discoverServers: async (ip) => {
    return await electron.ipcRenderer.invoke("discover-servers", ip);
  },
  wakeOnLan: async (mac) => {
    return await electron.ipcRenderer.invoke("wake-on-lan", mac);
  },
  endSession: async (url) => {
    return await electron.ipcRenderer.invoke("end-session", url);
  },
  checkServersStatus: async (servers) => {
    return await electron.ipcRenderer.invoke("check-servers-status", servers);
  },
  appExit: async () => {
    return await electron.ipcRenderer.invoke("app-exit");
  }
});
