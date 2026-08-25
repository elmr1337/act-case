"use client";

import { FileText, Table2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Eén asset of een hele lijst — voor dezelfde template. Zonder deze schakelaar
 * zie je aan niets dat je in een andere modus zit: de pagina's lijken op elkaar
 * en de URL leest niemand.
 */
export function ModeToggle({ templateId }: { templateId: string }) {
  const pathname = usePathname();
  const batch = pathname.endsWith("/batch");
  const base = `/maken/${encodeURIComponent(templateId)}`;

  return (
    <div
      className="bg-muted inline-flex shrink-0 gap-0.5 rounded-xl p-1"
      role="group"
      aria-label="Hoeveel assets"
    >
      <Option href={base} active={!batch} icon={<FileText className="size-4" />}>
        Eén
      </Option>
      <Option href={`${base}/batch`} active={batch} icon={<Table2 className="size-4" />}>
        Meerdere
      </Option>
    </div>
  );
}

function Option({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}
