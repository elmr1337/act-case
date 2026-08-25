"use client";

import { useQueries } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { api } from "@/lib/client";
import type { AssetState } from "@/lib/dto";
import { isRunning, updateJob } from "@/lib/jobs";
import { notify } from "@/lib/notify";
import { keys } from "@/lib/queries";
import { useJobs } from "@/lib/use-jobs";

/**
 * Bewaakt alle lopende renders, op welke pagina je ook bent. Hierdoor hoef je
 * niet op het wachtscherm te blijven staan: start er tien, doe wat anders, en
 * je hoort het zodra er een klaar is.
 *
 * Hangt in de Providers, dus hij draait overal.
 */
export function JobsWatcher() {
  const router = useRouter();
  const jobs = useJobs();
  const running = jobs.filter(isRunning);

  const results = useQueries({
    queries: running.map((job) => ({
      queryKey: keys.asset(job.id),
      queryFn: () =>
        api<{ asset: AssetState }>(`/api/assets/${encodeURIComponent(job.id)}`).then(
          (r) => r.asset,
        ),
      // Rustiger dan de 2 seconden op het wachtscherm: dit loopt op de
      // achtergrond en mag de API niet onnodig belasten.
      refetchInterval: 5000,
      refetchIntervalInBackground: true,
      retry: 2,
    })),
  });

  // Welke fase we het laatst gemeld hebben, zodat één melding per overgang komt.
  const announced = useRef(new Map<string, string>());

  useEffect(() => {
    results.forEach((result, index) => {
      const job = running[index];
      const asset = result.data;
      if (!job || !asset) return;

      updateJob(job.id, { phase: asset.phase });

      if (asset.phase !== "finished" && asset.phase !== "failed") return;
      if (announced.current.get(job.id) === asset.phase) return;
      announced.current.set(job.id, asset.phase);

      const name = job.label || job.templateName;
      if (asset.phase === "finished") {
        toast.success(`"${name}" is klaar`, {
          description: "Klik om te bekijken en downloaden.",
          action: {
            label: "Bekijken",
            onClick: () => router.push(`/asset/${encodeURIComponent(job.id)}`),
          },
          duration: 10_000,
        });
        notify("Je asset is klaar", name);
      } else {
        toast.error(`"${name}" is niet gelukt`, {
          description: "Bekijk hem in je overzicht om het opnieuw te proberen.",
          duration: 10_000,
        });
      }
    });
  }, [results, running, router]);

  return null;
}
