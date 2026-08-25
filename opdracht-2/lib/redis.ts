import "server-only";
import { createClient, type RedisClientType } from "redis";

/**
 * Redis is optioneel. Zonder `REDIS_URL` draait de app precies zoals hij was:
 * je joblijst leeft dan alleen in je eigen browser. Mét `REDIS_URL` bewaart de
 * server hem er ook, gekoppeld aan een anonieme sessie-cookie — dan overleeft
 * je overzicht het legen van je browseropslag.
 *
 * Eén verbinding per proces, lui opgezet: is Redis niet bereikbaar, dan valt de
 * app terug op browser-only in plaats van stuk te gaan.
 */
let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL?.trim());
}

export async function getRedis(): Promise<RedisClientType | null> {
  if (!isRedisConfigured()) return null;
  if (client?.isReady) return client;

  connecting ??= (async () => {
    try {
      const next: RedisClientType = createClient({ url: process.env.REDIS_URL });
      // Zonder listener gooit node-redis een unhandled error bij verbindingsverlies.
      next.on("error", (err) => console.error("[redis]", err.message));
      await next.connect();
      client = next;
      return next;
    } catch (err) {
      console.error("[redis] verbinden mislukt, verder zonder:", err);
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}
