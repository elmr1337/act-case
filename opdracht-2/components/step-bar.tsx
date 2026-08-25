import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const STEPS = [
  { id: "choose", label: "Kies" },
  { id: "fill", label: "Vul in" },
  { id: "make", label: "Maken" },
  { id: "done", label: "Klaar" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

/**
 * Vier bolletjes. Geen breadcrumbs, geen percentages — alleen: hier ben je,
 * en zoveel komt er nog.
 */
export function StepBar({ current }: { current: StepId }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <ol className="flex items-center gap-1.5 sm:gap-3" aria-label="Voortgang">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;

        return (
          <li key={step.id} className="flex flex-1 items-center gap-1.5 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                  done && "bg-success text-success-foreground",
                  active && "bg-primary text-primary-foreground",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm transition-colors",
                  active ? "text-foreground font-medium" : "text-muted-foreground",
                  // Op mobiel alleen het label van de huidige stap tonen.
                  active ? "inline" : "hidden sm:inline",
                )}
              >
                {step.label}
              </span>
              <span className="sr-only">
                {active ? "(huidige stap)" : done ? "(afgerond)" : ""}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-px flex-1 transition-colors",
                  done ? "bg-success/40" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
