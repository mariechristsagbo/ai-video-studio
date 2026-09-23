import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { generations, scenes, shots } from "../db/schema";
import {
  briefSchema,
  bibleSchema,
  storyboardSchema,
  planShotDurations,
  fitShotsToTimeline,
  normalizeStoryboard,
} from "../domain/video";
import { structured, type TextProvider } from "../providers/agnes";
import type { Job, Generation } from "../generations/repository";
export async function plan(job: Job, g: Generation, provider: TextProvider) {
  const context = JSON.stringify({
    topic: g.topic,
    language: g.language,
    format: g.contentFormat,
    style: g.visualStyle,
    instructions: g.customInstructions,
  });
  const brief =
    g.creativeBrief ??
    (await structured(
      provider,
      `Create a cinematic educational creative brief for ${context}. Strong immediate hook; never "Did you know", "Today we" or "In this video". Return JSON with title,hook,premise,targetAudience,tone,visualDirection,ending,cta strings and narrativeArc,keyFacts string arrays.`,
      briefSchema,
    ));
  const script =
    g.script ||
    (
      await structured(
        provider,
        `Write spoken narration for ${context}. Brief: ${JSON.stringify(brief)}. Target ${g.targetDuration} seconds at 130–155 words per minute. Introduce a new idea every 10–20 seconds. Short natural sentences, no filler or production notes. Return {"script":"complete narration"}.`,
        z.object({ script: z.string().min(30).max(30000) }),
      )
    ).script;
  const bible =
    g.visualBible ??
    (await structured(
      provider,
      `Define visual continuity for ${context}. Return JSON with cinematography,colorPalette,worldDescription strings and characterRules,styleRules string arrays.`,
      bibleSchema,
    ));
  // Real uploaded narration is authoritative; otherwise estimate spoken timing.
  const duration =
    g.timelineDuration ??
    Math.max(4, Math.min(600, (script.trim().split(/\s+/).length / 145) * 60));
  const durations = planShotDurations(duration);
  const board = await structured(
    provider,
    `Storyboard this exact narration: ${script}. Context ${context}. Visual bible ${JSON.stringify(bible)}. Narration drives the timeline. Create narrative scenes with title,narration,shots. There must be exactly ${durations.length} shots in order with durations ${JSON.stringify(durations)}. Each shot needs duration,visualDescription,videoPrompt,camera,environment,transition (cut/fade/crossfade), mode=text. Prompts describe subject,action,environment,camera,composition,lighting,mood,physical movement and continuity. Never include captions in video frames. Return exactly {"scenes":[{"title":"...","narration":"...","shots":[{"duration":8,"visualDescription":"...","videoPrompt":"...","camera":"...","environment":"...","transition":"cut","mode":"text"}]}]} — every shot must sit inside its scene's shots array.`,
    storyboardSchema,
    normalizeStoryboard,
  );
  // The storyboard is fitted to the narration rather than rejected for a small count difference.
  const fitted = fitShotsToTimeline(
    board.scenes.flatMap((s) => s.shots),
    duration,
  );
  let cursor = 0;
  const plan = board.scenes
    .map((scene) => {
      const take = Math.max(0, Math.min(scene.shots.length, fitted.shots.length - cursor));
      const kept = fitted.shots.slice(cursor, cursor + take);
      cursor += take;
      return { ...scene, shots: kept };
    })
    .filter((scene) => scene.shots.length > 0);
  if (cursor < fitted.shots.length) plan[plan.length - 1].shots.push(...fitted.shots.slice(cursor));
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(generations)
      .where(and(eq(generations.id, g.id), isNull(generations.deletedAt)))
      .for("update");
    if (!current || current.revision !== job.version) return;
    await tx.delete(scenes).where(eq(scenes.generationId, g.id));
    let position = 0;
    for (let i = 0; i < plan.length; i++) {
      const scene = plan[i];
      const [row] = await tx
        .insert(scenes)
        .values({
          generationId: g.id,
          position: i,
          title: scene.title,
          narration: scene.narration,
        })
        .returning();
      for (const shot of scene.shots) {
        await tx.insert(shots).values({
          ...shot,
          duration: fitted.durations[position],
          position: position++,
          generationId: g.id,
          sceneId: row.id,
          mode: "text",
          referenceId: null,
          characterId: null,
          continuityFrom: null,
        });
      }
    }
    await tx
      .update(generations)
      .set({
        creativeBrief: brief,
        script,
        visualBible: bible,
        title: briefSchema.parse(brief).title,
        timelineDuration: duration,
        status: "STORYBOARD_READY",
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(generations.id, g.id));
  });
}
