"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { ClientError } from "@/lib/client";

export function Providers({ children }: { children: React.ReactNode }) {
  // Eén client per browser-sessie; niet op module-niveau, anders delen
  // server-renders in dev per ongeluk dezelfde cache.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Een mislukte call is bijna altijd de API, niet de gebruiker:
            // twee stille pogingen, daarna pas een foutscherm. Maar een
            // ontbrekende sleutel of een 404 wordt niet beter van herhalen.
            retry: (failureCount, error) => {
              if (error instanceof ClientError && !error.retryable) return false;
              return failureCount < 2;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
