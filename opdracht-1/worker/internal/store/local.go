package store

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Local maps the "data/" and "outputs/" key prefixes onto their configured
// directories; everything else lives under the store root. That way the
// worker can run from opdracht-1/ with zero configuration, and Docker can
// mount /data and /outputs wherever it wants.
type Local struct {
	root      string
	dataDir   string
	outputDir string
}

func NewLocal(root, dataDir, outputDir string) *Local {
	return &Local{root: root, dataDir: dataDir, outputDir: outputDir}
}

func (l *Local) path(key string) (string, error) {
	key = strings.TrimPrefix(key, "/")
	clean := filepath.Clean(filepath.FromSlash(key))
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("ongeldige key %q", key)
	}
	switch {
	case key == "data" || strings.HasPrefix(key, "data/"):
		return filepath.Join(l.dataDir, strings.TrimPrefix(strings.TrimPrefix(key, "data"), "/")), nil
	case key == "outputs" || strings.HasPrefix(key, "outputs/"):
		return filepath.Join(l.outputDir, strings.TrimPrefix(strings.TrimPrefix(key, "outputs"), "/")), nil
	default:
		return filepath.Join(l.root, clean), nil
	}
}

func (l *Local) List(_ context.Context, prefix string) ([]string, error) {
	base, err := l.path(prefix)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(base)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	if !info.IsDir() {
		return []string{strings.TrimSuffix(prefix, "/")}, nil
	}

	var keys []string
	prefix = strings.TrimSuffix(prefix, "/")
	err = filepath.WalkDir(base, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || strings.HasPrefix(d.Name(), ".") {
			return nil
		}
		rel, err := filepath.Rel(base, p)
		if err != nil {
			return err
		}
		keys = append(keys, prefix+"/"+filepath.ToSlash(rel))
		return nil
	})
	return keys, err
}

func (l *Local) Read(_ context.Context, key string) ([]byte, error) {
	p, err := l.path(key)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return nil, fmt.Errorf("store: %s (%s): %w", key, p, err)
	}
	return data, nil
}

// Write is atomic: temp file in the target dir, then rename.
func (l *Local) Write(_ context.Context, key string, data []byte) error {
	p, err := l.path(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(p), ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o644); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), p)
}
