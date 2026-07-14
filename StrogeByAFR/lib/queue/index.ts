import Redis from "ioredis";
import { Queue } from "bullmq";

export const QUEUE_NAME = "storage-jobs";

let queue: Queue | null = null;

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new Redis(url, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
}

export function getQueue(): Queue | null {
  if (process.env.REDIS_DISABLED === "true") return null;

  if (!queue) {
    try {
      queue = new Queue(QUEUE_NAME, {
        connection: getRedisConnection() as unknown as import("bullmq").ConnectionOptions,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });
      queue.on("error", () => {});
    } catch {
      return null;
    }
  }
  return queue;
}

export type JobType =
  | "generate_thumbnail"
  | "compress_image"
  | "trim_media"
  | "recalculate_quota";

export async function enqueueJob(
  type: JobType,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const q = getQueue();
    if (!q) return;
    await q.add(type, { type, ...data });
  } catch {
    // Jobs are optional in dev without Redis
  }
}
