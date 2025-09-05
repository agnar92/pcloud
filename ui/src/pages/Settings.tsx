import { useState } from "react";
import { useSettings } from "../context/SettingsContext";

// Reusable component for a single setting item
const SettingItem = ({ label, children }) => (
  <div className="py-4 flex justify-between items-center border-b border-gray-700">
    <label className="text-lg text-gray-300">{label}</label>
    <div className="w-1/2">{children}</div>
  </div>
);

// Reusable styled <select> element with custom arrow and better contrast
const StyledSelect = ({ children, ...props }) => (
  <div className="relative">
    <select
      {...props}
      className="w-full pr-10 pl-3 py-3 appearance-none bg-gray-900/70 text-gray-100 rounded-md border border-gray-700 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      {children}
    </select>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.127l3.71-3.897a.75.75 0 111.08 1.04l-4.24 4.46a.75.75 0 01-1.08 0l-4.24-4.46a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  </div>
);

// Reusable styled <input> element
const StyledInput = (props) => (
  <input {...props} className="w-full p-3 bg-gray-900/70 text-gray-100 rounded-md border border-gray-700 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400" />
);

export default function Settings() {
  const { settings, setSettings } = useSettings();
  const [activeCategory, setActiveCategory] = useState('video');

  const updateVideo = (key, value) => setSettings(s => ({ ...s, video: { ...s.video, [key]: value } }));
  const updateAudio = (key, value) => setSettings(s => ({ ...s, audio: { ...s.audio, [key]: value } }));
  const updateNetwork = (key, value) => setSettings(s => ({ ...s, network: { ...s.network, [key]: value } }));

  const categories = ['Video', 'Audio', 'Network'];

  return (
    <div className="w-screen h-screen p-6 md:p-12 flex gap-8 md:gap-16 text-gray-200 box-border">
      {/* Left-hand navigation for setting categories */}
      <div className="w-1/4 max-w-xs">
        <h1 className="text-4xl font-bold text-white mb-6">Settings</h1>
        <ul className="space-y-2">
          {categories.map(cat => (
            <li key={cat}>
              <button
                onClick={() => setActiveCategory(cat.toLowerCase())}
                className={`w-full text-left text-lg p-3 rounded-md transition-colors ${activeCategory === cat.toLowerCase() ? 'glass text-white font-semibold' : 'text-gray-300 hover:bg-gray-800/50'}`}>
                {cat}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Right-hand panel for the active category's settings */}
      <div className="w-3/4 flex-grow glass rounded-2xl p-6 md:p-8">
        {activeCategory === 'video' && (
          <div>
            <h2 className="text-3xl font-bold text-white mb-6">Video Settings</h2>
            <SettingItem label="Codec">
              <StyledSelect value={settings.video.codec} onChange={(e) => updateVideo("codec", e.target.value)}>
                <option value="av1">AV1</option>
                <option value="h264">H.264</option>
                <option value="hevc">HEVC (H.265)</option>
              </StyledSelect>
            </SettingItem>
            <SettingItem label="Resolution">
              <StyledInput type="text" value={settings.video.res} onChange={(e) => updateVideo("res", e.target.value)} placeholder="1920x1080" />
            </SettingItem>
            <SettingItem label="FPS">
              <StyledInput type="number" value={settings.video.fps} onChange={(e) => updateVideo("fps", Number(e.target.value))} />
            </SettingItem>
            <SettingItem label="Bitrate (Mbps)">
              <StyledInput type="number" value={settings.video.bitrate} onChange={(e) => updateVideo("bitrate", Number(e.target.value))} />
            </SettingItem>
          </div>
        )}

        {activeCategory === 'audio' && (
          <div>
            <h2 className="text-3xl font-bold text-white mb-6">Audio Settings</h2>
            <SettingItem label="Codec">
              <StyledSelect value={settings.audio.codec} onChange={(e) => updateAudio("codec", e.target.value)}>
                <option value="opus">Opus</option>
                <option value="aac">AAC</option>
              </StyledSelect>
            </SettingItem>
            {/* A proper toggle switch would be better here, but this is functional */}
            <SettingItem label="Stereo Audio">
                 <input type="checkbox" checked={settings.audio.stereo} onChange={(e) => updateAudio("stereo", e.target.checked)} className="w-6 h-6" />
            </SettingItem>
          </div>
        )}

        {activeCategory === 'network' && (
          <div>
            <h2 className="text-3xl font-bold text-white mb-6">Network Settings</h2>
            <SettingItem label="LAN QoS Profile">
              <StyledSelect value={settings.network.qos} onChange={(e) => updateNetwork("qos", e.target.value)}>
                <option value="low-latency">Low Latency</option>
                <option value="balanced">Balanced</option>
                <option value="quality">Quality</option>
              </StyledSelect>
            </SettingItem>
          </div>
        )}
      </div>
    </div>
  );
}
