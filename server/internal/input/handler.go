package input

import (
	"encoding/json"
	"log"
	"strings"

	"github.com/go-vgo/robotgo"
)

// Matches the structure sent from webrtc.js
type InputEvent struct {
	T      string  `json:"t"` // Type: "mmoveAbs", "mdown", "mup", "kdown", "kup", "mwheel", "gp"
	X      float64 `json:"x,omitempty"`
	Y      float64 `json:"y,omitempty"`
	B      int     `json:"b,omitempty"` // button
	K      string  `json:"k,omitempty"` // key code
	DX     float64 `json:"dx,omitempty"`
	DY     float64 `json:"dy,omitempty"`
	Inside int     `json:"inside,omitempty"`
	GP     Gamepad `json:"gp,omitempty"`
}

type Gamepad struct {
	ID      string    `json:"id"`
	Index   int       `json:"index"`
	Axes    []float64 `json:"axes"`
	Buttons []int     `json:"buttons"`
}

type Handler struct {
	screenWidth  int
	screenHeight int
}

func NewHandler() *Handler {
	w, h := robotgo.GetScreenSize()
	return &Handler{
		screenWidth:  w,
		screenHeight: h,
	}
}

func (h *Handler) Process(data []byte) {
	var e InputEvent
	if err := json.Unmarshal(data, &e); err != nil {
		log.Printf("Failed to unmarshal input event: %v", err)
		return
	}

	switch e.T {
	case "mmoveAbs":
		// Only move if the cursor is intended to be inside the video frame
		if e.Inside == 1 {
			x := int(e.X * float64(h.screenWidth))
			y := int(e.Y * float64(h.screenHeight))
			robotgo.Move(x, y)
		}
	case "mdown":
		btn := "left"
		if e.B == 2 {
			btn = "right"
		} else if e.B == 1 {
			btn = "center"
		}
		robotgo.MouseDown(btn)
	case "mup":
		btn := "left"
		if e.B == 2 {
			btn = "right"
		} else if e.B == 1 {
			btn = "center"
		}
		robotgo.MouseUp(btn)
	case "mwheel":
		// robotgo.Scroll expects integer values
		dx := int(e.DX)
		dy := int(e.DY)
		if dx != 0 {
			robotgo.Scroll(dx, 0)
		}
		if dy != 0 {
			robotgo.Scroll(0, dy)
		}
	case "kdown":
		key := normalizeKeyCode(e.K)
		if key != "" {
			robotgo.KeyDown(key)
		}
	case "kup":
		key := normalizeKeyCode(e.K)
		if key != "" {
			robotgo.KeyUp(key)
		}
	case "gp":
		// Gamepad handling is complex and requires a virtual joystick driver.
		// This part is a placeholder for future integration with tools like ViGEm.
		// log.Printf("Gamepad event received: %+v", e.GP)
	}
}

// normalizeKeyCode converts JavaScript key codes to a format robotgo understands.
// This is a simplified mapping and might need expansion.
func normalizeKeyCode(jsKey string) string {
	key := strings.ToLower(jsKey)
	key = strings.Replace(key, "key", "", 1)
	key = strings.Replace(key, "arrow", "", 1)
	key = strings.Replace(key, "digit", "", 1)
	key = strings.Replace(key, "numpad", "", 1)

	switch key {
	case "controlleft", "controlright":
		return "ctrl"
	case "shiftleft", "shiftright":
		return "shift"
	case "altleft", "altright":
		return "alt"
	case "metaleft", "metaright":
		return "cmd"
	case " ":
		return "space"
	}

	if len(key) > 1 {
		return key
	}
	return key
}
