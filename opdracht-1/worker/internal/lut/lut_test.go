package lut

import (
	"image"
	"image/color"
	"math"
	"strings"
	"testing"
)

const identity2 = `# identity
TITLE "identity"
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`

// Swaps the R and G channels: value at lattice point (r,g,b) is (g,r,b).
const swapRG2 = `LUT_3D_SIZE 2
0 0 0
0 1 0
1 0 0
1 1 0
0 0 1
0 1 1
1 0 1
1 1 1
`

// Halves every channel.
const half2 = `LUT_3D_SIZE 2
0 0 0
0.5 0 0
0 0.5 0
0.5 0.5 0
0 0 0.5
0.5 0 0.5
0 0.5 0.5
0.5 0.5 0.5
`

func mustParse(t *testing.T, src string) *LUT {
	t.Helper()
	l, err := Parse(strings.NewReader(src))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	return l
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestParseIdentity(t *testing.T) {
	l := mustParse(t, identity2)
	if l.Size != 2 || l.Title != "identity" || len(l.Data) != 24 {
		t.Fatalf("onverwachte LUT: size=%d title=%q len=%d", l.Size, l.Title, len(l.Data))
	}
}

// Trilinear interpolation of per-channel linear data is exact, so an
// identity LUT must return its input unchanged everywhere.
func TestIdentityLookupIsExact(t *testing.T) {
	l := mustParse(t, identity2)
	for _, in := range [][3]float64{{0, 0, 0}, {1, 1, 1}, {0.25, 0.5, 0.75}, {0.1, 0.9, 0.33}} {
		r, g, b := l.Lookup(in[0], in[1], in[2])
		if !near(r, in[0]) || !near(g, in[1]) || !near(b, in[2]) {
			t.Errorf("identity(%v) = (%v %v %v)", in, r, g, b)
		}
	}
}

func TestSwapLookup(t *testing.T) {
	l := mustParse(t, swapRG2)
	r, g, b := l.Lookup(0.25, 0.75, 0.5)
	if !near(r, 0.75) || !near(g, 0.25) || !near(b, 0.5) {
		t.Fatalf("swap(0.25 0.75 0.5) = (%v %v %v), verwacht (0.75 0.25 0.5)", r, g, b)
	}
}

func TestDomainScaling(t *testing.T) {
	src := "LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n" +
		"0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n"
	l := mustParse(t, src)

	r, g, b := l.Lookup(1, 1, 1) // midden van het domein 0..2
	if !near(r, 0.5) || !near(g, 0.5) || !near(b, 0.5) {
		t.Fatalf("domein-midden = (%v %v %v), verwacht 0.5", r, g, b)
	}
	// Buiten het domein wordt geklemd.
	r, g, b = l.Lookup(5, 5, 5)
	if !near(r, 1) || !near(g, 1) || !near(b, 1) {
		t.Fatalf("klemmen boven domein = (%v %v %v), verwacht 1", r, g, b)
	}
}

func TestParseErrors(t *testing.T) {
	cases := map[string]string{
		"geen size":      "0 0 0\n",
		"te weinig data": "LUT_3D_SIZE 2\n0 0 0\n",
		"kapotte waarde": "LUT_3D_SIZE 2\n0 0 x\n" + strings.Repeat("0 0 0\n", 7),
		"1d lut":         "LUT_1D_SIZE 4\n0 0 0\n",
		"size te klein":  "LUT_3D_SIZE 1\n0 0 0\n",
		"kapot domein":   "LUT_3D_SIZE 2\nDOMAIN_MAX 0 0 0\n" + strings.Repeat("0 0 0\n", 8),
		"vier kolommen":  "LUT_3D_SIZE 2\n0 0 0 0\n" + strings.Repeat("0 0 0\n", 7),
	}
	for name, src := range cases {
		if _, err := Parse(strings.NewReader(src)); err == nil {
			t.Errorf("%s: verwachtte een parse-fout", name)
		}
	}
}

func TestApplyIdentityAndHalf(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	img.SetNRGBA(0, 0, color.NRGBA{R: 64, G: 128, B: 255, A: 200})
	img.SetNRGBA(1, 0, color.NRGBA{R: 0, G: 255, B: 10, A: 255})

	ident := mustParse(t, identity2).Apply(img)
	for x := 0; x < 2; x++ {
		if got, want := ident.NRGBAAt(x, 0), img.NRGBAAt(x, 0); got != want {
			t.Errorf("identity pixel %d: %v != %v", x, got, want)
		}
	}

	halved := mustParse(t, half2).Apply(img)
	want := color.NRGBA{R: 32, G: 64, B: 128, A: 200}
	if got := halved.NRGBAAt(0, 0); got != want {
		t.Errorf("half pixel: %v != %v", got, want)
	}
	if halved.NRGBAAt(1, 0).A != 255 {
		t.Error("alpha moet onaangetast blijven")
	}
}
