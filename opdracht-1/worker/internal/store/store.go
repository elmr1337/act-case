// Package store abstracts file storage: local filesystem (default) or
// S3-compatible object storage (Hetzner).
//
// Keys are always forward-slash paths relative to the project:
// "data/reference/x.jpg", "outputs/lora-lut/p1.png", "analysis/ai/...",
// "models/latest.json", "lut/campaign.cube".
package store

import (
	"context"
	"fmt"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/config"
)

type Store interface {
	// List returns all keys under the given prefix (recursively).
	List(ctx context.Context, prefix string) ([]string, error)
	Read(ctx context.Context, key string) ([]byte, error)
	Write(ctx context.Context, key string, data []byte) error
}

func New(cfg *config.Config) (Store, error) {
	switch cfg.StoreDriver {
	case "local":
		return NewLocal(cfg.StoreRoot, cfg.DataDir, cfg.OutputDir), nil
	case "s3":
		return NewS3(cfg)
	default:
		return nil, fmt.Errorf("onbekende STORE_DRIVER %q (local|s3)", cfg.StoreDriver)
	}
}
