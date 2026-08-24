package store

import (
	"context"
	"testing"
)

func TestLocalPrefixMappingRoundTrip(t *testing.T) {
	ctx := context.Background()
	root, data, out := t.TempDir(), t.TempDir(), t.TempDir()
	s := NewLocal(root, data, out)

	cases := map[string][]byte{
		"data/reference/foto.jpg": []byte("jpeg-bytes"),
		"outputs/prompt/p1.png":   []byte("png-bytes"),
		"analysis/ai/style.md":    []byte("# stijl"),
		"models/latest.json":      []byte("{}"),
	}
	for key, val := range cases {
		if err := s.Write(ctx, key, val); err != nil {
			t.Fatalf("write %s: %v", key, err)
		}
		got, err := s.Read(ctx, key)
		if err != nil || string(got) != string(val) {
			t.Fatalf("read %s: %q, %v", key, got, err)
		}
	}

	keys, err := s.List(ctx, "data/reference")
	if err != nil || len(keys) != 1 || keys[0] != "data/reference/foto.jpg" {
		t.Fatalf("list data/reference: %v, %v", keys, err)
	}

	// Een lege prefix mag niet crashen en geeft niets terug.
	keys, err = s.List(ctx, "data/bestaat-niet")
	if err != nil || len(keys) != 0 {
		t.Fatalf("list op lege prefix: %v, %v", keys, err)
	}

	// Path traversal wordt geweigerd.
	if err := s.Write(ctx, "../buiten.txt", []byte("x")); err == nil {
		t.Fatal("path traversal moet geweigerd worden")
	}
}
