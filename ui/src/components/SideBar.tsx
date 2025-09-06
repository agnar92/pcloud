import { AnimatePresence, motion } from "framer-motion";
import { useSettings } from "../context/SettingsContext";
import GamepadStatus from "./GamepadStatus";
import { ReactNode, ChangeEvent } from "react";

// From App.tsx
interface Server {
  name: string;
  address: string;
  mac: string;
}

interface Session {
  mode: string;
  server: Server;
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

const Toggle = ({ label, checked, onChange }: ToggleProps) => (
  <label className="flex items-center justify-between cursor-pointer p-2 hover:bg-gray-700/50 rounded-md">
    <span className="font-medium text-gray-200">{label}</span>
    <div className="relative">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <div className={`block w-12 h-6 rounded-full transition ${checked ? 'bg-blue-500' : 'bg-gray-600'}`}></div>
      <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'transform translate-x-6' : ''}`}></div>
    </div>
  </label>
);

interface ActionButtonProps {
  onClick: () => void;
  children: ReactNode;
  className: string;
}

const ActionButton = ({ onClick, children, className }: ActionButtonProps) => (
  <button
    onClick={onClick}
    className={`w-full px-4 py-2 rounded-md font-semibold text-white text-left transition-colors duration-200 ease-in-out ${className}`}>
    {children}
  </button>
);

interface SideBarProps {
  page: string;
  session: Session | null;
  onExit: () => void;
}

export default function SideBar({ page, session, onExit }: SideBarProps) {
  const { showSidebar, setShowSidebar, showStats, setShowStats } = useSettings();

  const handleExit = () => {
    onExit();
    setShowSidebar(false);
  };

  return (
    <AnimatePresence>
      {showSidebar && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSidebar(false)}
            className="fixed inset-0 bg-black/60 z-40"
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl z-50 flex flex-col"
          >
            <div className="p-4 flex-grow overflow-y-auto">
              <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
              
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-2">Display</h3>
                <Toggle
                  label="Show Statistics HUD"
                  checked={showStats}
                  onChange={(e) => setShowStats(e.target.checked)}
                />
              </div>

              {page === 'player' && (
                <div className="mt-6 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-2">Session Controls</h3>
                  <div className="p-2 text-sm text-gray-300">
                    Streaming from: <strong className="text-white">{session?.server?.name || "Local"}</strong>
                  </div>
                  <div className="p-2">
                    <GamepadStatus />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-700 space-y-2">
              {page === 'player' && (
                  <ActionButton onClick={handleExit} className="bg-red-600/80 hover:bg-red-600">
                    End Session
                  </ActionButton>
              )}
              <ActionButton onClick={() => setShowSidebar(false)} className="bg-gray-700 hover:bg-gray-600">
                Close
              </ActionButton>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}