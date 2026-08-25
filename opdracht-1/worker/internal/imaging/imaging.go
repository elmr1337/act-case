// Package imaging downscales reference images before they go to providers:
// full-res campaign originals (40MB+ each) are pointless over the wire —
// LoRA-training en vision-modellen werken intern toch op ~1-2K pixels.
package imaging

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"

	"golang.org/x/image/draw"

	_ "image/gif" // register decoders
	_ "image/png"

	_ "golang.org/x/image/webp"
)

// Downscale re-encodes an image as JPEG with the longest edge capped at
// maxEdge pixels. Images that already fit are still re-encoded (cheap, and it
// normalises exotic formats), quality 90.
func Downscale(data []byte, maxEdge int) ([]byte, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("imaging: decode faalde: %w", err)
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()

	if w > maxEdge || h > maxEdge {
		scale := float64(maxEdge) / float64(w)
		if h > w {
			scale = float64(maxEdge) / float64(h)
		}
		nw, nh := int(float64(w)*scale+0.5), int(float64(h)*scale+0.5)
		if nw < 1 {
			nw = 1
		}
		if nh < 1 {
			nh = 1
		}
		dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
		draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)
		img = dst
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
