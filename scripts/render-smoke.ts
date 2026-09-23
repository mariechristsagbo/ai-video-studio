import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { run } from "../src/render/process";
import { renderVideo } from "../src/render/render";
import { buildComposition } from "../src/domain/video";
const dir = resolve("data/verification");
await mkdir(dir, { recursive: true });
for (const [i, color] of ["#315546", "#61764b", "#d5be85"].entries())
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=360x640:r=30:d=4`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${220 + i * 110}:duration=4`,
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    `${dir}/fixture-${i}.mp4`,
  ]);
await run("ffmpeg", [
  "-y",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=180:duration=11.6",
  "-c:a",
  "pcm_s16le",
  `${dir}/narration.wav`,
]);
const composition = {
  ...buildComposition(
    [0, 1, 2].map((i) => ({
      path: `${dir}/fixture-${i}.mp4`,
      duration: 4,
      transition: i === 0 ? "crossfade" : i === 1 ? "fade" : "cut",
    })),
    "9:16",
    11.6,
  ),
  script:
    "At dawn the city wakes. Three scenes become one coherent story. This is a generated test fixture, not an Agnes production.",
  burnCaptions: true,
  clipAudio: true,
  narration: `${dir}/narration.wav`,
  music: `${dir}/narration.wav`,
};
const info = await renderVideo(composition, `${dir}/multi-shot.mp4`);
const video = info.streams.find((s) => s.codec_type === "video"),
  audio = info.streams.find((s) => s.codec_type === "audio");
assert.equal(video?.width, 1080);
assert.equal(video?.height, 1920);
assert.equal(video?.codec_name, "h264");
assert.equal(audio?.codec_name, "aac");
assert.ok(Math.abs(info.duration - 11.6) < 0.2);
await writeFile(
  `${dir}/render-smoke.json`,
  JSON.stringify({ fixture: true, composition, probe: info }, null, 2),
);
console.log(
  JSON.stringify({
    renderSmoke: "passed",
    path: `${dir}/multi-shot.mp4`,
    probe: info,
  }),
);
