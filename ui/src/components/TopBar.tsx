export default function TopBar({ page, setPage, canResume, onResume }) {
    const NavBtn = ({ id, label }) => (
        <button
            onClick={() => setPage(id)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${page === id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
                }`}
        >
            {label}
        </button>
    );


    return (
        <header className="h-16 px-6 flex items-center justify-between bg-zinc-950 border-b border-zinc-800">
            <div className="text-xl font-bold text-cyan-400">PCloud Console</div>
            <div className="flex gap-3">
                <NavBtn id="home" label="Home" />
                <NavBtn id="servers" label="Servers" />
                <NavBtn id="settings" label="Settings" />
                <button
                    onClick={onResume}
                    disabled={!canResume}
                    className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40"
                >
                    Resume
                </button>
            </div>
        </header>
    );
}