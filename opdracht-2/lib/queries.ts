"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import { api, ClientError } from "./client";
import type { AssetState, TemplateDetail, TemplateSummary } from "./dto";

/**
 * Alles in deze app is server state: templates, de aanmaak-actie, en de status
 * van een render. Vandaar TanStack Query en géén state manager — er is
 * simpelweg geen client state die er een rechtvaardigt.
 */

export const keys = {
  templates: ["templates"] as const,
  template: (id: string) => ["template", id] as const,
  asset: (id: string) => ["asset", id] as const,
};

export function useTemplates(): UseQueryResult<TemplateSummary[]> {
  return useQuery({
    queryKey: keys.templates,
    queryFn: async () => {
      const { templates } = await api<{ templates: TemplateSummary[] }>("/api/templates");
      return templates;
    },
    staleTime: 60_000,
  });
}

export function useTemplate(id: string | null): UseQueryResult<TemplateDetail> {
  return useQuery({
    queryKey: keys.template(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => {
      const { template } = await api<{ template: TemplateDetail }>(
        `/api/templates/${encodeURIComponent(id!)}`,
      );
      return template;
    },
    staleTime: 60_000,
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      templateId: string;
      parameters: Record<string, string>;
    }) => {
      const { asset } = await api<{ asset: AssetState }>("/api/assets", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return asset;
    },
    onSuccess: (asset) => {
      // De status-pagina heeft meteen data; het pollen begint dus niet blind.
      queryClient.setQueryData(keys.asset(asset.id), asset);
    },
  });
}

/** Hoe vaak we pollen zolang de render loopt. */
const POLL_MS = 2000;

export function useAssetStatus(id: string | null): UseQueryResult<AssetState> {
  return useQuery({
    queryKey: keys.asset(id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => {
      const { asset } = await api<{ asset: AssetState }>(
        `/api/assets/${encodeURIComponent(id!)}`,
      );
      return asset;
    },
    // Pollen zolang het loopt, stoppen zodra het klaar of mislukt is.
    refetchInterval: (query) => {
      const asset = query.state.data;
      if (!asset) return POLL_MS;
      return asset.done || asset.failed ? false : POLL_MS;
    },
    refetchIntervalInBackground: true,
    // Een enkele hik in het pollen mag de gebruiker niet in een foutscherm gooien.
    retry: (failureCount, error) => {
      if (error instanceof ClientError && !error.retryable) return false;
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
