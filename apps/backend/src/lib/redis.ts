import { env } from "../env.js";

/**
 * Connection options for BullMQ. We pass plain options (not an ioredis
 * instance) so BullMQ uses its own bundled ioredis, avoiding version clashes.
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export function createRedisConnection() {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname.length > 1
      ? Number(url.pathname.slice(1))
      : 0,
    maxRetriesPerRequest: null,
  };
}
