// Package config loads worker configuration from the environment, with an
// optional .env file. Defaults are chosen so the worker runs with zero infra:
// memory queue, local filesystem store.
package config

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	// Drivers
	QueueDriver string // memory | redis
	StoreDriver string // local | s3
	StoreRoot   string // base dir for everything that is not data/ or outputs/
	DataDir     string // local dir behind the "data/" key prefix
	OutputDir   string // local dir behind the "outputs/" key prefix

	// Redis (QUEUE_DRIVER=redis)
	RedisURL string

	// S3 (STORE_DRIVER=s3, Hetzner Object Storage compatible)
	S3Endpoint  string
	S3Region    string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string

	// Provider keys
	FalAPIKey       string
	GeminiAPIKey    string
	AnthropicAPIKey string

	// Models / endpoints
	AnalyzeProvider    string // gemini | anthropic
	AnthropicModel     string
	GeminiAnalyzeModel string
	GeminiImageModel   string
	GeminiBaseURL      string
	FalFluxModel       string
	FalLoraModel       string
	FalTrainModel      string
	FalQueueBase       string
	FalRestBase        string

	// Generation settings
	TriggerPhrase string
	LutPath       string
	Concurrency   int
	ImageSize     string // fal image_size enum, e.g. portrait_4_3
	ImageAspect   string // gemini aspectRatio, e.g. 3:4
	TrainSteps    int

	// Cost config (used when the provider response carries no cost)
	GeminiImageCostUSD   float64
	GeminiInCostPerMTok  float64
	GeminiOutCostPerMTok float64
	FalImageCostUSD      float64
	FalTrainCostUSD      float64 // per 1000 steps
	AnthropicInPerMTok   float64
	AnthropicOutPerMTok  float64
}

func Load() (*Config, error) {
	// .env is optional and never overrides real environment variables.
	if err := loadDotEnv(".env"); err != nil {
		return nil, err
	}

	c := &Config{
		QueueDriver: getenv("QUEUE_DRIVER", "memory"),
		StoreDriver: getenv("STORE_DRIVER", "local"),
		StoreRoot:   getenv("STORE_ROOT", "."),
		DataDir:     getenv("DATA_DIR", "./data"),
		OutputDir:   getenv("OUTPUT_DIR", "./outputs"),

		RedisURL: os.Getenv("REDIS_URL"),

		S3Endpoint:  os.Getenv("S3_ENDPOINT"),
		S3Region:    os.Getenv("S3_REGION"),
		S3Bucket:    os.Getenv("S3_BUCKET"),
		S3AccessKey: os.Getenv("S3_ACCESS_KEY"),
		S3SecretKey: os.Getenv("S3_SECRET_KEY"),

		FalAPIKey:       os.Getenv("FAL_API_KEY"),
		GeminiAPIKey:    os.Getenv("GEMINI_API_KEY"),
		AnthropicAPIKey: os.Getenv("ANTHROPIC_API_KEY"),

		AnalyzeProvider:    getenv("ANALYZE_PROVIDER", "gemini"),
		AnthropicModel:     getenv("ANTHROPIC_MODEL", "claude-opus-5"),
		GeminiAnalyzeModel: getenv("GEMINI_ANALYZE_MODEL", "gemini-2.5-flash"),
		GeminiImageModel:   getenv("GEMINI_IMAGE_MODEL", "gemini-3-pro-image-preview"),
		GeminiBaseURL:      getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
		FalFluxModel:       getenv("FAL_FLUX_MODEL", "fal-ai/flux/dev"),
		FalLoraModel:       getenv("FAL_LORA_MODEL", "fal-ai/flux-lora"),
		FalTrainModel:      getenv("FAL_TRAIN_MODEL", "fal-ai/flux-lora-fast-training"),
		FalQueueBase:       getenv("FAL_QUEUE_BASE", "https://queue.fal.run"),
		FalRestBase:        getenv("FAL_REST_BASE", "https://rest.alpha.fal.ai"),

		TriggerPhrase: getenv("TRIGGER_PHRASE", "ACTCAMP style"),
		LutPath:       getenv("LUT_PATH", "lut/campaign.cube"),
		ImageSize:     getenv("IMAGE_SIZE", "portrait_4_3"),
		ImageAspect:   getenv("IMAGE_ASPECT", "3:4"),
	}

	var err error
	if c.Concurrency, err = intenv("WORKER_CONCURRENCY", 3); err != nil {
		return nil, err
	}
	if c.TrainSteps, err = intenv("TRAIN_STEPS", 1000); err != nil {
		return nil, err
	}
	if c.GeminiImageCostUSD, err = floatenv("GEMINI_IMAGE_COST_USD", 0.134); err != nil {
		return nil, err
	}
	if c.GeminiInCostPerMTok, err = floatenv("GEMINI_IN_COST_PER_MTOK", 0.30); err != nil {
		return nil, err
	}
	if c.GeminiOutCostPerMTok, err = floatenv("GEMINI_OUT_COST_PER_MTOK", 2.50); err != nil {
		return nil, err
	}
	if c.FalImageCostUSD, err = floatenv("FAL_IMAGE_COST_USD", 0.025); err != nil {
		return nil, err
	}
	if c.FalTrainCostUSD, err = floatenv("FAL_TRAIN_COST_USD", 2.00); err != nil {
		return nil, err
	}
	if c.AnthropicInPerMTok, err = floatenv("ANTHROPIC_IN_COST_PER_MTOK", 5.00); err != nil {
		return nil, err
	}
	if c.AnthropicOutPerMTok, err = floatenv("ANTHROPIC_OUT_COST_PER_MTOK", 25.00); err != nil {
		return nil, err
	}
	return c, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func intenv(key string, def int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("config: %s is geen getal: %q", key, v)
	}
	return n, nil
}

func floatenv(key string, def float64) (float64, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, fmt.Errorf("config: %s is geen getal: %q", key, v)
	}
	return f, nil
}

// loadDotEnv reads KEY=VALUE lines from path into the process environment.
// Existing environment variables win. A missing file is not an error.
func loadDotEnv(path string) error {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		v = strings.Trim(v, `"'`)
		if k == "" || os.Getenv(k) != "" {
			continue
		}
		os.Setenv(k, v)
	}
	return sc.Err()
}
