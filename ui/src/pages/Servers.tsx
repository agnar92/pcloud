import { useEffect, useState, useCallback, useRef } from "react";
import { useNotification } from "../context/NotificationContext";
import { PlayIcon, ArrowPathIcon, PowerIcon, MoonIcon, PencilSquareIcon, XMarkIcon } from "../components/Icons";

// A custom hook to simplify storing state in localStorage.
const useStoredState = (key, defaultValue) => {
  const [value, setValue] = useState(() => {
    try {
      const storedValue = localStorage.getItem(key);
      return storedValue !== null ? JSON.parse(storedValue) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
};

// The main component, now focused on a single primary server
export default function Servers({ onConnect }) {
  const [server, setServer] = useStoredState('pcloud_primary_server', {
    name: 'My Gaming PC',
    address: '192.168.0.101',
    mac: '00:00:00:00:00:00'
  });
  const [status, setStatus] = useState('offline'); // offline, checking, scanning, online, waking
  const { addNotification } = useNotification();
  const pollingRef = useRef(null);

  // State for the Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [formName, setFormName] = useState(server.name);
  const [formIp, setFormIp] = useState(server.address);
  const [formMac, setFormMac] = useState(server.mac);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const checkServer = useCallback(async (ip) => {
    return await window.ipcRenderer.invoke("check-one-server", ip);
  }, []);

  // Refresh logic: check if the server is online, if not try to discover it
  const handleRefresh = useCallback(async (ip) => {
    stopPolling();
    setStatus('checking');
    addNotification(`Checking for ${server.name}...`, 'info');
    const result = await checkServer(server.address);

    if (result.status === 'online') {
      addNotification(`${server.name} is online!`, 'success');
      setServer(s => ({ ...s, name: result.data.name, address: result.ip }));
      setStatus('online');
    } else {
      addNotification(`${server.name} not found. Scanning network...`, 'info');
      setStatus('scanning');
      const found = await window.ipcRenderer.invoke("discover-servers", server.address);
      if (found.length > 0) {
        const discovered = found[0];
        addNotification(`Found ${discovered.data.name} at new IP: ${discovered.ip}!`, 'success');
        setServer(s => ({ ...s, name: discovered.data.name, address: discovered.ip }));
        setStatus('online');
      } else {
        addNotification(`${server.name} could not be found.`, 'error');
        setStatus('offline');
      }
    }
  }, [server, checkServer, addNotification, setServer]);

  const handleWake = useCallback(async () => {
    if (!server.mac) return addNotification('No MAC address configured.', 'error');
    stopPolling();
    setStatus('waking');
    addNotification(`Sending Wake-on-LAN to ${server.mac}...`, 'info');
    try {
      await window.ipcRenderer.invoke('wake-on-lan', server.mac);
      addNotification('Wake command sent. Waiting for PC to boot (30s)... ', 'info');

      const wakeTimeout = setTimeout(() => {
        stopPolling();
        addNotification(`${server.name} did not respond.`, 'error');
        setStatus('offline');
      }, 30000);

      pollingRef.current = setInterval(async () => {
        const result = await checkServer(server.address);
        if (result.status === 'online') {
          stopPolling();
          clearTimeout(wakeTimeout);
          addNotification(`${server.name} is now online!`, 'success');
          setServer(s => ({ ...s, name: result.data.name, address: result.ip }));
          setStatus('online');
        }
      }, 3000);

    } catch (err) {
      addNotification(`WoL Failed: ${err.message}`, 'error');
      setStatus('offline');
    }
  }, [server, checkServer, addNotification, setServer]);

  const handleSuspend = useCallback(async () => {
    stopPolling();
    addNotification(`Sending suspend command to ${server.name}...`, 'info');
    try {
      await window.ipcRenderer.invoke('suspend-server', server.address);
      addNotification('Suspend command sent successfully.', 'success');
      setStatus('offline');
    } catch (err) {
      addNotification(`Suspend failed: ${err.message}`, 'error');
    }
  }, [server, addNotification]);

  const handleEditSave = (e) => {
    e.preventDefault();
    if (!formName || !formIp) return addNotification('PC Name and IP Address are required.', 'error');
    setServer({ name: formName, address: formIp, mac: formMac });
    setShowEditModal(false);
    addNotification('Configuration saved!', 'success');
    handleRefresh();
  };

  // Initial check on load
  useEffect(() => {
    setStatus('checking');
    checkServer(server.address).then(result => {
      if (result.status === 'online') {
        setServer(s => ({ ...s, name: result.data.name, address: result.ip }));
        setStatus('online');
      } else {
        setStatus('offline');
      }
    });
    return stopPolling;
  }, []); // Note: dependencies are intentionally omitted to only run once on mount.

  const isOnline = status === 'online';
  const isBusy = ['checking', 'scanning', 'waking'].includes(status);

  return (
    <>
      <div className="w-screen h-screen p-6 md:p-8 flex items-center justify-center text-gray-200 box-border relative overflow-hidden">
        {/* Decorative gradient blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 bg-blue-500/20 blur-3xl rounded-full" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 bg-green-500/20 blur-3xl rounded-full" />

        <div className="w-full max-w-lg">
          <div className="glass rounded-2xl p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-3xl md:text-4xl font-bold text-white truncate">{server.name}</h1>
                <div className="flex items-center gap-3 text-sm mt-3">
                  <span className={`status-dot ${isOnline ? 'bg-green-500' : 'bg-gray-600'} ${isBusy ? 'animate-pulse' : ''}`}></span>
                  <span className={`capitalize ${isOnline ? 'text-green-400' : 'text-gray-400'}`}>{status}</span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-400 truncate">{isOnline ? server.address : (server.mac || 'No MAC configured')}</span>
                </div>
              </div>
              <button onClick={() => setShowEditModal(true)} className="btn-ghost px-3 py-2">
                <PencilSquareIcon />
                <span className="sr-only">Edit</span>
              </button>
            </div>

            <div className="mt-8 grid gap-3">
              <button
                onClick={() => onConnect(server)}
                disabled={!isOnline}
                className={`btn-primary text-lg px-6 py-4 rounded-xl ${!isOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <PlayIcon />
                Connect
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleWake}
                  disabled={isBusy || isOnline || !server.mac}
                  className={`btn-success px-4 py-3 ${isBusy || isOnline || !server.mac ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <PowerIcon />
                  Wake Up
                </button>
                <button
                  onClick={handleSuspend}
                  disabled={!isOnline}
                  className={`btn-muted px-4 py-3 ${!isOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <MoonIcon />
                  Suspend
                </button>
              </div>

              <button
                onClick={handleRefresh}
                disabled={isBusy}
                className={`btn-ghost px-4 py-3 ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <ArrowPathIcon />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
          <form onSubmit={handleEditSave} className="w-full max-w-md glass p-6 md:p-8 rounded-xl flex flex-col gap-4 relative">
            <button type="button" onClick={() => setShowEditModal(false)} className="absolute top-3 right-3 text-gray-400 hover:text-white">
              <XMarkIcon />
            </button>
            <h2 className="text-xl md:text-2xl font-bold text-white">Edit PC Configuration</h2>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="PC Name" className="bg-gray-900/70 text-white placeholder-gray-400 px-4 py-3 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" value={formIp} onChange={(e) => setFormIp(e.target.value)} placeholder="IP Address (e.g., 192.168.0.101)" className="bg-gray-900/70 text-white placeholder-gray-400 px-4 py-3 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" value={formMac} onChange={(e) => setFormMac(e.target.value)} placeholder="MAC Address (for WoL)" className="bg-gray-900/70 text-white placeholder-gray-400 px-4 py-3 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" className="btn-primary px-6 py-3 rounded-md">Save Changes</button>
          </form>
        </div>
      )}
    </>
  );
}
