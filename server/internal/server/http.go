package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"time"

	"pc_cloud/internal/webrtcx"
	// "pc_cloud/internal/devices"
	"github.com/gorilla/websocket"
)

// TODO: add devices, something wrong with imports?

type Server struct {
	mux *http.ServeMux
	mgr *webrtcx.Manager
}

type PadButton struct {
	I       int     `json:"i"`
	Pressed bool    `json:"pressed"`
	Val     float64 `json:"val"`
}
type PadMsg struct {
	Type    string      `json:"type"` // "pad"
	ID      string      `json:"id"`
	Index   int         `json:"index"`
	TS      float64     `json:"ts"`
	Axes    []float64   `json:"axes"`
	Buttons []PadButton `json:"buttons"`
}

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func InputWS(w http.ResponseWriter, r *http.Request) {
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	defer c.Close()
	for {
		_, data, err := c.ReadMessage()
		if err != nil {
			return
		}
		var msg PadMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		if msg.Type == "pad" {
			// TODO: mapuj do akcji lub wstrzykuj do OS (ViGEm/uinput)
			log.Printf("pad[%d] axes=%v buttons=%d", msg.Index, shortAxes(msg.Axes), len(msg.Buttons))
		}
	}
}

func shortAxes(a []float64) []float64 {
	if len(a) > 4 {
		return a[:4]
	}
	return a
}

func handleSuspend(w http.ResponseWriter, r *http.Request) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0")
	case "linux":
		cmd = exec.Command("systemctl", "suspend")
	case "darwin":
		cmd = exec.Command("pmset", "sleepnow")
	default:
		http.Error(w, "Unsupported operating system for suspend", http.StatusNotImplemented)
		return
	}

	log.Println("Executing suspend command for", runtime.GOOS)
	err := cmd.Run()
	if err != nil {
		log.Printf("Failed to suspend system: %v", err)
		http.Error(w, "Failed to suspend system", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "System is going to sleep.")
}

func New(mgr *webrtcx.Manager) *Server {
	s := &Server{
		mux: http.NewServeMux(),
		mgr: mgr,
	}
	// id, _ := loadOrCreateIdentity()
	StartLANDiscoveryResponder()
	// s.RegisterPairingExportRoute("wss://broker.example.com/ws", 8080)
	s.routes()
	return s
}

func (s *Server) routes() {
	// --- Discovery / health ---
	s.mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":      true,
			"name":    "pc_cloud",
			"version": "kiosk-1",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	// --- API ---
	s.mux.HandleFunc("/api/session/offer", s.mgr.HandleOffer)
	// s.mux.HandleFunc("/api/devices/audio", devices.handleListAudioDevices)
	s.mux.HandleFunc("/api/session/end", s.mgr.End)
	s.mux.HandleFunc("/api/system/suspend", handleSuspend)

	// --- WebSocket endpoints ---
	// input (gamepad, keyboard, mouse) -> webrtc
	s.mux.HandleFunc("/input", InputWS)

	// // --- PWA: redirect helpers ---
	// // / -> /kiosk/
	s.mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			// let other handlers match (like /kiosk/...)
			http.NotFound(w, r)
			return
		}
	})

}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Global CORS (dla kiosku odpalonego z innego hosta/portu)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS,HEAD")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Accept,Authorization")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mux.ServeHTTP(w, r)
}
