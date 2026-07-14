import Redis from "ioredis";
import { getRedis } from "@/lib/cache/redis";
import type { RealtimeEvent, RealtimeEventHandler } from "./types";

export type { RealtimeEvent, RealtimeEventHandler } from "./types";

const CHANNEL_PREFIX = "realtime:user:";

/** Per-process in-memory subscribers (dev / single process, and local fan-out). */
const localSubscribers = new Map<string, Set<RealtimeEventHandler>>();

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let subscriberReady: Promise<void> | null = null;
const subscribedChannels = new Set<string>();

function redisEnabled(): boolean {
  return process.env.REDIS_DISABLED !== "true";
}

function channelForUser(userId: string): string {
  return `${CHANNEL_PREFIX}${userId}`;
}

function deliverLocal(userId: string, event: RealtimeEvent): void {
  const set = localSubscribers.get(userId);
  if (!set || set.size === 0) return;
  for (const cb of set) {
    try {
      cb(event);
    } catch {
      // ignore subscriber errors
    }
  }
}

function createPubSubClient(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new Redis(url, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableOfflineQueue: true,
    connectTimeout: 3000,
    retryStrategy: (times) => {
      if (times > 5) return null;
      return Math.min(times * 500, 2000);
    },
  });
}

async function ensurePublisher(): Promise<Redis | null> {
  if (!redisEnabled()) return null;

  const shared = getRedis();
  if (shared) {
    try {
      if (shared.status !== "ready") await shared.connect();
      return shared;
    } catch {
      // fall through to dedicated publisher
    }
  }

  if (!publisher) {
    publisher = createPubSubClient();
    publisher.on("error", () => {});
  }
  try {
    if (publisher.status !== "ready") await publisher.connect();
    return publisher;
  } catch {
    return null;
  }
}

async function ensureSubscriber(): Promise<Redis | null> {
  if (!redisEnabled()) return null;

  if (subscriber && subscriber.status === "ready") return subscriber;

  if (!subscriberReady) {
    subscriberReady = (async () => {
      const client = createPubSubClient();
      client.on("error", () => {});
      client.on("message", (channel: string, message: string) => {
        if (!channel.startsWith(CHANNEL_PREFIX)) return;
        const userId = channel.slice(CHANNEL_PREFIX.length);
        try {
          const event = JSON.parse(message) as RealtimeEvent;
          deliverLocal(userId, event);
        } catch {
          // ignore bad payloads
        }
      });
      await client.connect();
      subscriber = client;

      for (const ch of subscribedChannels) {
        await client.subscribe(ch);
      }
    })().catch(() => {
      subscriberReady = null;
      subscriber = null;
    });
  }

  await subscriberReady;
  return subscriber;
}

async function ensureChannelSubscribed(userId: string): Promise<void> {
  const channel = channelForUser(userId);
  if (subscribedChannels.has(channel)) return;
  subscribedChannels.add(channel);

  const sub = await ensureSubscriber();
  if (!sub) return;
  try {
    await sub.subscribe(channel);
  } catch {
    subscribedChannels.delete(channel);
  }
}

/**
 * Publish an event to all SSE listeners for a user.
 * Uses Redis pub/sub when available (multi-process/docker); otherwise in-memory.
 */
export async function publishToUser(userId: string, event: RealtimeEvent): Promise<void> {
  const pub = await ensurePublisher();
  if (pub) {
    try {
      await pub.publish(channelForUser(userId), JSON.stringify(event));
      return;
    } catch {
      // fall through to in-memory
    }
  }
  deliverLocal(userId, event);
}

/**
 * Subscribe to realtime events for a user in this process.
 * Returns an unsubscribe function.
 */
export function subscribeUser(userId: string, callback: RealtimeEventHandler): () => void {
  let set = localSubscribers.get(userId);
  if (!set) {
    set = new Set();
    localSubscribers.set(userId, set);
  }
  set.add(callback);

  void ensureChannelSubscribed(userId);

  return () => {
    const current = localSubscribers.get(userId);
    if (!current) return;
    current.delete(callback);
    if (current.size === 0) {
      localSubscribers.delete(userId);
    }
  };
}
