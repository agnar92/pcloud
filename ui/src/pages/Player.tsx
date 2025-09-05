import { useEffect, useRef, useState } from "react";
import StreamPlayer from "../components/StreamPlayer";
import StatsOverlay from "../components/StatsOverlay";
import { setVideoElement, startSession } from "../lib/webrtc";
import { useSettings } from "../context/SettingsContext";
import useGamepad from "../hooks/useGamepad";

export default function Player({ session, onExit }) {
  const { settings, showStats, setShowSidebar } = useSettings();
  const videoRef = useRef(null);
  const [started, setStarted] = useState(false);

  // --- Hold Escape Logic ---
  const escTimer = useRef(null);
  const [holding, setHolding] = useState(false);
  const [holdTime, setHoldTime] = useState(0);

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

    const server = session.server?.address ? `http://${session.server.address}:8080` : "http://localhost:8080";

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
            setShowSidebar(true); // Open the global sidebar
          }
        }, 100);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === "Escape") {
        setHolding(false);
        setHoldTime(0);
        if (escTimer.current) {
          clearInterval(escTimer.current);
          escTimer.current = null;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (escTimer.current) {
        clearInterval(escTimer.current);
      }
    };
  }, [setShowSidebar]);

  return (
    <div className="w-screen h-screen relative bg-black overflow-hidden">
      <StreamPlayer />
      {showStats && <StatsOverlay />}

      {holding && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-900/70 border border-zinc-600 rounded-xl text-sm animate-pulse">
          Hold ESC to open settings... ({Math.ceil(holdTime / 1000)}s)
        </div>
      )}
    </div>
  );
}
