import { HomeIcon, Cog6ToothIcon } from './Icons'; // Assuming you'll create an Icons component
import { ReactNode, Dispatch, SetStateAction } from 'react';

interface NavProps {
  page: string;
  setPage: Dispatch<SetStateAction<string>>;
}

interface NavBtnProps {
  id: string;
  label: string;
  icon: ReactNode;
}

export default function Nav({ page, setPage }: NavProps) {
  const NavBtn = ({ id, label, icon }: NavBtnProps) => (
    <button
      onClick={() => setPage(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 ${page === id
          ? "bg-gray-800 text-white"
          : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
        }`}>
      {icon}
      <span>{label}</span>
    </button>
  );

  const handleExit = async () => {
    await window.ipcRenderer.invoke('app-exit');
  };

  return (
    <nav className="absolute top-0 left-0 right-0 z-10 p-4 flex justify-center">
      <div className="flex items-center gap-4 p-2 rounded-lg bg-gray-950/50 backdrop-blur-md border border-gray-800">
        <NavBtn id="servers" label="Connect" icon={<HomeIcon />} />
        <NavBtn id="settings" label="Settings" icon={<Cog6ToothIcon />} />
        <button
          onClick={handleExit}
          className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
        >
          Exit
        </button>
      </div>
    </nav>
  );
}