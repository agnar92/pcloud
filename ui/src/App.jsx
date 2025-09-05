import { useState } from "react";
import TopBar from "./components/TopBar";
import Home from "./pages/Home";
import Servers from "./pages/Servers";
import Settings from "./pages/Settings";
import Player from "./pages/Player";
import { endSession } from "./lib/webrtc";
import { AnimatePresence, motion } from "framer-motion";
import { SettingsProvider } from "./context/SettingsContext";

export default function App() {
  const [page, setPage] = useState("home");
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);

  const startSession = async (config) => {
    setLoading(true);
    await new Promise((res) => setTimeout(res, 1000));
    setSession(config);
    setLoading(false);
    setPage("player");
  };

  const end = () => {
    setSession(null);
    setPage("home");
    endSession("http://localhost:8080");

  };

  const resumeSession = async () => {
    if (session) {
      setLoading(true);
      await new Promise((res) => setTimeout(res, 1000));
      setLoading(false);
      setPage("player");
    }
  };

  const renderPage = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full text-xl animate-pulse">
          Connecting to session...
        </div>
      );
    }

    if (page === "home") return <Home onLaunch={startSession} onResume={resumeSession} canResume={!!session} />;
    if (page === "servers") return <Servers onConnect={(srv) => startSession({ mode: "desktop", server: srv })} />;
    if (page === "settings") return <Settings />;
    if (page === "player") return <Player session={session} onExit={end} />;

    return null;
  };

  return (
    <SettingsProvider>
      <div className="w-screen h-screen bg-black text-white">
        {page !== "player" && (
          <TopBar
            page={page}
            setPage={setPage}
            canResume={!!session}
            onResume={resumeSession}
          />
        )}
        <main className="h-[calc(100%-4rem)] p-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={page + (loading ? "-loading" : "")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </SettingsProvider>
  );
}