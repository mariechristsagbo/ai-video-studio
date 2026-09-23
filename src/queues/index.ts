import { Queue } from "bullmq";
export function connection() {
  const url = new URL(process.env.REDIS_URL || "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
export const queueNames = {
  plan: "generation-planning",
  shot: "video-generation",
  render: "video-rendering",
  delete: "generation-cleanup",
};
let queues: Record<string, Queue> | undefined;
export function getQueues() {
  return (queues ??= Object.fromEntries(
    Object.entries(queueNames).map(([kind, name]) => [
      kind,
      new Queue(name, { connection: connection() }),
    ]),
  ));
}
