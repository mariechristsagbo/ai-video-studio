import { and, eq, isNull, inArray, asc, desc, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  generations,
  shots,
  scenes,
  renders,
  jobs,
  assets,
  characters,
} from "../db/schema";
export type Generation = typeof generations.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export async function ownedGeneration(id: string, userId: string) {
  const g = await db.query.generations.findFirst({
    where: and(
      eq(generations.id, id),
      eq(generations.userId, userId),
      isNull(generations.deletedAt),
    ),
  });
  if (!g) throw new Error("NOT_FOUND");
  return g;
}
export async function detail(id: string, userId: string) {
  const generation = await ownedGeneration(id, userId);
  const [shotList, sceneList, renderList, assetList, characterList] = await Promise.all(
    [
      db
        .select()
        .from(shots)
        .where(eq(shots.generationId, id))
        .orderBy(asc(shots.position)),
      db
        .select()
        .from(scenes)
        .where(eq(scenes.generationId, id))
        .orderBy(asc(scenes.position)),
      db
        .select()
        .from(renders)
        .where(eq(renders.generationId, id))
        .orderBy(desc(renders.createdAt)),
      db
        .select({
          id: assets.id,
          kind: assets.kind,
          mime: assets.mime,
          duration: assets.duration,
        })
        .from(assets)
        .where(eq(assets.generationId, id)),
      db.select().from(characters).where(eq(characters.userId, userId)),
    ],
  );
  return {
    generation,
    shots: shotList,
    scenes: sceneList,
    renders: renderList,
    assets: assetList,
    characters: characterList,
  };
}
export async function listing(
  userId: string,
  page = 1,
  search = "",
  status = "",
  oldest = false,
) {
  const where = and(
    eq(generations.userId, userId),
    isNull(generations.deletedAt),
    search
      ? or(
          ilike(generations.title, `%${search}%`),
          ilike(generations.topic, `%${search}%`),
        )
      : undefined,
    status ? sql`${generations.status}::text = ${status}` : undefined,
  );
  const [items, [count]] = await Promise.all([
    db
      .select()
      .from(generations)
      .where(where)
      .orderBy(oldest ? asc(generations.createdAt) : desc(generations.createdAt))
      .limit(12)
      .offset((page - 1) * 12),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(generations)
      .where(where),
  ]);
  return { items: await withThumbnails(items), total: count.total, page };
}
// Lists stay cheap: one thumbnail lookup per page, preferring the delivered render.
async function withThumbnails(items: Generation[]) {
  if (!items.length) return [];
  const ids = items.map((item) => item.id);
  const [shotThumbs, renderThumbs] = await Promise.all([
    db
      .select({
        generationId: shots.generationId,
        thumbnailId: shots.thumbnailId,
        position: shots.position,
      })
      .from(shots)
      .where(
        and(inArray(shots.generationId, ids), sql`${shots.thumbnailId} is not null`),
      )
      .orderBy(asc(shots.position)),
    db
      .select({
        generationId: renders.generationId,
        thumbnailId: renders.thumbnailId,
        version: renders.version,
      })
      .from(renders)
      .where(and(inArray(renders.generationId, ids), eq(renders.status, "COMPLETED")))
      .orderBy(desc(renders.version)),
  ]);
  return items.map((item) => ({
    ...item,
    thumbnailId:
      renderThumbs.find((r) => r.generationId === item.id)?.thumbnailId ??
      shotThumbs.find((s) => s.generationId === item.id)?.thumbnailId ??
      null,
  }));
}
export async function refreshGeneration(id: string) {
  const list = await db.select().from(shots).where(eq(shots.generationId, id));
  if (!list.length) return;
  const status = list.some((s) =>
    ["QUEUED", "SUBMITTING", "SUBMITTED", "GENERATING"].includes(s.status),
  )
    ? "GENERATING"
    : list.some((s) => s.status === "FAILED" || s.status === "UNCERTAIN")
      ? "FAILED"
      : list.every((s) => s.clipId)
        ? "READY_TO_RENDER"
        : "STORYBOARD_READY";
  await db
    .update(generations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(generations.id, id), isNull(generations.deletedAt)));
}
