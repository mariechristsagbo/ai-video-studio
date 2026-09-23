import "dotenv/config";
import { Worker } from "bullmq";
import { and, eq, inArray, lte, isNull } from "drizzle-orm";
import { db, pool } from "../db";
import { jobs, shots, generations, renders } from "../db/schema";
import { connection, getQueues, queueNames } from "../queues";
import {
  AgnesProvider,
  ProviderError,
  type TextProvider,
  type VideoProvider,
} from "../providers/agnes";
import { plan } from "./planning";
import { generateShot, uncertain } from "./shot";
import { render } from "./rendering";
import { refreshGeneration } from "../generations/repository";
import { storage, downloadPublic } from "../storage";
export async function processJob(
  id: string,
  provider: TextProvider & VideoProvider = new AgnesProvider(),
  download: (url: string) => Promise<Buffer> = downloadPublic,
) {
  const [job] = await db
    .update(jobs)
    .set({ status: "RUNNING", updatedAt: new Date() })
    .where(
      and(
        eq(jobs.id, id),
        inArray(jobs.status, ["QUEUED", "SUBMITTED"]),
        lte(jobs.runAfter, new Date()),
      ),
    )
    .returning();
  if (!job) return;
  const g = await db.query.generations.findFirst({
    where: eq(generations.id, job.generationId),
  });
  if (!g || (g.deletedAt && job.kind !== "delete")) {
    await db.update(jobs).set({ status: "CANCELLED" }).where(eq(jobs.id, id));
    return;
  }
  if (!job.startedAt) {
    job.startedAt = new Date();
    await db.update(jobs).set({ startedAt: job.startedAt }).where(eq(jobs.id, id));
  }
  try {
    let terminal = true;
    if (job.kind === "plan") await plan(job, g, provider);
    else if (job.kind === "shot")
      terminal = await generateShot(job, g, provider, download);
    else if (job.kind === "render") await render(job, g);
    else if (job.kind === "delete") {
      const active = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.generationId, g.id), eq(jobs.status, "RUNNING")));
      if (active.some((j) => j.id !== id)) {
        await db
          .update(jobs)
          .set({ status: "QUEUED", runAfter: new Date(Date.now() + 60000) })
          .where(eq(jobs.id, id));
        return;
      }
      await storage.remove(`users/${g.userId}/generations/${g.id}`);
      await db.delete(generations).where(eq(generations.id, g.id));
      return;
    }
    // Asynchronous provider work stays in the durable outbox until it is terminal.
    await db
      .update(jobs)
      .set({
        status: terminal ? "COMPLETED" : "SUBMITTED",
        completedAt: terminal ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, "RUNNING")));
    console.info(
      JSON.stringify({
        event: "job_processed",
        jobId: id,
        generationId: g.id,
        operation: job.kind,
      }),
    );
  } catch (error) {
    const retry =
      job.attempts < 2 &&
      (!(error instanceof ProviderError) ||
        error.code === 429 ||
        error.code >= 500 ||
        error.code === 0);
    const message =
      error instanceof ProviderError
        ? error.message
        : "Operation failed; check configuration and retry.";
    await db
      .update(jobs)
      .set({
        status: retry ? "QUEUED" : "FAILED",
        attempts: job.attempts + 1,
        error: message,
        runAfter: new Date(Date.now() + 5000 * 2 ** job.attempts),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id));
    if (!retry) {
      if (job.shotId) {
        await db
          .update(shots)
          .set({ status: "FAILED", lastError: message })
          .where(and(eq(shots.id, job.shotId), eq(shots.version, job.version)));
        await refreshGeneration(g.id);
      } else {
        await db
          .update(generations)
          .set({ status: "FAILED", error: message })
          .where(and(eq(generations.id, g.id), isNull(generations.deletedAt)));
        if (job.kind === "render")
          await db
            .update(renders)
            .set({ status: "FAILED", error: message })
            .where(
              and(eq(renders.generationId, g.id), eq(renders.version, job.version)),
            );
      }
    }
    console.error(
      JSON.stringify({
        event: "job_failed",
        jobId: id,
        operation: job.kind,
        retry,
        category:
          error instanceof ProviderError ? `provider_${error.code}` : "internal",
        // Server-side only: the stored/user-facing message stays sanitized, but a failed job must be
        // diagnosable without reproducing it by hand.
        detail: (error instanceof Error ? error.message : String(error)).slice(0, 300),
      }),
    );
  }
}
export async function reconcile() {
  // Database rows are a durable outbox. Redis loss only delays work, never loses it.
  const stale = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "RUNNING"),
        lte(jobs.updatedAt, new Date(Date.now() - 120000)),
      ),
    );
  for (const job of stale) {
    if (job.shotId && !job.providerId) {
      const shot = await db.query.shots.findFirst({
        where: eq(shots.id, job.shotId),
      });
      if (shot?.status === "SUBMITTING") {
        await uncertain(job, shot.id);
        continue;
      }
    }
    // A live worker refreshes updatedAt periodically. Dead work is recoverable.
    await db
      .update(jobs)
      .set({ status: job.providerId ? "SUBMITTED" : "QUEUED" })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, "RUNNING")));
  }
  const ready = await db
    .select()
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["QUEUED", "SUBMITTED"]),
        lte(jobs.runAfter, new Date()),
      ),
    )
    .limit(100);
  for (const job of ready) {
    const queue = getQueues()[job.kind];
    if (!queue) continue;
    const previous = await queue.getJob(job.id);
    if (previous) {
      const state = await previous.getState();
      if (state === "completed" || state === "failed") await previous.remove();
      else continue;
    }
    await queue.add(
      job.kind,
      { id: job.id },
      {
        jobId: job.id,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
export function startWorkers() {
  const workers = Object.entries(queueNames).map(
    ([kind, name]) =>
      new Worker(
        name,
        async (job) => {
          const heartbeat = setInterval(
            () =>
              void db
                .update(jobs)
                .set({ updatedAt: new Date() })
                .where(and(eq(jobs.id, job.data.id), eq(jobs.status, "RUNNING")))
                .catch(() => {}),
            30000,
          );
          try {
            await processJob(job.data.id);
          } finally {
            clearInterval(heartbeat);
          }
        },
        {
          connection: connection(),
          concurrency:
            kind === "shot"
              ? Number(process.env.VIDEO_GENERATION_CONCURRENCY || 3)
              : kind === "render"
                ? Number(process.env.RENDER_CONCURRENCY || 1)
                : 2,
        },
      ),
  );
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await reconcile();
    } catch {
      console.error(JSON.stringify({ event: "reconcile_failed" }));
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 2000);
  void tick();
  for (const worker of workers)
    worker.on("error", () =>
      console.error(JSON.stringify({ event: "queue_connection_error" })),
    );
  const stop = async () => {
    clearInterval(timer);
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all(Object.values(getQueues()).map((q) => q.close()));
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  return workers;
}
if (process.argv[1]?.endsWith("/main.ts")) startWorkers();
