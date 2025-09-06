import { ipcRenderer, contextBridge } from 'electron'


// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
  checkServer: async (ip: string) => {
    return await ipcRenderer.invoke('check-one-server', ip);
  },
  discoverServers: async (ip: string) => {
    return await ipcRenderer.invoke('discover-servers', ip);
  },
  wakeOnLan: async (mac: string) => {
    return await ipcRenderer.invoke('wake-on-lan', mac);
  },
  endSession: async (url: string) => {
    return await ipcRenderer.invoke('end-session', url);
  },
  checkServersStatus: async (servers: Array<{ name: string; address: string; mac?: string }>) => {
    return await ipcRenderer.invoke('check-servers-status', servers);
  },
  appExit: async () => { return await ipcRenderer.invoke('app-exit');},
})
