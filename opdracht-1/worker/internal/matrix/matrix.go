// Package matrix parses the batch definition (matrix.yaml) and expands it
// into jobs: optional analyze, optional train runs, then the full
// prompts x variants x lut generation matrix.
package matrix

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/job"
)

type Prompt struct {
	ID   string `yaml:"id"`
	Text string `yaml:"text"`
}

type Matrix struct {
	ClientID string `yaml:"client_id"`
	Analyze  bool   `yaml:"analyze"`
	Train    struct {
		Enabled bool  `yaml:"enabled"`
		Steps   []int `yaml:"steps"`
	} `yaml:"train"`
	Variants []string `yaml:"variants"`
	Lut      []bool   `yaml:"lut"`
	Prompts  []Prompt `yaml:"prompts"`
}

func Load(path string) (*Matrix, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return Parse(data)
}

func Parse(data []byte) (*Matrix, error) {
	m := &Matrix{}
	if err := yaml.Unmarshal(data, m); err != nil {
		return nil, fmt.Errorf("matrix: ongeldige yaml: %w", err)
	}
	if m.ClientID == "" {
		m.ClientID = "act-case"
	}
	if len(m.Variants) == 0 {
		m.Variants = []string{"prompt", "multiref", "lora"}
	}
	if len(m.Lut) == 0 {
		m.Lut = []bool{false, true}
	}
	if m.Train.Enabled && len(m.Train.Steps) == 0 {
		m.Train.Steps = []int{1000}
	}
	for _, v := range m.Variants {
		switch job.Variant(v) {
		case job.VariantPrompt, job.VariantMultiref, job.VariantLora:
		default:
			return nil, fmt.Errorf("matrix: onbekende variant %q", v)
		}
	}
	seen := map[string]bool{}
	for i, p := range m.Prompts {
		if p.ID == "" {
			return nil, fmt.Errorf("matrix: prompt %d mist een id", i+1)
		}
		if p.Text == "" {
			return nil, fmt.Errorf("matrix: prompt %q mist tekst", p.ID)
		}
		if seen[p.ID] {
			return nil, fmt.Errorf("matrix: dubbele prompt-id %q", p.ID)
		}
		seen[p.ID] = true
	}
	return m, nil
}

// Expand returns the jobs in execution order: analyze first, then training
// (sequential, the generates need the LoRA), then the generation matrix.
func (m *Matrix) Expand() (analyze []job.Job, train []job.Job, generate []job.Job) {
	if m.Analyze {
		analyze = append(analyze, job.New(job.TypeAnalyze, m.ClientID))
	}
	if m.Train.Enabled {
		for _, steps := range m.Train.Steps {
			j := job.New(job.TypeTrain, m.ClientID)
			j.Steps = steps
			train = append(train, j)
		}
	}
	for _, p := range m.Prompts {
		for _, v := range m.Variants {
			for _, lut := range m.Lut {
				j := job.New(job.TypeGenerate, m.ClientID)
				j.Variant = job.Variant(v)
				j.LUT = lut
				j.Prompt = p.Text
				j.PromptID = p.ID
				generate = append(generate, j)
			}
		}
	}
	return analyze, train, generate
}
