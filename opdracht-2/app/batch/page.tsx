import { AppShell } from "@/components/app-shell";
import { TemplateGrid } from "@/components/template-grid";

/** Dezelfde grid, maar elke kaart leidt naar de CSV-flow van die template. */
export default function BatchPickerPage() {
  return (
    <AppShell>
      <div className="mb-9 max-w-2xl space-y-3">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">
          Meerdere tegelijk maken
        </h1>
        <p className="text-muted-foreground text-base text-balance sm:text-lg">
          Kies een template. Je krijgt er een invulbestand bij dat je in Excel
          vult — één regel per asset — en daarna in één keer inleest.
        </p>
      </div>

      <TemplateGrid mode="batch" />
    </AppShell>
  );
}
