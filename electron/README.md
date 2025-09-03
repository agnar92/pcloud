# Kiosk (Electron)

Refactor of your PWA kiosk app into an Electron desktop application with kiosk/fullscreen support.

## Quick start

```bash
npm i
npm run dev       # runs Electron with dev tools enabled
# or
npm start         # runs normally
```

### Useful flags
- `--kiosk`      Start in Chromium kiosk mode (esc disabled, no window frame).
- `--fullscreen` Start in fullscreen windowed mode.

### Dev helpers
- `F12` or `Ctrl/Cmd+Shift+I` toggle DevTools
- `Ctrl/Cmd+R` reloads renderer
- `F11` toggles fullscreen

## Structure
- `src/main`     Electron main process (`main.js`, `preload.js`)
- `src/renderer` Your former PWA assets (HTML/CSS/JS). Service worker and manifest are ignored in Electron.

## Notes

- PWA-only features (service worker, web manifest) are stubbed so the renderer doesn't crash.
- External links open in your default browser.
- For security, navigation is limited to `file://` origin by default. If your app must request remote APIs, use `fetch`/`WebRTC` from the renderer; those are allowed by `connect-src` in CSP.
- Replace any browser-only APIs with `window.electronAPI.*` calls where you need native capabilities.
