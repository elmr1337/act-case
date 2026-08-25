import { AppShell } from "@/components/app-shell";
import { TemplateGrid } from "@/components/template-grid";

export default function HomePage() {
  return (
    <AppShell step="choose">
      <div className="mb-9 max-w-2xl space-y-3">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">
          Waar wil je mee beginnen?
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg">
          Kies een template. Je vult daarna alleen de tekst en beelden in — de
          rest gebeurt vanzelf.
        </p>
      </div>
      <TemplateGrid />
    </AppShell>
  );
}
