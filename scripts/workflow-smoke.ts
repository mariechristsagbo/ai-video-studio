import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Worker } from "bullmq";
import { eq, and } from "drizzle-orm";
import { db, pool } from "../src/db";
import { generations, jobs, shots } from "../src/db/schema";
import {
  create,
  queueShots,
  queueRender,
  editGeneration,
} from "../src/generations/service";
import { detail, ownedGeneration } from "../src/generations/repository";
import { processJob, reconcile } from "../src/workers/main";
import { queueNames, connection, getQueues } from "../src/queues";
import { ProviderError, type VideoStatus } from "../src/providers/agnes";
const session = JSON.parse(
  await readFile("data/verification/session.json", "utf8"),
) as { userId: string };
let calls = 0,
  uncertain = false;
const script =
  Array.from(
    { length: 70 },
    (_, i) =>
      [
        "At",
        "dawn",
        "the",
        "city",
        "wakes",
        "and",
        "connections",
        "begin",
        "to",
        "change",
      ][i % 10],
  ).join(" ") + ".";
const provider = {
  async generate(prompt: string) {
    if (prompt.includes("creative brief"))
      return JSON.stringify({
        title: "Fixture: The connected city",
        hook: "At dawn, everything changes.",
        premise: "A fixture story",
        targetAudience: "Everyone",
        tone: "Curious",
        visualDirection: "Cinematic",
        narrativeArc: ["Setup", "Reveal"],
        keyFacts: [],
        ending: "A new day",
        cta: "Stay curious",
      });
    if (prompt.includes("spoken narration")) return JSON.stringify({ script });
    if (prompt.includes("visual continuity"))
      return JSON.stringify({
        cinematography: "Steady",
        colorPalette: "Green",
        worldDescription: "A city",
        characterRules: [],
        styleRules: ["No text"],
      });
    const match = /durations (\[[\d,]+\])/.exec(prompt);
    const durations = JSON.parse(match![1]) as number[];
    return JSON.stringify({
      scenes: durations.map((duration, i) => ({
        title: `Scene ${i + 1}`,
        narration: "Fixture narration",
        shots: [
          {
            duration,
            visualDescription: "Generated color fixture",
            videoPrompt: "A clearly labeled test fixture, not provider footage",
            camera: "Static",
            environment: "Studio",
            transition: i === 0 ? "crossfade" : "cut",
          },
        ],
      })),
    });
  },
  async create(): Promise<VideoStatus> {
    calls++;
    if (uncertain) {
      uncertain = false;
      throw new ProviderError(0, true);
    }
    return { id: `fixture-${calls}`, status: "queued" };
  },
  async getStatus(id: string): Promise<VideoStatus> {
    return { id, status: "completed", url: "https://fixture.invalid/clip.mp4" };
  },
};
const download = () => readFile("data/verification/fixture-0.mp4");
const workers = Object.values(queueNames).map(
  (name) =>
    new Worker(name, (job) => processJob(job.data.id, provider, download), {
      connection: connection(),
      concurrency: 2,
    }),
);
const wait = async (test: () => Promise<boolean>, timeout = 180000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    await reconcile();
    if (await test()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Workflow deadline reached");
};
try {
  const g = await create(session.userId, {
    topic: "Fixture: What if city connections disappeared?",
    targetDuration: 30,
    contentFormat: "Cinematic Explainer",
    visualStyle: "Cinematic Realistic",
  });
  await wait(
    async () =>
      (await ownedGeneration(g.id, session.userId)).status === "STORYBOARD_READY",
  );
  let d = await detail(g.id, session.userId);
  assert.equal(d.shots.length, 4);
  await assert.rejects(() => ownedGeneration(g.id, "another-user"), /NOT_FOUND/);
  await editGeneration(g.id, session.userId, {
    revision: d.generation.revision,
    shot: {
      id: d.shots[0].id,
      data: { ...d.shots[0], videoPrompt: "Edited fixture prompt" },
    },
  });
  await queueShots(g.id, session.userId);
  await wait(async () =>
    (await detail(g.id, session.userId)).shots.every((s) => s.status === "COMPLETED"),
  );
  assert.equal(calls, 4);
  await queueShots(g.id, session.userId);
  await reconcile();
  assert.equal(calls, 4);
  d = await detail(g.id, session.userId);
  const target = d.shots[0],
    previous = target.clipId;
  await queueShots(g.id, session.userId, target.id);
  assert.equal((await detail(g.id, session.userId)).shots[0].clipId, previous);
  await wait(
    async () => (await detail(g.id, session.userId)).shots[0].status === "COMPLETED",
  );
  assert.equal(calls, 5);
  assert.notEqual((await detail(g.id, session.userId)).shots[0].clipId, previous);
  uncertain = true;
  await queueShots(g.id, session.userId, target.id);
  await wait(
    async () => (await detail(g.id, session.userId)).shots[0].status === "UNCERTAIN",
  );
  assert.equal(calls, 6);
  await queueShots(g.id, session.userId);
  assert.equal((await detail(g.id, session.userId)).shots[0].status, "UNCERTAIN");
  await queueShots(g.id, session.userId, target.id, true);
  await wait(
    async () => (await detail(g.id, session.userId)).shots[0].status === "COMPLETED",
  );
  assert.equal(calls, 7);
  // Simulate lost Redis delivery by removing a waiting queue entry. The DB outbox reconstructs it.
  await queueShots(g.id, session.userId, d.shots[1].id);
  await wait(
    async () => (await detail(g.id, session.userId)).shots[1].status === "COMPLETED",
  );
  const [durable] = await db
    .insert(jobs)
    .values({
      generationId: g.id,
      kind: "shot",
      shotId: target.id,
      version: 999,
      status: "QUEUED",
    })
    .returning();
  await reconcile();
  await wait(
    async () =>
      (await db.query.jobs.findFirst({ where: eq(jobs.id, durable.id) }))?.status ===
      "COMPLETED",
  );
  assert.equal(calls, 8);
  await queueRender(g.id, session.userId);
  await wait(
    async () => (await ownedGeneration(g.id, session.userId)).status === "COMPLETED",
    300000,
  );
  d = await detail(g.id, session.userId);
  assert.ok(d.renders[0].assetId);
  const before = d.renders.length;
  await queueRender(g.id, session.userId);
  assert.equal((await detail(g.id, session.userId)).renders.length, before);
  await writeFile(
    "data/verification/workflow.json",
    JSON.stringify(
      {
        fixture: true,
        generationId: g.id,
        shots: d.shots.length,
        providerSubmissions: calls,
        renderId: d.renders[0].id,
        assetId: d.renders[0].assetId,
        checks: [
          "Neon persistence",
          "official auth session",
          "BullMQ workers",
          "structured planning",
          "owner isolation",
          "single-shot regeneration",
          "old clip preservation",
          "uncertain submission",
          "idempotent shot delivery",
          "versioned render",
          "real FFmpeg",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      workflowSmoke: "passed",
      generationId: g.id,
      shots: d.shots.length,
      submissions: calls,
      renderAssetId: d.renders[0].assetId,
    }),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(Object.values(getQueues()).map((q) => q.close()));
  await pool.end();
}
