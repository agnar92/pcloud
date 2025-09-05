export default function Home({ onLaunch, onResume, canResume }) {
    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-4xl font-extrabold mb-10"></h1>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                <div className="rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 shadow p-4">
                    <div className="aspect-video bg-zinc-700/30 rounded-xl flex items-center justify-center text-5xl">🖥</div>
                    <h2 className="mt-4 text-lg font-semibold">Desktop</h2>
                    <div className="mt-2 flex gap-3">
                        <button onClick={() => onLaunch({ mode: "desktop" })} className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-xl font-medium w-full">Play</button>
                        <button className="px-4 py-2 rounded-xl border border-zinc-600">⚙</button>
                    </div>
                </div>


                {canResume && (
                    <div className="rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 shadow p-4">
                        <div className="aspect-video bg-zinc-700/30 rounded-xl flex items-center justify-center text-5xl">🎮</div>
                        <h2 className="mt-4 text-lg font-semibold">Resume Session</h2>
                        <div className="mt-2">
                            <button onClick={onResume} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-xl font-medium w-full">
                                ▶️ Resume
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}