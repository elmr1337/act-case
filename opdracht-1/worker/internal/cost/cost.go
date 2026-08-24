// Package cost logs the price of every provider call to outputs/costs.json,
// so the run-log and the deck can show what the matrix actually cost.
package cost

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/store"
)

const Key = "outputs/costs.json"

type Entry struct {
	Timestamp    time.Time `json:"timestamp"`
	JobID        string    `json:"job_id"`
	Type         string    `json:"type"`              // analyze | train | generate
	Variant      string    `json:"variant,omitempty"` // prompt | multiref | lora
	LUT          bool      `json:"lut,omitempty"`
	PromptID     string    `json:"prompt_id,omitempty"`
	Provider     string    `json:"provider"`
	Model        string    `json:"model"`
	Images       int       `json:"images,omitempty"`
	InputTokens  int       `json:"input_tokens,omitempty"`
	OutputTokens int       `json:"output_tokens,omitempty"`
	USD          float64   `json:"usd"`
	// Source is "response" when the provider reported the cost itself,
	// "config" when it comes from a configured price per image/step.
	Source string `json:"source"`
	Note   string `json:"note,omitempty"`
}

type Log struct {
	mu sync.Mutex
	st store.Store
}

func NewLog(st store.Store) *Log { return &Log{st: st} }

func (l *Log) Append(ctx context.Context, e Entry) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	entries, err := l.readLocked(ctx)
	if err != nil {
		return err
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now().UTC()
	}
	entries = append(entries, e)
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return l.st.Write(ctx, Key, data)
}

func (l *Log) Entries(ctx context.Context) ([]Entry, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.readLocked(ctx)
}

func (l *Log) readLocked(ctx context.Context) ([]Entry, error) {
	data, err := l.st.Read(ctx, Key)
	if err != nil {
		// Geen bestand is geen fout: eerste run.
		return []Entry{}, nil
	}
	var entries []Entry
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, fmt.Errorf("%s is corrupt: %w", Key, err)
	}
	return entries, nil
}

// MarkdownTable renders a per-cell summary plus a total, for the README/deck.
func MarkdownTable(entries []Entry) string {
	type agg struct {
		count int
		usd   float64
	}
	cells := map[string]*agg{}
	var total float64
	order := []string{}
	for _, e := range entries {
		label := e.Type
		if e.Variant != "" {
			label = e.Variant
			if e.LUT {
				label += "-lut"
			}
		}
		key := label + "|" + e.Provider + "|" + e.Model
		if cells[key] == nil {
			cells[key] = &agg{}
			order = append(order, key)
		}
		cells[key].count++
		cells[key].usd += e.USD
		total += e.USD
	}
	sort.Strings(order)

	var b strings.Builder
	b.WriteString("| Cel | Provider | Model | Jobs | Kosten (USD) |\n")
	b.WriteString("|---|---|---|---:|---:|\n")
	for _, key := range order {
		parts := strings.SplitN(key, "|", 3)
		a := cells[key]
		fmt.Fprintf(&b, "| %s | %s | %s | %d | %.4f |\n", parts[0], parts[1], parts[2], a.count, a.usd)
	}
	fmt.Fprintf(&b, "| **totaal** | | | %d | **%.4f** |\n", len(entries), total)
	return b.String()
}
