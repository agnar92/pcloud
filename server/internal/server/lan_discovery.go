package server

import (
	"encoding/json"
	"log"
	"net"
	"strings"
)

const lanPort = ":9876:"

func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return ""
}

func StartLANDiscoveryResponder() {
	addr, err := net.ResolveUDPAddr("udp", lanPort)
	if err != nil {
		log.Println("LAN discovery resolve error:", err)
		return
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		log.Println("LAN discovery listen error:", err)
		return
	}

	go func() {
		defer conn.Close()
		buf := make([]byte, 1024)

		for {
			n, remoteAddr, err := conn.ReadFromUDP(buf)
			if err != nil {
				continue
			}

			msg := strings.TrimSpace(string(buf[:n]))
			if msg == "DISCOVER_PCCLOUD" {
				resp := map[string]interface{}{
					"id":      "steam-pc",
					"name":    "Gaming PC",
					"status":  "online",
					"address": getLocalIP(), // your function
				}

				jsonData, _ := json.Marshal(resp)
				conn.WriteToUDP(jsonData, remoteAddr)
			}
		}
	}()
}
