// Package queue abstracts job transport: an in-process memory queue for the
// default batch mode, and Redis for the multi-process production story.
package queue

import (
	"context"
	"errors"
	"fmt"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/config"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/job"
)

// ErrClosed is returned by Dequeue when the queue is closed and drained.
var ErrClosed = errors.New("queue is gesloten")

type Queue interface {
	Enqueue(ctx context.Context, j job.Job) error
	// Dequeue blocks until a job is available, the context is cancelled,
	// or the queue is closed (ErrClosed).
	Dequeue(ctx context.Context) (job.Job, error)
	SetStatus(ctx context.Context, id string, st job.Status, detail string) error
	Status(ctx context.Context, id string) (job.Record, error)
	Close() error
}

func New(cfg *config.Config) (Queue, error) {
	switch cfg.QueueDriver {
	case "memory":
		return NewMemory(1024), nil
	case "redis":
		return NewRedis(cfg.RedisURL)
	default:
		return nil, fmt.Errorf("onbekende QUEUE_DRIVER %q (memory|redis)", cfg.QueueDriver)
	}
}
