import { useEffect, useRef, useState } from "react";

export default function GamepadStatus() {
  const [connected, setConnected] = useState(false);
  const [buttons, setButtons] = useState<boolean[]>([]);
  const [axes, setAxes] = useState<number[]>([]);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    function pollGamepad() {
      const gamepads = navigator.getGamepads();
      const pad = gamepads[0];

      if (pad && pad.connected) {
        setConnected(true);
        setButtons(pad.buttons.map((btn) => btn.pressed));
        setAxes([...pad.axes]);
      } else {
        setConnected(false);
        setButtons([]);
        setAxes([]);
      }

      raf.current = requestAnimationFrame(pollGamepad);
    }

    pollGamepad();
    return () => {
      if (raf.current) {
        cancelAnimationFrame(raf.current);
      }
    };
  }, []);

  return (
    <div className="bg-zinc-900/80 border border-zinc-700 rounded-xl p-4 text-sm text-white space-y-2">
      <div>
        Status Gamepad:{" "}
        <span className={connected ? "text-green-400" : "text-red-500"}>
          {connected ? "🟢 Connected" : "🔴 Not connected"}
        </span>
      </div>

      {connected && (
        <>
          <div>
            <strong>Buttons:</strong>{" "}
            {buttons.map((pressed, i) =>
              pressed ? (
                <span key={i} className="px-1 text-cyan-300">
                  B{i}
                </span>
              ) : null
            )}
          </div>
          <div>
            <strong>Axes:</strong>{" "}
            {axes.map((a, i) => (
              <span key={i} className="px-1 text-orange-300">
                A{i}: {a.toFixed(2)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}