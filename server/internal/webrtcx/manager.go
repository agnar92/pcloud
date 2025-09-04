package webrtcx

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"pc_cloud/internal/encoder"
	"pc_cloud/internal/input"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	wmedia "github.com/pion/webrtc/v4/pkg/media"
)

type OfferRequest struct {
	SDP     string `json:"sdp"`
	Type    string `json:"type"`
	Codec   string `json:"codec"`   // h264|hevc|av1
	Audio   bool   `json:"audio"`   // enable audio
	FPS     int    `json:"fps"`     // e.g. 60
	Width   int    `json:"width"`   // 0 = native
	Height  int    `json:"height"`  // 0 = native
	Preset  string `json:"preset"`  // NVENC p1..p7 (lower=slower/better)
	Bitrate string `json:"bitrate"` // e.g. "25M"
	Capture string `json:"capture"` // "ddagrab"|"gdigrab"
}

type Answer struct {
	SDP  string `json:"sdp"`
	Type string `json:"type"`
}

type Session struct {
	pc           *webrtc.PeerConnection
	cancel       context.CancelFunc
	codec        string
	audioConn    *net.UDPConn
	audioPT      uint8
	ffmpeg       *exec.Cmd
	inputHandler *input.Handler
}

type Manager struct {
	mu     sync.Mutex
	active *Session
}

func New() *Manager { return &Manager{} }

func (m *Manager) CloseActive() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.active != nil {
		if err := m.active.Close(); err != nil {
			log.Printf("error closing active session: %v", err)
		}
		m.active = nil
	}
}

func (m *Manager) End(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	defer m.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")

	sess := m.active
	m.active = nil
	m.mu.Unlock()

	if sess != nil {
		_ = sess.Close()
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write([]byte(`{"status":"ended"}`)); err != nil {
			log.Printf("error writing response: %v", err)
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if _, err := w.Write([]byte(`{"error":` + strconv.Quote(msg) + `}`)); err != nil {
		log.Printf("error writing JSON error: %v", err)
	}
}

func (s *Session) Close() error {
	if s.audioConn != nil {
		_ = s.audioConn.Close()
	}
	if s.pc != nil {
		_ = s.pc.Close()
	}
	if s.ffmpeg != nil && s.ffmpeg.Process != nil {
		_ = s.ffmpeg.Process.Kill()
	}
	if s.cancel != nil {
		s.cancel()
	}
	return nil
}

func (m *Manager) HandleOffer(w http.ResponseWriter, r *http.Request) {
	var req OfferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "bad json: "+err.Error())
		return
	}
	req.Codec = strings.ToLower(strings.TrimSpace(req.Codec))
	if req.Codec == "" {
		req.Codec = "h264"
	}
	if req.FPS <= 0 {
		req.FPS = 60
	}
	req.Preset = strings.ToLower(strings.TrimSpace(req.Preset))
	if req.Preset == "" {
		req.Preset = "p4"
	}
	if req.Bitrate == "" {
		req.Bitrate = "20M"
	}

	log.Printf("OFFER codec=%s fps=%d %dx%d preset=%s br=%s audio=%v",
		req.Codec, req.FPS, req.Width, req.Height, req.Preset, req.Bitrate, req.Audio)

	api, err := buildAPIForCodec(req.Codec)
	if err != nil {
		log.Printf("api build failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "api: "+err.Error())
		return
	}
	pc, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		log.Printf("pc create failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "pc: "+err.Error())
		return
	}

	m.CloseActive()

	ctx, cancel := context.WithCancel(context.Background())
	sess := &Session{
		pc:           pc,
		cancel:       cancel,
		codec:        req.Codec,
		inputHandler: input.NewHandler(),
	}

	pc.OnDataChannel(func(d *webrtc.DataChannel) {
		if d.Label() == "input" {
			log.Println("Input DataChannel created")
			d.OnMessage(func(msg webrtc.DataChannelMessage) {
				sess.inputHandler.Process(msg.Data)
			})
		}
	})

	mime := webrtc.MimeTypeH264
	switch strings.ToLower(req.Codec) {
	case "hevc", "h265":
		mime = webrtc.MimeTypeH265
	case "av1":
		mime = webrtc.MimeTypeAV1
	}
	videoTrack, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: mime, ClockRate: 90000},
		"video", "pccloud",
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_, err = pc.AddTrack(videoTrack)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var audioTrack *webrtc.TrackLocalStaticRTP
	var aSender *webrtc.RTPSender
	if req.Audio {
		audioTrack, err = webrtc.NewTrackLocalStaticRTP(
			webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2},
			"audio", "pccloud",
		)
		if err == nil {
			aSender, _ = pc.AddTrack(audioTrack)
		}
	} else {
		log.Println("audio disabled")
	}

	offer := webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: req.SDP}
	if err := pc.SetRemoteDescription(offer); err != nil {
		http.Error(w, "set remote: "+err.Error(), http.StatusBadRequest)
		return
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	g := webrtc.GatheringCompletePromise(pc)
	if err := pc.SetLocalDescription(answer); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	<-g

	var audioPort int
	if req.Audio && audioTrack != nil && aSender != nil {
		aconn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
		if err == nil {
			aaddr := aconn.LocalAddr().(*net.UDPAddr)
			audioPort = aaddr.Port
			if params := aSender.GetParameters(); len(params.Codecs) > 0 {
				sess.audioPT = uint8(params.Codecs[0].PayloadType)
			}
			sess.audioConn = aconn
			go forwardRTP(ctx, aconn, audioTrack, sess.audioPT)
		} else {
			log.Println("audio UDP bind failed:", err)
			log.Println("audio disabled")
		}
	}

	cmd, vfmt := encoder.BuildFFmpegPipeCmd(ctx, encoder.Params{
		Codec:       req.Codec,
		FPS:         req.FPS,
		Width:       req.Width,
		Height:      req.Height,
		Preset:      req.Preset,
		Bitrate:     req.Bitrate,
		WithAudio:   req.Audio,
		AudioPort:   audioPort,
		AudioDevice: os.Getenv("AUDIO_DEVICE"),
		Capture:     req.Capture,
	})
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		pc.Close()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		pc.Close()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	sess.ffmpeg = cmd

	switch vfmt {
	case "h264":
		go pumpH264AnnexBToTrack(ctx, stdout, videoTrack, 60)
	case "hevc":
		go pumpH265AnnexBToTrack(ctx, stdout, videoTrack, 60)
	case "ivf":
		go pumpAV1IVFToTrack(ctx, stdout, videoTrack, 60)
	default:
		go pumpH264AnnexBToTrack(ctx, stdout, videoTrack, 60)
	}

	m.mu.Lock()
	m.active = sess
	m.mu.Unlock()

	resp := Answer{SDP: pc.LocalDescription().SDP, Type: pc.LocalDescription().Type.String()}

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("error encoding answer: %v", err)
	}
}

func forwardRTP(ctx context.Context, conn *net.UDPConn, track *webrtc.TrackLocalStaticRTP, wantPT uint8) {
	buf := make([]byte, 1700)
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			return
		}
		if n <= 0 {
			continue
		}
		pkt := &rtp.Packet{}
		if err := pkt.Unmarshal(buf[:n]); err == nil {
			pkt.PayloadType = wantPT
			if err := track.WriteRTP(pkt); err != nil {
				log.Printf("error writing RTP packet: %v", err)
			}
		} else {
			_, _ = track.Write(buf[:n])
		}
	}
}

func pumpH264AnnexBToTrack(ctx context.Context, r io.Reader, t *webrtc.TrackLocalStaticSample, fps int) {
	br := bufio.NewReaderSize(r, 1<<20)
	var (
		sps []byte
		pps []byte
	)
	frameDur := time.Second / time.Duration(max(1, fps))
	var au [][]byte

	writeAU := func(nalus [][]byte) {
		if len(nalus) == 0 {
			return
		}
		if hasH264IDR(nalus) && (sps != nil && pps != nil) {
			nalus = append([][]byte{sps, pps}, nalus...)
		}
		payload := joinAnnexB(nalus)
		_ = t.WriteSample(wmedia.Sample{Data: payload, Duration: frameDur})
	}

	for {
		nal, err := nextAnnexBNAL(br)
		if err != nil {
			return
		}
		nt := h264Type(nal)
		switch nt {
		case 7:
			sps = append([]byte{}, nal...)
		case 8:
			pps = append([]byte{}, nal...)
		case 9:
			if len(au) > 0 {
				writeAU(au)
				au = au[:0]
			}
		default:
			au = append(au, nal)
			if len(au) > 50 {
				writeAU(au)
				au = au[:0]
			}
		}
	}
}

func h264Type(nal []byte) byte {
	if len(nal) == 0 {
		return 0
	}
	return nal[0] & 0x1F
}
func hasH264IDR(nals [][]byte) bool {
	for _, n := range nals {
		if h264Type(n) == 5 {
			return true
		}
	}
	return false
}

func pumpH265AnnexBToTrack(ctx context.Context, r io.Reader, t *webrtc.TrackLocalStaticSample, fps int) {
	br := bufio.NewReaderSize(r, 1<<20)
	var (
		vps []byte
		sps []byte
		pps []byte
	)
	frameDur := time.Second / time.Duration(max(1, fps))
	var au [][]byte

	writeAU := func(nalus [][]byte) {
		if len(nalus) == 0 {
			return
		}
		if hasH265IDR(nalus) && (vps != nil && sps != nil && pps != nil) {
			nalus = append([][]byte{vps, sps, pps}, nalus...)
		}
		payload := joinAnnexB(nalus)
		_ = t.WriteSample(wmedia.Sample{Data: payload, Duration: frameDur})
	}

	for {
		nal, err := nextAnnexBNAL(br)
		if err != nil {
			return
		}
		nt := h265Type(nal)
		switch nt {
		case 32:
			vps = append([]byte{}, nal...)
		case 33:
			sps = append([]byte{}, nal...)
		case 34:
			pps = append([]byte{}, nal...)
		case 35:
			if len(au) > 0 {
				writeAU(au)
				au = au[:0]
			}
		default:
			au = append(au, nal)
			if len(au) > 50 {
				writeAU(au)
				au = au[:0]
			}
		}
	}
}

func h265Type(nal []byte) int {
	if len(nal) < 2 {
		return -1
	}
	return int((nal[0] >> 1) & 0x3F)
}

func hasH265IDR(nals [][]byte) bool {
	for _, n := range nals {
		t := h265Type(n)
		if t == 19 || t == 20 {
			return true
		}
	}
	return false
}

func pumpAV1IVFToTrack(ctx context.Context, r io.Reader, t *webrtc.TrackLocalStaticSample, fps int) {
	br := bufio.NewReaderSize(r, 1<<20)
	h := make([]byte, 32)
	if _, err := io.ReadFull(br, h); err != nil {
		return
	}
	frameDur := time.Second / time.Duration(max(1, fps))

	for {
		hdr := make([]byte, 12)
		if _, err := io.ReadFull(br, hdr); err != nil {
			return
		}
		sz := binary.LittleEndian.Uint32(hdr[:4])
		if sz == 0 || sz > 50*1024*1024 {
			return
		}
		frame := make([]byte, sz)
		if _, err := io.ReadFull(br, frame); err != nil {
			return
		}
		_ = t.WriteSample(wmedia.Sample{Data: frame, Duration: frameDur})
	}
}

func nextAnnexBNAL(br *bufio.Reader) ([]byte, error) {
	if _, err := findStartCode(br); err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	for {
		b, err := br.ReadByte()
		if err != nil {
			if err == io.EOF && buf.Len() > 0 {
				return buf.Bytes(), nil
			}
			return nil, err
		}
		if b == 0x00 {
			br.UnreadByte()
			m, sc := peekStartCode(br)
			if sc {
				return buf.Bytes(), nil
			}
			_, _ = br.ReadByte()
			buf.WriteByte(0x00)
			if m > 1 {
				for i := 1; i < m; i++ {
					buf.WriteByte(0x00)
				}
			}
			continue
		}
		buf.WriteByte(b)
	}
}

func findStartCode(br *bufio.Reader) (int, error) {
	var z int
	for {
		b, err := br.ReadByte()
		if err != nil {
			return 0, err
		}
		if b == 0x00 {
			z++
			if z > 4 {
				z = 4
			}
			continue
		}
		if b == 0x01 && (z == 2 || z == 3) {
			return z, nil
		}
		z = 0
	}
}

func peekStartCode(br *bufio.Reader) (zeros int, found bool) {
	bs, _ := br.Peek(4)
	if len(bs) >= 3 && bs[0] == 0x00 && bs[1] == 0x00 && bs[2] == 0x01 {
		return 2, true
	}
	if len(bs) >= 4 && bs[0] == 0x00 && bs[1] == 0x00 && bs[2] == 0x00 && bs[3] == 0x01 {
		return 3, true
	}
	return 0, false
}

func joinAnnexB(nals [][]byte) []byte {
	if len(nals) == 0 {
		return nil
	}
	total := 0
	for _, n := range nals {
		total += 3 + len(n)
	}
	out := make([]byte, 0, total)
	for _, n := range nals {
		out = append(out, 0x00, 0x00, 0x01)
		out = append(out, n...)
	}
	return out
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func buildAPIForCodec(codec string) (*webrtc.API, error) {
	me := &webrtc.MediaEngine{}
	if err := me.RegisterDefaultCodecs(); err != nil {
		return nil, err
	}

	switch strings.ToLower(codec) {
	case "hevc", "h265":
		if err := addVideoCodecIfMissing(me, webrtc.MimeTypeH265); err != nil {
			return nil, fmt.Errorf("register hevc: %w", err)
		}
	case "av1":
		if err := addVideoCodecIfMissing(me, webrtc.MimeTypeAV1); err != nil {
			return nil, fmt.Errorf("register av1: %w", err)
		}
	}

	ir := &interceptor.Registry{}
	if err := webrtc.RegisterDefaultInterceptors(me, ir); err != nil {
		return nil, err
	}
	return webrtc.NewAPI(
		webrtc.WithMediaEngine(me),
		webrtc.WithInterceptorRegistry(ir),
	), nil
}

func addVideoCodecIfMissing(me *webrtc.MediaEngine, mime string) error {
	for pt := webrtc.PayloadType(96); pt <= 127; pt++ {
		err := me.RegisterCodec(webrtc.RTPCodecParameters{
			RTPCodecCapability: webrtc.RTPCodecCapability{
				MimeType:  mime,
				ClockRate: 90000,
			},
			PayloadType: pt,
		}, webrtc.RTPCodecTypeVideo)
		if err == nil {
			return nil
		}
		es := strings.ToLower(err.Error())
		if strings.Contains(es, "payload type") && strings.Contains(es, "already") {
			continue
		}
		if strings.Contains(es, "codec already registered") {
			return nil
		}
	}
	return fmt.Errorf("no free dynamic payload type for %s", mime)
}
