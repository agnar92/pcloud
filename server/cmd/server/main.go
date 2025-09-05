package main

import (
	"log"
	"net/http"
	"os"

	"pc_cloud/internal/server"
	"pc_cloud/internal/ui"
	"pc_cloud/internal/webrtcx"
)

var logFile *os.File

func main() {
	setupLogging()
	defer logFile.Close()

	go startHTTPServer()

	// Start tray
	ui.StartTray(ui.Callbacks{
		OnRestart: func() {
			log.Println("Restart triggered from tray")
			// Simple restart: exec new process and exit
			restartServer()
		},
		OnExit: func() {
			log.Println("Exiting server from tray")
		},
	})
}

func startHTTPServer() {
	mgr := webrtcx.New()
	srv := server.New(mgr)
	addr := ":8080"
	log.Printf("PCloud server listening on %s", addr)
	if err := http.ListenAndServe(addr, srv); err != nil {
		log.Fatal(err)
	}
}

func restartServer() {
	exe, err := os.Executable()
	if err != nil {
		log.Fatalf("Could not get executable path: %v", err)
	}
	if _, err := os.StartProcess(exe, os.Args, &os.ProcAttr{
		Files: []*os.File{os.Stdin, os.Stdout, os.Stderr},
	}); err != nil {
		log.Fatalf("Failed to restart: %v", err)
	}
	os.Exit(0)
}

func setupLogging() {
	var err error
	logFile, err = os.OpenFile("pcloud.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		panic("Failed to open log file: " + err.Error())
	}
	log.SetOutput(logFile)
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}
