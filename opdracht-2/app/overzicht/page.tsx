import { AppShell } from "@/components/app-shell";
import { JobsOverview } from "@/components/jobs-overview";

export default function OverviewPage() {
  return (
    <AppShell>
      <div className="mb-9 max-w-2xl space-y-3">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Jouw assets</h1>
        <p className="text-muted-foreground text-base text-balance sm:text-lg">
          Wat er loopt en wat er klaar staat. Je kunt dit tabblad sluiten — we
          onthouden het in deze browser.
        </p>
      </div>

      <JobsOverview />
    </AppShell>
  );
}
