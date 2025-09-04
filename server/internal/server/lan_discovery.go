//go:build windows || linux || darwin

package server

import (
	"encoding/json"
	"fmt"
	"net"
	"time"
)

const lanPort = 35853 // UDP

type lanMsg struct {
	T    string `json:"t"`    // "disc" | "ann"
	V    int    `json:"v"`    // 1
	Dev  string `json:"dev"`  // device_id
	Port int    `json:"port"` // http/healthz port hosta
	Tok  string `json:"tok"`  // lan_token
}

// StartLANDiscoveryResponder: nasłuchuje DISC i odpowiada ANN (unicast).
// Wywołaj raz przy starcie serwera, po wczytaniu identity.
func StartLANDiscoveryResponder(deviceID, lanToken string, httpPort int) error {
	addr, err := net.ResolveUDPAddr("udp4", fmt.Sprintf(":%d", lanPort))
	if err != nil {
		return err
	}
	conn, err := net.ListenUDP("udp4", addr)
	if err != nil {
		return err
	}

	// krótkie ogłoszenie po starcie (3x broadcast)
	go func() {
		defer conn.Close()
		ann := lanMsg{T: "ann", V: 1, Dev: deviceID, Port: httpPort, Tok: lanToken}
		b, _ := json.Marshal(ann)
		bcast := &net.UDPAddr{IP: net.IPv4bcast, Port: lanPort}
		for i := 0; i < 3; i++ {
			_, _ = conn.WriteToUDP(b, bcast)
			time.Sleep(400 * time.Millisecond)
		}
		buf := make([]byte, 2048)
		for {
			n, raddr, err := conn.ReadFromUDP(buf)
			if err != nil {
				return
			}
			var m lanMsg
			if json.Unmarshal(buf[:n], &m) != nil {
				continue
			}
			if m.T == "disc" && m.V == 1 && m.Dev == deviceID && (lanToken == "" || m.Tok == lanToken) {
				// unicast ANN do pytającego
				_, _ = conn.WriteToUDP(b, raddr)
			}
		}
	}()

	return nil
}
