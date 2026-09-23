// Prints a generation's plan: status, creative brief, narration and scene/shot breakdown.
// Usage: pnpm exec tsx scripts/show-plan.ts <generationId> [--wait]
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { generations, scenes, shots } from "../src/db/schema";

const [id, ...flags] = process.argv.slice(2);
const wait = flags.includes("--wait");
const terminal = ["STORYBOARD_READY", "COMPLETED", "FAILED"];

for (let attempt = 0; attempt < 40; attempt++) {
  const [g] = await db.select().from(generations).where(eq(generations.id, id));
  if (!g) throw new Error("generation not found");
  if (!wait || terminal.includes(g.status)) {
    const rows = await db
      .select()
      .from(scenes)
      .where(eq(scenes.generationId, id))
      .orderBy(scenes.position);
    const all = await db
      .select()
      .from(shots)
      .where(eq(shots.generationId, id))
      .orderBy(shots.position);
    console.log(
      JSON.stringify(
        {
          status: g.status,
          error: g.error,
          title: g.title,
          language: g.language,
          targetDuration: g.targetDuration,
          timelineDuration: g.timelineDuration,
          aspectRatio: g.aspectRatio,
          platform: g.platform,
          contentFormat: g.contentFormat,
          visualStyle: g.visualStyle,
          brief: g.creativeBrief,
          bible: g.visualBible,
          script: g.script,
          scenes: rows.map((scene) => ({
            title: scene.title,
            narration: scene.narration,
            shots: all
              .filter((shot) => shot.sceneId === scene.id)
              .map((shot) => ({
                duration: shot.duration,
                camera: shot.camera,
                environment: shot.environment,
                transition: shot.transition,
                visualDescription: shot.visualDescription,
                videoPrompt: shot.videoPrompt,
              })),
          })),
          totals: {
            scenes: rows.length,
            shots: all.length,
            seconds: all.reduce((sum, shot) => sum + shot.duration, 0),
          },
        },
        null,
        1,
      ),
    );
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 15000));
}
process.exit(0);
