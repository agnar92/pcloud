// import { useState } from "react";
import { useSettings } from "../context/SettingsContext";


export default function Settings() {
    const { settings, setSettings } = useSettings();

    const updateAudio = (key, value) =>
        setSettings((s) => ({ ...s, audio: { ...s.audio, [key]: value } }));

    const updateNetwork = (key, value) =>
        setSettings((s) => ({ ...s, network: { ...s.network, [key]: value } }));


    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold mb-6">Settings</h1>
            <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl bg-zinc-900/80 border border-zinc-700 p-6">
                    <h2 className="text-lg font-semibold mb-4">Video</h2>

                    <label className="block text-sm text-zinc-400 mb-1">Codec</label>
                    <select
                        value={settings.video.codec}
                        onChange={(e) =>
                            setSettings((s) => ({ ...s, video: { ...s.video, codec: e.target.value } }))
                        }
                        className="w-full p-2 bg-zinc-800 rounded"
                    >
                        <option value="av1">AV1</option>
                        <option value="h264">H.264</option>
                        <option value="hevc">HEVC</option>
                    </select>

                    <label className="block text-sm text-zinc-400 mt-3 mb-1">Resolution</label>
                    <input
                        type="text"
                        value={settings.video.res}
                        onChange={(e) =>
                            setSettings((s) => ({
                                ...s,
                                video: { ...s.video, res: e.target.value },
                            }))
                        }
                        placeholder="1920x1080"
                        className="w-full p-2 bg-zinc-800 text-white rounded z-50 border border-white"
                    />


                    <label className="block text-sm text-zinc-400 mt-3 mb-1">FPS</label>
                    <input
                        type="number"
                        value={settings.video.fps}
                        onChange={(e) =>
                            setSettings((s) => ({ ...s, video: { ...s.video, fps: Number(e.target.value) } }))
                        }
                        className="w-full p-2 bg-zinc-800 rounded"
                    />

                    <label className="block text-sm text-zinc-400 mt-3 mb-1">Bitrate (Mbps)</label>
                    <input
                        type="number"
                        value={settings.video.bitrate}
                        onChange={(e) =>
                            setSettings((s) => ({ ...s, video: { ...s.video, bitrate: Number(e.target.value) } }))
                        }
                        className="w-full p-2 bg-zinc-800 rounded"
                    />
                </div>


                <div className="space-y-6">
                    <div className="rounded-2xl bg-zinc-900/80 border border-zinc-700 p-6">
                        <h2 className="text-lg font-semibold mb-4">Audio</h2>
                        <label className="block text-sm text-zinc-400 mb-1">Codec</label>
                        <select
                            value={settings.audio.codec}
                            onChange={(e) => updateAudio("codec", e.target.value)}
                            className="w-full p-2 bg-zinc-800 rounded"
                        >
                            <option value="opus">Opus</option>
                            <option value="aac">AAC</option>
                        </select>


                        <label className="flex items-center gap-2 mt-3 text-sm text-zinc-400">
                            <input
                                type="checkbox"
                                checked={settings.audio.stereo}
                                onChange={(e) => updateAudio("stereo", e.target.checked)}
                            />
                            Stereo
                        </label>
                    </div>


                    <div className="rounded-2xl bg-zinc-900/80 border border-zinc-700 p-6">
                        <h2 className="text-lg font-semibold mb-4">Network</h2>
                        <label className="block text-sm text-zinc-400 mb-1">LAN QoS</label>
                        <select
                            value={settings.network.qos}
                            onChange={(e) => updateNetwork("qos", e.target.value)}
                            className="w-full p-2 bg-zinc-800 rounded"
                        >
                            <option value="low-latency">Low Latency</option>
                            <option value="balanced">Balanced</option>
                            <option value="quality">Quality</option>
                        </select>
                    </div>
                </div>
            </div>


            <div className="flex gap-4">
                <button className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500">Save</button>
                <button className="px-6 py-3 rounded-xl bg-zinc-800 border border-zinc-600">Apply</button>
            </div>
        </div>
    );
}