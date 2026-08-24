package job

import (
	"strings"
	"testing"
	"time"
)

// The queue serialisation contract: a Job must survive a JSON round trip
// exactly, both via MarshalBinary (go-redis path) and plain encoding/json.
func TestJobSerializationRoundTrip(t *testing.T) {
	orig := Job{
		ID:        NewID(),
		Type:      TypeGenerate,
		ClientID:  "act-case",
		Variant:   VariantLora,
		LUT:       true,
		Prompt:    "een man leest de krant in een tram",
		PromptID:  "p1",
		Steps:     1000,
		LoraURL:   "https://example.com/lora.safetensors",
		CreatedAt: time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC),
	}

	data, err := orig.MarshalBinary()
	if err != nil {
		t.Fatalf("MarshalBinary: %v", err)
	}
	var back Job
	if err := back.UnmarshalBinary(data); err != nil {
		t.Fatalf("UnmarshalBinary: %v", err)
	}
	if back != orig {
		t.Fatalf("round trip mismatch:\n voor: %+v\n na:   %+v", orig, back)
	}
}

func TestJobOmitsEmptyOptionalFields(t *testing.T) {
	j := New(TypeAnalyze, "act-case")
	data, err := j.MarshalBinary()
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"variant", "prompt", "steps", "lora_url", "prompt_id"} {
		if strings.Contains(string(data), `"`+field+`"`) {
			t.Errorf("leeg optioneel veld %q hoort niet in de payload: %s", field, data)
		}
	}
}

func TestValidate(t *testing.T) {
	ok := New(TypeGenerate, "act-case")
	ok.Variant = VariantPrompt
	ok.Prompt = "test"
	if err := ok.Validate(); err != nil {
		t.Errorf("geldige job afgekeurd: %v", err)
	}

	bad := New(TypeGenerate, "act-case")
	bad.Prompt = "test" // geen variant
	if err := bad.Validate(); err == nil {
		t.Error("generate zonder variant moet afgekeurd worden")
	}

	noPrompt := New(TypeGenerate, "act-case")
	noPrompt.Variant = VariantMultiref
	if err := noPrompt.Validate(); err == nil {
		t.Error("generate zonder prompt moet afgekeurd worden")
	}
}

func TestNewIDShape(t *testing.T) {
	id := NewID()
	if len(id) != 36 || strings.Count(id, "-") != 4 {
		t.Fatalf("geen uuid-vorm: %q", id)
	}
	if id == NewID() {
		t.Fatal("twee ids identiek")
	}
}
