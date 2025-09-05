import { useEffect, useRef } from "react";
import { GamepadStreamer } from "../lib/gamepad"; // <- adjust if needed

export default function useGamepad(serverUrl, enabled = true) {
  const streamerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !serverUrl) return;

    const streamer = new GamepadStreamer({
      hz: 120,
      wsPath: "/input", // your Go server's WebSocket path
      onStatus: (s) => console.log("🎮 Gamepad:", s),
      onError: (e) => console.error("❌ Gamepad:", e),
      onLog: (data) => console.log("📤 Pad data:", data),
    });

    streamer.setTargetFromURL(serverUrl);
    streamer.setPadIndex(0);
    streamer.recalibrate();
    streamer.start();
    streamerRef.current = streamer;

    return () => {
      streamer.stop();
    };
  }, [serverUrl, enabled]);
}
