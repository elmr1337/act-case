package lut

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"

	_ "image/jpeg" // register decoder
)

// Apply runs every pixel through the LUT and returns a new image.
// Alpha is preserved untouched.
func (l *LUT) Apply(img image.Image) *image.NRGBA {
	bounds := img.Bounds()
	dst := image.NewNRGBA(bounds)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
			r, g, b := l.Lookup(float64(c.R)/255, float64(c.G)/255, float64(c.B)/255)
			dst.SetNRGBA(x, y, color.NRGBA{clamp8(r), clamp8(g), clamp8(b), c.A})
		}
	}
	return dst
}

// ApplyPNG decodes an image (png/jpeg), applies the LUT and re-encodes as PNG.
func (l *LUT) ApplyPNG(data []byte) ([]byte, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("lut: kan afbeelding niet decoderen: %w", err)
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, l.Apply(img)); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func clamp8(v float64) uint8 {
	s := v*255 + 0.5
	if s < 0 {
		return 0
	}
	if s > 255 {
		return 255
	}
	return uint8(s)
}
