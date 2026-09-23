import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { AgnesProvider } from "../src/providers/agnes";
import { downloadPublic } from "../src/storage/local";
import { probe } from "../src/render/process";
const provider = new AgnesProvider();
const text = await provider.generate('Return only JSON: {"status":"ok"}.');
console.log(
  JSON.stringify({
    textReachable: true,
    validJson: JSON.parse(text).status === "ok",
  }),
);
const created = await provider.create({
  prompt:
    "A calm close-up of a green leaf with morning dew, gentle natural breeze, soft daylight, steady cinematic camera. No text or people.",
  seconds: 4,
  aspectRatio: "9:16",
  mode: "text",
});
await mkdir("data/verification", { recursive: true });
await writeFile(
  "data/verification/live-agnes.json",
  JSON.stringify({ videoId: created.id, status: created.status }),
);
console.log(
  JSON.stringify({
    submitted: true,
    videoId: created.id,
    status: created.status,
  }),
);
for (let attempt = 0; attempt < 100; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const result = await provider.getStatus(created.id);
  if (result.status === "failed") throw new Error("Live Agnes job failed");
  if (result.status === "completed" && result.url) {
    const bytes = await downloadPublic(result.url);
    await writeFile("data/verification/live-agnes.mp4", bytes);
    const info = await probe("data/verification/live-agnes.mp4");
    await writeFile(
      "data/verification/live-agnes.json",
      JSON.stringify(
        { videoId: created.id, status: result.status, probe: info },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ completed: true, videoId: created.id, probe: info }));
    process.exit(0);
  }
}
throw new Error(
  "Live polling deadline reached; preserve videoId and query it before submitting again",
);
