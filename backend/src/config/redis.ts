import IORedis from "ioredis";

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim().length > 0);
}

export function createRedisConnection(label = "default"): IORedis {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    throw new Error(
      `[Redis:${label}] REDIS_URL is not configured. Cannot create Redis connection.`
    );
  }

  const isTls = redisUrl.startsWith("rediss://");

  const client = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: isTls ? { rejectUnauthorized: false } : undefined,
    retryStrategy(times) {
      return Math.min(times * 250, 5000);
    },
  });

  client.on("connect", () => {
    console.log(`[Redis:${label}] Connected (${isTls ? "TLS" : "TCP"})`);
  });

  client.on("ready", () => {
    console.log(`[Redis:${label}] Ready`);
  });

  client.on("error", (err: Error) => {
    console.error(`[Redis:${label}] Connection error:`, err.message);
  });

  return client;
}

let sharedRedisConnection: IORedis | null = null;

export function getRedisConnection(): IORedis | null {
  if (!isRedisConfigured()) {
    return null;
  }
  if (!sharedRedisConnection) {
    sharedRedisConnection = createRedisConnection("health");
  }
  return sharedRedisConnection;
}
