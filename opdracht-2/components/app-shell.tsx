import Link from "next/link";

import { StepBar, type StepId } from "@/components/step-bar";

/**
 * Eén frame om alle stappen heen. Bewust geen sidebar, geen navigatie, geen
 * dashboard: er is precies één ding te doen en de bovenbalk laat alleen zien
 * waar je in die ene flow bent.
 */
export function AppShell({
  step,
  children,
}: {
  step: StepId;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="font-heading text-lg font-bold tracking-tight transition-opacity hover:opacity-70"
            >
              Asset maken
            </Link>
            <span className="text-muted-foreground hidden text-sm sm:inline">
              powered by Storyteq
            </span>
          </div>
          <StepBar current={step} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>

      <footer className="border-t border-border/70">
        <div className="text-muted-foreground mx-auto w-full max-w-5xl px-5 py-6 text-xs sm:px-8">
          ACT.agency praktijkcase · gebouwd met Next.js en de Storyteq API
        </div>
      </footer>
    </div>
  );
}
