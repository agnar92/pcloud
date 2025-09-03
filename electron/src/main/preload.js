// src/main/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setKiosk: (enabled) => ipcRenderer.invoke('kiosk:set', enabled),
  openFile: () => ipcRenderer.invoke('dialog:openFile')
});

contextBridge.exposeInMainWorld('native', {
  wolSend: (mac) => ipcRenderer.invoke('net:wol', mac),
  resolveMac: (mac) => ipcRenderer.invoke('net:resolveMac', mac),
  openKiosk: (server) => ipcRenderer.invoke('app:openKiosk', server),
  getPrefixes: () => ipcRenderer.invoke('net:getPrefixes')
});

contextBridge.exposeInMainWorld('pairing', {
  openFile: () => ipcRenderer.invoke('pair:openFile'),
});

// Shims (opcjonalne)
if (!('serviceWorker' in navigator)) {
  const sw = { register: async () => ({ update:()=>{}, unregister: async ()=>true }), ready: Promise.resolve({}) };
  Object.defineProperty(navigator, 'serviceWorker', { value: sw });
}
if (!('Notification' in globalThis)) {
  class FakeNotification { constructor(){} static requestPermission(){ return Promise.resolve('granted'); } }
  globalThis.Notification = FakeNotification;
}
