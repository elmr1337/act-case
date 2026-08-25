"use client";

import { ArrowRight, Film, Image as ImageIcon, LayoutTemplate } from "lucide-react";
import Link from "next/link";

import { ErrorState, EmptyState } from "@/components/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { useTemplates } from "@/lib/queries";
import { initials, placeholderGradient } from "@/lib/visual";
import type { TemplateSummary } from "@/lib/dto";

/** Stap 1: kiezen. Eén klik op een kaart en je bent in stap 2. */
export function TemplateGrid() {
  const { data, isPending, isError, error, refetch } = useTemplates();

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
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((template) => (
        <li key={template.id}>
          <TemplateCard template={template} />
        </li>
      ))}
    </ul>
  );
}

function TemplateCard({ template }: { template: TemplateSummary }) {
  return (
    <Link
      href={`/maken/${encodeURIComponent(template.id)}`}
      className="group border-border bg-card shadow-paper hover:shadow-paper-lg focus-visible:ring-ring block h-full overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <div
        className="relative flex aspect-[16/10] items-center justify-center overflow-hidden"
        style={
          template.thumbnailUrl
            ? undefined
            : { backgroundImage: placeholderGradient(template.id) }
        }
      >
        {template.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- host is niet vooraf bekend
          <img
            src={template.thumbnailUrl}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <span className="font-heading text-3xl font-bold text-white/90 drop-shadow-sm">
            {initials(template.name)}
          </span>
        )}
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

const KIND_LABEL: Record<string, string> = {
  video: "Video",
  banner: "Banner",
  image: "Afbeelding",
  onbekend: "Template",
};

function KindIcon({ kind }: { kind: TemplateSummary["mediaKind"] }) {
  const Icon = kind === "video" ? Film : kind === "banner" ? LayoutTemplate : ImageIcon;
  return <Icon className="size-3.5" />;
}

function TemplateGridSkeleton() {
  return (
    <ul
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Templates worden geladen"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <li
          key={i}
          className="border-border bg-card overflow-hidden rounded-2xl border"
        >
          <Skeleton className="aspect-[16/10] rounded-none" />
          <div className="space-y-2 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
