"use client";

import type { ApiErrorBody } from "./errors";

/**
 * De enige plek waar de browser HTTP doet. Praat uitsluitend met onze eigen
 * route handlers — nooit rechtstreeks met Storyteq.
 */

export class ClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly fields?: Record<string, string[]>;

  constructor(body: ApiErrorBody["error"]) {
    super(body.message);
    this.name = "ClientError";
    this.code = body.code;
    this.retryable = body.retryable;
    this.fields = "fields" in body ? body.fields : undefined;
  }
}

const FALLBACK = "Er ging iets mis. Probeer het opnieuw.";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ClientError({
      code: "network",
      message: "We konden de server niet bereiken. Controleer je verbinding.",
      retryable: true,
    });
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ClientError(
      error ?? { code: "upstream", message: FALLBACK, retryable: true },
    );
  }
  return body as T;
}
