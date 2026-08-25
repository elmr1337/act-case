"use client";

import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/feedback";
import { FieldInput } from "@/components/field-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientError } from "@/lib/client";
import { useCreateAsset, useTemplate } from "@/lib/queries";

/** Stap 2: invullen. Alleen de velden die de template zelf aandraagt. */
export function AssetForm({ templateId }: { templateId: string }) {
  const router = useRouter();
  const { data: template, isPending, isError, error, refetch } = useTemplate(templateId);
  const create = useCreateAsset();

  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const hasInput = useMemo(
    () => Object.values(values).some((v) => v.trim() !== ""),
    [values],
  );

  if (isPending) return <FormSkeleton />;

  if (isError) {
    return (
      <ErrorState
        title="Deze template kon niet geladen worden"
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }

  const noFields = template.fields.length === 0;

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
    setFieldErrors({});

    const parameters = Object.fromEntries(
      template!.fields.map((field) => [field.name, values[field.name]?.trim() ?? ""]),
    );

    create.mutate(
      { templateId, parameters },
      {
        onSuccess: (asset) => router.push(`/asset/${encodeURIComponent(asset.id)}`),
        onError: (err) => {
          if (err instanceof ClientError && err.fields) {
            // Storyteq geeft fouten per parameter terug; die horen bij het veld.
            const mapped: Record<string, string> = {};
            for (const [key, messages] of Object.entries(err.fields)) {
              mapped[key] = messages.join(" ");
            }
            setFieldErrors(mapped);
            toast.error("Niet alle velden zijn goed ingevuld", {
              description: "We hebben aangegeven welke.",
            });
            return;
          }
          toast.error("Aanmaken lukte niet", {
            description:
              err instanceof ClientError
                ? err.message
                : "Probeer het nog een keer.",
          });
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Andere template kiezen
      </Link>

      <div className="mb-8 space-y-2">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">
          {template.name}
        </h1>
        <p className="text-muted-foreground">
          {noFields
            ? "Deze template heeft geen velden — je kunt hem meteen maken."
            : "Vul in wat er in je asset moet komen te staan."}
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <div className="border-border bg-card shadow-paper space-y-6 rounded-2xl border p-6 sm:p-8">
          {template.fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={values[field.name] ?? ""}
              error={fieldErrors[field.name]}
              onChange={(value) => setValue(field.name, value)}
            />
          ))}

          {noFields && (
            <p className="text-muted-foreground text-sm">
              Er valt hier niets in te vullen.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          <Button
            type="submit"
            size="lg"
            disabled={create.isPending || (!hasInput && !noFields)}
            className="w-full sm:w-auto sm:min-w-56"
          >
            {create.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Bezig met versturen…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Maak mijn asset
              </>
            )}
          </Button>

          <p className="text-muted-foreground text-xs" aria-live="polite">
            {!hasInput && !noFields
              ? "Vul eerst minstens één veld in."
              : "Dit duurt meestal een halve minuut."}
          </p>
        </div>
      </form>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-2xl">
      <Skeleton className="mb-6 h-4 w-40" />
      <Skeleton className="mb-3 h-9 w-2/3" />
      <Skeleton className="mb-8 h-5 w-1/2" />
      <div className="border-border bg-card space-y-6 rounded-2xl border p-6 sm:p-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="mx-auto mt-6 h-11 w-56" />
    </div>
  );
}
