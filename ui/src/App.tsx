import { useState } from "react";
import Servers from "./pages/Servers";
import Settings from "./pages/Settings";
import Player from "./pages/Player";
import { endSession } from "./lib/webrtc.js";
import { AnimatePresence, motion } from "framer-motion";
import { SettingsProvider } from "./context/SettingsContext";
import { NotificationProvider } from "./context/NotificationContext";
import SideBar from "./components/SideBar";
import Nav from "./components/Nav";

interface Server {
  name: string;
  address: string;
  mac: string;
}


interface Session {
  mode: string;
  server: Server;
}



function AppContent() {
  const [page, setPage] = useState<string>("servers");
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const startSession = async (config: Session) => {
    setLoading(true);
    await new Promise((res) => setTimeout(res, 1000));
    setSession(config);
    setLoading(false);
    setPage("player");
  };

  const end = () => {
    setSession(null);
    setPage("servers"); // Go back to servers list
    endSession("http://localhost:8080");
  };

  const renderPage = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full text-xl animate-pulse text-gray-300">
          Connecting to session...
        </div>
      );
    }

    if (page === "servers") return <Servers onConnect={(srv: Server) => startSession({ mode: "desktop", server: srv })} />;
    if (page === "settings") return <Settings />;
    if (page === "player") return <Player session={session as Session} onExit={end} />;

    return null;
  };

  return (
    <div className="w-screen h-screen text-white overflow-hidden">
      <SideBar page={page} onExit={end} session={session as Session} />
      {page !== "player" && <Nav page={page} setPage={setPage} />}
      <main className="w-full h-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </SettingsProvider>
  );
}
