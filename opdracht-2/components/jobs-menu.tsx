"use client";

import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { clearFinishedJobs, isDone, isRunning, markAllSeen, type Job } from "@/lib/jobs";
import { useJobs } from "@/lib/use-jobs";
import { cn } from "@/lib/utils";

/**
 * De belknop: wat loopt er, en wat is er klaar. Hiermee hoef je niet op het
 * wachtscherm te blijven staan — start er tien en kom later terug.
 */
export function JobsMenu() {
  const jobs = useJobs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const running = jobs.filter(isRunning).length;
  const unseen = jobs.filter((job) => isDone(job) && !job.seen).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badge = running > 0 ? running : unseen;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) markAllSeen();
        }}
        aria-expanded={open}
        aria-label={
          running > 0
            ? `${running} renders bezig`
            : unseen > 0
              ? `${unseen} nieuwe assets klaar`
              : "Jouw assets"
        }
        className="border-border hover:border-foreground/25 relative flex size-10 items-center justify-center rounded-xl border transition-colors"
      >
        {running > 0 ? (
          <Loader2 className="text-progress size-4 animate-spin" />
        ) : (
          <Bell className="size-4" />
        )}
        {badge > 0 && (
          <span
            className={cn(
              "absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
              running > 0
                ? "bg-progress text-white"
                : "bg-success text-success-foreground",
            )}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="border-border bg-popover shadow-paper-lg absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-2xl border">
          <div className="border-border/70 flex items-center justify-between border-b px-4 py-3">
            <p className="font-heading text-sm font-semibold">Jouw assets</p>
            {jobs.some(isDone) && (
              <button
                type="button"
                onClick={clearFinishedJobs}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
              >
                <Trash2 className="size-3" />
                Opruimen
              </button>
            )}
          </div>

          {jobs.length === 0 ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">
              Nog niets gemaakt. Kies een template om te beginnen.
            </p>
          ) : (
            <>
              <ul className="max-h-80 overflow-y-auto">
                {jobs.slice(0, 8).map((job) => (
                  <li key={job.id}>
                    <JobRow job={job} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
              <div className="border-border/70 border-t p-2">
                <Button asChild variant="ghost" className="w-full justify-between">
                  <Link href="/overzicht" onClick={() => setOpen(false)}>
                    Alles bekijken
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function JobRow({ job, onNavigate }: { job: Job; onNavigate: () => void }) {
  return (
    <Link
      href={`/asset/${encodeURIComponent(job.id)}`}
      onClick={onNavigate}
      className="hover:bg-accent/50 flex items-center gap-3 px-4 py-2.5 transition-colors"
    >
      <JobIcon job={job} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{job.label || job.templateName}</p>
        <p className="text-muted-foreground truncate text-xs">
          {job.templateName} · {statusLabel(job)}
        </p>
      </div>
      {isDone(job) && !job.seen && (
        <span className="bg-success size-2 shrink-0 rounded-full" aria-label="nieuw" />
      )}
    </Link>
  );
}

function JobIcon({ job }: { job: Job }) {
  if (job.phase === "finished") {
    return (
      <span className="bg-success/15 text-success flex size-8 shrink-0 items-center justify-center rounded-lg">
        <CheckCircle2 className="size-4" />
      </span>
    );
  }
  if (job.phase === "failed") {
    return (
      <span className="bg-destructive/10 text-destructive flex size-8 shrink-0 items-center justify-center rounded-lg">
        <TriangleAlert className="size-4" />
      </span>
    );
  }
  return (
    <span className="bg-progress/15 text-progress flex size-8 shrink-0 items-center justify-center rounded-lg">
      <Loader2 className="size-4 animate-spin" />
    </span>
  );
}

export function statusLabel(job: Job): string {
  switch (job.phase) {
    case "finished":
      return "klaar om te downloaden";
    case "failed":
      return "niet gelukt";
    case "rendering":
      return "wordt gemaakt";
    case "uploading":
      return "bijna klaar";
    default:
      return "in de wachtrij";
  }
}
