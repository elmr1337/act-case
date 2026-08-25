package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadDotEnv(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env")
	content := "" +
		"PLAIN=waarde\n" +
		"MET_COMMENT=0.134   # schatting, check actuele prijs\n" +
		"GEQUOTE=\"met # in de waarde\"\n" +
		"HASH_ZONDER_SPATIE=abc#def\n" +
		"AL_GEZET=uit-dotenv\n" +
		"# COMMENTREGEL=genegeerd\n" +
		"export EXPORTED=ja\n"
	if err := os.WriteFile(envFile, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"PLAIN", "MET_COMMENT", "GEQUOTE", "HASH_ZONDER_SPATIE", "COMMENTREGEL", "EXPORTED"} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}
	t.Setenv("AL_GEZET", "uit-echte-env")

	if err := loadDotEnv(envFile); err != nil {
		t.Fatal(err)
	}
	cases := map[string]string{
		"PLAIN":              "waarde",
		"MET_COMMENT":        "0.134",              // inline comment eraf
		"GEQUOTE":            "met # in de waarde", // quotes beschermen de #
		"HASH_ZONDER_SPATIE": "abc#def",            // # zonder spatie hoort bij de waarde
		"AL_GEZET":           "uit-echte-env",      // echte env wint
		"COMMENTREGEL":       "",
		"EXPORTED":           "ja",
	}
	for k, want := range cases {
		if got := os.Getenv(k); got != want {
			t.Errorf("%s = %q, verwacht %q", k, got, want)
		}
	}
}

// docker --env-file stript geen inline comments; de config moet dat zelf
// afvangen, ook voor waarden die al als env-var binnenkomen.
func TestSanitizeAppliesToRealEnvVars(t *testing.T) {
	t.Setenv("GEMINI_IMAGE_COST_USD", "0.134   # schatting, check actuele prijs")
	t.Setenv("FAL_API_KEY", "sleutel-zonder-hash")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.GeminiImageCostUSD != 0.134 {
		t.Errorf("GeminiImageCostUSD = %v", cfg.GeminiImageCostUSD)
	}
	if cfg.FalAPIKey != "sleutel-zonder-hash" {
		t.Errorf("FalAPIKey = %q", cfg.FalAPIKey)
	}
}
