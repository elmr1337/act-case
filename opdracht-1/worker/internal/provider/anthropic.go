package provider

import (
	"context"
	"encoding/base64"
	"fmt"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/config"
)

// Anthropic is the alternative vision/analyze driver (ANALYZE_PROVIDER=
// anthropic), using the official Go SDK.
type Anthropic struct {
	client    anthropic.Client
	apiKey    string
	model     string
	inPerMTok float64
	outPerMT  float64
}

func NewAnthropic(cfg *config.Config) *Anthropic {
	return &Anthropic{
		client:    anthropic.NewClient(option.WithAPIKey(cfg.AnthropicAPIKey)),
		apiKey:    cfg.AnthropicAPIKey,
		model:     cfg.AnthropicModel,
		inPerMTok: cfg.AnthropicInPerMTok,
		outPerMT:  cfg.AnthropicOutPerMTok,
	}
}

func (a *Anthropic) Name() string  { return "anthropic" }
func (a *Anthropic) Model() string { return a.model }

func (a *Anthropic) CostFor(u Usage) (float64, string) {
	return float64(u.InputTokens)*a.inPerMTok/1e6 + float64(u.OutputTokens)*a.outPerMT/1e6, "config"
}

func (a *Anthropic) send(ctx context.Context, blocks []anthropic.ContentBlockParamUnion) (string, Usage, error) {
	if a.apiKey == "" {
		return "", Usage{}, fmt.Errorf("ANTHROPIC_API_KEY is niet gezet (of kies ANALYZE_PROVIDER=gemini)")
	}
	resp, err := a.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(a.model),
		MaxTokens: 8192,
		Messages:  []anthropic.MessageParam{anthropic.NewUserMessage(blocks...)},
	})
	if err != nil {
		return "", Usage{}, fmt.Errorf("anthropic %s: %w", a.model, err)
	}
	usage := Usage{
		InputTokens:  int(resp.Usage.InputTokens),
		OutputTokens: int(resp.Usage.OutputTokens),
	}
	if resp.StopReason == anthropic.StopReasonRefusal {
		return "", usage, fmt.Errorf("anthropic %s: verzoek geweigerd (stop_reason=refusal)", a.model)
	}
	var text string
	for _, block := range resp.Content {
		if b, ok := block.AsAny().(anthropic.TextBlock); ok {
			text += b.Text
		}
	}
	if text == "" {
		return "", usage, fmt.Errorf("anthropic %s: leeg antwoord", a.model)
	}
	return text, usage, nil
}

func (a *Anthropic) AnalyzeImage(ctx context.Context, image []byte, mime, prompt string) (string, Usage, error) {
	blocks := []anthropic.ContentBlockParamUnion{
		anthropic.NewImageBlockBase64(mime, base64.StdEncoding.EncodeToString(image)),
		anthropic.NewTextBlock(prompt),
	}
	return a.send(ctx, blocks)
}

func (a *Anthropic) GenerateText(ctx context.Context, prompt string, _ bool) (string, Usage, error) {
	return a.send(ctx, []anthropic.ContentBlockParamUnion{anthropic.NewTextBlock(prompt)})
}
