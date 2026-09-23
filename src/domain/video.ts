import { z } from "zod";
export const MIN_VIDEO_SECONDS = 4;
export const MAX_VIDEO_SECONDS = 12;
export const generationStatuses = [
  "DRAFT",
  "PLANNING",
  "STORYBOARD_READY",
  "QUEUED",
  "GENERATING",
  "READY_TO_RENDER",
  "RENDERING",
  "COMPLETED",
  "FAILED",
] as const;
export const shotStatuses = [
  "DRAFT",
  "QUEUED",
  "SUBMITTING",
  "UNCERTAIN",
  "SUBMITTED",
  "GENERATING",
  "COMPLETED",
  "FAILED",
] as const;
export function planShotDurations(total: number): number[] {
  if (!Number.isFinite(total) || total < 4 || total > 600)
    throw new Error("Timeline must be between 4 and 600 seconds");
  const seconds = Math.ceil(total),
    count = Math.max(1, Math.round(seconds / 7.5)),
    base = Math.floor(seconds / count);
  return Array.from({ length: count }, (_, i) => base + (i < seconds % count ? 1 : 0));
}
/** The narration fixes the timeline, the storyboard fixes how many shots tell it: the two rarely agree
 * to the shot. Spread the narration length across the shots the model actually wrote, and only fold or
 * duplicate shots when its count cannot honour the 4–12 second per-shot limits — a creative mismatch
 * must not fail the whole plan. */
export function fitShotsToTimeline<T>(shots: T[], total: number) {
  if (!Number.isFinite(total) || total < MIN_VIDEO_SECONDS || total > 600)
    throw new Error("Timeline must be between 4 and 600 seconds");
  if (!shots.length) throw new Error("The storyboard contained no shots");
  const seconds = Math.round(total);
  const fitted = shots.slice(0, Math.max(1, Math.floor(seconds / MIN_VIDEO_SECONDS)));
  const minimum = Math.max(1, Math.ceil(seconds / MAX_VIDEO_SECONDS));
  while (fitted.length < minimum) fitted.push({ ...fitted[fitted.length - 1] });
  const base = Math.floor(seconds / fitted.length);
  return {
    shots: fitted,
    durations: fitted.map((_, index) => base + (index < seconds % fitted.length ? 1 : 0)),
  };
}

export const shotInput = z.object({
  visualDescription: z.string().min(1).max(4000),
  videoPrompt: z.string().min(1).max(8000),
  duration: z.number().int().min(4).max(12),
  camera: z.string().max(500).default(""),
  environment: z.string().max(1000).default(""),
  transition: z.enum(["cut", "fade", "crossfade"]).default("cut"),
  mode: z.enum(["text", "keyframe", "reference"]).default("text"),
  referenceId: z.string().uuid().nullable().default(null),
  characterId: z.string().uuid().nullable().default(null),
  continuityFrom: z.string().uuid().nullable().default(null),
});
export const sceneInput = z.object({
  title: z.string().min(1).max(300),
  narration: z.string().max(10000),
  shots: z.array(shotInput).min(1).max(80),
});
export const storyboardSchema = z.object({
  scenes: z.array(sceneInput).min(1).max(80),
});
/** Models drift from the requested shape: a scene sometimes carries the shot's own fields instead of a
 * shots array. Rebuild the documented shape before validating, instead of failing the whole plan. */
export function normalizeStoryboard(raw: unknown): unknown {
  const container = Array.isArray(raw) ? { scenes: raw } : raw;
  if (!container || typeof container !== "object") return raw;
  const scenes = (container as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes)) return raw;
  return {
    scenes: scenes.map((entry, index) => {
      if (!entry || typeof entry !== "object") return entry;
      const scene = entry as Record<string, unknown>;
      if (Array.isArray(scene.shots) && scene.shots.length) return scene;
      const text = scene.videoPrompt ?? scene.visualDescription;
      if (typeof text !== "string" || !text.trim()) return scene;
      const described = scene.visualDescription;
      const seconds = Number(scene.duration);
      return {
        title:
          typeof scene.title === "string" && scene.title.trim()
            ? scene.title
            : `Scene ${index + 1}`,
        narration: typeof scene.narration === "string" ? scene.narration : "",
        shots: [
          {
            visualDescription:
              typeof described === "string" && described.trim() ? described : text,
            videoPrompt: text,
            duration:
              Number.isInteger(seconds) && seconds >= MIN_VIDEO_SECONDS && seconds <= MAX_VIDEO_SECONDS
                ? seconds
                : 8,
            camera: typeof scene.camera === "string" ? scene.camera : "",
            environment: typeof scene.environment === "string" ? scene.environment : "",
            transition: typeof scene.transition === "string" ? scene.transition : "cut",
            mode: "text",
          },
        ],
      };
    }),
  };
}

export const briefSchema = z.object({
  title: z.string(),
  hook: z.string(),
  premise: z.string(),
  targetAudience: z.string(),
  tone: z.string(),
  visualDirection: z.string(),
  narrativeArc: z.array(z.string()),
  keyFacts: z.array(z.string()),
  ending: z.string(),
  cta: z.string(),
});
export const bibleSchema = z.object({
  cinematography: z.string(),
  colorPalette: z.string(),
  worldDescription: z.string(),
  characterRules: z.array(z.string()),
  styleRules: z.array(z.string()),
});
export const createGeneration = z.object({
  topic: z.string().trim().min(8).max(2000),
  targetDuration: z.union([
    z.literal(30),
    z.literal(60),
    z.literal(90),
    z.literal(180),
    z.literal(300),
  ]),
  language: z.string().min(2).max(60).default("English"),
  platform: z
    .enum(["TikTok", "YouTube Shorts", "Instagram Reels", "YouTube"])
    .default("TikTok"),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  contentFormat: z.string().min(1).max(100),
  visualStyle: z.string().min(1).max(100),
  customInstructions: z.string().max(4000).default(""),
});
export function progress(status: string, done: number, total: number) {
  if (status === "COMPLETED") return 100;
  if (status === "RENDERING") return 90;
  if (status === "PLANNING") return 10;
  if (!total) return 0;
  return Math.round(20 + (65 * done) / total);
}
export function shouldSubmit(status: string) {
  return status === "QUEUED";
}
export type Clip = { path: string; duration: number; transition: string };
export function buildComposition(
  clips: Clip[],
  ratio: string,
  narrationDuration?: number,
) {
  if (!clips.length || clips.some((c) => !c.path || c.duration <= 0))
    throw new Error("Every shot needs a completed clip");
  let start = 0;
  const video = clips.map((c) => {
    const item = { ...c, start };
    start += c.duration;
    return item;
  });
  const [width, height] =
    ratio === "16:9" ? [1920, 1080] : ratio === "1:1" ? [1080, 1080] : [1080, 1920];
  return {
    duration: narrationDuration ?? start,
    width,
    height,
    fps: 30,
    video,
  };
}
