import { createContext, useContext, useEffect, useState, ReactNode, Dispatch, SetStateAction } from "react";

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

type AppSettings = typeof defaultSettings;

type SettingsContextType = {
  showSidebar: boolean;
  setShowSidebar: (v: boolean) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children } : { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem("pcloud_settings");
      return saved ? JSON.parse(saved) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });
  const [showStats, setShowStats] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    localStorage.setItem("pcloud_settings", JSON.stringify(settings));
  }, [settings]);

  const value: SettingsContextType = { showSidebar, setShowSidebar, showStats, setShowStats, settings, setSettings };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within <SettingsProvider>');
  return ctx;
}