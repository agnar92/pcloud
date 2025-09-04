// devices.go
package devices

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

var (
	reHdrAudio   = regexp.MustCompile(`(?i)DirectShow audio devices`)
	reHdrVideo   = regexp.MustCompile(`(?i)DirectShow video devices`)
	reName       = regexp.MustCompile(`^\s*"([^"]+)"\s*$`)
	reAlt        = regexp.MustCompile(`^\s*Alternative name\s+"([^"]+)"\s*$`)
	lastDevCache []DShowDevice
	lastDevTS    time.Time
)

type DShowDevice struct {
	Name string `json:"name"` // friendly name shown in FFmpeg, e.g. Microphone (Realtek...)
	Alt  string `json:"alt"`  // Alternative name, e.g. @device_pnp_...
}

func listDShowAudioDevices(ctx context.Context, ffmpegPath string) ([]DShowDevice, error) {
	// simple 2s cache to avoid spamming
	if time.Since(lastDevTS) < 2*time.Second && len(lastDevCache) > 0 {
		return lastDevCache, nil
	}

	if ffmpegPath == "" {
		ffmpegPath = "ffmpeg"
	}
	// FFmpeg prints device list to STDERR
	cmd := exec.CommandContext(ctx, ffmpegPath, "-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy")
	var stderr bytes.Buffer
	cmd.Stdout = &bytes.Buffer{} // discard
	cmd.Stderr = &stderr
	_ = cmd.Run() // non-zero exit is normal for this probe

	lines := strings.Split(stderr.String(), "\n")
	inAudio := false
	var out []DShowDevice
	var cur *DShowDevice

	for _, ln := range lines {
		l := strings.TrimRight(ln, "\r")
		if reHdrAudio.MatchString(l) {
			inAudio = true
			continue
		}
		if reHdrVideo.MatchString(l) {
			// audio section ended
			if cur != nil {
				out = append(out, *cur)
				cur = nil
			}
			inAudio = false
		}
		if !inAudio {
			continue
		}
		if m := reName.FindStringSubmatch(l); m != nil {
			// flush previous
			if cur != nil {
				out = append(out, *cur)
			}
			cur = &DShowDevice{Name: m[1]}
			continue
		}
		if m := reAlt.FindStringSubmatch(l); m != nil && cur != nil {
			cur.Alt = m[1]
			continue
		}
	}
	if cur != nil {
		out = append(out, *cur)
	}
	if len(out) == 0 {
		return nil, errors.New("no DirectShow audio devices found")
	}
	lastDevCache, lastDevTS = out, time.Now()
	return out, nil
}

func handleListAudioDevices(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	devs, err := listDShowAudioDevices(ctx, "") // "" -> use PATH ffmpeg
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(devs)
}
