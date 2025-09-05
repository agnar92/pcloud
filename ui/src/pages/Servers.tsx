import { useEffect, useState } from "react";

export default function Servers({ onConnect }) {
  const [servers, setServers] = useState([]);

  const discover = async () => {
    try {
      const found = await window.electron.ipcRenderer.invoke("discover-servers");
      setServers(found);
    } catch (err) {
      console.error("Discovery failed:", err);
    }
  };

  useEffect(() => {
    discover();
    const interval = setInterval(discover, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">LAN Servers</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {servers.map((srv) => (
          <div key={srv.id} className="rounded-2xl bg-zinc-900/80 border border-zinc-700 shadow p-6 text-center">
            <h2 className="text-lg font-semibold mb-2">{srv.name}</h2>
            <div className="mb-4 text-sm text-zinc-400">IP: {srv.address}</div>
            <div className="mb-4 text-sm text-zinc-400">Status: {srv.status}</div>

            {srv.status === "online" && (
              <button
                onClick={() => onConnect(srv)}
                className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-xl"
              >
                Connect
              </button>
            )}

            {srv.status === "sleeping" && (
              <button className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl">Wake</button>
            )}

            {srv.status === "offline" && (
              <button disabled className="bg-zinc-700 px-4 py-2 rounded-xl text-zinc-400">Offline</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
