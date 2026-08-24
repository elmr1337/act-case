// Package job defines the job model that travels through the queue.
package job

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"time"
)

type Type string

const (
	TypeAnalyze  Type = "analyze"
	TypeTrain    Type = "train"
	TypeGenerate Type = "generate"
)

type Variant string

const (
	VariantPrompt   Variant = "prompt"
	VariantMultiref Variant = "multiref"
	VariantLora     Variant = "lora"
)

type Job struct {
	ID        string    `json:"id"`
	Type      Type      `json:"type"`
	ClientID  string    `json:"client_id"`
	Variant   Variant   `json:"variant,omitempty"`
	LUT       bool      `json:"lut"`
	Prompt    string    `json:"prompt,omitempty"`
	PromptID  string    `json:"prompt_id,omitempty"`
	Steps     int       `json:"steps,omitempty"`
	LoraURL   string    `json:"lora_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func New(t Type, clientID string) Job {
	return Job{
		ID:        NewID(),
		Type:      t,
		ClientID:  clientID,
		CreatedAt: time.Now().UTC(),
	}
}

func (j Job) Validate() error {
	switch j.Type {
	case TypeAnalyze, TypeTrain:
	case TypeGenerate:
		switch j.Variant {
		case VariantPrompt, VariantMultiref, VariantLora:
		default:
			return fmt.Errorf("job %s: ongeldige variant %q", j.ID, j.Variant)
		}
		if j.Prompt == "" {
			return fmt.Errorf("job %s: generate zonder prompt", j.ID)
		}
	default:
		return fmt.Errorf("job %s: ongeldig type %q", j.ID, j.Type)
	}
	return nil
}

// MarshalBinary/UnmarshalBinary make Job usable directly with go-redis.
func (j Job) MarshalBinary() ([]byte, error) { return json.Marshal(j) }

func (j *Job) UnmarshalBinary(data []byte) error { return json.Unmarshal(data, j) }

// NewID returns a random UUIDv4 without external dependencies.
func NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

type Status string

const (
	StatusQueued  Status = "queued"
	StatusRunning Status = "running"
	StatusDone    Status = "done"
	StatusFailed  Status = "failed"
)

// Record is the queue-side administration of a job.
type Record struct {
	Job       Job       `json:"job"`
	Status    Status    `json:"status"`
	Detail    string    `json:"detail,omitempty"` // failure reason or result key
	UpdatedAt time.Time `json:"updated_at"`
}
