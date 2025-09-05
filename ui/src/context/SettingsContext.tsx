import { createContext, useContext, useEffect, useState } from "react";

const defaultSettings = {
  video: {
    codec: "av1",
    res: "1920x1080",
    fps: 60,
    bitrate: 25,
  },
  audio: {
    codec: "opus",
    stereo: true,
  },
  network: {
    qos: "low-latency",
  },
};

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("pcloud_settings");
      return saved ? JSON.parse(saved) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    localStorage.setItem("pcloud_settings", JSON.stringify(settings));
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}