"use client";

import {
  ArrowRight,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  Rows3,
  Search,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ErrorState, EmptyState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTemplates } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { TemplateSummary } from "@/lib/dto";

type MediaKind = NonNullable<TemplateSummary["mediaKind"]>;
type SortKey = "recent" | "name" | "used";
type ViewMode = "grid" | "rows";

const KIND_LABEL: Record<string, string> = {
  video: "Video",
  banner: "Banner",
  image: "Afbeelding",
  onbekend: "Template",
};

const SORT_LABEL: Record<SortKey, string> = {
  recent: "Laatst gewijzigd",
  name: "Naam (A–Z)",
  used: "Meest gebruikt",
};

/** Stap 1: kiezen. Eén klik op een kaart en je bent bij het invullen. */
export function TemplateGrid() {
  const hrefFor = (id: string) => `/maken/${encodeURIComponent(id)}`;

  const { data, isPending, isError, error, refetch } = useTemplates();

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MediaKind | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<ViewMode>("grid");

  // Welke soorten er in dit account voorkomen — een filter tonen voor iets wat
  // er niet is, is alleen maar ruis.
  const availableKinds = useMemo(() => {
    const kinds = new Set<MediaKind>();
    for (const t of data ?? []) if (t.mediaKind) kinds.add(t.mediaKind);
    return [...kinds];
  }, [data]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = (data ?? []).filter((t) => {
      if (kind !== "all" && t.mediaKind !== kind) return false;
      return !needle || t.name.toLowerCase().includes(needle);
    });

    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "nl");
      if (sort === "used") return (b.usageCount ?? 0) - (a.usageCount ?? 0);
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });
  }, [data, query, kind, sort]);

  if (isPending) return <TemplateGridSkeleton />;

  if (isError) {
    return (
      <ErrorState
        title="De templates konden niet geladen worden"
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Nog geen templates"
        description="Er staan geen templates klaar voor dit account. Zodra ze in Storyteq zijn aangemaakt, verschijnen ze hier."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Toolbar
        query={query}
        onQuery={setQuery}
        kind={kind}
        onKind={setKind}
        availableKinds={availableKinds}
        sort={sort}
        onSort={setSort}
        view={view}
        onView={setView}
        total={data.length}
        shown={visible.length}
      />

      {visible.length === 0 ? (
        <EmptyState
          title="Niets gevonden"
          description={`Geen template met "${query.trim()}"${kind === "all" ? "" : ` in ${KIND_LABEL[kind].toLowerCase()}`}.`}
        >
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setKind("all");
            }}
          >
            Filters wissen
          </Button>
        </EmptyState>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((template) => (
            <li key={template.id}>
              <TemplateCard template={template} href={hrefFor(template.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-2xl border">
          {visible.map((template) => (
            <li key={template.id}>
              <TemplateRow template={template} href={hrefFor(template.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Toolbar({
  query,
  onQuery,
  kind,
  onKind,
  availableKinds,
  sort,
  onSort,
  view,
  onView,
  total,
  shown,
}: {
  query: string;
  onQuery: (value: string) => void;
  kind: MediaKind | "all";
  onKind: (value: MediaKind | "all") => void;
  availableKinds: MediaKind[];
  sort: SortKey;
  onSort: (value: SortKey) => void;
  view: ViewMode;
  onView: (value: ViewMode) => void;
  total: number;
  shown: number;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Zoek een template…"
            aria-label="Zoek een template"
            className="h-11 pl-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Zoekterm wissen"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {availableKinds.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={kind === "all"} onClick={() => onKind("all")}>
              Alles
            </FilterChip>
            {availableKinds.map((option) => (
              <FilterChip
                key={option}
                active={kind === option}
                onClick={() => onKind(option)}
              >
                {KIND_LABEL[option]}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span
          className="text-muted-foreground hidden text-sm tabular-nums sm:inline"
          aria-live="polite"
        >
          {shown === total ? `${total} templates` : `${shown} van ${total}`}
        </span>

        <Select value={sort} onValueChange={(v) => onSort(v as SortKey)}>
          <SelectTrigger className="h-11 w-44" aria-label="Sorteren">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABEL[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div
          className="bg-muted flex items-center gap-0.5 rounded-lg p-1"
          role="group"
          aria-label="Weergave"
        >
          <ViewButton active={view === "grid"} onClick={() => onView("grid")} label="Raster">
            <LayoutGrid className="size-4" />
          </ViewButton>
          <ViewButton active={view === "rows"} onClick={() => onView("rows")} label="Lijst">
            <Rows3 className="size-4" />
          </ViewButton>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex size-9 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function KindIcon({ kind }: { kind: TemplateSummary["mediaKind"] }) {
  const Icon = kind === "video" ? Film : kind === "banner" ? LayoutTemplate : ImageIcon;
  return <Icon className="size-3.5" />;
}

/**
 * Thumbnails komen via onze eigen proxy binnen en gaan door de
 * Next-beeldoptimalisatie: op maat geschaald, in webp/avif, en lazy geladen.
 * Boven de vouw krijgen de eerste zes prioriteit.
 */
function Thumbnail({
  template,
  priority,
  sizes,
  className,
}: {
  template: TemplateSummary;
  priority: boolean;
  sizes: string;
  className?: string;
}) {
  if (!template.thumbnailUrl) {
    return (
      <div
        className={cn(
          "bg-muted text-muted-foreground flex items-center justify-center",
          className,
        )}
      >
        <KindIcon kind={template.mediaKind} />
      </div>
    );
  }

  return (
    <Image
      src={template.thumbnailUrl}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
    />
  );
}

function TemplateCard({ template, href }: { template: TemplateSummary; href: string }) {
  return (
    <Link
      href={href}
      className="group border-border bg-card focus-visible:ring-ring block h-full overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <div className="bg-muted relative aspect-[16/10] overflow-hidden">
        <Thumbnail
          template={template}
          priority={false}
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      <div className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1">
          <h2 className="font-heading truncate text-base font-semibold">
            {template.name}
          </h2>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <KindIcon kind={template.mediaKind} />
            {KIND_LABEL[template.mediaKind ?? "onbekend"]}
          </p>
        </div>
        <ArrowRight className="text-muted-foreground group-hover:text-primary mt-0.5 size-4 shrink-0 transition-all group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function TemplateRow({ template, href }: { template: TemplateSummary; href: string }) {
  return (
    <Link
      href={href}
      className="group bg-card hover:bg-accent/40 focus-visible:ring-ring flex items-center gap-4 p-3 transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2 sm:gap-5 sm:p-4"
    >
      <div className="bg-muted relative aspect-[16/10] w-24 shrink-0 overflow-hidden rounded-lg sm:w-32">
        <Thumbnail template={template} priority={false} sizes="128px" />
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="font-heading truncate text-base font-semibold">{template.name}</h2>
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-sm">
          <KindIcon kind={template.mediaKind} />
          {KIND_LABEL[template.mediaKind ?? "onbekend"]}
          {template.usageCount !== null && (
            <span className="text-muted-foreground/70">
              · {template.usageCount}× gebruikt
            </span>
          )}
        </p>
      </div>

      <ArrowRight className="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-all group-hover:translate-x-0.5" />
    </Link>
  );
}

function TemplateGridSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
        <Skeleton className="h-11 w-full sm:max-w-72" />
        <Skeleton className="h-11 w-64" />
      </div>
      <ul
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Templates worden geladen"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="border-border bg-card overflow-hidden rounded-2xl border">
            <Skeleton className="aspect-[16/10] rounded-none" />
            <div className="space-y-2 p-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
