import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { assets, generations, renders, scenes, shots } from "../src/db/schema";
import { createAuth } from "../src/auth";
import { storage } from "../src/storage";
import { renderVideo, thumbnail } from "../src/render/render";
import { buildComposition } from "../src/domain/video";

// Labelled fixture data for UI verification only. `tsx scripts/ui-fixture.ts clean`
// removes every fixture user, project and media file it created.
const mode = process.argv[2];
if (mode === "clean") {
  const rows = await db
    .select({ userId: generations.userId, id: generations.id })
    .from(generations)
    .where(
      inArray(generations.topic, [
        "Fixture: what if the Internet disappeared for 24 hours?",
      ]),
    );
  for (const row of rows) {
    await storage.remove(`users/${row.userId}/generations/${row.id}`);
    await db.delete(generations).where(eq(generations.id, row.id));
  }
  const users = await db.select({ id: generations.userId }).from(generations);
  void users;
  const fixtureUsers = await pool.query<{ id: string }>(
    "select id from users where email like 'ui-fixture-%@example.invalid'",
  );
  for (const user of fixtureUsers.rows) {
    await storage.remove(`users/${user.id}`);
    await pool.query("delete from users where id = $1", [user.id]);
  }
  console.log(JSON.stringify({ cleaned: rows.length + fixtureUsers.rows.length }));
  await pool.end();
  process.exit(0);
}

const base = process.env.BETTER_AUTH_URL!;
let link = "";
const auth = createAuth(async (mail) => {
  link = mail.url;
});
const email = `ui-fixture-${Date.now()}@example.invalid`;
await auth.handler(
  new Request(`${base}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email, name: "Amina Diallo", callbackURL: "/dashboard" }),
  }),
);
const response = await auth.handler(new Request(link));
const cookie = response.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
const userId = session!.user.id;

const topic = "Fixture: what if the Internet disappeared for 24 hours?";
const script =
  "At 7:03 AM, the Internet disappears. Traffic lights still blink, but every payment terminal shows an offline error. " +
  "Shoppers tap cards that answer with silence. Queues form within minutes. Cash becomes the loudest object in the room. " +
  "Delivery drivers lose their route. Warehouses cannot confirm a single order. By noon, hospitals switch to paper records. " +
  "Radio hosts read the news aloud. Neighbours talk across balconies for the first time in years. The silence is not empty. " +
  "It is busy. Every system that failed had a human fallback waiting to be remembered.";
const [generation] = await db
  .insert(generations)
  .values({
    userId,
    title: "What if the Internet disappeared for 24 hours?",
    topic,
    status: "COMPLETED",
    targetDuration: 60,
    language: "English",
    platform: "TikTok",
    aspectRatio: "9:16",
    contentFormat: "24 Hours Without...",
    visualStyle: "Cinematic Realistic",
    script,
    timelineDuration: 48,
    creativeBrief: {
      title: "The day the Internet went quiet",
      hook: "At 7:03 AM, the Internet disappears.",
      premise: "A single day without connectivity, minute by minute.",
      targetAudience: "Curious short-form viewers",
      tone: "Calm, cinematic, precise",
      visualDirection: "Documentary realism, muted dawn light, shallow depth of field",
      narrativeArc: [
        "The outage",
        "The squeeze",
        "The fallback",
        "The quiet aftermath",
      ],
      keyFacts: ["Card terminals depend on online authorisation"],
      ending: "Paper, cash and conversation return",
      cta: "Stay curious",
    },
    visualBible: {
      cinematography: "Handheld but steady, medium shots",
      colorPalette: "Muted dawn blues with warm amber interior light",
      worldDescription: "A modern city losing its network at sunrise",
      characterRules: ["No visible brand logos or device screens with legible text"],
      styleRules: ["No captions inside frames", "Realistic skin texture"],
    },
  })
  .returning();
const clipSources = [0, 1, 2, 0, 1, 2];
const [scene] = await db
  .insert(scenes)
  .values({
    generationId: generation.id,
    position: 0,
    title: "The outage begins",
    narration: "At 7:03 AM, the Internet disappears.",
  })
  .returning();
const clipPaths: { path: string; duration: number; transition: string }[] = [];
for (const [index, source] of clipSources.entries()) {
  const key = `users/${userId}/generations/${generation.id}/shots/fixture-${index}.mp4`;
  await storage.put(key, await readFile(`data/verification/fixture-${source}.mp4`));
  const thumbKey = `users/${userId}/generations/${generation.id}/shots/fixture-${index}.jpg`;
  await thumbnail(await storage.materialize(key), storage.localPath(thumbKey));
  await storage.upload(thumbKey);
  const [clip] = await db
    .insert(assets)
    .values({
      userId,
      generationId: generation.id,
      kind: "clip",
      path: key,
      mime: "video/mp4",
      duration: 4,
      metadata: { fixture: true },
    })
    .returning();
  const [thumb] = await db
    .insert(assets)
    .values({
      userId,
      generationId: generation.id,
      kind: "thumbnail",
      path: thumbKey,
      mime: "image/jpeg",
      metadata: { fixture: true },
    })
    .returning();
  clipPaths.push({
    path: key,
    duration: 8,
    transition: index === 0 ? "crossfade" : "cut",
  });
  await db.insert(shots).values({
    generationId: generation.id,
    sceneId: scene.id,
    position: index,
    duration: 8,
    visualDescription: `Fixture storyboard frame ${index + 1}: a city street losing connectivity at dawn.`,
    videoPrompt: `Fixture clip ${index + 1}: cinematic medium shot, no text in frame.`,
    camera: index % 2 ? "Slow push in" : "Locked off, subtle handheld",
    environment: "City street at sunrise",
    transition: index === 0 ? "crossfade" : "cut",
    mode: "text",
    status: "COMPLETED",
    version: 1,
    clipId: clip.id,
    thumbnailId: thumb.id,
  });
}
const composition = {
  ...buildComposition(clipPaths, "9:16", 48),
  script,
  burnCaptions: true,
  clipAudio: false,
};
// A real render so the editor shows an actual playable final video.
const renderKey = `users/${userId}/generations/${generation.id}/renders/fixture-final.mp4`;
const renderPath = storage.localPath(renderKey);
const renderInfo = await renderVideo(composition, renderPath);
const [renderAsset] = await db
  .insert(assets)
  .values({
    userId,
    generationId: generation.id,
    kind: "render",
    path: renderKey,
    mime: "video/mp4",
    duration: renderInfo.duration,
    metadata: { fixture: true },
  })
  .returning();
const renderThumbKey = `${renderKey}.jpg`;
const [renderThumb] = await db
  .insert(assets)
  .values({
    userId,
    generationId: generation.id,
    kind: "thumbnail",
    path: renderThumbKey,
    mime: "image/jpeg",
    metadata: { fixture: true },
  })
  .returning();
const [render] = await db
  .insert(renders)
  .values({
    generationId: generation.id,
    version: generation.revision,
    status: "COMPLETED",
    composition,
    assetId: renderAsset.id,
    thumbnailId: renderThumb.id,
  })
  .returning();
await db
  .update(generations)
  .set({ finalRenderId: render.id })
  .where(eq(generations.id, generation.id));
await mkdir("data/verification", { recursive: true });
await writeFile(
  "data/verification/ui-session.json",
  JSON.stringify({ cookie, userId, generationId: generation.id, email }, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    fixtureUi: "seeded",
    generationId: generation.id,
    userId,
    shots: clipPaths.length,
    renderDuration: renderInfo.duration,
  }),
);
await pool.end();
