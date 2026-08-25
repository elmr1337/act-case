import "server-only";
import { cookies } from "next/headers";

/**
 * Een anonieme sessie, alleen om jouw joblijst aan te hangen als Redis aanstaat.
 * Geen account, geen persoonsgegevens: een willekeurige id in een httpOnly
 * cookie. Zonder Redis wordt hij nooit aangemaakt.
 */
const COOKIE = "storyteq_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function getSessionId(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing) return existing;

  const id = crypto.randomUUID();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return id;
}

export const SESSION_TTL_SECONDS = MAX_AGE;
