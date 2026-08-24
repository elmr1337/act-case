// Package lut parses Adobe .cube 3D LUT files and applies them to images
// with trilinear interpolation. Pure Go, no cgo.
package lut

import (
	"bufio"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
	"strings"
)

// LUT is a 3D lookup table. Data holds Size^3 RGB triplets in .cube order:
// red changes fastest, then green, then blue.
type LUT struct {
	Title     string
	Size      int
	DomainMin [3]float64
	DomainMax [3]float64
	Data      []float32 // len == 3 * Size^3
}

func LoadFile(path string) (*LUT, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	l, err := Parse(f)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return l, nil
}

func Parse(r io.Reader) (*LUT, error) {
	l := &LUT{
		DomainMin: [3]float64{0, 0, 0},
		DomainMax: [3]float64{1, 1, 1},
	}

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	lineNo := 0
	for sc.Scan() {
		lineNo++
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		first := line[0]
		if (first >= 'A' && first <= 'Z') || (first >= 'a' && first <= 'z') {
			if err := l.parseKeyword(line); err != nil {
				return nil, fmt.Errorf("regel %d: %w", lineNo, err)
			}
			continue
		}

		fields := strings.Fields(line)
		if len(fields) != 3 {
			return nil, fmt.Errorf("regel %d: verwacht 3 waarden, kreeg %d", lineNo, len(fields))
		}
		if l.Size == 0 {
			return nil, fmt.Errorf("regel %d: datapunt vóór LUT_3D_SIZE", lineNo)
		}
		for _, f := range fields {
			v, err := strconv.ParseFloat(f, 64)
			if err != nil {
				return nil, fmt.Errorf("regel %d: ongeldige waarde %q", lineNo, f)
			}
			l.Data = append(l.Data, float32(v))
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}

	if l.Size == 0 {
		return nil, fmt.Errorf("geen LUT_3D_SIZE gevonden")
	}
	want := 3 * l.Size * l.Size * l.Size
	if len(l.Data) != want {
		return nil, fmt.Errorf("verwacht %d datapunten (size %d), kreeg %d", want/3, l.Size, len(l.Data)/3)
	}
	for c := 0; c < 3; c++ {
		if l.DomainMax[c] <= l.DomainMin[c] {
			return nil, fmt.Errorf("DOMAIN_MAX moet groter zijn dan DOMAIN_MIN (kanaal %d)", c)
		}
	}
	return l, nil
}

func (l *LUT) parseKeyword(line string) error {
	fields := strings.Fields(line)
	key := strings.ToUpper(fields[0])
	switch key {
	case "TITLE":
		_, rest, _ := strings.Cut(line, " ")
		l.Title = strings.Trim(strings.TrimSpace(rest), `"`)
	case "LUT_3D_SIZE":
		if len(fields) != 2 {
			return fmt.Errorf("LUT_3D_SIZE verwacht één getal")
		}
		n, err := strconv.Atoi(fields[1])
		if err != nil || n < 2 || n > 256 {
			return fmt.Errorf("ongeldige LUT_3D_SIZE %q (2..256)", fields[1])
		}
		l.Size = n
		l.Data = make([]float32, 0, 3*n*n*n)
	case "LUT_1D_SIZE":
		return fmt.Errorf("1D LUTs worden niet ondersteund, exporteer als 3D .cube")
	case "DOMAIN_MIN":
		return parseTriple(fields, &l.DomainMin)
	case "DOMAIN_MAX":
		return parseTriple(fields, &l.DomainMax)
	default:
		// Unknown keywords (LUT_3D_INPUT_RANGE etc.) are ignored on purpose:
		// exporters add vendor extensions and we only need the core data.
	}
	return nil
}

func parseTriple(fields []string, dst *[3]float64) error {
	if len(fields) != 4 {
		return fmt.Errorf("%s verwacht 3 waarden", fields[0])
	}
	for i := 0; i < 3; i++ {
		v, err := strconv.ParseFloat(fields[i+1], 64)
		if err != nil {
			return fmt.Errorf("%s: ongeldige waarde %q", fields[0], fields[i+1])
		}
		dst[i] = v
	}
	return nil
}

// Lookup maps one RGB value (in domain space, normally 0..1) through the LUT
// with trilinear interpolation. Inputs outside the domain are clamped.
func (l *LUT) Lookup(r, g, b float64) (float64, float64, float64) {
	n := l.Size
	fr := l.norm(r, 0) * float64(n-1)
	fg := l.norm(g, 1) * float64(n-1)
	fb := l.norm(b, 2) * float64(n-1)

	r0, dr := split(fr, n)
	g0, dg := split(fg, n)
	b0, db := split(fb, n)
	r1, g1, b1 := r0+1, g0+1, b0+1

	idx := func(ri, gi, bi int) int { return 3 * (ri + n*(gi+n*bi)) }

	var out [3]float64
	for c := 0; c < 3; c++ {
		c000 := float64(l.Data[idx(r0, g0, b0)+c])
		c100 := float64(l.Data[idx(r1, g0, b0)+c])
		c010 := float64(l.Data[idx(r0, g1, b0)+c])
		c110 := float64(l.Data[idx(r1, g1, b0)+c])
		c001 := float64(l.Data[idx(r0, g0, b1)+c])
		c101 := float64(l.Data[idx(r1, g0, b1)+c])
		c011 := float64(l.Data[idx(r0, g1, b1)+c])
		c111 := float64(l.Data[idx(r1, g1, b1)+c])

		c00 := c000*(1-dr) + c100*dr
		c10 := c010*(1-dr) + c110*dr
		c01 := c001*(1-dr) + c101*dr
		c11 := c011*(1-dr) + c111*dr

		c0 := c00*(1-dg) + c10*dg
		c1 := c01*(1-dg) + c11*dg

		out[c] = c0*(1-db) + c1*db
	}
	return out[0], out[1], out[2]
}

func (l *LUT) norm(v float64, ch int) float64 {
	v = (v - l.DomainMin[ch]) / (l.DomainMax[ch] - l.DomainMin[ch])
	return math.Min(1, math.Max(0, v))
}

// split returns the lower lattice index and the fractional distance to the
// next one, keeping the index in [0, n-2] so idx+1 stays valid.
func split(f float64, n int) (int, float64) {
	i := int(math.Floor(f))
	if i < 0 {
		i = 0
	}
	if i > n-2 {
		i = n - 2
	}
	return i, f - float64(i)
}
