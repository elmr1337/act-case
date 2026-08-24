package queue

import (
	"context"
	"testing"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/job"
)

func testJob(prompt string) job.Job {
	j := job.New(job.TypeGenerate, "act-case")
	j.Variant = job.VariantPrompt
	j.Prompt = prompt
	return j
}

func TestMemoryQueueFIFOAndStatus(t *testing.T) {
	ctx := context.Background()
	q := NewMemory(8)

	a, b := testJob("a"), testJob("b")
	if err := q.Enqueue(ctx, a); err != nil {
		t.Fatal(err)
	}
	if err := q.Enqueue(ctx, b); err != nil {
		t.Fatal(err)
	}

	got, err := q.Dequeue(ctx)
	if err != nil || got.ID != a.ID {
		t.Fatalf("verwacht job a, kreeg %v (err %v)", got.ID, err)
	}
	if err := q.SetStatus(ctx, got.ID, job.StatusDone, "outputs/x.png"); err != nil {
		t.Fatal(err)
	}
	rec, err := q.Status(ctx, a.ID)
	if err != nil || rec.Status != job.StatusDone || rec.Detail != "outputs/x.png" {
		t.Fatalf("status niet bijgewerkt: %+v (err %v)", rec, err)
	}
	// De volledige job moet in het record bewaard blijven.
	if rec.Job.Prompt != "a" || rec.Job.Variant != job.VariantPrompt {
		t.Fatalf("job-payload kwijt in record: %+v", rec.Job)
	}
}

func TestMemoryQueueCloseDrains(t *testing.T) {
	ctx := context.Background()
	q := NewMemory(8)
	if err := q.Enqueue(ctx, testJob("laatste")); err != nil {
		t.Fatal(err)
	}
	q.Close()

	// Wat al op de queue stond moet nog uitgelezen kunnen worden…
	if _, err := q.Dequeue(ctx); err != nil {
		t.Fatalf("drainen na Close hoort te werken: %v", err)
	}
	// …daarna is de queue klaar.
	if _, err := q.Dequeue(ctx); err != ErrClosed {
		t.Fatalf("verwacht ErrClosed, kreeg %v", err)
	}
	// En nieuwe jobs worden geweigerd.
	if err := q.Enqueue(ctx, testJob("te laat")); err != ErrClosed {
		t.Fatalf("enqueue na Close moet ErrClosed geven, kreeg %v", err)
	}
}

func TestMemoryQueueRejectsInvalidJob(t *testing.T) {
	q := NewMemory(1)
	bad := job.New(job.TypeGenerate, "act-case") // geen variant/prompt
	if err := q.Enqueue(context.Background(), bad); err == nil {
		t.Fatal("ongeldige job moet geweigerd worden")
	}
}
