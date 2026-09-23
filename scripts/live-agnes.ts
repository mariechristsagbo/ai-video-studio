import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import {
  AgnesProvider,
  AGNES_DEFAULT_BASE_URL,
  AGNES_DEFAULT_VIDEO_MODEL,
  AGNES_DEFAULT_TEXT_MODEL,
} from "../src/providers/agnes";
import { downloadPublic } from "../src/storage";
import { probe } from "../src/render/process";
const provider = new AgnesProvider();
const record: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  model: process.env.AGNES_VIDEO_MODEL,
};
const text = await provider.generate('Return only JSON: {"status":"ok"}.');
record.textModel = { reachable: true, validJson: JSON.parse(text).status === "ok" };
// Diagnostic only: reports the provider status and message, never credentials.
const diagnostic = await fetch(
  `${process.env.AGNES_BASE_URL || AGNES_DEFAULT_BASE_URL}/videos`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AGNES_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AGNES_VIDEO_MODEL || AGNES_DEFAULT_VIDEO_MODEL,
      prompt: "Diagnostic request for account entitlement",
      seconds: "4",
      mode: "text",
      size: "720P",
      aspect_ratio: "9:16",
      n: 1,
    }),
  },
);
record.videoCreate = { status: diagnostic.status };
if (!diagnostic.ok) {
  const body = (await diagnostic.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
  };
  record.videoCreate = {
    status: diagnostic.status,
    message: body.error?.message ?? body.message ?? "no message returned",
  };
  await mkdir("data/verification", { recursive: true });
  await writeFile("data/verification/live-agnes.json", JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
  process.exit(1);
}
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
  JSON.stringify(
    { ...record, submitted: { videoId: created.id, status: created.status } },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ submitted: true, videoId: created.id, status: created.status }),
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
        { ...record, completed: { videoId: created.id, probe: info } },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ completed: true, videoId: created.id, probe: info }));
    process.exit(0);
  }
}
throw new Error(
  "Live polling deadline reached; preserve the videoId and query it before submitting again",
);
