import { Rows3, Table2 } from "lucide-react";
import Link from "next/link";

import { JobsMenu } from "@/components/jobs-menu";

/**
 * Eén frame om alle stappen heen. Geen sidebar, geen dashboard: een topbar met
 * de twee dingen die je overal nodig hebt — meerdere tegelijk maken, en zien
 * wat er loopt — en verder alle ruimte voor de stap waar je in zit.
 *
 * `actions` hangt onderin diezelfde sticky balk, zodat de knop van een stap in
 * beeld blijft tijdens het scrollen zonder ergens een headerhoogte na te rekenen.
 */
export function AppShell({
  actions,
  children,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border/70 bg-background/85 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <Link
            href="/"
            className="font-heading text-lg font-bold tracking-tight transition-opacity hover:opacity-70"
          >
            Asset maken
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/batch"
              className="border-border hover:border-foreground/25 flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors sm:px-4"
            >
              <Table2 className="size-4" />
              <span className="hidden sm:inline">Meerdere tegelijk</span>
            </Link>

            <Link
              href="/overzicht"
              aria-label="Overzicht van jouw assets"
              className="border-border hover:border-foreground/25 hidden h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors sm:flex"
            >
              <Rows3 className="size-4" />
              Overzicht
            </Link>

            <JobsMenu />
          </div>
        </div>

        {actions && (
          <div className="border-border/70 border-t">
            <div className="mx-auto w-full max-w-5xl px-5 py-3 sm:px-8">{actions}</div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>

      <footer className="border-border/70 border-t">
        <div className="text-muted-foreground mx-auto w-full max-w-5xl px-5 py-6 text-xs sm:px-8">
          ACT.agency praktijkcase · gebouwd met Next.js en de Storyteq API
        </div>
      </footer>
    </div>
  );
}
