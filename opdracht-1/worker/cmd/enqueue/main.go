// Command enqueue puts a single job on the (redis) queue. In the default
// memory mode this makes no sense — enqueue and worker live in one process
// there — so it refuses with an explanation.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/config"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/job"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/queue"
)

func main() {
	log.SetFlags(0)
	var (
		typ      = flag.String("type", "generate", "jobtype: analyze | train | generate")
		variant  = flag.String("variant", "", "variant bij generate: prompt | multiref | lora")
		lutOn    = flag.Bool("lut", false, "pas de campagne-LUT toe op de output")
		prompt   = flag.String("prompt", "", "prompt bij generate")
		promptID = flag.String("prompt-id", "", "korte naam voor het outputbestand (bijv. p1)")
		steps    = flag.Int("steps", 0, "trainingssteps bij train (default uit env)")
		client   = flag.String("client", "act-case", "client id")
	)
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	if cfg.QueueDriver != "redis" {
		log.Fatal("enqueue heeft QUEUE_DRIVER=redis nodig; in memory-mode draait alles in één proces via `worker run matrix.yaml`")
	}
	q, err := queue.New(cfg)
	if err != nil {
		log.Fatalf("queue: %v", err)
	}
	defer q.Close()

	j := job.New(job.Type(*typ), *client)
	j.Variant = job.Variant(*variant)
	j.LUT = *lutOn
	j.Prompt = *prompt
	j.PromptID = *promptID
	j.Steps = *steps
	if err := j.Validate(); err != nil {
		flag.Usage()
		log.Fatalf("ongeldige job: %v", err)
	}
	if err := q.Enqueue(context.Background(), j); err != nil {
		log.Fatalf("enqueue: %v", err)
	}
	fmt.Fprintln(os.Stdout, j.ID)
}
