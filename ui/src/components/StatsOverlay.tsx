import { useEffect, useState } from "react";
import { onStats } from "../lib/webrtc";

export default function StatsOverlay() {
  const [stats, setStats] = useState("");

  useEffect(() => {
    onStats(setStats);
  }, []);

  return (
    <div className="absolute bottom-4 left-4 z-50">
      <div className="bg-black/75 text-lime-300 text-sm px-4 py-2 rounded shadow font-mono whitespace-pre-wrap">
        {stats || "Waiting for stats..."}
      </div>
    </div>
  );
}
