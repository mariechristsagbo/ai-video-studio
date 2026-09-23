import { and, eq, isNull, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  generations,
  shots,
  scenes,
  jobs,
  renders,
  assets,
  characters,
  generationCharacters,
} from "../db/schema";
import { createGeneration, shotInput, buildComposition } from "../domain/video";
import { ownedGeneration, detail } from "./repository";

export async function create(userId: string, input: unknown) {
  const data = createGeneration.parse(input);
  return db.transaction(async (tx) => {
    const [g] = await tx
      .insert(generations)
      .values({ ...data, userId, title: data.topic, status: "PLANNING" })
      .returning();
    await tx
      .insert(jobs)
      .values({ generationId: g.id, kind: "plan", version: g.revision });
    return g;
  });
}
const edit = z.object({
  revision: z.number().int(),
  script: z.string().max(30000).optional(),
  creativeBrief: z.unknown().optional(),
  visualBible: z.unknown().optional(),
  burnCaptions: z.boolean().optional(),
  clipAudio: z.boolean().optional(),
  scene: z
    .object({
      id: z.string().uuid(),
      title: z.string().min(1).max(300),
      narration: z.string().max(10000),
    })
    .optional(),
  shot: z.object({ id: z.string().uuid(), data: shotInput }).optional(),
  operation: z.enum(["up", "down", "duplicate", "delete"]).optional(),
  shotId: z.string().uuid().optional(),
});
export async function editGeneration(id: string, userId: string, input: unknown) {
  const value = edit.parse(input);
  await ownedGeneration(id, userId);
  return db.transaction(async (tx) => {
    const [g] = await tx
      .select()
      .from(generations)
      .where(
        and(
          eq(generations.id, id),
          eq(generations.userId, userId),
          isNull(generations.deletedAt),
        ),
      )
      .for("update");
    if (!g) throw new Error("NOT_FOUND");
    if (g.revision !== value.revision) throw new Error("CONFLICT");
    if (["PLANNING", "RENDERING"].includes(g.status)) throw new Error("BUSY");
    if (value.shot) {
      const [shot] = await tx
        .select()
        .from(shots)
        .where(and(eq(shots.id, value.shot.id), eq(shots.generationId, id)));
      if (!shot) throw new Error("NOT_FOUND");
      if (["QUEUED", "SUBMITTING", "SUBMITTED", "GENERATING"].includes(shot.status))
        throw new Error("BUSY");
      for (const assetId of [value.shot.data.referenceId])
        if (assetId) {
          const [a] = await tx
            .select()
            .from(assets)
            .where(and(eq(assets.id, assetId), eq(assets.userId, userId)));
          if (!a || a.kind !== "reference") throw new Error("Invalid reference");
        }
      if (value.shot.data.characterId) {
        const [c] = await tx
          .select()
          .from(characters)
          .where(
            and(
              eq(characters.id, value.shot.data.characterId),
              eq(characters.userId, userId),
            ),
          );
        if (!c) throw new Error("Invalid character");
        await tx
          .insert(generationCharacters)
          .values({ generationId: id, characterId: c.id })
          .onConflictDoNothing();
      }
      if (value.shot.data.continuityFrom) {
        const [previous] = await tx
          .select()
          .from(shots)
          .where(
            and(
              eq(shots.id, value.shot.data.continuityFrom),
              eq(shots.generationId, id),
            ),
          );
        if (!previous || previous.position >= shot.position)
          throw new Error("Continuity requires an earlier shot");
      }
      await tx
        .update(shots)
        .set({ ...value.shot.data, updatedAt: new Date() })
        .where(eq(shots.id, shot.id));
    }
    if (value.scene)
      await tx
        .update(scenes)
        .set({
          title: value.scene.title,
          narration: value.scene.narration,
          updatedAt: new Date(),
        })
        .where(and(eq(scenes.id, value.scene.id), eq(scenes.generationId, id)));
    if (value.operation && value.shotId) {
      const list = await tx
        .select()
        .from(shots)
        .where(eq(shots.generationId, id))
        .orderBy(shots.position);
      const i = list.findIndex((s) => s.id === value.shotId);
      if (i < 0) throw new Error("NOT_FOUND");
      const s = list[i];
      if (
        list.some((s) =>
          ["QUEUED", "SUBMITTING", "SUBMITTED", "GENERATING"].includes(s.status),
        )
      )
        throw new Error("BUSY");
      if (value.operation === "delete") {
        if (list.length === 1) throw new Error("Keep at least one shot");
        await tx.delete(shots).where(eq(shots.id, s.id));
        list.splice(i, 1);
      } else if (value.operation === "duplicate") {
        if (list.length >= 100) throw new Error("Maximum 100 shots");
        const { id: discard, createdAt, updatedAt, ...copy } = s;
        void discard;
        void createdAt;
        void updatedAt;
        const [duplicated] = await tx
          .insert(shots)
          .values({
            ...copy,
            status: "DRAFT",
            version: 0,
            clipId: null,
            thumbnailId: null,
          })
          .returning();
        list.splice(i + 1, 0, duplicated);
      } else {
        const to = i + (value.operation === "up" ? -1 : 1);
        if (to >= 0 && to < list.length) [list[i], list[to]] = [list[to], list[i]];
      }
      for (let index = 0; index < list.length; index++)
        await tx
          .update(shots)
          .set({ position: index })
          .where(eq(shots.id, list[index].id));
    }
    const patch: Partial<typeof generations.$inferInsert> = {
      revision: g.revision + 1,
      updatedAt: new Date(),
    };
    for (const key of [
      "script",
      "creativeBrief",
      "visualBible",
      "burnCaptions",
      "clipAudio",
    ] as const)
      if (value[key] !== undefined) Object.assign(patch, { [key]: value[key] });
    await tx.update(generations).set(patch).where(eq(generations.id, id));
  });
}
export async function queueShots(
  id: string,
  userId: string,
  shotId?: string,
  acknowledgeUncertain = false,
) {
  await ownedGeneration(id, userId);
  return db.transaction(async (tx) => {
    const [g] = await tx
      .select()
      .from(generations)
      .where(eq(generations.id, id))
      .for("update");
    if (g.deletedAt) throw new Error("NOT_FOUND");
    if (["PLANNING", "RENDERING"].includes(g.status)) throw new Error("BUSY");
    const list = await tx
      .select()
      .from(shots)
      .where(
        and(eq(shots.generationId, id), shotId ? eq(shots.id, shotId) : undefined),
      );
    let queued = 0;
    for (const shot of list) {
      if (["QUEUED", "SUBMITTING", "SUBMITTED", "GENERATING"].includes(shot.status))
        continue;
      if (!shotId && shot.clipId) continue;
      if (shot.status === "UNCERTAIN" && !acknowledgeUncertain) continue;
      await tx
        .update(shots)
        .set({ status: "QUEUED", version: shot.version + 1, lastError: null })
        .where(eq(shots.id, shot.id));
      await tx.insert(jobs).values({
        generationId: id,
        shotId: shot.id,
        kind: "shot",
        version: shot.version + 1,
      });
      queued++;
    }
    if (queued)
      await tx
        .update(generations)
        .set({
          status: "QUEUED",
          revision: g.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(generations.id, id));
    return { queued };
  });
}
export async function queueRender(id: string, userId: string, force = false) {
  await ownedGeneration(id, userId);
  return db.transaction(async (tx) => {
    const [g] = await tx
      .select()
      .from(generations)
      .where(eq(generations.id, id))
      .for("update");
    if (g.deletedAt) throw new Error("NOT_FOUND");
    // Rendering again with identical inputs would produce an identical version, so
    // an explicit re-render bumps the revision instead of duplicating work.
    const revision = force ? g.revision + 1 : g.revision;
    if (g.status === "RENDERING") return;
    const list = await tx
      .select()
      .from(shots)
      .where(eq(shots.generationId, id))
      .orderBy(shots.position);
    if (
      !list.length ||
      list.some(
        (s) =>
          !s.clipId ||
          ["QUEUED", "SUBMITTING", "SUBMITTED", "GENERATING"].includes(s.status),
      )
    )
      throw new Error("Complete all shots before rendering");
    const all = await tx
      .select()
      .from(assets)
      .where(and(eq(assets.userId, userId), eq(assets.generationId, id)));
    const asset = (assetId: string | null) => all.find((a) => a.id === assetId);
    const narration = asset(g.narrationId);
    const music = asset(g.musicId);
    const composition = {
      ...buildComposition(
        list.map((s) => ({
          path: asset(s.clipId)!.path,
          duration: s.duration,
          transition: s.transition,
        })),
        g.aspectRatio,
        narration?.duration ?? undefined,
      ),
      script: g.script,
      burnCaptions: g.burnCaptions,
      clipAudio: g.clipAudio,
      narration: narration?.path,
      music: music?.path,
    };
    const [r] = await tx
      .insert(renders)
      .values({ generationId: id, version: g.revision, composition })
      .onConflictDoNothing()
      .returning();
    if (!r) {
      const [existing] = await tx
        .select()
        .from(renders)
        .where(and(eq(renders.generationId, id), eq(renders.version, revision)));
      if (existing.status === "COMPLETED") return;
      await tx
        .update(renders)
        .set({ status: "QUEUED", error: null })
        .where(eq(renders.id, existing.id));
      await tx.insert(jobs).values({
        generationId: id,
        kind: "render",
        version: revision,
        payload: { renderId: existing.id },
      });
    } else
      await tx.insert(jobs).values({
        generationId: id,
        kind: "render",
        version: revision,
        payload: { renderId: r.id },
      });
    await tx
      .update(generations)
      .set({ status: "RENDERING", revision, updatedAt: new Date() })
      .where(eq(generations.id, id));
  });
}
export async function removeGeneration(id: string, userId: string) {
  await ownedGeneration(id, userId);
  await db.transaction(async (tx) => {
    await tx.select().from(generations).where(eq(generations.id, id)).for("update");
    await tx
      .update(generations)
      .set({ deletedAt: new Date() })
      .where(eq(generations.id, id));
    await tx
      .update(jobs)
      .set({ status: "CANCELLED" })
      .where(
        and(eq(jobs.generationId, id), inArray(jobs.status, ["QUEUED", "SUBMITTED"])),
      );
    await tx.insert(jobs).values({
      generationId: id,
      kind: "delete",
      version: 0,
      runAfter: new Date(Date.now() + 120000),
    });
  });
}
export async function replan(id: string, userId: string) {
  const g = await ownedGeneration(id, userId);
  const d = await detail(id, userId);
  if (
    d.shots.some(
      (s) =>
        s.clipId ||
        ["QUEUED", "SUBMITTING", "SUBMITTED", "GENERATING"].includes(s.status),
    )
  )
    throw new Error("Replanning is only available before clip generation");
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(generations)
      .where(eq(generations.id, id))
      .for("update");
    if (locked.status === "PLANNING") return;
    await tx
      .update(generations)
      .set({ status: "PLANNING", revision: sql`${generations.revision}+1` })
      .where(eq(generations.id, id));
    await tx.insert(jobs).values({
      generationId: id,
      kind: "plan",
      version: g.revision + 1,
      payload: { useScript: !!g.script },
    });
  });
}
