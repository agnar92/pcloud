package encoder

import (
	"context"
	_ "embed"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

//go:embed ffmpeg.exe
var winFFmpeg []byte

var (
	extractedOnce sync.Once
	extractedPath string
	extractErr    error
)

type Params struct {
	Codec       string // h264|hevc|av1
	FPS         int
	Width       int    // 0 = native
	Height      int    // 0 = native
	Preset      string // NVENC p1..p7 (e.g. "p3","p4")
	Bitrate     string // e.g. "25M"
	WithAudio   bool
	AudioPort   int    // RTP port for Opus (0 = off)
	Display     string // ":0.0" on Linux (Wayland via PipeWire later)
	AudioDevice string // Windows dshow device; or env AUDIO_DEVICE
	Capture     string // "ddagrab"|"gdigrab" (Windows), "" => auto ddagrab
}

// BuildFFmpegPipeCmd builds a single FFmpeg process that writes
// the *video elementary stream* to stdout (h264|hevc|ivf) and,
// optionally, sends Opus to RTP (AudioPort > 0).
//
// Video stdout formats:
//   - h264 -> Annex-B byte stream: "-f h264 -"
//   - hevc -> Annex-B byte stream: "-f hevc -"
//   - av1  -> IVF container:       "-f ivf -"
// ...imports & type Params unchanged...

func extract() (string, error) {
	extractedOnce.Do(func() {
		name := "ffmpeg"
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		f, err := os.CreateTemp("", "ffmpeg-*.exe")
		if err != nil {
			extractErr = err
			return
		}
		extractedPath = f.Name()
		// pick bytes per OS (here only Windows embedded)
		var data []byte
		switch runtime.GOOS {
		case "windows":
			data = winFFmpeg
		default:
			extractErr = io.ErrUnexpectedEOF // no embed for this OS
			_ = f.Close()
			return
		}
		if _, err := f.Write(data); err != nil {
			_ = f.Close()
			extractErr = err
			return
		}
		_ = f.Close()
		// mark executable on POSIX (no-op on Windows)
		_ = os.Chmod(extractedPath, 0o755)
	})
	return extractedPath, extractErr
}

func Run(ctx context.Context, args ...string) (*exec.Cmd, error) {
	path, err := extract()
	if err != nil {
		return nil, err
	}
	// Clean up the temp ffmpeg when ctx is canceled/exits.
	go func(p string) {
		<-ctx.Done()
		// On Windows you can't delete while a process is using it,
		// but after ffmpeg exits, this will succeed.
		_ = os.Remove(p)
	}(path)

	cmd := exec.CommandContext(ctx, path, args...)
	// Optional: pipe stdout/stderr or assign your own
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Optional: hide window on Windows
	if runtime.GOOS == "windows" {
		// avoid importing syscall on non-windows builds
		type sysProcAttr struct{ HideWindow bool }
		// unsafe cast avoided for brevity; if you want, put this in a //go:build windows file and:
		// cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		_ = sysProcAttr{} // no-op placeholder
	}

	// Set working dir if you want:
	cmd.Dir = filepath.Dir(path)

	return cmd, nil
}

func BuildFFmpegPipeCmd(ctx context.Context, p Params) (*exec.Cmd, string /*videoFmt*/) {
	vf := strings.ToLower(p.Codec)
	if vf == "" {
		vf = "h264"
	}

	var vcodec, vfmt string
	var vbsf []string
	switch vf {
	case "hevc", "h265":
		vcodec, vfmt = "hevc_nvenc", "hevc"
		vbsf = []string{"-bsf:v", "dump_extra=all,hevc_metadata=aud=insert"}
	case "av1":
		vcodec, vfmt = "av1_nvenc", "ivf"
	default:
		vcodec, vfmt = "h264_nvenc", "h264"
		vbsf = []string{"-bsf:v", "dump_extra=all,h264_metadata=aud=insert"}
	}

	if p.FPS <= 0 {
		p.FPS = 60
	}
	if p.Preset == "" {
		p.Preset = "p4"
	}
	if p.Bitrate == "" {
		p.Bitrate = "20M"
	}

	// helper: bufsize = 2 * bitrate (e.g., "20M" -> "40M")
	bufsize := p.Bitrate
	if n, err := strconv.Atoi(strings.TrimSuffix(strings.ToUpper(p.Bitrate), "M")); err == nil {
		bufsize = fmt.Sprintf("%dM", n*2)
	}

	args := []string{"-hide_banner", "-loglevel", "info", "-y"}

	// --- INPUTS ---
	if runtime.GOOS == "windows" {
		cap := strings.ToLower(strings.TrimSpace(p.Capture))
		if cap == "" {
			cap = "ddagrab"
		} // better fps stability than gdigrab

		if cap == "ddagrab" {
			// Desktop Duplication API (Win 8+) — high FPS
			args = append(args, "-f", "lavfi", "-i", fmt.Sprintf("ddagrab=framerate=%d:draw_mouse=1", p.FPS))
		} else {
			// fallback
			args = append(args, "-f", "gdigrab", "-framerate", fmt.Sprintf("%d", p.FPS), "-i", "desktop")
		}
		// Audio
		if p.WithAudio {
			dev := p.AudioDevice
			if dev == "" {
				dev = os.Getenv("AUDIO_DEVICE")
			}
			if dev != "" {
				args = append(args, "-f", "dshow", "-i", "audio="+dev)
			} else {
				args = append(args, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000")
			}
		} else {
			args = append(args, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000")
		}
	} else {
		// Linux/X11 (unchanged)
		disp := p.Display
		if disp == "" {
			disp = ":0.0"
		}
		args = append(args, "-f", "x11grab", "-framerate", fmt.Sprintf("%d", p.FPS), "-i", disp)
		if p.WithAudio {
			args = append(args, "-f", "pulse", "-i", "default")
		} else {
			args = append(args, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000")
		}
	}

	// --- VIDEO FILTERGRAPH ---
	// Build a filter_complex with explicit labels to avoid numeric -map issues.
	// Always ensure even W/H and NVENC-friendly 4:2:0 input.
	var w, h int
	w, h = p.Width, p.Height
	if w > 0 && (w&1) == 1 {
		w++
	}
	if h > 0 && (h&1) == 1 {
		h++
	}

	var filt string
	if w > 0 || h > 0 {
		if w == 0 {
			w = -2
		}
		if h == 0 {
			h = -2
		}
		filt = fmt.Sprintf("[0:v]hwdownload,format=bgra,format=nv12,hwupload_cuda,scale_cuda=w=%d:h=%d[vout]", w, h)
	} else {
		filt = "[0:v]hwdownload,format=bgra,format=nv12,hwupload_cuda,scale_cuda=w=-2:h=-2[vout]"
	}
	args = append(args, "-filter_complex", filt)

	// --- VIDEO to stdout (elementary stream) ---
	args = append(args,
		"-map", "[vout]",
		"-r", fmt.Sprintf("%d", p.FPS), // force CFR on output
		"-c:v", vcodec,
		"-preset", p.Preset,
		"-tune", "ll",
		"-rc", "cbr",
		"-b:v", p.Bitrate,
		"-maxrate", p.Bitrate,
		"-bufsize", bufsize,
		"-g", fmt.Sprintf("%d", p.FPS*2),
		"-bf", "0",
	)
	args = append(args, vbsf...)
	args = append(args, "-an", "-f", vfmt, "-") // stdout

	// --- AUDIO RTP (optional) ---
	if p.WithAudio && p.AudioPort > 0 {
		audioOut := fmt.Sprintf("rtp://127.0.0.1:%d?pkt_size=1200&ttl=1", p.AudioPort)
		args = append(args,
			"-map", "1:a:0",
			"-c:a", "libopus",
			"-b:a", "160k",
			"-ar", "48000",
			"-ac", "2",
			"-f", "rtp", audioOut,
		)
	}
	cmd := exec.Command("ffmpeg", args...)
	return cmd, vfmt
}
