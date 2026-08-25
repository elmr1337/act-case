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
import { useAssetStatus, useTemplateHistory } from "@/lib/queries";
import type { AssetPhase, AssetState } from "@/lib/dto";
import type { DurationEstimate } from "@/lib/history";

/** Stap 3 en 4 wonen op dezelfde pagina: het wachten gaat vanzelf over in het resultaat. */
export function AssetStatusPage({ assetId }: { assetId: string }) {
  const { data, isPending, isError, error, refetch } = useAssetStatus(assetId);

  return (
    <AppShell>
      {isPending ? (
        <WaitingScreen phase="queued" elapsed={0} estimate={null} />
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

/** Waar de render is. Eén regel, geen eigen kop — de kop blijft staan. */
const PHASE_COPY: Record<AssetPhase, string> = {
  queued: "Hij staat in de rij bij Storyteq en is zo aan de beurt.",
  rendering: "De beelden en teksten worden nu samengevoegd.",
  uploading: "De laatste hand wordt gelegd.",
  unknown: "We houden het voor je in de gaten.",
  finished: "",
  failed: "",
};

function PollingScreen({ asset }: { asset: AssetState }) {
  const history = useTemplateHistory(asset.templateId);
  const elapsed = useElapsedSeconds(asset.startedAt);

  return (
    <WaitingScreen
      phase={asset.phase}
      elapsed={elapsed}
      estimate={history.data?.estimate ?? null}
      templateId={asset.templateId}
    />
  );
}

/**
 * Hoelang de render al loopt. Gebaseerd op `created_at` van Storyteq, dus de
 * teller klopt ook als je de pagina ververst of de link later opent.
 */
function useElapsedSeconds(startedAt: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const start = startedAt ? Date.parse(startedAt.replace(" ", "T") + "Z") : NaN;
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.round((now - start) / 1000));
}

function WaitingScreen({
  phase,
  elapsed,
  estimate,
  templateId,
}: {
  phase: AssetPhase;
  elapsed: number;
  estimate: DurationEstimate | null;
  templateId?: string | null;
}) {
  // Het blijft van begin tot eind hetzelfde: je asset wordt gemaakt. De fase
  // eronder vertelt waar hij is, zonder dat de kop steeds verspringt.
  const overdue = estimate !== null && elapsed > estimate.p90Seconds;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center sm:py-16">
      <span className="bg-progress/15 text-progress flex size-16 items-center justify-center rounded-full">
        <Loader2 className="size-7 animate-spin" strokeWidth={2.5} />
      </span>

      <h1 className="font-heading mt-7 text-3xl font-bold sm:text-4xl">
        Je asset wordt gemaakt
      </h1>
      <p className="text-muted-foreground mt-2.5 text-balance">
        {PHASE_COPY[phase]}
      </p>

      <div className="mt-8 w-full space-y-3">
        <Progress
          value={progressFor(phase, elapsed, estimate)}
          className="h-2 [&>div]:bg-progress [&>div]:transition-all [&>div]:duration-700"
          aria-label="Voortgang"
        />
        <p className="text-foreground text-sm font-medium" aria-live="polite" aria-atomic>
          {remainingCopy(elapsed, estimate, overdue)}
        </p>
      </div>

      <p className="text-muted-foreground mt-8 max-w-sm text-sm text-balance">
        {overdue
          ? "Hij is er nog mee bezig. Je kunt dit tabblad gerust open laten staan."
          : "Je kunt dit tabblad open laten staan — we laten het weten zodra het klaar is."}
      </p>

      {/*
        Wachten hoeft niet: deze render loopt door in de wachtrij en je krijgt
        een melding zodra hij klaar is. Zonder deze knop lijkt het statusscherm
        een doodlopende weg, en dat is precies wat we niet willen.
      */}
      <div className="border-border/70 mt-10 w-full border-t pt-8">
        <p className="text-foreground text-sm font-medium">
          Je hoeft hier niet op te wachten
        </p>
        <p className="text-muted-foreground mt-1 text-sm text-balance">
          Hij loopt door en je krijgt een melding zodra hij klaar is.
        </p>

        <div className="mt-4 flex flex-col items-center gap-3">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 w-full rounded-xl text-base sm:w-auto sm:min-w-64"
          >
            <Link href={templateId ? `/maken/${encodeURIComponent(templateId)}` : "/"}>
              <Sparkles className="size-4" />
              Maak er ondertussen nog een
            </Link>
          </Button>

          {templateId && (
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4 transition-colors"
            >
              of kies een andere template
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Storyteq geeft geen percentage, alleen een fase. De balk loopt daarom mee met
 * de tijd, afgezet tegen wat deze template in de praktijk nodig heeft, met de
 * fase als ondergrens zodat hij nooit terugvalt. Nooit voorbij 96%: die laatste
 * paar procent zijn niet van ons om te beloven.
 */
function progressFor(
  phase: AssetPhase,
  elapsed: number,
  estimate: DurationEstimate | null,
): number {
  const floor = PHASE_FLOOR[phase];
  if (!estimate) return floor;
  const byTime = (elapsed / Math.max(estimate.medianSeconds, 1)) * 90;
  return Math.round(Math.min(96, Math.max(floor, byTime)));
}

const PHASE_FLOOR: Record<AssetPhase, number> = {
  queued: 8,
  rendering: 45,
  uploading: 85,
  finished: 100,
  failed: 100,
  unknown: 20,
};

/**
 * Een verwachting geven mag alleen als we hem kunnen onderbouwen. Zonder
 * historie zeggen we niets over de resterende tijd.
 */
function remainingCopy(
  elapsed: number,
  estimate: DurationEstimate | null,
  overdue: boolean,
): string {
  if (!estimate) return "Dit duurt meestal één tot drie minuten.";
  if (overdue) return "Duurt langer dan gewoonlijk.";

  const remaining = estimate.medianSeconds - elapsed;
  if (remaining <= 20) return "Bijna klaar…";
  if (remaining < 90) return "Nog ongeveer een minuut.";
  return `Nog ongeveer ${Math.round(remaining / 60)} minuten.`;
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
          {/*
            De hoogte is begrensd: een 9:16-video zou anders het hele scherm
            vullen en de downloadknop ver onder de vouw duwen. Landschap blijft
            gewoon breed, staand past nu ook in beeld.
          */}
          <div className="border-border shadow-paper-lg mx-auto flex w-fit max-w-full items-center justify-center overflow-hidden rounded-2xl border bg-neutral-950">
            {asset.result.kind === "video" ? (
              <video
                src={asset.result.previewUrl}
                controls
                autoPlay
                muted
                loop
                playsInline
                className="max-h-[46vh] w-auto max-w-full"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- gaat door onze eigen proxy
              <img
                src={asset.result.previewUrl}
                alt="De asset die je zojuist hebt gemaakt"
                className="max-h-[46vh] w-auto max-w-full"
              />
            )}
          </div>

          {/* De download is waar deze hele flow op uitkomt; die knop mag je
              niet hoeven zoeken. "Nog een maken" staat er als gelijkwaardige
              tweede optie naast, niet als voetnoot eronder. */}
          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="h-14 w-full rounded-xl px-9 text-base font-semibold sm:w-auto sm:min-w-72"
              >
                <a href={asset.result.downloadUrl} download={asset.result.fileName}>
                  <Download className="size-5" />
                  Downloaden
                </a>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-14 w-full rounded-xl px-7 text-base sm:w-auto"
              >
                <Link href="/">
                  <Sparkles className="size-5" />
                  Nog een maken
                </Link>
              </Button>
            </div>

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

      {!asset.result && (
        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline" size="lg" className="h-14 rounded-xl px-7 text-base">
            <Link href="/">
              <Sparkles className="size-5" />
              Nog een maken
            </Link>
          </Button>
        </div>
      )}
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
