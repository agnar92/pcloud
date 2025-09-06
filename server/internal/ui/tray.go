// internal/ui/tray.go
package ui

import (
	_ "embed"
	"os/exec"
	"runtime"

	"github.com/getlantern/systray"
)

//go:embed pcloud.ico
var iconData []byte

type Callbacks struct {
	OnRestart func()
	OnExit    func()
}

func StartTray(cb Callbacks) {
	systray.Run(func() {
		onReady(cb)
	}, func() {
		cb.OnExit()
	})
}

func onReady(cb Callbacks) {
	systray.SetTitle("PCloud")
	systray.SetTooltip("PCloud Server")
	systray.SetIcon(iconData)

	// Set your tray icon (optional)
	// systray.SetIcon(yourIconBytes)

	openUI := systray.AddMenuItem("Open UI", "Open Settings Page")
	showLogs := systray.AddMenuItem("Show Logs", "Open log file")
	systray.AddSeparator()
	restart := systray.AddMenuItem("Restart", "Restart the server")
	exit := systray.AddMenuItem("Exit", "Exit the application")

	go func() {
		for {
			select {
			case <-openUI.ClickedCh:
				openBrowser("http://localhost:8080/settings")
			case <-showLogs.ClickedCh:
				openLogFile("pcloud.log")
			case <-restart.ClickedCh:
				cb.OnRestart()
			case <-exit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func openLogFile(path string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("notepad.exe", path)
	case "darwin":
		cmd = exec.Command("open", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	_ = cmd.Start()
}
