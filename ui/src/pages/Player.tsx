import { useEffect, useRef, useState } from "react";
import StreamPlayer from "../components/StreamPlayer";
import StatsOverlay from "../components/StatsOverlay";
import { setVideoElement, startSession } from "../lib/webrtc";
import { useSettings } from "../context/SettingsContext";
import useGamepad from "../hooks/useGamepad";
import GamepadStatus from "../components/GamepadStatus";

export default function Player({ session, onExit }) {
  const { settings } = useSettings();
  const [showSidebar, setShowSidebar] = useState(false);
  const escTimer = useRef(null);
  const [holding, setHolding] = useState(false);
  const [holdTime, setHoldTime] = useState(0);
  const videoRef = useRef(null);
  const [started, setStarted] = useState(false);

  useGamepad(session?.server?.address, true);

  useEffect(() => {
    if (!session || started) return;

    setVideoElement(videoRef.current);

    const [width, height] = settings.video.res.split("x").map(Number);
    const config = {
      codec: settings.video.codec,
      fps: settings.video.fps,
      width,
      height,
      bitrate: `${settings.video.bitrate}M`,
      preset: "p1",
      audio: true,
    };

    const server = session.server?.address || "http://localhost:8080";

    const start = async () => {
      try {
        console.log("▶️ Starting session...");
        await startSession(server, config, console.log);
        console.log("✅ Stream started");
        setStarted(true); // ✅ prevent re-run
      } catch (err) {
        console.error("❌ Failed to start session", err);
      }
    };

    start();
  }, [session, started, settings]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !escTimer.current) {
        let held = 0;
        setHolding(true);
        escTimer.current = setInterval(() => {
          held += 100;
          setHoldTime(held);
          if (held >= 3000) {
            clearInterval(escTimer.current);
            escTimer.current = null;
            setHolding(false);
            setShowSidebar(true);
          }
        }, 100);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === "Escape") {
        setHolding(false);
        setHoldTime(0);
        clearInterval(escTimer.current);
        escTimer.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <div className="w-screen h-screen relative bg-black overflow-hidden">
      <StreamPlayer />
      <StatsOverlay />

      {holding && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-900/70 border border-zinc-600 rounded-xl text-sm">
          Hold ESC to unlock settings ({Math.floor(holdTime / 1000)}s / 3s)
        </div>
      )}

      {showSidebar && (
        <div className="absolute top-0 right-0 w-80 h-full bg-zinc-900/95 border-l border-zinc-700 p-6">
          <h2 className="text-xl font-bold mb-6">Session Options</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Streaming from: <strong>{session?.server?.name || "Local"}</strong>
          </p>

          <div className="sidebar-panel">
            <GamepadStatus />
          </div>

          <button
            onClick={() => setShowSidebar(false)}
            className="bg-zinc-700 hover:bg-zinc-600 px-4 py-2 w-full rounded text-left mb-4"
          >
            Hide Sidebar
          </button>
          <button
            onClick={onExit}
            className="bg-red-600 hover:bg-red-500 px-4 py-2 w-full rounded text-left"
          >
            End Session
          </button>
        </div>
      )}
    </div>
  );
}