import { z } from "zod";
import { and, eq, sql, isNull } from "drizzle-orm";
import { db } from "../db";
import { generations, characters, assets, shots } from "../db/schema";
import {
  create,
  editGeneration,
  queueShots,
  queueRender,
  removeGeneration,
  replan,
} from "./service";
import { listing, detail, ownedGeneration } from "./repository";
import { readFormData } from "../lib/body";
import { saveUpload, MAX_UPLOAD } from "../storage/uploads";
import { pool } from "../db";
import { run } from "../render/process";
import { getRedis } from "../queues/redis";
const id = z.string().uuid();
const characterSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(3000),
  visualPrompt: z.string().min(1).max(3000),
  referenceId: z.string().uuid().nullable().default(null),
});
export async function readRoute(userId: string, path: string[], url: URL) {
  if (path[0] === "generations") {
    if (path[1]) return detail(id.parse(path[1]), userId);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(url.searchParams.get("page") || 1);
    return listing(
      userId,
      page,
      (url.searchParams.get("search") || "").slice(0, 200),
      (url.searchParams.get("status") || "").slice(0, 30),
      url.searchParams.get("sort") === "oldest",
    );
  }
  if (path[0] === "overview") {
    const counts = await db
      .select({ status: generations.status, count: sql<number>`count(*)::int` })
      .from(generations)
      .where(and(eq(generations.userId, userId), isNull(generations.deletedAt)))
      .groupBy(generations.status);
    return { counts, ...(await listing(userId)) };
  }
  if (path[0] === "characters")
    return db
      .select()
      .from(characters)
      .where(eq(characters.userId, userId))
      .orderBy(characters.createdAt)
      .limit(100);
  if (path[0] === "settings") {
    const [database, redis, ffmpeg] = await Promise.allSettled([
      pool.query("SELECT 1"),
      getRedis().ping(),
      run("ffmpeg", ["-version"], 5000),
    ]);
    return {
      database: database.status === "fulfilled",
      redis: redis.status === "fulfilled",
      ffmpeg: ffmpeg.status === "fulfilled",
      agnes: !!process.env.AGNES_API_KEY,
      resend: !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL,
      model: process.env.AGNES_VIDEO_MODEL || "agnes-video-2.5",
      concurrency: Number(process.env.VIDEO_GENERATION_CONCURRENCY || 3),
      storage: "Persistent local storage",
    };
  }
  throw new Error("NOT_FOUND");
}
export async function writeRoute(userId: string, path: string[], request: Request) {
  const body = () => request.json();
  if (path[0] === "generations") {
    if (!path[1]) return { status: 201, data: await create(userId, await body()) };
    const generationId = id.parse(path[1]);
    await ownedGeneration(generationId, userId);
    if (path[2] === "edit") {
      await editGeneration(generationId, userId, await body());
      return { data: { ok: true } };
    }
    if (path[2] === "generate") {
      const data = z
        .object({
          shotId: id.optional(),
          acknowledgeUncertain: z.boolean().default(false),
        })
        .parse(await body());
      return {
        data: await queueShots(
          generationId,
          userId,
          data.shotId,
          data.acknowledgeUncertain,
        ),
      };
    }
    if (path[2] === "render") {
      const data = z
        .object({ force: z.boolean().default(false) })
        .parse((await request.json().catch(() => ({}))) ?? {});
      await queueRender(generationId, userId, data.force);
      return { data: { ok: true } };
    }
    if (path[2] === "replan") {
      await replan(generationId, userId);
      return { data: { ok: true } };
    }
    if (path[2] === "delete") {
      await removeGeneration(generationId, userId);
      return { data: { ok: true } };
    }
    if (path[2] === "upload") {
      const form = await readFormData(request, MAX_UPLOAD + 10000);
      const kind = z.enum(["reference", "narration", "music"]).parse(form.get("kind"));
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Missing upload file");
      const asset = await saveUpload(userId, generationId, kind, file);
      if (kind !== "reference")
        await db.transaction(async (tx) => {
          const [generation] = await tx
            .select()
            .from(generations)
            .where(and(eq(generations.id, generationId), isNull(generations.deletedAt)))
            .for("update");
          if (!generation || ["PLANNING", "RENDERING"].includes(generation.status))
            throw new Error("BUSY");
          await tx
            .update(generations)
            .set(
              kind === "narration"
                ? { narrationId: asset.id, timelineDuration: asset.duration }
                : { musicId: asset.id },
            )
            .where(eq(generations.id, generationId));
          await tx
            .update(generations)
            .set({ revision: sql`${generations.revision}+1`, updatedAt: new Date() })
            .where(eq(generations.id, generationId));
        });
      return { data: { id: asset.id, kind: asset.kind, duration: asset.duration } };
    }
  }
  if (path[0] === "characters") {
    if (path[1] === "upload") {
      const form = await readFormData(request, MAX_UPLOAD + 10000),
        file = form.get("file");
      if (!(file instanceof File)) throw new Error("Missing upload file");
      return { data: { id: (await saveUpload(userId, null, "reference", file)).id } };
    }
    const data = characterSchema.parse(await body());
    if (data.referenceId) {
      const [asset] = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, data.referenceId),
            eq(assets.userId, userId),
            eq(assets.kind, "reference"),
          ),
        );
      if (!asset) throw new Error("Invalid reference");
    }
    if (path[1]) {
      const characterId = id.parse(path[1]);
      const [existing] = await db
        .select()
        .from(characters)
        .where(and(eq(characters.id, characterId), eq(characters.userId, userId)));
      if (!existing) throw new Error("NOT_FOUND");
      if (path[2] === "delete") {
        await db
          .update(shots)
          .set({ characterId: null })
          .where(eq(shots.characterId, existing.id));
        await db.delete(characters).where(eq(characters.id, existing.id));
      } else
        await db
          .update(characters)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(characters.id, existing.id));
      return { data: { ok: true } };
    }
    return {
      data: await db
        .insert(characters)
        .values({ ...data, userId })
        .returning()
        .then((rows) => rows[0]),
    };
  }
  throw new Error("NOT_FOUND");
}
