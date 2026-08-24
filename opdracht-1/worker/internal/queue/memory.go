package queue

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/job"
)

// Memory is a channel-backed queue for single-process batch runs:
// enqueue everything, run a worker pool over Dequeue, Close, done.
type Memory struct {
	ch      chan job.Job
	mu      sync.RWMutex
	records map[string]job.Record
	closed  bool
	once    sync.Once
}

func NewMemory(buffer int) *Memory {
	return &Memory{
		ch:      make(chan job.Job, buffer),
		records: make(map[string]job.Record),
	}
}

func (m *Memory) Enqueue(ctx context.Context, j job.Job) error {
	if err := j.Validate(); err != nil {
		return err
	}
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return ErrClosed
	}
	m.records[j.ID] = job.Record{Job: j, Status: job.StatusQueued, UpdatedAt: time.Now().UTC()}
	m.mu.Unlock()

	select {
	case m.ch <- j:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (m *Memory) Dequeue(ctx context.Context) (job.Job, error) {
	select {
	case j, ok := <-m.ch:
		if !ok {
			return job.Job{}, ErrClosed
		}
		return j, nil
	case <-ctx.Done():
		return job.Job{}, ctx.Err()
	}
}

func (m *Memory) SetStatus(_ context.Context, id string, st job.Status, detail string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	rec, ok := m.records[id]
	if !ok {
		return fmt.Errorf("onbekende job %s", id)
	}
	rec.Status = st
	rec.Detail = detail
	rec.UpdatedAt = time.Now().UTC()
	m.records[id] = rec
	return nil
}

func (m *Memory) Status(_ context.Context, id string) (job.Record, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	rec, ok := m.records[id]
	if !ok {
		return job.Record{}, fmt.Errorf("onbekende job %s", id)
	}
	return rec, nil
}

func (m *Memory) Close() error {
	m.mu.Lock()
	m.closed = true
	m.mu.Unlock()
	m.once.Do(func() { close(m.ch) })
	return nil
}
