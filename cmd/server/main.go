package main

import (
	"log"
	"net/http"

	"pc_cloud/internal/server"
	"pc_cloud/internal/webrtcx"
)

func main() {
	mgr := webrtcx.New()
	srv := server.New(mgr)
	addr := ":8080"
	log.Printf("pc_cloud server listening on %s", addr)
	if err := http.ListenAndServe(addr, srv); err != nil {
		log.Fatal(err)
	}

}
