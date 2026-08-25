"use client";

import { AlertCircle, KeyRound, RotateCw, Wifi } from "lucide-react";

import { ClientError } from "@/lib/client";
import { Button } from "@/components/ui/button";

/**
 * Eén foutscherm voor de hele app. Toont wat er aan de hand is in gewone taal
 * plus, als het zin heeft, een knop om het opnieuw te proberen. Nooit een
 * stacktrace, nooit een statuscode, nooit rauwe API-tekst.
 */
export function ErrorState({
  error,
  onRetry,
  title = "Dat lukte niet",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const clientError = error instanceof ClientError ? error : null;
  const code = clientError?.code ?? "upstream";
  const message =
    clientError?.message ?? "Er ging iets mis. Probeer het nog een keer.";
  const canRetry = (clientError?.retryable ?? true) && Boolean(onRetry);

  const Icon = code === "config" ? KeyRound : code === "network" ? Wifi : AlertCircle;

  return (
    <div className="border-border bg-card shadow-paper mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border p-8 text-center">
      <span className="bg-destructive/10 text-destructive flex size-11 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1.5">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>

      {code === "config" && (
        <p className="text-muted-foreground bg-muted rounded-lg px-3 py-2 text-left font-mono text-xs">
          cp .env.example .env.local
          <br />
          STORYTEQ_API_KEY=...
        </p>
      )}

      {canRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-1">
          <RotateCw className="size-4" />
          Opnieuw proberen
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-border/80 mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
      {children}
    </div>
  );
}
