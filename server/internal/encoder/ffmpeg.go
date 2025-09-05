package encoder

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
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
	persisted     bool
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
	Display     string // ":0.0" on Linux
	AudioDevice string // Windows dshow device name
	Capture     string // This is now handled automatically for Windows
}

// ... (extract and Run functions remain the same) ...

func BuildFFmpegPipeCmd(ctx context.Context, p Params) (*exec.Cmd, string /*videoFmt*/) {
	vf := strings.ToLower(p.Codec)
	if vf == "" {
		vf = "h264"
	}

	var vcodec, vfmt string
	var vbsf []string
	var extraCodecOptions []string // To hold profile option
	switch vf {
	case "hevc", "h265":
		vcodec, vfmt = "hevc_nvenc", "hevc"
		vbsf = []string{"-bsf:v", "dump_extra=all,hevc_metadata=aud=insert"}
	case "av1":
		vcodec, vfmt = "av1_nvenc", "ivf"
	default:
		vcodec, vfmt = "h264_nvenc", "h264"
		vbsf = []string{"-bsf:v", "dump_extra=all,h264_metadata=aud=insert"}
		extraCodecOptions = []string{"-profile:v", "high"}
	}

	if p.FPS <= 0 {
		p.FPS = 60
	}
	if p.Preset == "" {
		p.Preset = "p1"
	}
	if p.Bitrate == "" {
		p.Bitrate = "25M"
	}

	args := []string{"-hide_banner", "-loglevel", "error", "-y"}

	// --- INPUTS ---
	if runtime.GOOS == "windows" {
		// videoInputGraph := fmt.Sprintf("ddagrab=framerate=%d:draw_mouse=1", p.FPS)
		// args = append(args, "-init_hw_device", "d3d11va", "-f", "lavfi", "-i", videoInputGraph)
		args = append(args, "-init_hw_device", "d3d11va")

		if p.WithAudio {
			audioDeviceName := p.AudioDevice
			if audioDeviceName == "" {
				audioDeviceName = os.Getenv("AUDIO_DEVICE")
			}
			if audioDeviceName != "" {
				args = append(args, "-f", "dshow", "-i", fmt.Sprintf("audio=%s", audioDeviceName))
			} else {
				args = append(args, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000")
			}
		} else {
			args = append(args, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000")
		}
	} else {
		// Linux/X11
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
	var filterComplex string
	if p.Width > 0 && p.Height > 0 {
		w, h := p.Width, p.Height
		if (w & 1) == 1 {
			w++
		}
		if (h & 1) == 1 {
			h++
		}
		// filterComplex = fmt.Sprintf("[0:v]hwdownload,hwupload_cuda,scale_cuda=w=%d:h=%d:format=nv12[vout]", w, h)
		filterComplex = fmt.Sprintf("ddagrab=framerate=%d:draw_mouse=1", p.FPS)
	} else {
		// filterComplex = "[0:v]hwdownload,hwupload_cuda,scale_cuda=w=-2:h=-2:format=nv12[vout]"
		filterComplex = fmt.Sprintf("ddagrab=framerate=%d:draw_mouse=1", p.FPS)
	}

	args = append(args, "-filter_complex", filterComplex)

	// bufsize, _ := strconv.ParseInt(strings.TrimSuffix(p.Bitrate, "M"), 10, 0)
	bufsize, _ := strconv.Atoi(strings.TrimSuffix(p.Bitrate, "M"))
	bufsize_f := float64(bufsize) * 1.2
	bufsize = int(bufsize_f)

	// --- VIDEO to stdout (elementary stream) ---
	args = append(args,
		// "-map", "[vout]",
		"-c:v", vcodec,
		"-preset", p.Preset,
		"-tune", "ll",
		"-cq", "25",
		"-b:v", p.Bitrate,
		"-rc", "vbr",
		"-maxrate", p.Bitrate,
		"-g", fmt.Sprintf("%d", p.FPS/2),
		"-keyint_min", fmt.Sprintf("%d", p.FPS/2),
		"-minrate", p.Bitrate,
		"-bufsize", fmt.Sprintf("%dM", bufsize),
		"-bf", "2",
		"-zerolatency", "1",
		"-no-scenecut", "1",
	)
	args = append(args, extraCodecOptions...)
	args = append(args, vbsf...)
	args = append(args, "-an", "-f", vfmt, "-")

	// --- AUDIO RTP (optional) ---
	if p.WithAudio && p.AudioPort > 0 {
		audioOut := fmt.Sprintf("rtp://127.0.0.1:%d?pkt_size=1200&ttl=1", p.AudioPort)
		args = append(args,
			// "-map", "1:a",
			"-c:a", "libopus",
			"-b:a", "128k",
			"-ar", "48000",
			"-ac", "2",
			"-application", "lowdelay",
			"-f", "rtp", audioOut,
		)
	}

	ff, err := Path()
	if err != nil || ff == "" {
		ff = "ffmpeg" // fallback to system ffmpeg
	}
	cmd := exec.Command(ff, args...)
	return cmd, vfmt
}

func extract() (string, error) {
	extractedOnce.Do(func() {
		target, ok := chooseCacheTarget()
		if ok {
			// Try to place a persistent cached binary validated by hash
			if err := ensureCachedFFmpeg(target); err == nil {
				extractedPath = target
				persisted = true
				extractErr = nil
				return
			}
		}
		// Fallback to temp extraction
		f, err := os.CreateTemp("", "ffmpeg-*.exe")
		if err != nil {
			extractErr = err
			return
		}
		extractedPath = f.Name()
		data, derr := embeddedData()
		if derr != nil {
			_ = f.Close()
			extractErr = derr
			return
		}
		if _, err := f.Write(data); err != nil {
			_ = f.Close()
			extractErr = err
			return
		}
		_ = f.Close()
		_ = os.Chmod(extractedPath, 0o755)
	})
	return extractedPath, extractErr
}

func Run(ctx context.Context, args ...string) (*exec.Cmd, error) {
	path, err := extract()
	if err != nil {
		return nil, err
	}
	go func(p string) {
		<-ctx.Done()
		if !persisted {
			if err := os.Remove(p); err != nil {
				fmt.Printf("error removing temp file: %v\n", err)
			}
		}
	}(path)

	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if runtime.GOOS == "windows" {
		type sysProcAttr struct{ HideWindow bool }
		_ = sysProcAttr{}
	}

	cmd.Dir = filepath.Dir(path)

	return cmd, nil
}

// Path returns the ffmpeg path ensuring it is extracted/cached.
func Path() (string, error) { return extract() }

// embeddedData returns the platform-appropriate embedded ffmpeg bytes.
func embeddedData() ([]byte, error) {
	switch runtime.GOOS {
	case "windows":
		return winFFmpeg, nil
	default:
		return nil, io.ErrUnexpectedEOF
	}
}

func ensureCachedFFmpeg(target string) error {
	data, err := embeddedData()
	if err != nil {
		return err
	}
	h := sha256.Sum256(data)
	hexh := hex.EncodeToString(h[:])
	dir := filepath.Dir(target)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	hashFile := target + ".sha256"
	// Validate existing
	if b, err := os.ReadFile(hashFile); err == nil && strings.TrimSpace(string(b)) == hexh {
		if fi, err := os.Stat(target); err == nil && fi.Mode().Perm()&0o111 != 0 {
			return nil
		}
	}
	// Write atomically
	tmp := target + ".tmp"
	if err := os.WriteFile(tmp, data, 0o755); err != nil {
		return err
	}
	if err := os.Rename(tmp, target); err != nil {
		return err
	}
	if err := os.WriteFile(hashFile, []byte(hexh), fs.FileMode(0o644)); err != nil {
		return err
	}
	return nil
}

// chooseCacheTarget returns a suitable persistent path for ffmpeg.
func chooseCacheTarget() (string, bool) {
	// Prefer ProgramData on Windows, else LocalAppData, else temp
	name := "ffmpeg.exe"
	if runtime.GOOS == "windows" {
		if pd := os.Getenv("ProgramData"); pd != "" {
			return filepath.Join(pd, "pc_cloud", "bin", name), true
		}
		if la := os.Getenv("LocalAppData"); la != "" {
			return filepath.Join(la, "pc_cloud", "bin", name), true
		}
	}
	return filepath.Join(os.TempDir(), name), true
}
