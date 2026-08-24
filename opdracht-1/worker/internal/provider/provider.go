// Package provider contains the API clients for image generation, LoRA
// training and vision analysis: fal.ai (Flux), Gemini and Anthropic.
package provider

// Usage counts tokens for text/vision calls so cost can be derived.
type Usage struct {
	InputTokens  int
	OutputTokens int
}

// GenResult is one generated image plus its cost administration.
type GenResult struct {
	Image      []byte
	MimeType   string
	Provider   string
	Model      string
	CostUSD    float64
	CostSource string // "response" | "config"
	Note       string
}

// TrainResult describes a finished LoRA training run.
type TrainResult struct {
	LoraURL    string
	ConfigURL  string
	RequestID  string
	Steps      int
	Provider   string
	Model      string
	CostUSD    float64
	CostSource string
}

// RefImage is a reference image passed to multi-reference generation.
type RefImage struct {
	Data []byte
	Mime string
}
