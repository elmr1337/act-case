"use client";

import { CheckCircle2, Download, Loader2, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { statusLabel } from "@/components/jobs-menu";
import { EmptyState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { clearFinishedJobs, isDone, isRunning, type Job } from "@/lib/jobs";
import { useJobs } from "@/lib/use-jobs";

/**
 * Alles wat je hebt gemaakt, in één lijst. Hierdoor hoef je nooit op het
 * wachtscherm te blijven staan: start er tien en kom hier terug.
 */
export function JobsOverview() {
  const jobs = useJobs();

  const running = jobs.filter(isRunning);
  const done = jobs.filter(isDone);

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="Nog niets gemaakt"
        description="Zodra je een asset aanmaakt, houden we hem hier voor je bij — ook als je verder klikt."
      >
        <Button asChild>
          <Link href="/">
            <Sparkles className="size-4" />
            Kies een template
          </Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      {running.length > 0 && (
        <Section
          title={`${running.length} ${running.length === 1 ? "asset wordt" : "assets worden"} gemaakt`}
          jobs={running}
        />
      )}

      {done.length > 0 && (
        <Section
          title="Klaar"
          jobs={done}
          action={
            <button
              type="button"
              onClick={clearFinishedJobs}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
            >
              <Trash2 className="size-3.5" />
              Lijst opruimen
            </button>
          }
        />
      )}
    </div>
  );
}

function Section({
  title,
  jobs,
  action,
}: {
  title: string;
  jobs: Job[];
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        {action}
      </div>

      <ul className="border-border divide-border divide-y overflow-hidden rounded-2xl border">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobRow job={job} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function JobRow({ job }: { job: Job }) {
  const finished = job.phase === "finished";

  return (
    <div className="bg-card flex items-center gap-4 p-4">
      <Status job={job} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{job.label || job.templateName}</p>
        <p className="text-muted-foreground truncate text-sm">
          {job.templateName} · {statusLabel(job)}
        </p>
      </div>

      {finished ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" className="hidden h-11 rounded-xl sm:inline-flex">
            <Link href={`/asset/${encodeURIComponent(job.id)}`}>Bekijken</Link>
          </Button>
          <Button asChild className="h-11 rounded-xl">
            <a href={`/api/assets/${encodeURIComponent(job.id)}/download`} download>
              <Download className="size-4" />
              <span className="hidden sm:inline">Downloaden</span>
            </a>
          </Button>
        </div>
      ) : (
        <Button asChild variant="ghost" className="h-11 shrink-0 rounded-xl">
          <Link href={`/asset/${encodeURIComponent(job.id)}`}>Volgen</Link>
        </Button>
      )}
    </div>
  );
}

function Status({ job }: { job: Job }) {
  if (job.phase === "finished") {
    return (
      <span className="bg-success/15 text-success flex size-10 shrink-0 items-center justify-center rounded-xl">
        <CheckCircle2 className="size-5" />
      </span>
    );
  }
  if (job.phase === "failed") {
    return (
      <span className="bg-destructive/10 text-destructive flex size-10 shrink-0 items-center justify-center rounded-xl">
        <TriangleAlert className="size-5" />
      </span>
    );
  }
  return (
    <span className="bg-progress/15 text-progress flex size-10 shrink-0 items-center justify-center rounded-xl">
      <Loader2 className="size-5 animate-spin" />
    </span>
  );
}
