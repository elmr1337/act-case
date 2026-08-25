"use client";

import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/feedback";
import { FieldInput } from "@/components/field-input";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientError } from "@/lib/client";
import { isFieldValid, type FormField, type TemplateDetail } from "@/lib/dto";
import { addJobs } from "@/lib/jobs";
import { useCreateAsset, useTemplate, useTemplateHistory } from "@/lib/queries";

/** Stap 2: invullen. Alleen de velden die de template zelf aandraagt. */
export function AssetForm({ templateId }: { templateId: string }) {
  const { data: template, isPending, isError, error, refetch } = useTemplate(templateId);

  if (isPending) {
    return (
      <AppShell>
        <FormSkeleton />
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell>
        <ErrorState
          title="Deze template kon niet geladen worden"
          error={error}
          onRetry={() => void refetch()}
        />
      </AppShell>
    );
  }

  // De key zorgt dat de formulierstaat opnieuw uit de template wordt opgebouwd
  // als je van template wisselt — inclusief de standaardwaardes.
  return <TemplateForm key={template.id} template={template} />;
}

function TemplateForm({ template }: { template: TemplateDetail }) {
  const router = useRouter();
  const create = useCreateAsset();
  const history = useTemplateHistory(template.id);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.fields.map((f) => [f.name, f.initialValue])),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const missing = useMemo(
    () =>
      template.fields.filter(
        (field) => field.required && !(values[field.name] ?? "").trim(),
      ),
    [template.fields, values],
  );

  const noFields = template.fields.length === 0;

  /**
   * Bij een keuzeveld tonen we een eerdere render als voorbeeld. Dat werkt
   * alleen als die render zélf het beeld is: bij een video is de thumbnail de
   * posterframe, en die is voor elke keuze hetzelfde — vier identieke plaatjes
   * naast vier verschillende opties helpen niemand.
   */
  const showExamples = template.mediaKind !== "video";
  const hasContent = Object.values(values).some((v) => v.trim() !== "");
  const canSubmit = noFields || (missing.length === 0 && hasContent);

  function setValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    // Fout weghalen zodra iemand het veld aanraakt.
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Verplichte velden vangen we hier al af — dat scheelt een ronde naar
    // Storyteq en de gebruiker ziet meteen waar het aan ligt.
    if (missing.length > 0) {
      setFieldErrors(
        Object.fromEntries(missing.map((f) => [f.name, "Dit veld is verplicht."])),
      );
      document
        .getElementById(`field-${missing[0].name}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setFieldErrors({});
    const parameters = Object.fromEntries(
      template.fields.map((field) => [field.name, values[field.name]?.trim() ?? ""]),
    );

    create.mutate(
      { templateId: template.id, parameters },
      {
        onSuccess: (asset) => {
          // Ook een losse render komt in je overzicht; zo hoef je nooit op het
          // wachtscherm te blijven staan.
          addJobs([
            {
              id: asset.id,
              templateId: template.id,
              templateName: template.name,
              label: firstTextValue(template.fields, values) || template.name,
            },
          ]);
          router.push(`/asset/${encodeURIComponent(asset.id)}`);
        },
        onError: (err) => {
          if (err instanceof ClientError && err.fields) {
            // Storyteq geeft fouten per parameter terug; die horen bij het veld.
            setFieldErrors(
              Object.fromEntries(
                Object.entries(err.fields).map(([key, messages]) => [
                  key.replace(/^template_parameters\./, ""),
                  messages.join(" "),
                ]),
              ),
            );
            toast.error("Niet alle velden zijn goed ingevuld", {
              description: "We hebben aangegeven welke.",
            });
            return;
          }
          toast.error("Aanmaken lukte niet", {
            description:
              err instanceof ClientError ? err.message : "Probeer het nog een keer.",
          });
        },
      },
    );
  }

  const formId = "asset-form";

  const actions = (
    <div className="flex items-center gap-3">
      <Link
        href="/"
        aria-label="Andere template kiezen"
        className="text-muted-foreground hover:text-foreground hover:border-foreground/25 border-border flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors"
      >
        <ArrowLeft className="size-4" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="font-heading truncate text-base font-semibold">{template.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {missing.length > 0
            ? `Nog ${missing.length} verplicht ${missing.length === 1 ? "veld" : "velden"}`
            : durationHint(history.data?.estimate?.medianSeconds ?? null)}
        </p>
      </div>

      <ModeToggle templateId={template.id} />

      <Button
        type="submit"
        form={formId}
        size="lg"
        disabled={create.isPending || !canSubmit}
        className="h-12 shrink-0 px-6 text-base"
      >
        {create.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span className="hidden sm:inline">Versturen…</span>
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            <span className="hidden sm:inline">Maak mijn asset</span>
            <span className="sm:hidden">Maken</span>
          </>
        )}
      </Button>
    </div>
  );

  return (
    <AppShell actions={actions}>
      <div className="mx-auto max-w-2xl">
        {/* De naam staat al in de balk hierboven; hier alleen voor schermlezers. */}
        <h1 className="sr-only">{template.name}</h1>

        <p className="text-muted-foreground mb-8 text-lg text-balance">
          {noFields
            ? "Deze template heeft geen velden — je kunt hem meteen maken."
            : "Vul in wat er in je asset moet komen te staan."}
        </p>

        <form id={formId} onSubmit={onSubmit} noValidate>
          <div className="divide-border divide-y">
            {groupFields(template.fields).map((group, index) => (
              <div key={index} className="space-y-6 py-7 first:pt-0 last:pb-0">
                {group.map((field) => (
                  <FieldInput
                    key={field.name}
                    field={field}
                    value={values[field.name] ?? ""}
                    error={fieldErrors[field.name]}
                    valid={isFieldValid(field, values[field.name] ?? "")}
                    examples={
                      showExamples ? history.data?.optionExamples?.[field.name] : undefined
                    }
                    onChange={(value) => setValue(field.name, value)}
                  />
                ))}
              </div>
            ))}
          </div>

          {noFields && (
            <p className="text-muted-foreground text-sm">
              Er valt hier niets in te vullen.
            </p>
          )}
        </form>
      </div>
    </AppShell>
  );
}

/** Waar de gebruiker deze render aan herkent in het overzicht. */
function firstTextValue(fields: FormField[], values: Record<string, string>) {
  return (
    fields
      .filter((field) => field.kind === "text" || field.kind === "longtext")
      .map((field) => values[field.name]?.trim())
      .find(Boolean) ?? ""
  );
}

/**
 * Groepeert *opeenvolgende* velden van dezelfde soort. Zo krijgt het formulier
 * ritme — teksten bij teksten, keuzes bij keuzes — zonder dat de volgorde die de
 * template zelf meegeeft (`order`) door elkaar gehaald wordt.
 */
function groupFields(fields: FormField[]): FormField[][] {
  const groups: FormField[][] = [];
  for (const field of fields) {
    const last = groups.at(-1);
    if (last && last[0].group === field.group) last.push(field);
    else groups.push([field]);
  }
  return groups;
}

/**
 * De verwachting komt uit de eigen historie van de template (mediaan over
 * eerdere renders), niet uit `processing_time` — dat veld telt de wachtrij niet
 * mee en was in de praktijk minder dan de helft van de echte duur.
 */
function durationHint(medianSeconds: number | null): string {
  if (!medianSeconds) return "Dit duurt meestal één tot drie minuten.";
  const minutes = Math.round(medianSeconds / 60);
  if (minutes <= 1) return "Meestal binnen een minuut klaar.";
  return `Meestal binnen ${minutes} minuten klaar.`;
}

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-2xl">
      <Skeleton className="mb-3 h-9 w-2/3" />
      <Skeleton className="mb-8 h-5 w-1/2" />
      <div className="space-y-7">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
