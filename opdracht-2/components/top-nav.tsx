"use client";

import { Rows3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { JobsMenu } from "@/components/jobs-menu";
import { cn } from "@/lib/utils";

/**
 * De vaste navigatie. Bewust géén ingang naar de batch-flow hier: die hangt aan
 * een template, en met een knop bovenin én een schakelaar in de balk zou je twee
 * bedieningen hebben voor hetzelfde. Je kiest eerst een template, daarna of je
 * er één of meerdere maakt.
 */
export function TopNav() {
  const pathname = usePathname();
  const active = pathname === "/overzicht";

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/overzicht"
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors sm:px-4",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border hover:border-foreground/25",
        )}
      >
        <Rows3 className="size-4" />
        <span className="hidden sm:inline">Overzicht</span>
      </Link>

      <JobsMenu />
    </div>
  );
}
