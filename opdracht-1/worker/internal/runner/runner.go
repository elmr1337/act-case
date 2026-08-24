// Package runner executes jobs: it wires store, providers, LUT and cost
// logging together and is shared by the batch mode and the queue consumer.
package runner

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"log"
	"path"
	"strings"
	"sync"
	"time"

	_ "image/jpeg" // register decoder for provider output

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/analyze"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/config"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/cost"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/job"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/lut"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/provider"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/store"
)

const (
	modelLatestKey  = "models/latest.json"
	stylePromptUser = "analysis/style-prompt.txt" // door Elmar bijgewerkt na de merge
	stylePromptAI   = analyze.StylePromptKey      // gegenereerd door de analyze-job
)

type Runner struct {
	Cfg    *config.Config
	Store  store.Store
	Costs  *cost.Log
	Vision analyze.Vision
	Fal    *provider.Fal
	Gemini *provider.Gemini

	lutOnce sync.Once
	lutTab  *lut.LUT
	lutErr  error
}

// ModelMeta is what a train job writes to models/.
type ModelMeta struct {
	LoraURL   string    `json:"lora_url"`
	ConfigURL string    `json:"config_url,omitempty"`
	RequestID string    `json:"request_id,omitempty"`
	Steps     int       `json:"steps"`
	Trigger   string    `json:"trigger_phrase"`
	CreatedAt time.Time `json:"created_at"`
}

// Execute runs one job to completion and returns a short result description
// (typically the output key). A panic in a provider becomes a failed job, not
// a dead worker.
func (r *Runner) Execute(ctx context.Context, j job.Job) (result string, err error) {
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("panic in job %s: %v", j.ID, rec)
		}
	}()
	if err := j.Validate(); err != nil {
		return "", err
	}
	switch j.Type {
	case job.TypeAnalyze:
		res, err := analyze.Run(ctx, r.Store, r.Vision, r.Costs, j.ID, log.Printf)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%d beelden geanalyseerd → %s", res.Images, res.GuideKey), nil
	case job.TypeTrain:
		return r.train(ctx, j)
	case job.TypeGenerate:
		return r.generate(ctx, j)
	}
	return "", fmt.Errorf("onbekend jobtype %q", j.Type)
}

// --- train ------------------------------------------------------------------

func (r *Runner) train(ctx context.Context, j job.Job) (string, error) {
	steps := j.Steps
	if steps <= 0 {
		steps = r.Cfg.TrainSteps
	}
	imgs, err := analyze.ListReferenceImages(ctx, r.Store)
	if err != nil {
		return "", err
	}

	// Zip: afbeelding + caption-bestand met dezelfde basename. De captions
	// beschrijven alleen content; de trigger phrase gaat er hier vóór zodat
	// de stijl aan de trigger bindt en niet aan de onderwerpen.
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, key := range imgs {
		data, err := r.Store.Read(ctx, key)
		if err != nil {
			return "", err
		}
		name := path.Base(key)
		w, err := zw.Create(name)
		if err != nil {
			return "", err
		}
		if _, err := w.Write(data); err != nil {
			return "", err
		}

		base := strings.TrimSuffix(name, path.Ext(name))
		capData, err := r.Store.Read(ctx, analyze.CaptionsDir+"/"+base+".txt")
		if err != nil {
			return "", fmt.Errorf("caption voor %s ontbreekt — draai eerst de analyze-job (worker analyze): %w", name, err)
		}
		caption := r.Cfg.TriggerPhrase + ", " + strings.TrimSpace(string(capData))
		cw, err := zw.Create(base + ".txt")
		if err != nil {
			return "", err
		}
		if _, err := cw.Write([]byte(caption)); err != nil {
			return "", err
		}
	}
	if err := zw.Close(); err != nil {
		return "", err
	}
	log.Printf("train: %d beelden + captions gezipt (%d bytes), uploaden naar fal", len(imgs), buf.Len())

	zipURL, err := r.Fal.UploadZip(ctx, fmt.Sprintf("act-training-%s.zip", j.ID[:8]), buf.Bytes())
	if err != nil {
		return "", err
	}
	res, err := r.Fal.Train(ctx, zipURL, steps, r.Cfg.TriggerPhrase)
	if err != nil {
		return "", err
	}

	meta := ModelMeta{
		LoraURL:   res.LoraURL,
		ConfigURL: res.ConfigURL,
		RequestID: res.RequestID,
		Steps:     res.Steps,
		Trigger:   r.Cfg.TriggerPhrase,
		CreatedAt: time.Now().UTC(),
	}
	metaJSON, _ := json.MarshalIndent(meta, "", "  ")
	if err := r.Store.Write(ctx, fmt.Sprintf("models/lora-%d.json", steps), metaJSON); err != nil {
		return "", err
	}
	if err := r.Store.Write(ctx, modelLatestKey, metaJSON); err != nil {
		return "", err
	}

	_ = r.Costs.Append(ctx, cost.Entry{
		JobID: j.ID, Type: "train", Provider: res.Provider, Model: res.Model,
		Images: len(imgs), USD: res.CostUSD, Source: res.CostSource,
		Note: fmt.Sprintf("steps=%d request=%s", steps, res.RequestID),
	})
	return res.LoraURL, nil
}

// --- generate ---------------------------------------------------------------

func (r *Runner) generate(ctx context.Context, j job.Job) (string, error) {
	var (
		gen provider.GenResult
		err error
	)
	switch j.Variant {
	case job.VariantPrompt:
		stylePrompt, serr := r.stylePrompt(ctx)
		if serr != nil {
			return "", serr
		}
		full := fmt.Sprintf("%s. Photographic style: %s", j.Prompt, stylePrompt)
		gen, err = r.Fal.GenerateFlux(ctx, full)
	case job.VariantMultiref:
		refs, rerr := r.pickRefs(ctx, 5)
		if rerr != nil {
			return "", rerr
		}
		instruction := fmt.Sprintf(
			"Create a brand-new photograph in exactly the photographic style of the attached reference images: match their lighting, color grade, palette, composition style, lens feel, depth of field and mood precisely. "+
				"Do not copy or reuse any person, face or specific location from the references; this must be an entirely new scene. New subject: %s", j.Prompt)
		gen, err = r.Gemini.GenerateWithRefs(ctx, instruction, refs)
	case job.VariantLora:
		loraURL := j.LoraURL
		if loraURL == "" {
			meta, merr := r.latestModel(ctx)
			if merr != nil {
				return "", merr
			}
			loraURL = meta.LoraURL
		}
		full := fmt.Sprintf("%s, %s", r.Cfg.TriggerPhrase, j.Prompt)
		gen, err = r.Fal.GenerateLora(ctx, full, loraURL)
	default:
		return "", fmt.Errorf("onbekende variant %q", j.Variant)
	}
	if err != nil {
		return "", err
	}

	img, err := ensurePNG(gen.Image, gen.MimeType)
	if err != nil {
		return "", err
	}
	if j.LUT {
		l, lerr := r.loadLUT(ctx)
		if lerr != nil {
			return "", lerr
		}
		if img, err = l.ApplyPNG(img); err != nil {
			return "", err
		}
	}

	dir := "outputs/" + string(j.Variant)
	if j.LUT {
		dir += "-lut"
	}
	name := j.PromptID
	if name == "" {
		name = j.ID[:8]
	}
	key := dir + "/" + name + ".png"
	if err := r.Store.Write(ctx, key, img); err != nil {
		return "", err
	}

	_ = r.Costs.Append(ctx, cost.Entry{
		JobID: j.ID, Type: "generate", Variant: string(j.Variant), LUT: j.LUT,
		PromptID: j.PromptID, Provider: gen.Provider, Model: gen.Model,
		Images: 1, USD: gen.CostUSD, Source: gen.CostSource, Note: gen.Note,
	})
	return key, nil
}

// stylePrompt prefers the human-merged version, falls back to the AI one.
func (r *Runner) stylePrompt(ctx context.Context) (string, error) {
	for _, key := range []string{stylePromptUser, stylePromptAI} {
		if data, err := r.Store.Read(ctx, key); err == nil && len(bytes.TrimSpace(data)) > 0 {
			return string(bytes.TrimSpace(data)), nil
		}
	}
	return "", fmt.Errorf("geen style prompt gevonden (%s of %s) — draai eerst de analyze-job", stylePromptUser, stylePromptAI)
}

func (r *Runner) latestModel(ctx context.Context) (ModelMeta, error) {
	data, err := r.Store.Read(ctx, modelLatestKey)
	if err != nil {
		return ModelMeta{}, fmt.Errorf("geen getrainde LoRA gevonden (%s) — draai eerst een train-job: %w", modelLatestKey, err)
	}
	var meta ModelMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return ModelMeta{}, fmt.Errorf("%s is corrupt: %w", modelLatestKey, err)
	}
	if meta.LoraURL == "" {
		return ModelMeta{}, fmt.Errorf("%s bevat geen lora_url", modelLatestKey)
	}
	return meta, nil
}

// pickRefs selects up to max reference images, spread over the sorted set so
// the style sample stays representative.
func (r *Runner) pickRefs(ctx context.Context, max int) ([]provider.RefImage, error) {
	keys, err := analyze.ListReferenceImages(ctx, r.Store)
	if err != nil {
		return nil, err
	}
	selected := keys
	if len(keys) > max {
		selected = make([]string, 0, max)
		for i := 0; i < max; i++ {
			idx := i * (len(keys) - 1) / (max - 1)
			selected = append(selected, keys[idx])
		}
	}
	var refs []provider.RefImage
	for _, k := range selected {
		data, err := r.Store.Read(ctx, k)
		if err != nil {
			return nil, err
		}
		refs = append(refs, provider.RefImage{Data: data, Mime: analyze.MimeFor(k)})
	}
	return refs, nil
}

func (r *Runner) loadLUT(ctx context.Context) (*lut.LUT, error) {
	r.lutOnce.Do(func() {
		data, err := r.Store.Read(ctx, r.Cfg.LutPath)
		if err != nil {
			r.lutErr = fmt.Errorf("LUT %s niet gevonden — exporteer de .cube uit Photoshop/Resolve of draai met lut: [false]: %w", r.Cfg.LutPath, err)
			return
		}
		r.lutTab, r.lutErr = lut.Parse(bytes.NewReader(data))
	})
	return r.lutTab, r.lutErr
}

// ensurePNG passes PNG bytes through untouched and transcodes anything else.
func ensurePNG(data []byte, mime string) ([]byte, error) {
	if strings.Contains(mime, "png") {
		return data, nil
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("output (%s) niet te decoderen: %w", mime, err)
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
