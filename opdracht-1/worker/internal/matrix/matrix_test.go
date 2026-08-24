package matrix

import "testing"

const sample = `
client_id: act-case
analyze: true
train:
  enabled: true
  steps: [500, 1000]
variants: [prompt, multiref, lora]
lut: [false, true]
prompts:
  - id: p1
    text: "een vrouw wacht op de bus"
  - id: p2
    text: "een man leest de krant"
  - id: p3
    text: "twee kinderen spelen in een park"
`

func TestExpandFullMatrix(t *testing.T) {
	m, err := Parse([]byte(sample))
	if err != nil {
		t.Fatal(err)
	}
	analyze, train, gen := m.Expand()
	if len(analyze) != 1 || len(train) != 2 {
		t.Fatalf("analyze=%d train=%d", len(analyze), len(train))
	}
	// 3 prompts x 3 varianten x 2 lut-standen = 18 outputs, conform het plan.
	if len(gen) != 18 {
		t.Fatalf("verwacht 18 generate-jobs, kreeg %d", len(gen))
	}
	if train[0].Steps != 500 || train[1].Steps != 1000 {
		t.Fatalf("steps niet overgenomen: %+v", train)
	}
	for _, j := range gen {
		if err := j.Validate(); err != nil {
			t.Errorf("gegenereerde job ongeldig: %v", err)
		}
	}
}

func TestParseRejectsBrokenInput(t *testing.T) {
	cases := map[string]string{
		"onbekende variant": "variants: [dalle]\nprompts: [{id: a, text: x}]",
		"prompt zonder id":  "prompts: [{text: x}]",
		"dubbele id":        "prompts: [{id: a, text: x}, {id: a, text: y}]",
		"kapotte yaml":      ": [",
	}
	for name, src := range cases {
		if _, err := Parse([]byte(src)); err == nil {
			t.Errorf("%s: verwachtte een fout", name)
		}
	}
}

func TestDefaults(t *testing.T) {
	m, err := Parse([]byte("prompts: [{id: a, text: x}]"))
	if err != nil {
		t.Fatal(err)
	}
	if m.ClientID != "act-case" || len(m.Variants) != 3 || len(m.Lut) != 2 {
		t.Fatalf("defaults kloppen niet: %+v", m)
	}
	_, _, gen := m.Expand()
	if len(gen) != 6 {
		t.Fatalf("1 prompt hoort 6 cellen te geven, kreeg %d", len(gen))
	}
}
