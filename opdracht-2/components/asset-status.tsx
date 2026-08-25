"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAssetStatus } from "@/lib/queries";
import type { AssetPhase, AssetState } from "@/lib/dto";

/** Stap 3 en 4 wonen op dezelfde pagina: het wachten gaat vanzelf over in het resultaat. */
export function AssetStatusPage({ assetId }: { assetId: string }) {
  const { data, isPending, isError, error, refetch } = useAssetStatus(assetId);

  const step = data?.done ? "done" : "make";

  return (
    <AppShell step={step}>
      {isPending ? (
        <WaitingScreen phase="queued" elapsed={0} />
      ) : isError ? (
        <ErrorState
          title="We konden de status niet ophalen"
          error={error}
          onRetry={() => void refetch()}
        />
      ) : data.failed ? (
        <FailedScreen asset={data} />
      ) : data.done ? (
        <ResultScreen asset={data} />
      ) : (
        <PollingScreen asset={data} />
      )}
    </AppShell>
  );
}

const PHASE_COPY: Record<AssetPhase, { title: string; body: string }> = {
  queued: {
    title: "In de wachtrij",
    body: "Je asset staat klaar en is zo aan de beurt.",
  },
  rendering: {
    title: "Wordt gemaakt",
    body: "De beelden en teksten worden nu samengevoegd.",
  },
  uploading: {
    title: "Bijna klaar",
    body: "De laatste hand wordt gelegd.",
  },
  unknown: {
    title: "Bezig",
    body: "We houden het voor je in de gaten.",
  },
  finished: { title: "Klaar", body: "" },
  failed: { title: "Mislukt", body: "" },
};

function PollingScreen({ asset }: { asset: AssetState }) {
  const elapsed = useElapsedSeconds();

  return (
    <WaitingScreen phase={asset.phase} elapsed={elapsed} target={asset.progress} />
  );
}

/** Hoelang de gebruiker al wacht. Loopt door over alle fasen heen. */
function useElapsedSeconds() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  return elapsed;
}

function WaitingScreen({
  phase,
  elapsed,
  target = 8,
}: {
  phase: AssetPhase;
  elapsed: number;
  target?: number;
}) {
  const copy = PHASE_COPY[phase];
  const slow = elapsed > 90;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center sm:py-16">
      <span className="bg-progress/15 text-progress relative flex size-16 items-center justify-center rounded-full">
        <span className="bg-progress/20 absolute inset-0 animate-ping rounded-full opacity-60" />
        <Loader2 className="relative size-7 animate-spin" strokeWidth={2.5} />
      </span>

      <h1 className="font-heading mt-7 text-3xl font-bold sm:text-4xl">
        {copy.title}
      </h1>
      <p className="text-muted-foreground mt-2.5">{copy.body}</p>

      <div className="mt-8 w-full space-y-3">
        {/* De key zorgt dat de kruip opnieuw begint bij elke nieuwe fase. */}
        <CreepingProgress key={phase} target={target} />
        <p
          className="text-muted-foreground text-sm tabular-nums"
          aria-live="polite"
          aria-atomic
        >
          {elapsed > 0 ? `${elapsed} seconden bezig` : "Aan het starten…"}
        </p>
      </div>

      <p className="text-muted-foreground mt-8 max-w-sm text-sm">
        {slow
          ? "Het duurt wat langer dan gebruikelijk, maar hij is er nog mee bezig. Je kunt dit tabblad open laten staan."
          : "Je kunt dit tabblad open laten staan — we laten het weten zodra het klaar is."}
      </p>
    </div>
  );
}

/**
 * Storyteq geeft geen percentage terug, alleen een fase. Om te voorkomen dat de
 * balk minutenlang stilstaat kruipt hij binnen elke fase langzaam vooruit —
 * maar nooit voorbij het punt dat de volgende fase zou rechtvaardigen.
 */
function CreepingProgress({ target }: { target: number }) {
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setDrift((d) => d + (22 - d) * 0.08), 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <Progress
      value={Math.min(Math.round(target + drift), 96)}
      className="h-2 [&>div]:bg-progress [&>div]:transition-all [&>div]:duration-700"
      aria-label="Voortgang"
    />
  );
}

function ResultScreen({ asset }: { asset: AssetState }) {
  useEffect(() => {
    toast.success("Je asset is klaar!");
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="bg-success/15 text-success flex size-14 items-center justify-center rounded-full">
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="font-heading mt-6 text-3xl font-bold sm:text-4xl">
          Klaar. Hier is hij.
        </h1>
        <p className="text-muted-foreground mt-2.5">
          Bekijk hem even, en download hem daarna met één klik.
        </p>
      </div>

      {asset.result ? (
        <>
          <div className="border-border bg-card shadow-paper-lg overflow-hidden rounded-2xl border">
            {asset.result.kind === "video" ? (
              <video
                src={asset.result.previewUrl}
                controls
                autoPlay
                muted
                loop
                playsInline
                className="w-full bg-black"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- gaat door onze eigen proxy
              <img
                src={asset.result.previewUrl}
                alt="De asset die je zojuist hebt gemaakt"
                className="w-full"
              />
            )}
          </div>

          <div className="mt-7 flex flex-col items-center gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto sm:min-w-64">
              <a href={asset.result.downloadUrl} download={asset.result.fileName}>
                <Download className="size-4" />
                Downloaden
              </a>
            </Button>
            <p className="text-muted-foreground font-mono text-xs">
              {asset.result.fileName}
            </p>
          </div>
        </>
      ) : (
        // Klaar volgens Storyteq, maar geen bestand-URL erbij: eerlijk zijn.
        <div className="border-border bg-card rounded-2xl border p-8 text-center">
          <p className="text-muted-foreground text-sm">
            De asset is gemaakt, maar Storyteq gaf er nog geen bestand bij terug.
            Even wachten en verversen helpt meestal.
          </p>
        </div>
      )}

      <div className="mt-10 flex justify-center">
        <Button asChild variant="ghost">
          <Link href="/">
            <Sparkles className="size-4" />
            Nog een maken
          </Link>
        </Button>
      </div>
    </div>
  );
}

function FailedScreen({ asset }: { asset: AssetState }) {
  const backHref = asset.templateId
    ? `/maken/${encodeURIComponent(asset.templateId)}`
    : "/";

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center sm:py-14">
      <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
        <RefreshCw className="size-6" />
      </span>

      <h1 className="font-heading mt-6 text-3xl font-bold">
        Het maken is niet gelukt
      </h1>
      <p className="text-muted-foreground mt-2.5">
        Storyteq kon deze asset niet afmaken. Meestal helpt het om het opnieuw te
        proberen, eventueel met een andere afbeelding of kortere tekst.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href={backHref}>
            <RefreshCw className="size-4" />
            Opnieuw proberen
          </Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Andere template
          </Link>
        </Button>
      </div>
    </div>
  );
}
