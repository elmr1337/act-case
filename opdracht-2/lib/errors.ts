/**
 * Eén foutentaxonomie voor de hele app. De UI ziet alleen `code` en
 * `userMessage` — nooit rauwe API-output (staat letterlijk in de opdracht).
 */
export type ErrorCode =
  | "config"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "upstream"
  | "network"
  | "timeout"
  | "shape";

/** Nederlandse, menselijke tekst per foutsoort. Geen jargon, geen stacktrace. */
const MESSAGES: Record<ErrorCode, string> = {
  config:
    "De verbinding met Storyteq is nog niet ingesteld. Vul de API-sleutel in .env.local in.",
  unauthorized:
    "Storyteq accepteert de API-sleutel niet. Controleer of de sleutel klopt en nog geldig is.",
  forbidden: "Deze sleutel heeft geen toegang tot dit onderdeel van Storyteq.",
  not_found: "Dit item bestaat niet (meer) in Storyteq.",
  validation: "Niet alle velden zijn goed ingevuld.",
  conflict: "Dit is net al aangemaakt. Even wachten of iets aanpassen.",
  rate_limited: "Storyteq krijgt te veel verzoeken tegelijk. Probeer het zo nog eens.",
  upstream: "Storyteq reageerde onverwacht. Probeer het opnieuw.",
  network: "We konden Storyteq niet bereiken. Controleer de internetverbinding.",
  timeout: "Storyteq deed er te lang over. Probeer het opnieuw.",
  shape: "Storyteq gaf een antwoord dat we niet konden lezen.",
};

/** Welke fouten zin hebben om opnieuw te proberen. Stuurt de retry-knop in de UI. */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  "rate_limited",
  "upstream",
  "network",
  "timeout",
]);

export const HTTP_STATUS: Record<ErrorCode, number> = {
  config: 503,
  unauthorized: 502,
  forbidden: 502,
  not_found: 404,
  validation: 422,
  conflict: 409,
  rate_limited: 429,
  upstream: 502,
  network: 502,
  timeout: 504,
  shape: 502,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Per-veld fouten bij `validation`, keyed op parameternaam. */
  readonly fieldErrors?: Record<string, string[]>;
  /** Alleen server-side: wat er echt gebeurde, voor de logs. */
  readonly detail?: string;

  constructor(
    code: ErrorCode,
    options: {
      message?: string;
      fieldErrors?: Record<string, string[]>;
      detail?: string;
      cause?: unknown;
    } = {},
  ) {
    super(options.message ?? MESSAGES[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = options.fieldErrors;
    this.detail = options.detail;
  }

  get retryable() {
    return RETRYABLE.has(this.code);
  }

  /** De enige vorm die de browser te zien krijgt. */
  toResponseBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.fieldErrors ? { fields: this.fieldErrors } : {}),
      },
    };
  }
}

/** Vertaalt een HTTP-status van Storyteq naar onze eigen code. */
export function codeForStatus(status: number): ErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  return "upstream";
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const detail = err instanceof Error ? err.message : String(err);
  return new AppError("upstream", { detail, cause: err });
}

/** Client-side vorm van `toResponseBody()`. */
export type ApiErrorBody = ReturnType<AppError["toResponseBody"]>;

/**
 * Storyteq's 422-teksten zijn Engels en gaan over API-veldnamen ("The
 * scene_1.headline field is required."). Die horen niet in een Nederlandse UI
 * voor niet-technische gebruikers. We vertalen wat we herkennen en vallen
 * anders terug op iets neutraals; de originele tekst blijft in `detail` staan
 * voor de server-logs.
 */
const FIELD_ERROR_RULES: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  [/required|mag niet leeg|must not be empty/i, "Dit veld is verplicht."],
  [
    /may not be greater than (\d+)|must not exceed (\d+)|max(?:imum)?[^\d]{0,10}(\d+)/i,
    (m) => `Dit is te lang — maximaal ${m[1] ?? m[2] ?? m[3]} tekens.`,
  ],
  [
    /at least (\d+)|min(?:imum)?[^\d]{0,10}(\d+)/i,
    (m) => `Dit is te kort — minimaal ${m[1] ?? m[2]} tekens.`,
  ],
  [/valid url|must be a (?:valid )?url|invalid url/i, "Dit moet een geldige link zijn."],
  [/image|jpe?g|png/i, "Dit moet een link naar een afbeelding zijn."],
  [/video|mp4/i, "Dit moet een link naar een video zijn."],
  [/colou?r|hex/i, "Gebruik een kleurcode zoals #1a2b3c."],
  [/numeric|must be a number|integer/i, "Vul hier een getal in."],
  [/format|invalid|does not match/i, "Deze waarde klopt nog niet."],
];

export function humanizeFieldError(messages: string[]): string {
  for (const message of messages) {
    for (const [pattern, replacement] of FIELD_ERROR_RULES) {
      const match = message.match(pattern);
      if (match) {
        return typeof replacement === "function" ? replacement(match) : replacement;
      }
    }
  }
  return "Deze waarde klopt nog niet.";
}
