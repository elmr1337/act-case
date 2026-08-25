"use client";

import { RotateCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Vangnet voor onverwachte fouten. Ook hier: geen stacktrace op het scherm. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="font-heading text-2xl font-bold">Er ging iets mis</h1>
      <p className="text-muted-foreground text-sm">
        Onverwacht probleem aan onze kant. Probeer het opnieuw — meestal is het
        daarmee opgelost.
      </p>
      <Button onClick={reset}>
        <RotateCw className="size-4" />
        Opnieuw proberen
      </Button>
    </div>
  );
}
