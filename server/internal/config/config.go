package config

import (
	"os"
	"strconv"
)

type Config struct {
	ListenAddr       string
	VideoPort        int
	AudioPort        int
	CaptureFramerate int
	BrowserCmd       string
	BrowserURL       string
	DefaultCodec     string // h264|hevc|av1
	Audio            bool
}

func Load() Config {
	c := Config{
		ListenAddr:       getEnv("LISTEN_ADDR", ":8080"),
		VideoPort:        getEnvInt("VIDEO_PORT", 5004),
		AudioPort:        getEnvInt("AUDIO_PORT", 5006),
		CaptureFramerate: getEnvInt("FRAMERATE", 60),
		BrowserCmd:       os.Getenv("BROWSER_CMD"),
		BrowserURL:       getEnv("BROWSER_URL", "http://127.0.0.1:8080/play"),
		DefaultCodec:     getEnv("DEFAULT_CODEC", "h264"),
		Audio:            !isTrue(os.Getenv("DISABLE_AUDIO")),
	}
	return c
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" { return v }
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil { return n }
	}
	return def
}

func isTrue(v string) bool {
	switch v {
	case "1", "true", "TRUE", "yes", "YES":
		return true
	}
	return false
}
