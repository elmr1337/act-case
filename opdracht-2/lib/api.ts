import { NextResponse } from "next/server";

import { AppError, HTTP_STATUS, toAppError } from "./errors";

/**
 * Route-handler helpers. Elke fout verlaat de server via `fail()`, zodat er
 * nooit een stacktrace of rauwe Storyteq-response in de browser belandt.
 */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function fail(err: unknown) {
  const appError = toAppError(err);

  // Server-side wél het volledige verhaal, want daar zoeken we het op.
  console.error(`[api] ${appError.code}`, appError.detail ?? appError.message);

  return NextResponse.json(appError.toResponseBody(), {
    status: HTTP_STATUS[appError.code],
  });
}

/** Wikkelt een handler zodat elke worp een nette JSON-fout wordt. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return fail(err);
    }
  };
}

export { AppError };
