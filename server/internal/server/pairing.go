// Package: ten sam co Server (np. package server)
package server

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

type pairFile struct {
	Ver      string `json:"ver"`
	DeviceID string `json:"device_id"`
	Pub      string `json:"pub"`            // base64
	FP       string `json:"fp"`             // = DeviceID (fingerprint pubkey)
	Broker   string `json:"broker"`         // np. wss://broker.example.com/ws
	Name     string `json:"name,omitempty"` // friendly
	Mac      string `json:"mac,omitempty"`  // opcjonalnie do WoL w LAN
	Port     int    `json:"port,omitempty"` // domyślny port healthz (np. 8080)
	LanToken string `json:"lan_token,omitempty"`
}

type identity struct {
	DeviceID   string `json:"device_id"`
	PublicKey  string `json:"pub"`  // base64
	PrivateKey string `json:"priv"` // base64 (zostaje TYLKO lokalnie)
	LanToken   string `json:"lan_token,omitempty"`
}

func idPath() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("ProgramData"), "PCloud", "identity.json")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "pcloud", "identity.json")
}

func ensureDir(p string) error { return os.MkdirAll(filepath.Dir(p), 0o755) }

func loadOrCreateIdentity() (*identity, error) {
	p := idPath()
	if b, err := os.ReadFile(p); err == nil {
		var id identity
		if json.Unmarshal(b, &id) == nil && id.DeviceID != "" && id.PublicKey != "" {
			return &id, nil
		}
	}
	// generate new
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	fpBytes := sha256.Sum256(pub)
	fp := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(fpBytes[:]))
	id := &identity{
		DeviceID:   fp,
		PublicKey:  base64.StdEncoding.EncodeToString(pub),
		PrivateKey: base64.StdEncoding.EncodeToString(priv),
		LanToken:   randomToken(), // 16B -> base64url
	}
	if err := ensureDir(p); err != nil {
		return nil, err
	}
	b, _ := json.MarshalIndent(id, "", "  ")
	if err := os.WriteFile(p, b, 0o600); err != nil {
		return nil, err
	}
	return id, nil
}

func primaryMAC() string {
	ifs, _ := net.Interfaces()
	for _, in := range ifs {
		if in.Flags&net.FlagUp == 0 || in.Flags&net.FlagLoopback != 0 || len(in.HardwareAddr) == 0 {
			continue
		}
		return formatMAC(in.HardwareAddr)
	}
	return ""
}
func formatMAC(hw net.HardwareAddr) string {
	out := make([]string, len(hw))
	for i, b := range hw {
		out[i] = fmt.Sprintf("%02X", b)
	}
	return strings.Join(out, ":")
}

// RegisterPairingExportRoute dodaje endpoint, który generuje .pcloud-pair.
// brokerDefault można podać na stałe lub zostawić pusty i ustawić przez query/env.
func (s *Server) RegisterPairingExportRoute(brokerDefault string, defaultPort int) {
	s.mux.HandleFunc("/api/pairing/export", func(w http.ResponseWriter, r *http.Request) {
		id, err := loadOrCreateIdentity()
		if err != nil {
			http.Error(w, "identity: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// źródła: ?broker=... -> env PCLOUD_BROKER -> brokerDefault
		broker := r.URL.Query().Get("broker")
		if broker == "" {
			if env := os.Getenv("PCLOUD_BROKER"); env != "" {
				broker = env
			}
		}
		if broker == "" {
			broker = brokerDefault
		}

		// friendly name: ?name=... (opcjonalnie)
		name := r.URL.Query().Get("name")
		if name == "" {
			if hn, err := os.Hostname(); err == nil {
				name = hn
			}
		}

		// port: ?port=... lub default
		port := defaultPort
		if sp := r.URL.Query().Get("port"); sp != "" {
			if v, err := strconv.Atoi(sp); err == nil && v > 0 && v < 65536 {
				port = v
			}
		}

		pf := pairFile{
			Ver:      "1",
			DeviceID: id.DeviceID,
			Pub:      id.PublicKey,
			FP:       id.DeviceID,
			Broker:   broker,
			Name:     name,
			Mac:      primaryMAC(),
			Port:     port,
			LanToken: id.LanToken,
		}
		b, _ := json.MarshalIndent(pf, "", "  ")
		filename := fmt.Sprintf("pcloud-%s.pcloud-pair", id.DeviceID[:8])

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
		_, _ = w.Write(b)
	})
}

func randomToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
