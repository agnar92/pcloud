# pc_cloud (Bubble Tea + WebRTC with H264/HEVC/AV1)

## Build
```bash
go build ./cmd/server
go build ./cmd/tui
```

## Run
1. `./server`
2. `./tui` — Enter to start, ←/→ to change codec, Delete to end.

## Notes
- FFmpeg with NVENC required (`h264_nvenc`, `hevc_nvenc`, `av1_nvenc`).
- Chrome kiosk recommended; on Steam Deck use Flatpak Chrome with VAAPI flags.
