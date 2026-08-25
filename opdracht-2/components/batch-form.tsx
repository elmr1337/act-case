"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Table2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/feedback";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ClientError } from "@/lib/client";
import {
  buildTemplateCsv,
  mapColumns,
  parseCsv,
  rowsToParameters,
  type ColumnMapping,
  type ParsedRow,
} from "@/lib/csv";
import type { AssetState, TemplateDetail } from "@/lib/dto";
import { addJobs } from "@/lib/jobs";
import { askForNotificationPermission } from "@/lib/notify";
import { useTemplate } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Hoeveel renders we tegelijk aanmelden — beleefd blijven tegen de API. */
const CONCURRENCY = 3;

export function BatchForm({ templateId }: { templateId: string }) {
  const { data: template, isPending, isError, error, refetch } = useTemplate(templateId);

  if (isPending) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
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

  return <BatchWizard key={template.id} template={template} />;
}

type Parsed = { rows: ParsedRow[]; mapping: ColumnMapping; fileName: string };

function BatchWizard({ template }: { template: TemplateDetail }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(0);

  const valid = useMemo(
    () => parsed?.rows.filter((row) => row.errors.length === 0) ?? [],
    [parsed],
  );
  const invalid = useMemo(
    () => parsed?.rows.filter((row) => row.errors.length > 0) ?? [],
    [parsed],
  );

  function downloadTemplate() {
    const csv = buildTemplateCsv(template.fields);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(template.name)}-invulbestand.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function readFile(file: File) {
    setParseError(null);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) {
        setParsed(null);
        setParseError("Dit bestand bevat geen regels onder de kolomkoppen.");
        return;
      }
      const mapping = mapColumns(rows[0], template.fields);
      setParsed({
        rows: rowsToParameters(rows, mapping, template.fields),
        mapping,
        fileName: file.name,
      });
    } catch {
      setParsed(null);
      setParseError("Dit bestand konden we niet lezen. Is het wel een CSV?");
    }
  }

  async function generateAll() {
    if (valid.length === 0) return;
    setSending(true);
    setSent(0);

    // Nu vragen, niet bij het laden: hier snapt de gebruiker waarom.
    await askForNotificationPermission();

    const created: Array<{ id: string; label: string }> = [];
    const failed: string[] = [];
    const queue = [...valid];

    async function worker() {
      for (let row = queue.shift(); row; row = queue.shift()) {
        try {
          const { asset } = await api<{ asset: AssetState }>("/api/assets", {
            method: "POST",
            body: JSON.stringify({
              templateId: template.id,
              parameters: row.parameters,
            }),
          });
          created.push({ id: asset.id, label: row.label });
        } catch (err) {
          failed.push(
            `Regel ${row.line}: ${err instanceof ClientError ? err.message : "afgewezen"}`,
          );
        } finally {
          setSent((count) => count + 1);
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (created.length > 0) {
      addJobs(
        created.map((item) => ({
          id: item.id,
          templateId: template.id,
          templateName: template.name,
          label: item.label,
        })),
      );
      toast.success(
        `${created.length} ${created.length === 1 ? "asset" : "assets"} in de wachtrij`,
        { description: "Je hoort het zodra ze klaar zijn." },
      );
    }

    if (failed.length > 0) {
      toast.error(`${failed.length} regel(s) niet aangemeld`, {
        description: failed.slice(0, 3).join(" · "),
        duration: 10_000,
      });
    }

    setSending(false);
    if (created.length > 0) router.push("/overzicht");
  }

  const actions = (
    <div className="flex items-center gap-3">
      <Link
        href="/batch"
        aria-label="Andere template kiezen"
        className="text-muted-foreground hover:text-foreground hover:border-foreground/25 border-border flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors"
      >
        <ArrowLeft className="size-4" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="font-heading truncate text-base font-semibold">{template.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {parsed
            ? `${valid.length} klaar om te maken${invalid.length ? `, ${invalid.length} met een probleem` : ""}`
            : "Meerdere tegelijk via een invulbestand"}
        </p>
      </div>

      <ModeToggle templateId={template.id} />

      <Button
        type="button"
        size="lg"
        onClick={generateAll}
        disabled={sending || valid.length === 0}
        className="h-12 shrink-0 px-6 text-base"
      >
        {sending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {sent}/{valid.length}
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            <span className="hidden sm:inline">
              {valid.length > 0 ? `Maak ${valid.length} assets` : "Maak alles"}
            </span>
            <span className="sm:hidden">Maken</span>
          </>
        )}
      </Button>
    </div>
  );

  return (
    <AppShell actions={actions}>
      <div className="mx-auto max-w-3xl">
        {/* Zonder deze kop lijkt de batch-pagina te veel op het gewone
            formulier — je moet meteen zien dat je iets anders aan het doen bent. */}
        <div className="mb-8 space-y-2">
          <span className="bg-accent text-accent-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <Table2 className="size-3.5" />
            Meerdere tegelijk
          </span>
          {/* De templatenaam staat al in de balk hierboven; hier gaat het om
              de modus waar je in zit. */}
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">
            Maak er meerdere in één keer
          </h1>
          <p className="text-muted-foreground text-lg text-balance">
            Vul één regel per asset in een bestand en maak ze in één keer.
            Liever er één?{" "}
            <Link
              href={`/maken/${encodeURIComponent(template.id)}`}
              className="text-primary hover:text-primary/80 font-medium underline underline-offset-4 transition-colors"
            >
              Terug naar het formulier
            </Link>
            .
          </p>
        </div>

        <ol className="space-y-6">
          <li className="border-border rounded-2xl border p-6">
            <Step number={1} title="Haal het invulbestand op">
              Eén kolom per veld, met de verplichte velden gemarkeerd. De eerste
              regel is een voorbeeld — die mag je overschrijven.
            </Step>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={downloadTemplate}
              className="mt-4 h-12 rounded-xl"
            >
              <Download className="size-4" />
              Invulbestand downloaden
            </Button>
          </li>

          <li className="border-border rounded-2xl border p-6">
            <Step number={2} title="Vul hem in Excel of Numbers">
              Eén regel per asset. Bij een keuzeveld vul je het label in — bijvoorbeeld{" "}
              <span className="text-foreground font-medium">
                {template.fields.find((f) => f.kind === "select")?.options?.[0]?.label ??
                  "Groen"}
              </span>
              . Sla op als CSV.
            </Step>
          </li>

          <li className="border-border rounded-2xl border p-6">
            <Step number={3} title="Lees hem hier weer in">
              We controleren elke regel voordat er iets gemaakt wordt.
            </Step>

            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />

            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) void readFile(file);
              }}
              className="border-border mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center"
            >
              <FileSpreadsheet className="text-muted-foreground size-7" />
              <p className="text-muted-foreground text-sm">
                {parsed ? parsed.fileName : "Sleep je bestand hierheen of kies het"}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInput.current?.click()}
                className="h-11 rounded-xl"
              >
                <Upload className="size-4" />
                Bestand kiezen
              </Button>
            </div>

            {parseError && (
              <p className="text-destructive mt-3 text-sm" role="alert">
                {parseError}
              </p>
            )}
          </li>
        </ol>

        {parsed && <Preview parsed={parsed} valid={valid} invalid={invalid} />}
      </div>
    </AppShell>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
        {number}
      </span>
      <div className="space-y-1.5">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm text-balance">{children}</p>
      </div>
    </div>
  );
}

function Preview({
  parsed,
  valid,
  invalid,
}: {
  parsed: Parsed;
  valid: ParsedRow[];
  invalid: ParsedRow[];
}) {
  return (
    <div className="mt-8 space-y-4">
      {parsed.mapping.missingRequired.length > 0 && (
        <Notice tone="error">
          Deze verplichte kolommen ontbreken:{" "}
          {parsed.mapping.missingRequired.map((f) => f.label).join(", ")}. Gebruik het
          invulbestand van stap 1.
        </Notice>
      )}

      {parsed.mapping.unknownHeaders.length > 0 && (
        <Notice tone="warning">
          Deze kolommen kennen we niet en slaan we over:{" "}
          {parsed.mapping.unknownHeaders.join(", ")}.
        </Notice>
      )}

      <div className="border-border overflow-hidden rounded-2xl border">
        <div className="border-border/70 flex items-center justify-between border-b px-4 py-3">
          <p className="font-heading text-sm font-semibold">
            {parsed.rows.length} regels gelezen
          </p>
          <p className="text-muted-foreground text-sm">
            {valid.length} klaar
            {invalid.length > 0 && ` · ${invalid.length} met een probleem`}
          </p>
        </div>

        <ul className="divide-border max-h-96 divide-y overflow-y-auto">
          {parsed.rows.map((row) => (
            <li key={row.line} className="flex items-start gap-3 px-4 py-3">
              {row.errors.length === 0 ? (
                <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" />
              ) : (
                <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.label}</p>
                {row.errors.length > 0 && (
                  <p className="text-destructive text-xs">{row.errors.join(" · ")}</p>
                )}
              </div>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                regel {row.line}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "error" | "warning";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-progress/30 bg-progress/5 text-foreground",
      )}
      role="alert"
    >
      {children}
    </p>
  );
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "template"
  );
}
