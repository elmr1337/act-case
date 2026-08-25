import { getConfig } from "./config";
import { logDiscovery, redactHeaders, shapeOf } from "./discovery";
import { AppError } from "./errors";

/**
 * Laagste laag: één HTTP-call naar Storyteq, met auth, timing en discovery-logging.
 *
 * Bewust géén `server-only` hier, zodat `scripts/explore.ts` dezelfde transport
 * kan gebruiken om ongedocumenteerde endpoints af te tasten. De token wordt
 * alleen via `getConfig()` gelezen en verlaat deze module niet.
 */

const TIMEOUT_MS = 30_000;

export type RawResult = {
  ok: boolean;
  status: number;
  ms: number;
  body: unknown;
  bodyText: string;
  contentType: string | null;
};

/** Doet de call, logt hem, en geeft de rauwe response terug. Gebruikt door scripts/explore.ts. */
export async function rawRequest(
  path: string,
  init: { method?: string; body?: unknown; note?: string } = {},
): Promise<RawResult> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;
  const method = init.method ?? "GET";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  // Niet gedocumenteerd in v4, maar sommige Storyteq-endpoints kennen tenant-headers.
  if (config.companyId) headers["X-Company-Id"] = config.companyId;

  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    await logDiscovery(
      {
        ts: new Date().toISOString(),
        method,
        path,
        status: 0,
        ms,
        requestHeaders: redactHeaders(headers),
        error: timedOut ? "timeout" : String(err),
        note: init.note,
      },
      config.discoveryLog,
    );
    throw new AppError(timedOut ? "timeout" : "network", { cause: err });
  }

  const ms = Math.round(performance.now() - started);
  const bodyText = await response.text();
  const contentType = response.headers.get("content-type");

  let body: unknown;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = undefined;
  }

  await logDiscovery(
    {
      ts: new Date().toISOString(),
      method,
      path,
      status: response.status,
      ms,
      requestHeaders: redactHeaders(headers),
      requestShape: init.body === undefined ? undefined : shapeOf(init.body),
      responseShape: body === undefined ? "non-json" : shapeOf(body),
      // Foutteksten loggen we wél letterlijk: dat is precies wat we willen leren.
      error: response.ok ? undefined : bodyText.slice(0, 500),
      note: init.note,
    },
    config.discoveryLog,
  );

  return { ok: response.ok, status: response.status, ms, body, bodyText, contentType };
}
