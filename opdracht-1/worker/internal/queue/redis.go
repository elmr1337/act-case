package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/job"
)

const (
	redisListKey   = "act:jobs"
	redisJobPrefix = "act:job:"
	redisJobTTL    = 14 * 24 * time.Hour
)

// Redis is a deliberately simple driver: LPUSH/BRPOP on a list, job status
// in a hash per job. No framework, no streams — an MVP does not need them.
type Redis struct {
	cli *redis.Client
}

func NewRedis(url string) (*Redis, error) {
	if url == "" {
		return nil, fmt.Errorf("QUEUE_DRIVER=redis maar REDIS_URL is leeg")
	}
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("ongeldige REDIS_URL: %w", err)
	}
	cli := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := cli.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis niet bereikbaar op %s: %w", url, err)
	}
	return &Redis{cli: cli}, nil
}

func (r *Redis) Enqueue(ctx context.Context, j job.Job) error {
	if err := j.Validate(); err != nil {
		return err
	}
	payload, err := json.Marshal(j)
	if err != nil {
		return err
	}
	key := redisJobPrefix + j.ID
	pipe := r.cli.TxPipeline()
	pipe.HSet(ctx, key, map[string]any{
		"status":     string(job.StatusQueued),
		"detail":     "",
		"updated_at": time.Now().UTC().Format(time.RFC3339),
		"payload":    payload,
	})
	pipe.Expire(ctx, key, redisJobTTL)
	pipe.LPush(ctx, redisListKey, payload)
	_, err = pipe.Exec(ctx)
	return err
}

func (r *Redis) Dequeue(ctx context.Context) (job.Job, error) {
	for {
		res, err := r.cli.BRPop(ctx, 5*time.Second, redisListKey).Result()
		if errors.Is(err, redis.Nil) {
			if ctx.Err() != nil {
				return job.Job{}, ctx.Err()
			}
			continue
		}
		if err != nil {
			if ctx.Err() != nil {
				return job.Job{}, ctx.Err()
			}
			return job.Job{}, err
		}
		var j job.Job
		if err := json.Unmarshal([]byte(res[1]), &j); err != nil {
			return job.Job{}, fmt.Errorf("kapotte job-payload op de queue: %w", err)
		}
		return j, nil
	}
}

func (r *Redis) SetStatus(ctx context.Context, id string, st job.Status, detail string) error {
	return r.cli.HSet(ctx, redisJobPrefix+id, map[string]any{
		"status":     string(st),
		"detail":     detail,
		"updated_at": time.Now().UTC().Format(time.RFC3339),
	}).Err()
}

func (r *Redis) Status(ctx context.Context, id string) (job.Record, error) {
	m, err := r.cli.HGetAll(ctx, redisJobPrefix+id).Result()
	if err != nil {
		return job.Record{}, err
	}
	if len(m) == 0 {
		return job.Record{}, fmt.Errorf("onbekende job %s", id)
	}
	var rec job.Record
	if err := json.Unmarshal([]byte(m["payload"]), &rec.Job); err != nil {
		return job.Record{}, err
	}
	rec.Status = job.Status(m["status"])
	rec.Detail = m["detail"]
	if t, err := time.Parse(time.RFC3339, m["updated_at"]); err == nil {
		rec.UpdatedAt = t
	}
	return rec, nil
}

func (r *Redis) Close() error { return r.cli.Close() }
