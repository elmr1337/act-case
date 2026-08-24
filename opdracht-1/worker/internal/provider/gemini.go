package provider

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/config"
)

// Gemini talks to the Google generative language API (generateContent) for
// two roles: vision analysis of the reference set, and multi-reference image
// generation ("Nano Banana Pro").
type Gemini struct {
	APIKey       string
	BaseURL      string
	AnalyzeModel string
	ImageModel   string
	Aspect       string // e.g. "3:4"
	ImageCostUSD float64
	InPerMTok    float64
	OutPerMTok   float64
	HTTP         *http.Client
}

func NewGemini(cfg *config.Config) *Gemini {
	return &Gemini{
		APIKey:       cfg.GeminiAPIKey,
		BaseURL:      cfg.GeminiBaseURL,
		AnalyzeModel: cfg.GeminiAnalyzeModel,
		ImageModel:   cfg.GeminiImageModel,
		Aspect:       cfg.ImageAspect,
		ImageCostUSD: cfg.GeminiImageCostUSD,
		InPerMTok:    cfg.GeminiInCostPerMTok,
		OutPerMTok:   cfg.GeminiOutCostPerMTok,
		HTTP:         &http.Client{Timeout: 5 * time.Minute},
	}
}

func (g *Gemini) Name() string  { return "gemini" }
func (g *Gemini) Model() string { return g.AnalyzeModel }

// CostFor prices an analyze call: token counts from the response, price per
// megatoken from config.
func (g *Gemini) CostFor(u Usage) (float64, string) {
	return float64(u.InputTokens)*g.InPerMTok/1e6 + float64(u.OutputTokens)*g.OutPerMTok/1e6, "config"
}

// --- wire types -------------------------------------------------------------
// Requests use snake_case as documented; responses arrive in camelCase, so
// geminiPart accepts both.

type geminiInline struct {
	MimeType string `json:"mime_type,omitempty"`
	Data     string `json:"data,omitempty"`
}

type geminiPart struct {
	Text       string        `json:"text,omitempty"`
	InlineData *geminiInline `json:"inline_data,omitempty"`
}

func (p *geminiPart) UnmarshalJSON(b []byte) error {
	var raw struct {
		Text        string `json:"text"`
		InlineSnake *struct {
			MimeType string `json:"mime_type"`
			Data     string `json:"data"`
		} `json:"inline_data"`
		InlineCamel *struct {
			MimeType string `json:"mimeType"`
			Data     string `json:"data"`
		} `json:"inlineData"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return err
	}
	p.Text = raw.Text
	if raw.InlineSnake != nil {
		p.InlineData = &geminiInline{MimeType: raw.InlineSnake.MimeType, Data: raw.InlineSnake.Data}
	} else if raw.InlineCamel != nil {
		p.InlineData = &geminiInline{MimeType: raw.InlineCamel.MimeType, Data: raw.InlineCamel.Data}
	}
	return nil
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiImageConfig struct {
	AspectRatio string `json:"aspectRatio,omitempty"`
}

type geminiGenCfg struct {
	Temperature        *float64           `json:"temperature,omitempty"`
	ResponseMimeType   string             `json:"responseMimeType,omitempty"`
	ResponseModalities []string           `json:"responseModalities,omitempty"`
	ImageConfig        *geminiImageConfig `json:"imageConfig,omitempty"`
}

type geminiReq struct {
	Contents         []geminiContent `json:"contents"`
	GenerationConfig *geminiGenCfg   `json:"generationConfig,omitempty"`
}

type geminiResp struct {
	Candidates []struct {
		Content      geminiContent `json:"content"`
		FinishReason string        `json:"finishReason"`
	} `json:"candidates"`
	PromptFeedback *struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
	UsageMetadata *struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
	} `json:"usageMetadata"`
}

// ----------------------------------------------------------------------------

func (g *Gemini) call(ctx context.Context, model string, req geminiReq) (*geminiResp, error) {
	if g.APIKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY is niet gezet")
	}
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/models/%s:generateContent", g.BaseURL, model)

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(time.Duration(attempt*3) * time.Second):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("x-goog-api-key", g.APIKey)

		resp, err := g.HTTP.Do(httpReq)
		if err != nil {
			lastErr = err
			continue
		}
		respBody, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("gemini %s: http %d: %s", model, resp.StatusCode, truncate(respBody, 300))
			continue
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("gemini %s: http %d: %s", model, resp.StatusCode, truncate(respBody, 600))
		}
		var out geminiResp
		if err := json.Unmarshal(respBody, &out); err != nil {
			return nil, fmt.Errorf("gemini %s: onleesbaar antwoord: %w", model, err)
		}
		if out.PromptFeedback != nil && out.PromptFeedback.BlockReason != "" {
			return nil, fmt.Errorf("gemini %s: prompt geblokkeerd: %s", model, out.PromptFeedback.BlockReason)
		}
		if len(out.Candidates) == 0 {
			return nil, fmt.Errorf("gemini %s: geen candidates in antwoord", model)
		}
		return &out, nil
	}
	return nil, fmt.Errorf("gemini %s: opgegeven na 3 pogingen: %w", model, lastErr)
}

func (g *Gemini) usage(r *geminiResp) Usage {
	if r.UsageMetadata == nil {
		return Usage{}
	}
	return Usage{InputTokens: r.UsageMetadata.PromptTokenCount, OutputTokens: r.UsageMetadata.CandidatesTokenCount}
}

func firstText(r *geminiResp) string {
	for _, p := range r.Candidates[0].Content.Parts {
		if p.Text != "" {
			return p.Text
		}
	}
	return ""
}

// AnalyzeImage sends one image plus the analysis prompt and returns the raw
// (JSON) text response.
func (g *Gemini) AnalyzeImage(ctx context.Context, image []byte, mime, prompt string) (string, Usage, error) {
	temp := 0.2
	req := geminiReq{
		Contents: []geminiContent{{Parts: []geminiPart{
			{InlineData: &geminiInline{MimeType: mime, Data: base64.StdEncoding.EncodeToString(image)}},
			{Text: prompt},
		}}},
		GenerationConfig: &geminiGenCfg{Temperature: &temp, ResponseMimeType: "application/json"},
	}
	resp, err := g.call(ctx, g.AnalyzeModel, req)
	if err != nil {
		return "", Usage{}, err
	}
	text := firstText(resp)
	if text == "" {
		return "", g.usage(resp), fmt.Errorf("gemini: leeg antwoord op vision-analyse")
	}
	return text, g.usage(resp), nil
}

// GenerateText runs a text-only prompt (used for the style-guide aggregation).
func (g *Gemini) GenerateText(ctx context.Context, prompt string, jsonMode bool) (string, Usage, error) {
	cfg := &geminiGenCfg{}
	if jsonMode {
		cfg.ResponseMimeType = "application/json"
	}
	req := geminiReq{
		Contents:         []geminiContent{{Parts: []geminiPart{{Text: prompt}}}},
		GenerationConfig: cfg,
	}
	resp, err := g.call(ctx, g.AnalyzeModel, req)
	if err != nil {
		return "", Usage{}, err
	}
	text := firstText(resp)
	if text == "" {
		return "", g.usage(resp), fmt.Errorf("gemini: leeg tekstantwoord")
	}
	return text, g.usage(resp), nil
}

// GenerateWithRefs is the multiref strategy: 3-5 campaign images go in as
// style reference, the prompt describes the new subject.
func (g *Gemini) GenerateWithRefs(ctx context.Context, prompt string, refs []RefImage) (GenResult, error) {
	parts := make([]geminiPart, 0, len(refs)+1)
	for _, ref := range refs {
		parts = append(parts, geminiPart{
			InlineData: &geminiInline{MimeType: ref.Mime, Data: base64.StdEncoding.EncodeToString(ref.Data)},
		})
	}
	parts = append(parts, geminiPart{Text: prompt})

	req := geminiReq{
		Contents: []geminiContent{{Parts: parts}},
		GenerationConfig: &geminiGenCfg{
			ResponseModalities: []string{"TEXT", "IMAGE"},
			ImageConfig:        &geminiImageConfig{AspectRatio: g.Aspect},
		},
	}
	resp, err := g.call(ctx, g.ImageModel, req)
	if err != nil {
		return GenResult{}, err
	}
	for _, p := range resp.Candidates[0].Content.Parts {
		if p.InlineData != nil && p.InlineData.Data != "" {
			raw, err := base64.StdEncoding.DecodeString(p.InlineData.Data)
			if err != nil {
				return GenResult{}, fmt.Errorf("gemini: kapotte image-payload: %w", err)
			}
			return GenResult{
				Image:      raw,
				MimeType:   p.InlineData.MimeType,
				Provider:   "gemini",
				Model:      g.ImageModel,
				CostUSD:    g.ImageCostUSD,
				CostSource: "config",
			}, nil
		}
	}
	return GenResult{}, fmt.Errorf("gemini %s: antwoord bevat geen afbeelding (finishReason=%s, tekst=%q)",
		g.ImageModel, resp.Candidates[0].FinishReason, truncate([]byte(firstText(resp)), 200))
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
