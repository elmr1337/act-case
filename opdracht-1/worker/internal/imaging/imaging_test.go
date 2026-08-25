package imaging

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func encodePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: uint8(x % 256), G: 128, B: 64, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestDownscaleCapsLongestEdge(t *testing.T) {
	out, err := Downscale(encodePNG(t, 100, 50), 40)
	if err != nil {
		t.Fatal(err)
	}
	img, format, err := image.Decode(bytes.NewReader(out))
	if err != nil || format != "jpeg" {
		t.Fatalf("verwacht jpeg, kreeg %q (err %v)", format, err)
	}
	if b := img.Bounds(); b.Dx() != 40 || b.Dy() != 20 {
		t.Fatalf("verwacht 40x20, kreeg %dx%d", b.Dx(), b.Dy())
	}
}

func TestDownscalePortraitUsesHeight(t *testing.T) {
	out, err := Downscale(encodePNG(t, 50, 100), 40)
	if err != nil {
		t.Fatal(err)
	}
	img, _, _ := image.Decode(bytes.NewReader(out))
	if b := img.Bounds(); b.Dx() != 20 || b.Dy() != 40 {
		t.Fatalf("verwacht 20x40, kreeg %dx%d", b.Dx(), b.Dy())
	}
}

func TestDownscaleKeepsSmallImages(t *testing.T) {
	out, err := Downscale(encodePNG(t, 30, 20), 40)
	if err != nil {
		t.Fatal(err)
	}
	img, _, _ := image.Decode(bytes.NewReader(out))
	if b := img.Bounds(); b.Dx() != 30 || b.Dy() != 20 {
		t.Fatalf("kleine afbeelding mag niet schalen: %dx%d", b.Dx(), b.Dy())
	}
}

func TestDownscaleRejectsGarbage(t *testing.T) {
	if _, err := Downscale([]byte("geen afbeelding"), 40); err == nil {
		t.Fatal("verwachtte een fout")
	}
}
