/**
 * Handmatige verkenning van de Storyteq API.
 *
 *   npm run explore                 # alles: auth-varianten, endpoint-probes, template-detail
 *   npm run explore -- templates    # alleen de lijst
 *   npm run explore -- template 123 # één template + parameter-configuratie
 *   npm run explore -- media 456    # status van één media
 *   npm run explore -- watch 456    # pollen tot finished/failed, met timings
 *   npm run explore -- create 123   # LET OP: maakt écht media aan (kost een render)
 *
 * Rauwe responses landen in docs/discovery/raw/ (gitignored — kan klantdata
 * bevatten). Het geaggregeerde vorm-log in docs/discovery/log.jsonl gaat wel mee.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfig } from "../lib/config";
import { shapeOf } from "../lib/discovery";
import { rawRequest } from "../lib/storyteq-transport";

const RAW_DIR = path.join(process.cwd(), "docs", "discovery", "raw");

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

function statusColor(status: number) {
  if (status === 0) return c.red("ERR");
  if (status < 300) return c.green(String(status));
  if (status < 500) return c.yellow(String(status));
  return c.red(String(status));
}

async function dump(name: string, data: unknown) {
  await mkdir(RAW_DIR, { recursive: true });
  const file = path.join(RAW_DIR, `${name}.json`);
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
  return path.relative(process.cwd(), file);
}

/**
 * Tast een pad af en rapporteert status + timing. Fouten worden gevangen:
 * een 404 is hier een resultaat, geen crash.
 */
async function probe(pathname: string, note: string, method: "GET" | "POST" = "GET") {
  try {
    const res = await rawRequest(pathname, { method, note });
    console.log(
      `  ${statusColor(res.status)} ${method.padEnd(4)} ${pathname.padEnd(46)} ${c.dim(`${res.ms}ms`)}`,
    );
    return res;
  } catch (err) {
    console.log(
      `  ${c.red("ERR")} ${method.padEnd(4)} ${pathname.padEnd(46)} ${c.dim(String(err))}`,
    );
    return null;
  }
}

/**
 * Probeert dezelfde call met verschillende auth-vormen. De spec zegt "Bearer",
 * maar we willen zwart op wit welke varianten de API accepteert of afwijst.
 */
async function probeAuthVariants() {
  const config = getConfig();
  const url = `${config.baseUrl}/content/templates/`;
  const variants: Array<[string, Record<string, string>]> = [
    ["Authorization: Bearer <token>", { Authorization: `Bearer ${config.apiKey}` }],
    ["Authorization: <token>", { Authorization: config.apiKey }],
    ["Authorization: Token <token>", { Authorization: `Token ${config.apiKey}` }],
    ["X-Api-Key: <token>", { "X-Api-Key": config.apiKey }],
    ["geen auth", {}],
    ["Bearer met onzin-token", { Authorization: "Bearer nope-this-is-not-a-token" }],
  ];

  console.log(c.bold("\nAuth-varianten op GET /content/templates/"));
  for (const [label, headers] of variants) {
    const started = performance.now();
    try {
      const res = await fetch(url, {
        headers: { ...headers, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      const ms = Math.round(performance.now() - started);
      const text = (await res.text()).slice(0, 120).replace(/\s+/g, " ");
      console.log(
        `  ${statusColor(res.status)} ${label.padEnd(32)} ${c.dim(`${ms}ms`)} ${c.dim(text)}`,
      );
    } catch (err) {
      console.log(`  ${c.red("ERR")} ${label.padEnd(32)} ${c.dim(String(err))}`);
    }
  }
}

/** Endpoints die niet in de v4-spec staan — bestaan ze? */
async function probeUndocumented(templateId?: string) {
  console.log(c.bold("\nOngedocumenteerde paden"));
  const paths: Array<[string, string]> = [
    ["/content/templates", "zonder trailing slash"],
    ["/content/media/", "media-lijst zonder id"],
    ["/content/templates/?page=2", "paginatie op templates"],
    ["/me", "wie is deze token"],
    ["/user", "wie is deze token"],
    ["/companies", "company-scope"],
    ["/content/folders/", "mappenstructuur"],
    ["/content/templates/0", "niet-bestaande template (foutvorm leren)"],
  ];
  if (templateId) {
    paths.push(
      [`/content/templates/${templateId}/media?page=1`, "paginatie op media"],
      [`/content/templates/${templateId}/preview`, "template preview/thumbnail"],
      [`/content/templates/${templateId}/parameters`, "losse parameters"],
      [`/content/templates/${templateId}/versions`, "template-versies"],
    );
  }
  for (const [p, note] of paths) await probe(p, note);
}

async function showTemplates() {
  console.log(c.bold("\nGET /content/templates/"));
  const res = await probe("/content/templates/", "templates ophalen");
  if (!res?.ok) return undefined;

  const file = await dump("templates", res.body);
  const body = res.body as { data?: unknown[] };
  const templates = Array.isArray(body?.data) ? body.data : [];
  console.log(`  ${templates.length} templates · rauw in ${c.dim(file)}`);
  console.log(c.dim(`  vorm: ${JSON.stringify(shapeOf(res.body)).slice(0, 400)}`));

  for (const t of templates.slice(0, 10)) {
    const tpl = t as Record<string, unknown>;
    console.log(`    ${String(tpl.id).padEnd(8)} ${String(tpl.name ?? "?")}`);
  }
  const first = templates[0] as Record<string, unknown> | undefined;
  return first ? String(first.id) : undefined;
}

async function showTemplate(templateId: string) {
  console.log(c.bold(`\nGET /content/templates/${templateId}`));
  const res = await probe(`/content/templates/${templateId}`, "template detail");
  if (!res?.ok) return;

  const file = await dump(`template-${templateId}`, res.body);
  console.log(`  rauw in ${c.dim(file)}`);

  const data = (res.body as { data?: Record<string, unknown> })?.data ?? {};
  const params = Array.isArray(data.parameters) ? data.parameters : [];

  // Dit is de belangrijkste onbekende: welke parameter-types bestaan er?
  // De spec zegt alleen `type: string` zonder enum.
  console.log(c.bold(`\n  Parameters (${params.length}) — type-enum is niet gedocumenteerd:`));
  const types = new Map<string, number>();
  for (const p of params as Array<Record<string, unknown>>) {
    const type = String(p.type ?? "?");
    types.set(type, (types.get(type) ?? 0) + 1);
    console.log(
      `    ${type.padEnd(16)} ${String(p.name ?? "").padEnd(40)} ${c.dim(String(p.label ?? ""))}`,
    );
    const extra = Object.keys(p).filter((k) => !["name", "label", "type"].includes(k));
    if (extra.length) console.log(c.dim(`      extra velden: ${extra.join(", ")}`));
  }
  console.log(c.bold(`\n  Gevonden types: ${[...types].map(([t, n]) => `${t}×${n}`).join(", ")}`));
}

async function showMedia(mediaId: string) {
  console.log(c.bold(`\nGET /content/media/${mediaId}`));
  const res = await probe(`/content/media/${mediaId}`, "media detail");
  if (!res?.ok) return null;
  await dump(`media-${mediaId}`, res.body);
  const data = (res.body as { data?: Record<string, unknown> })?.data ?? {};
  console.log(`  status: ${c.bold(String(data.current_status))}`);
  console.log(c.dim(`  vorm: ${JSON.stringify(shapeOf(res.body))}`));
  return data;
}

/** Pollen tot de render klaar is — levert de echte statusvolgorde en timings op. */
async function watchMedia(mediaId: string) {
  console.log(c.bold(`\nPollen op media ${mediaId} (elke 2s, max 5 min)`));
  const started = Date.now();
  const seen: Array<{ status: string; at: number }> = [];

  for (let i = 0; i < 150; i++) {
    const res = await rawRequest(`/content/media/${mediaId}`, { note: "poll" });
    const data = (res.body as { data?: Record<string, unknown> })?.data ?? {};
    const status = String(data.current_status ?? "?");
    const elapsed = Math.round((Date.now() - started) / 1000);

    if (seen.at(-1)?.status !== status) {
      seen.push({ status, at: elapsed });
      console.log(`  ${String(elapsed).padStart(4)}s  ${c.bold(status)}`);
      await dump(`media-${mediaId}-${status}`, res.body);
    }
    if (status === "finished" || status === "failed") {
      console.log(c.bold(`\n  Statusverloop: ${seen.map((s) => `${s.status}@${s.at}s`).join(" → ")}`));
      console.log(c.dim(`  urls: ${JSON.stringify(data.urls ?? data.download_urls ?? null)}`));
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(c.yellow("  time-out na 5 minuten"));
}

/** Maakt écht media aan. Alleen draaien als je een render wilt verbranden. */
async function createMedia(templateId: string) {
  const detail = await rawRequest(`/content/templates/${templateId}`, { note: "voor create" });
  const data = (detail.body as { data?: Record<string, unknown> })?.data ?? {};
  const params = (Array.isArray(data.parameters) ? data.parameters : []) as Array<
    Record<string, unknown>
  >;

  const body: Record<string, string> = {};
  for (const p of params) {
    body[String(p.name)] = `ACT test ${new Date().toISOString().slice(11, 19)}`;
  }

  console.log(c.bold(`\nPOST /content/templates/${templateId}/media`));
  console.log(c.dim(`  body: ${JSON.stringify({ template_parameters: body }).slice(0, 300)}`));

  const res = await rawRequest(`/content/templates/${templateId}/media`, {
    method: "POST",
    body: { template_parameters: body },
    note: "media aanmaken (explore)",
  });
  console.log(`  ${statusColor(res.status)} ${c.dim(`${res.ms}ms`)}`);
  await dump(`create-${templateId}-${res.status}`, res.body);
  console.log(c.dim(`  vorm: ${JSON.stringify(shapeOf(res.body))}`));

  if (!res.ok) {
    console.log(c.yellow(`  body: ${res.bodyText.slice(0, 600)}`));
    return;
  }
  const media = (res.body as { data?: Record<string, unknown> })?.data ?? {};
  console.log(c.green(`  media ${media.id} aangemaakt, status ${media.current_status}`));
  if (media.id) await watchMedia(String(media.id));
}

async function main() {
  const [command, arg] = process.argv.slice(2);

  try {
    const config = getConfig();
    console.log(c.bold("Storyteq discovery"));
    console.log(`  base URL : ${config.baseUrl}`);
    console.log(`  region   : ${config.region}`);
    console.log(`  token    : <redacted, ${config.apiKey.length} chars>`);
    console.log(`  companyId: ${config.companyId ?? "(niet gezet)"}`);
  } catch (err) {
    console.error(c.red(`\n${err instanceof Error ? err.message : String(err)}`));
    console.error("Vul STORYTEQ_API_KEY in opdracht-2/.env.local (zie .env.example).");
    process.exitCode = 1;
    return;
  }

  switch (command) {
    case "templates":
      await showTemplates();
      break;
    case "template":
      if (!arg) throw new Error("geef een templateId mee");
      await showTemplate(arg);
      break;
    case "media":
      if (!arg) throw new Error("geef een mediaId mee");
      await showMedia(arg);
      break;
    case "watch":
      if (!arg) throw new Error("geef een mediaId mee");
      await watchMedia(arg);
      break;
    case "create":
      if (!arg) throw new Error("geef een templateId mee");
      await createMedia(arg);
      break;
    default: {
      await probeAuthVariants();
      const firstId = await showTemplates();
      if (firstId) await showTemplate(firstId);
      await probeUndocumented(firstId);
      console.log(
        c.bold("\nKlaar. Log: docs/discovery/log.jsonl · rauw: docs/discovery/raw/"),
      );
    }
  }
}

main().catch((err) => {
  console.error(c.red(String(err)));
  process.exitCode = 1;
});
