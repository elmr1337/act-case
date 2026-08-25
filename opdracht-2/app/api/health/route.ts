import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

/**
 * Healthcheck voor Docker. Vertelt of de app draait én of de Storyteq-config
 * compleet is — zonder ook maar iets van de token prijs te geven.
 */
export function GET() {
  let storyteq: "configured" | "missing-key" = "missing-key";
  let region: string | null = null;
  try {
    const config = getConfig();
    storyteq = "configured";
    region = config.region;
  } catch {
    // config incompleet: de app leeft, maar kan niets nuttigs doen
  }

  return NextResponse.json({
    status: "ok",
    storyteq,
    region,
    uptime: Math.round(process.uptime()),
  });
}
