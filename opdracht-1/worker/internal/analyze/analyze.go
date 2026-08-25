// Package analyze implements the analyze job: per-image vision analysis with
// a strict content/style split, aggregation into a style guide, and the
// caption files the LoRA training needs.
package analyze

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"sort"
	"strings"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/cost"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/imaging"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/provider"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/store"
)

// Vision is the pluggable analysis provider (gemini or anthropic).
type Vision interface {
	AnalyzeImage(ctx context.Context, image []byte, mime, prompt string) (string, provider.Usage, error)
	GenerateText(ctx context.Context, prompt string, jsonMode bool) (string, provider.Usage, error)
	Name() string
	Model() string
	CostFor(u provider.Usage) (float64, string)
}

const (
	RefPrefix      = "data/reference"
	ImagesDir      = "analysis/ai/images"
	CaptionsDir    = "analysis/ai/captions"
	GuideKey       = "analysis/ai/aggregated-style-guide.md"
	StylePromptKey = "analysis/ai/style-prompt.txt"
	MergedStyleKey = "analysis/style-prompt.txt" // optioneel, door Elmar bijgewerkt na de merge
)

var imageExts = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".webp": "image/webp",
}

// MimeFor returns the mime type for an image key, or "" if unsupported.
func MimeFor(key string) string { return imageExts[strings.ToLower(path.Ext(key))] }

// ListReferenceImages returns the sorted campaign images from the store.
func ListReferenceImages(ctx context.Context, st store.Store) ([]string, error) {
	keys, err := st.List(ctx, RefPrefix)
	if err != nil {
		return nil, err
	}
	var imgs []string
	for _, k := range keys {
		if MimeFor(k) != "" {
			imgs = append(imgs, k)
		}
	}
	sort.Strings(imgs)
	if len(imgs) == 0 {
		return nil, fmt.Errorf("geen reference-beelden gevonden onder %s/ — zet de originele campagnefoto's in ./data/reference/ (jpg/png/webp)", RefPrefix)
	}
	return imgs, nil
}

// perImagePrompt forces a strict split: content (becomes the LoRA caption)
// versus style (becomes the style guide). Mixing the two is exactly what
// causes content leakage in style training, hence the hard rules.
const perImagePrompt = `You are a photography analyst deconstructing one image from an advertising campaign.
Return ONLY a single JSON object (no markdown fences, no commentary) with exactly two top-level keys: "content" and "style".

"content" describes WHAT is depicted and must contain zero photographic-style vocabulary:
{
  "person": "age range, gender presentation, notable physical features",
  "action": "what the person is doing",
  "setting": "location / environment",
  "clothing": "outfit description",
  "caption": "ONE factual sentence combining person + action + setting in plain language. No lighting, color, mood or camera words. This is used verbatim as a training caption."
}

"style" describes HOW it is photographed and must not mention the subject or objects:
{
  "lighting": {"direction": "...", "quality": "hard|soft|diffused|...", "temperature": "warm|neutral|cool, approx Kelvin if you can"},
  "palette": [{"hex": "#RRGGBB", "role": "dominant|secondary|accent|skin|background"}],
  "composition": "framing, subject placement, negative space, camera height and angle",
  "lens": {"focal_length_impression": "e.g. 35mm/85mm look", "depth_of_field": "shallow|deep, bokeh character"},
  "grading": "contrast curve, saturation, color cast, highlight and shadow treatment",
  "mood": "overall atmosphere in a few words"
}

Give 4 to 6 palette swatches. Be specific and technical; avoid generic wording.`

const aggregatePromptHeader = `You are distilling one coherent visual style guide from per-image style analyses of a single advertising campaign. The guide will drive AI image generation, so every statement must be concrete and reproducible.

Write Markdown with exactly these sections:

# Campaign style guide (AI-analyse)
## Lighting
## Color palette
(as a table: hex | role | where it shows up)
## Composition & framing
## Lens & depth of field
## Grading
## Mood
## Do's
(5-8 concrete, testable bullets)
## Don'ts
(5-8 concrete, testable bullets)

After the guide, output one distilled style prompt of at most 60 words that captures ONLY the photographic style (never subjects or locations), usable as a suffix for a text-to-image model. Wrap it EXACTLY like this:

<style_prompt>
...
</style_prompt>

Per-image style analyses (JSON):
`

var stylePromptRe = regexp.MustCompile(`(?s)<style_prompt>\s*(.*?)\s*</style_prompt>`)

// imageAnalysis is the minimal shape we validate; the full JSON is stored as-is.
type imageAnalysis struct {
	Content struct {
		Person  string `json:"person"`
		Action  string `json:"action"`
		Setting string `json:"setting"`
		Caption string `json:"caption"`
	} `json:"content"`
	Style json.RawMessage `json:"style"`
}

type Result struct {
	Images      int
	GuideKey    string
	StyleKey    string
	CaptionsDir string
}

// Run executes the full analyze job. maxEdge caps the pixel size of images
// sent to the vision model.
func Run(ctx context.Context, st store.Store, v Vision, costs *cost.Log, jobID string, maxEdge int, logf func(string, ...any)) (Result, error) {
	if logf == nil {
		logf = func(string, ...any) {}
	}
	imgs, err := ListReferenceImages(ctx, st)
	if err != nil {
		return Result{}, err
	}
	logf("analyze: %d reference-beelden via %s (%s)", len(imgs), v.Name(), v.Model())

	type styleBlock struct {
		Image string          `json:"image"`
		Style json.RawMessage `json:"style"`
	}
	var styles []styleBlock

	for _, key := range imgs {
		data, err := st.Read(ctx, key)
		if err != nil {
			return Result{}, err
		}
		if data, err = imaging.Downscale(data, maxEdge); err != nil {
			return Result{}, fmt.Errorf("%s: %w", key, err)
		}
		parsed, raw, usage, err := analyzeOne(ctx, v, data, "image/jpeg")
		if err != nil {
			return Result{}, fmt.Errorf("analyse van %s faalde: %w", key, err)
		}
		base := strings.TrimSuffix(path.Base(key), path.Ext(key))

		var pretty map[string]any
		_ = json.Unmarshal(raw, &pretty)
		prettyJSON, _ := json.MarshalIndent(pretty, "", "  ")
		if err := st.Write(ctx, ImagesDir+"/"+base+".json", prettyJSON); err != nil {
			return Result{}, err
		}

		caption := strings.TrimSpace(parsed.Content.Caption)
		if caption == "" {
			caption = strings.TrimSpace(strings.Join([]string{parsed.Content.Person, parsed.Content.Action, parsed.Content.Setting}, ", "))
		}
		if err := st.Write(ctx, CaptionsDir+"/"+base+".txt", []byte(caption+"\n")); err != nil {
			return Result{}, err
		}

		usd, src := v.CostFor(usage)
		_ = costs.Append(ctx, cost.Entry{
			JobID: jobID, Type: "analyze", Provider: v.Name(), Model: v.Model(),
			Images: 1, InputTokens: usage.InputTokens, OutputTokens: usage.OutputTokens,
			USD: usd, Source: src, Note: key,
		})
		styles = append(styles, styleBlock{Image: path.Base(key), Style: parsed.Style})
		logf("analyze: %s klaar (caption: %q)", path.Base(key), caption)
	}

	// Aggregatie: alle style-blokken -> één style guide + distilled prompt.
	blockJSON, err := json.MarshalIndent(styles, "", "  ")
	if err != nil {
		return Result{}, err
	}
	guide, usage, err := v.GenerateText(ctx, aggregatePromptHeader+string(blockJSON), false)
	if err != nil {
		return Result{}, fmt.Errorf("aggregatie van de stijlanalyse faalde: %w", err)
	}
	usd, src := v.CostFor(usage)
	_ = costs.Append(ctx, cost.Entry{
		JobID: jobID, Type: "analyze", Provider: v.Name(), Model: v.Model(),
		InputTokens: usage.InputTokens, OutputTokens: usage.OutputTokens,
		USD: usd, Source: src, Note: "aggregatie style guide",
	})

	stylePrompt := ""
	if m := stylePromptRe.FindStringSubmatch(guide); m != nil {
		stylePrompt = strings.TrimSpace(m[1])
	}
	if stylePrompt == "" {
		logf("analyze: geen <style_prompt> gevonden, destilleer apart")
		distilled, u2, err := v.GenerateText(ctx,
			"Distill the following photography style guide into a single style prompt of at most 60 words for a text-to-image model. Style only, no subjects. Output only the prompt text.\n\n"+guide, false)
		if err != nil {
			return Result{}, fmt.Errorf("style prompt destilleren faalde: %w", err)
		}
		usd2, src2 := v.CostFor(u2)
		_ = costs.Append(ctx, cost.Entry{
			JobID: jobID, Type: "analyze", Provider: v.Name(), Model: v.Model(),
			InputTokens: u2.InputTokens, OutputTokens: u2.OutputTokens,
			USD: usd2, Source: src2, Note: "style prompt destillatie",
		})
		stylePrompt = strings.TrimSpace(distilled)
	}

	if err := st.Write(ctx, GuideKey, []byte(guide)); err != nil {
		return Result{}, err
	}
	if err := st.Write(ctx, StylePromptKey, []byte(stylePrompt+"\n")); err != nil {
		return Result{}, err
	}
	return Result{Images: len(imgs), GuideKey: GuideKey, StyleKey: StylePromptKey, CaptionsDir: CaptionsDir}, nil
}

// analyzeOne calls the vision model and validates the JSON contract, with one
// retry that repeats the format requirement.
func analyzeOne(ctx context.Context, v Vision, img []byte, mime string) (imageAnalysis, []byte, provider.Usage, error) {
	var total provider.Usage
	prompt := perImagePrompt
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		text, usage, err := v.AnalyzeImage(ctx, img, mime, prompt)
		total.InputTokens += usage.InputTokens
		total.OutputTokens += usage.OutputTokens
		if err != nil {
			return imageAnalysis{}, nil, total, err
		}
		raw := []byte(StripFences(text))
		var parsed imageAnalysis
		if err := json.Unmarshal(raw, &parsed); err != nil {
			lastErr = fmt.Errorf("geen geldige JSON: %w", err)
			prompt = perImagePrompt + "\n\nIMPORTANT: your previous answer was not valid JSON. Return ONLY the raw JSON object."
			continue
		}
		if len(parsed.Style) == 0 {
			lastErr = fmt.Errorf("JSON mist het style-blok")
			prompt = perImagePrompt + "\n\nIMPORTANT: the JSON object must contain both \"content\" and \"style\"."
			continue
		}
		return parsed, raw, total, nil
	}
	return imageAnalysis{}, nil, total, lastErr
}

// StripFences removes a wrapping ```json ... ``` fence if the model added one.
func StripFences(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(strings.TrimSpace(s), "```")
	return strings.TrimSpace(s)
}
