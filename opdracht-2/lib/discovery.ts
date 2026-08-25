import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Discovery-logger. De Storyteq API is deels ongedocumenteerd; elke call die de
 * proxy doet wordt hier vastgelegd zodat we docs/api-discovery.md kunnen voeden
 * met wat de API écht teruggeeft in plaats van met aannames.
 *
 * Wat WEL in het log gaat: method, path, status, timing en de *vorm* van de
 * response (een recursieve type-boom).
 * Wat NIET: de Authorization-header, en geen response-waardes — die kunnen
 * klantdata bevatten en het log wordt gecommit.
 */

const LOG_PATH = path.join(process.cwd(), "docs", "discovery", "log.jsonl");

export type Shape =
  | string
  | { [key: string]: Shape }
  | [Shape]
  | [];

/** Zet een waarde om in een type-boom. Waardes verdwijnen, structuur blijft. */
export function shapeOf(value: unknown, depth = 0): Shape {
  if (depth > 8) return "…";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return [unifyValues(value.slice(0, 20), depth + 1)];
  }
  switch (typeof value) {
    case "string":
      return stringShape(value);
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    case "boolean":
      return "boolean";
    case "object": {
      const out: Record<string, Shape> = {};
      for (const [k, v] of Object.entries(value as object)) {
        out[k] = shapeOf(v, depth + 1);
      }
      return out;
    }
    default:
      return typeof value;
  }
}

/**
 * Een lijst van templates of media is zelden homogeen: het ene item heeft
 * velden die het andere mist. In plaats van "union(2)" te melden voegen we de
 * sleutels recursief samen en markeren we met `?` wat niet in élk item zat —
 * precies wat je wilt weten over een API die je niet kent.
 */
function unifyValues(values: unknown[], depth: number): Shape {
  if (depth > 8) return "…";
  if (values.length === 0) return "null";

  const present = values.filter((v) => v !== null && v !== undefined);
  if (present.length === 0) return "null";

  if (present.every((v) => Array.isArray(v))) {
    const items = (present as unknown[][]).flat().slice(0, 40);
    return items.length === 0 ? [] : [unifyValues(items, depth + 1)];
  }

  if (present.every((v) => typeof v === "object" && !Array.isArray(v))) {
    const buckets = new Map<string, unknown[]>();
    for (const item of present) {
      for (const [key, value] of Object.entries(item as object)) {
        buckets.set(key, [...(buckets.get(key) ?? []), value]);
      }
    }

    const merged: Record<string, Shape> = {};
    for (const [key, bucketValues] of buckets) {
      // `?` betekent: niet elk item in deze lijst had dit veld.
      const optional = bucketValues.length < present.length;
      merged[optional ? `${key}?` : key] = unifyValues(bucketValues, depth + 1);
    }
    return merged;
  }

  const distinct = new Set(present.map((v) => JSON.stringify(shapeOf(v, depth))));
  return distinct.size === 1
    ? shapeOf(present[0], depth)
    : `mixed(${[...distinct].map((d) => JSON.parse(d)).map(labelOf).join("|")})`;
}

/** Korte naam voor een shape, voor in een `mixed(...)`-melding. */
function labelOf(shape: Shape): string {
  if (typeof shape === "string") return shape;
  if (Array.isArray(shape)) return "array";
  return "object";
}

function stringShape(value: string): string {
  if (/^https?:\/\//.test(value)) return "string(uri)";
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return "string(date-time)";
  if (value === "") return "string(empty)";
  return "string";
}

export type DiscoveryEntry = {
  ts: string;
  method: string;
  /** Path zonder host, met de echte ids — die zijn niet gevoelig en helpen bij reproduceren. */
  path: string;
  status: number;
  ms: number;
  /** Geredacte request-headers. */
  requestHeaders: Record<string, string>;
  /** Alleen bij een request body: de vorm ervan, niet de inhoud. */
  requestShape?: Shape;
  responseShape?: Shape;
  /** Foutmeldingen loggen we wél letterlijk — dat is precies de discovery-waarde. */
  error?: string;
  note?: string;
};

/**
 * Vervangt gevoelige headers door een onschadelijke marker. Naast de token gaat
 * ook `X-Company-Id` eruit: dat is een interne ACT-identifier en het log wordt
 * gecommit. Dát de header bestaat en verplicht is, staat in api-discovery.md —
 * de waarde hoeft daar niet bij.
 */
const SENSITIVE_HEADER = /authorization|api-key|token|cookie|company-id/i;

export function redactHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    out[key] = SENSITIVE_HEADER.test(key) ? `<redacted:${value.length}chars>` : value;
  });
  return out;
}

let warned = false;

export async function logDiscovery(entry: DiscoveryEntry, enabled: boolean) {
  if (!enabled) return;
  try {
    await mkdir(path.dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (err) {
    // Read-only filesystem (bijv. in de container) mag de app nooit slopen.
    if (!warned) {
      warned = true;
      console.warn("[discovery] log niet schrijfbaar, verder zonder:", err);
    }
  }
}
