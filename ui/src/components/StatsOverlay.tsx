import { useEffect, useState } from "react";
import { onStats } from "../lib/webrtc";

// A single stat item component for consistent styling
const StatItem = ({ label, value, unit }) => (
  <div className="flex justify-between items-baseline">
    <span className="text-gray-400">{label}</span>
    <span className="font-semibold text-gray-200">
      {value} <span className="text-xs text-gray-400">{unit}</span>
    </span>
  </div>
);

export default function StatsOverlay() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    // The onStats callback from webrtc.js will be called with the stats string.
    // We parse it here into a key-value object for easier rendering.
    onStats((statsString) => {
      const statsObject = {};
      statsString.split('|').forEach(part => {
        const [key, value] = part.trim().split(':');
        if (key && value) {
          const [val, unit] = value.trim().split(' ');
          statsObject[key.trim()] = { value: val, unit: unit || '' };
        }
      });
      setStats(statsObject);
    });
  }, []);

  const statItems = [
    { key: 'fps', label: 'FPS' },
    { key: 'br', label: 'Bitrate', unit: 'Mbps' },
    { key: 'jitter', label: 'Jitter', unit: 'ms' },
    { key: 'loss', label: 'Packet Loss', unit: '%' },
    { key: 'dropped', label: 'Frames Dropped' },
  ];

  return (
    <div className="absolute top-4 left-4 z-50 font-mono text-sm">
      <div className="bg-gray-950/80 backdrop-blur-sm text-white p-3 rounded-lg border border-gray-700 shadow-2xl min-w-[200px]">
        <div className="space-y-1">
          {statItems.map(({ key, label, unit: defaultUnit }) => (
            <StatItem
              key={key}
              label={label}
              value={stats[key]?.value || '-'}
              unit={stats[key]?.unit || defaultUnit || ''}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
