import { z } from "zod";

/**
 * Server-side configuratie. Wordt nooit naar de client gestuurd:
 * geen enkele waarde hier is `NEXT_PUBLIC_*`.
 */
const REGIONS = ["europe-west1", "us-east4"] as const;

const schema = z.object({
  /** Persoonlijke bearer-token van een ACT-medewerker. Nooit loggen, nooit committen. */
  apiKey: z.string().min(1, "STORYTEQ_API_KEY ontbreekt"),
  region: z.enum(REGIONS),
  /** Override voor de base URL; anders afgeleid uit de region. */
  baseUrl: z.string().url(),
  /**
   * Komt niet voor in de v4-spec, maar is in de praktijk verplicht zodra de
   * token bij meerdere companies mag: zonder deze header antwoordt Storyteq met
   * 403 "This user has access to multiple companies". Schema-technisch
   * optioneel, want een token met één company werkt er wél zonder.
   * Zie docs/api-discovery.md §2.
   */
  companyId: z.string().optional(),
  /** Schrijft elke proxy-call naar docs/discovery/log.jsonl (auth geredact). */
  discoveryLog: z.boolean(),
});

export type StoryteqConfig = z.infer<typeof schema>;

export class ConfigError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Storyteq-configuratie onvolledig: ${issues.join(", ")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

function read(): StoryteqConfig {
  const region = process.env.STORYTEQ_REGION?.trim() || "europe-west1";
  const parsed = schema.safeParse({
    apiKey: process.env.STORYTEQ_API_KEY?.trim() ?? "",
    region,
    baseUrl:
      process.env.STORYTEQ_BASE_URL?.trim() ||
      `https://api.${region}.storyteq.com/v4`,
    companyId: process.env.STORYTEQ_COMPANY_ID?.trim() || undefined,
    // Alleen aan als je er expliciet om vraagt. Stond dit automatisch aan in
    // development, dan groeide docs/discovery/log.jsonl bij elke `make dev` en
    // was het bestand permanent "gewijzigd" in git. `npm run explore` zet hem
    // zelf aan, dus de verkenning blijft gewoon loggen.
    discoveryLog: (process.env.STORYTEQ_DISCOVERY_LOG?.trim() ?? "") === "1",
  });

  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`),
    );
  }
  return parsed.data;
}

let cached: StoryteqConfig | undefined;

/** Leest en valideert de config. Gooit ConfigError als de token ontbreekt. */
export function getConfig(): StoryteqConfig {
  cached ??= read();
  return cached;
}

/** Alleen voor tests/scripts: gooi de cache weg. */
export function resetConfigCache() {
  cached = undefined;
}
