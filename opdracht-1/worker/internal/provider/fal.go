package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/config"
)

// Fal drives fal.ai via the public queue API: submit -> poll -> fetch result.
// Used for Flux (prompt-only), Flux+LoRA generation and LoRA training.
type Fal struct {
	APIKey     string
	QueueBase  string // https://queue.fal.run
	RestBase   string // https://rest.alpha.fal.ai
	FluxModel  string
	LoraModel  string
	TrainModel string
	ImageSize  string // fal image_size enum, e.g. portrait_4_3

	ImageCostUSD float64 // per gegenereerde afbeelding (config-schatting)
	TrainCostUSD float64 // per 1000 steps (config-schatting)

	HTTP *http.Client
	Logf func(format string, args ...any) // optioneel voortgangslogje
}

func NewFal(cfg *config.Config) *Fal {
	return &Fal{
		APIKey:       cfg.FalAPIKey,
		QueueBase:    cfg.FalQueueBase,
		RestBase:     cfg.FalRestBase,
		FluxModel:    cfg.FalFluxModel,
		LoraModel:    cfg.FalLoraModel,
		TrainModel:   cfg.FalTrainModel,
		ImageSize:    cfg.ImageSize,
		ImageCostUSD: cfg.FalImageCostUSD,
		TrainCostUSD: cfg.FalTrainCostUSD,
		HTTP:         &http.Client{Timeout: 2 * time.Minute},
	}
}

func (f *Fal) logf(format string, args ...any) {
	if f.Logf != nil {
		f.Logf(format, args...)
	}
}

type falQueued struct {
	RequestID   string `json:"request_id"`
	StatusURL   string `json:"status_url"`
	ResponseURL string `json:"response_url"`
}

func (f *Fal) doJSON(ctx context.Context, method, url string, in any, out any) error {
	if f.APIKey == "" {
		return fmt.Errorf("FAL_API_KEY is niet gezet")
	}
	var body io.Reader
	if in != nil {
		data, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Key "+f.APIKey)
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := f.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("fal %s %s: http %d: %s", method, url, resp.StatusCode, truncate(respBody, 600))
	}
	if out != nil {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("fal: onleesbaar antwoord van %s: %w", url, err)
		}
	}
	return nil
}

// submitAndAwait queues a job on a fal model and polls until it completes.
func (f *Fal) submitAndAwait(ctx context.Context, model string, input any, timeout time.Duration) (json.RawMessage, string, error) {
	var q falQueued
	if err := f.doJSON(ctx, http.MethodPost, f.QueueBase+"/"+model, input, &q); err != nil {
		return nil, "", err
	}
	if q.StatusURL == "" || q.ResponseURL == "" {
		return nil, q.RequestID, fmt.Errorf("fal %s: queue-antwoord mist status/response url", model)
	}
	f.logf("fal %s: request %s in de wachtrij", model, q.RequestID)

	deadline := time.Now().Add(timeout)
	lastLog := time.Now()
	for {
		if time.Now().After(deadline) {
			return nil, q.RequestID, fmt.Errorf("fal %s: timeout na %s (request %s)", model, timeout, q.RequestID)
		}
		select {
		case <-time.After(3 * time.Second):
		case <-ctx.Done():
			return nil, q.RequestID, ctx.Err()
		}

		var st struct {
			Status string `json:"status"`
		}
		if err := f.doJSON(ctx, http.MethodGet, q.StatusURL, nil, &st); err != nil {
			// Statuspoll mag haperen; de deadline bewaakt het geheel.
			f.logf("fal %s: statuspoll faalde: %v", model, err)
			continue
		}
		switch st.Status {
		case "COMPLETED":
			var raw json.RawMessage
			if err := f.doJSON(ctx, http.MethodGet, q.ResponseURL, nil, &raw); err != nil {
				return nil, q.RequestID, err
			}
			return raw, q.RequestID, nil
		case "IN_QUEUE", "IN_PROGRESS":
			if time.Since(lastLog) > 20*time.Second {
				f.logf("fal %s: %s (request %s)", model, st.Status, q.RequestID)
				lastLog = time.Now()
			}
		default:
			return nil, q.RequestID, fmt.Errorf("fal %s: onverwachte status %q (request %s)", model, st.Status, q.RequestID)
		}
	}
}

type falImageOut struct {
	Images []struct {
		URL         string `json:"url"`
		ContentType string `json:"content_type"`
	} `json:"images"`
	Seed json.Number `json:"seed"`
}

func (f *Fal) fetchImage(ctx context.Context, raw json.RawMessage, model string) (GenResult, error) {
	var out falImageOut
	if err := json.Unmarshal(raw, &out); err != nil {
		return GenResult{}, fmt.Errorf("fal %s: onleesbare output: %w", model, err)
	}
	if len(out.Images) == 0 {
		return GenResult{}, fmt.Errorf("fal %s: geen afbeeldingen in output: %s", model, truncate(raw, 300))
	}
	img := out.Images[0]

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, img.URL, nil)
	if err != nil {
		return GenResult{}, err
	}
	resp, err := f.HTTP.Do(req)
	if err != nil {
		return GenResult{}, fmt.Errorf("fal %s: download van resultaat faalde: %w", model, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return GenResult{}, fmt.Errorf("fal %s: download gaf http %d", model, resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 128<<20))
	if err != nil {
		return GenResult{}, err
	}

	mime := img.ContentType
	if mime == "" {
		mime = "image/png"
	}
	return GenResult{
		Image:      data,
		MimeType:   mime,
		Provider:   "fal",
		Model:      model,
		CostUSD:    f.ImageCostUSD,
		CostSource: "config",
		Note:       "seed=" + out.Seed.String(),
	}, nil
}

// GenerateFlux is the prompt-only strategy on the same base model as the
// LoRA, so the LoRA delta stays isolated.
func (f *Fal) GenerateFlux(ctx context.Context, prompt string) (GenResult, error) {
	input := map[string]any{
		"prompt":                prompt,
		"image_size":            f.ImageSize,
		"num_images":            1,
		"num_inference_steps":   28,
		"guidance_scale":        3.5,
		"output_format":         "png",
		"enable_safety_checker": true,
	}
	raw, _, err := f.submitAndAwait(ctx, f.FluxModel, input, 10*time.Minute)
	if err != nil {
		return GenResult{}, err
	}
	return f.fetchImage(ctx, raw, f.FluxModel)
}

// GenerateLora runs Flux with the trained style-LoRA attached.
func (f *Fal) GenerateLora(ctx context.Context, prompt, loraURL string) (GenResult, error) {
	if loraURL == "" {
		return GenResult{}, fmt.Errorf("geen LoRA-URL: draai eerst een train-job")
	}
	input := map[string]any{
		"prompt":                prompt,
		"image_size":            f.ImageSize,
		"num_images":            1,
		"num_inference_steps":   28,
		"guidance_scale":        3.5,
		"output_format":         "png",
		"enable_safety_checker": true,
		"loras": []map[string]any{
			{"path": loraURL, "scale": 1.0},
		},
	}
	raw, _, err := f.submitAndAwait(ctx, f.LoraModel, input, 10*time.Minute)
	if err != nil {
		return GenResult{}, err
	}
	res, err := f.fetchImage(ctx, raw, f.LoraModel)
	if err == nil {
		res.Note += " lora=" + loraURL
	}
	return res, err
}

// UploadZip pushes the training archive to fal storage and returns its URL.
func (f *Fal) UploadZip(ctx context.Context, name string, data []byte) (string, error) {
	var init struct {
		UploadURL string `json:"upload_url"`
		FileURL   string `json:"file_url"`
	}
	err := f.doJSON(ctx, http.MethodPost, f.RestBase+"/storage/upload/initiate", map[string]string{
		"file_name":    name,
		"content_type": "application/zip",
	}, &init)
	if err != nil {
		return "", fmt.Errorf("fal storage initiate: %w", err)
	}
	if init.UploadURL == "" || init.FileURL == "" {
		return "", fmt.Errorf("fal storage initiate: antwoord mist upload_url/file_url")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, init.UploadURL, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/zip")
	req.ContentLength = int64(len(data))
	resp, err := f.HTTP.Do(req)
	if err != nil {
		return "", fmt.Errorf("fal storage upload: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("fal storage upload: http %d: %s", resp.StatusCode, truncate(body, 300))
	}
	f.logf("fal storage: %s geüpload (%d bytes)", name, len(data))
	return init.FileURL, nil
}

// Train starts a style-LoRA training on the uploaded archive and waits for
// the result. Settings follow the plan: style mode on, masks/segmentation
// off, steps configurable.
func (f *Fal) Train(ctx context.Context, zipURL string, steps int, triggerWord string) (TrainResult, error) {
	input := map[string]any{
		"images_data_url": zipURL,
		"steps":           steps,
		"trigger_word":    triggerWord,
		"is_style":        true,
		// create_masks staat standaard AAN bij fal; voor een stijl-LoRA
		// expliciet uit (geen subject-segmentatie).
		"create_masks": false,
	}
	raw, reqID, err := f.submitAndAwait(ctx, f.TrainModel, input, 90*time.Minute)
	if err != nil {
		return TrainResult{}, err
	}
	var out struct {
		DiffusersLoraFile struct {
			URL string `json:"url"`
		} `json:"diffusers_lora_file"`
		ConfigFile struct {
			URL string `json:"url"`
		} `json:"config_file"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return TrainResult{}, fmt.Errorf("fal train: onleesbare output: %w", err)
	}
	if out.DiffusersLoraFile.URL == "" {
		return TrainResult{}, fmt.Errorf("fal train: geen diffusers_lora_file in output: %s", truncate(raw, 300))
	}
	return TrainResult{
		LoraURL:    out.DiffusersLoraFile.URL,
		ConfigURL:  out.ConfigFile.URL,
		RequestID:  reqID,
		Steps:      steps,
		Provider:   "fal",
		Model:      f.TrainModel,
		CostUSD:    f.TrainCostUSD * float64(steps) / 1000.0,
		CostSource: "config",
	}, nil
}
