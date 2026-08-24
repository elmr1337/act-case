// Command worker is the entrypoint: batch runner (default, zero infra) and
// queue consumer (redis mode).
//
//	worker run matrix.yaml   draai een batchdefinitie (memory queue + pool)
//	worker serve             consumeer de queue tot SIGINT (redis-mode)
//	worker analyze           draai alleen de analyze-job
//	worker costs             print de kosten-tabel (markdown) uit costs.json
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/analyze"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/config"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/cost"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/job"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/matrix"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/provider"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/queue"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/runner"
	"github.com/elmr1337/act-case/opdracht-1/worker/internal/store"
)

func main() {
	log.SetFlags(log.Ltime)
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	var exitErr error
	switch os.Args[1] {
	case "run":
		if len(os.Args) != 3 {
			usage()
			os.Exit(2)
		}
		exitErr = runBatch(ctx, cfg, os.Args[2])
	case "serve":
		exitErr = serve(ctx, cfg)
	case "analyze":
		exitErr = runSingleAnalyze(ctx, cfg)
	case "costs":
		exitErr = printCosts(ctx, cfg)
	default:
		usage()
		os.Exit(2)
	}
	if exitErr != nil {
		log.Fatalf("fout: %v", exitErr)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `gebruik:
  worker run <matrix.yaml>   draai de volledige matrix (batch, geen infra nodig)
  worker serve               consumeer de queue tot SIGINT (QUEUE_DRIVER=redis)
  worker analyze             draai alleen de analyze-job
  worker costs               print de kosten-tabel uit outputs/costs.json`)
}

// wire builds the shared dependency graph.
func wire(cfg *config.Config) (*runner.Runner, error) {
	st, err := store.New(cfg)
	if err != nil {
		return nil, err
	}
	gemini := provider.NewGemini(cfg)
	fal := provider.NewFal(cfg)
	fal.Logf = log.Printf

	var vision analyze.Vision
	switch cfg.AnalyzeProvider {
	case "gemini":
		vision = gemini
	case "anthropic":
		vision = provider.NewAnthropic(cfg)
	default:
		return nil, fmt.Errorf("onbekende ANALYZE_PROVIDER %q (gemini|anthropic)", cfg.AnalyzeProvider)
	}

	return &runner.Runner{
		Cfg:    cfg,
		Store:  st,
		Costs:  cost.NewLog(st),
		Vision: vision,
		Fal:    fal,
		Gemini: gemini,
	}, nil
}

func runBatch(ctx context.Context, cfg *config.Config, matrixPath string) error {
	m, err := matrix.Load(matrixPath)
	if err != nil {
		return err
	}
	r, err := wire(cfg)
	if err != nil {
		return err
	}
	analyzeJobs, trainJobs, genJobs := m.Expand()
	log.Printf("matrix: %d analyze, %d train, %d generate (concurrency %d)",
		len(analyzeJobs), len(trainJobs), len(genJobs), cfg.Concurrency)

	// Analyze en train zijn afhankelijkheden van de generates: sequentieel.
	for _, j := range append(analyzeJobs, trainJobs...) {
		if err := execLogged(ctx, r, j); err != nil {
			return fmt.Errorf("%s-job faalde, matrix gestopt: %w", j.Type, err)
		}
	}

	if len(genJobs) == 0 {
		return nil
	}

	// Generates via de memory queue + worker pool.
	q := queue.NewMemory(len(genJobs))
	for _, j := range genJobs {
		if err := q.Enqueue(ctx, j); err != nil {
			return err
		}
	}
	q.Close()

	var wg sync.WaitGroup
	for i := 0; i < cfg.Concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				j, err := q.Dequeue(ctx)
				if err != nil {
					return // ErrClosed of context cancelled
				}
				_ = q.SetStatus(ctx, j.ID, job.StatusRunning, "")
				if res, err := r.Execute(ctx, j); err != nil {
					_ = q.SetStatus(ctx, j.ID, job.StatusFailed, err.Error())
					log.Printf("[FAAL] %s %s: %v", cell(j), j.PromptID, err)
				} else {
					_ = q.SetStatus(ctx, j.ID, job.StatusDone, res)
					log.Printf("[ok]   %s %s → %s", cell(j), j.PromptID, res)
				}
			}
		}()
	}
	wg.Wait()

	// Samenvatting + exitcode.
	failed := 0
	for _, j := range genJobs {
		rec, err := q.Status(ctx, j.ID)
		if err != nil || rec.Status != job.StatusDone {
			failed++
		}
	}
	log.Printf("klaar: %d/%d generate-jobs geslaagd", len(genJobs)-failed, len(genJobs))
	if entries, err := r.Costs.Entries(ctx); err == nil {
		var total float64
		for _, e := range entries {
			total += e.USD
		}
		log.Printf("kosten tot nu toe: $%.4f (zie outputs/costs.json, `worker costs` voor de tabel)", total)
	}
	if failed > 0 {
		return fmt.Errorf("%d job(s) gefaald", failed)
	}
	return nil
}

func serve(ctx context.Context, cfg *config.Config) error {
	if cfg.QueueDriver != "redis" {
		log.Printf("let op: serve met QUEUE_DRIVER=%s is alleen zinvol met redis", cfg.QueueDriver)
	}
	q, err := queue.New(cfg)
	if err != nil {
		return err
	}
	defer q.Close()
	r, err := wire(cfg)
	if err != nil {
		return err
	}
	log.Printf("worker luistert op de queue (%s), ctrl-c om te stoppen", cfg.QueueDriver)
	for {
		j, err := q.Dequeue(ctx)
		if err != nil {
			if ctx.Err() != nil {
				log.Printf("gestopt")
				return nil
			}
			return err
		}
		_ = q.SetStatus(ctx, j.ID, job.StatusRunning, "")
		if res, execErr := r.Execute(ctx, j); execErr != nil {
			_ = q.SetStatus(ctx, j.ID, job.StatusFailed, execErr.Error())
			log.Printf("[FAAL] %s %s: %v", j.Type, j.ID, execErr)
		} else {
			_ = q.SetStatus(ctx, j.ID, job.StatusDone, res)
			log.Printf("[ok]   %s %s → %s", j.Type, j.ID, res)
		}
	}
}

func runSingleAnalyze(ctx context.Context, cfg *config.Config) error {
	r, err := wire(cfg)
	if err != nil {
		return err
	}
	return execLogged(ctx, r, job.New(job.TypeAnalyze, "act-case"))
}

func printCosts(ctx context.Context, cfg *config.Config) error {
	st, err := store.New(cfg)
	if err != nil {
		return err
	}
	entries, err := cost.NewLog(st).Entries(ctx)
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		fmt.Println("nog geen kosten gelogd (outputs/costs.json is leeg)")
		return nil
	}
	fmt.Print(cost.MarkdownTable(entries))
	return nil
}

func execLogged(ctx context.Context, r *runner.Runner, j job.Job) error {
	log.Printf("start %s-job %s", j.Type, j.ID[:8])
	res, err := r.Execute(ctx, j)
	if err != nil {
		return err
	}
	log.Printf("[ok]   %s → %s", j.Type, res)
	return nil
}

func cell(j job.Job) string {
	c := string(j.Variant)
	if j.LUT {
		c += "-lut"
	}
	return c
}
