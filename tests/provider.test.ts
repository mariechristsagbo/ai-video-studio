import { it, expect, vi } from "vitest";
import { AgnesProvider, ProviderError, structured } from "../src/providers/agnes";
import { z } from "zod";
it("uses the current documented video_id polling contract", async () => {
  process.env.AGNES_API_KEY = "test-only";
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ video_id: "video_test", status: "queued" }))
    .mockResolvedValueOnce(
      Response.json({
        video_id: "video_test",
        status: "completed",
        metadata: { url: "https://cdn.example.com/clip.mp4" },
      }),
    );
  const p = new AgnesProvider(http);
  expect(
    (
      await p.create({
        prompt: "A city",
        seconds: 7,
        aspectRatio: "9:16",
        mode: "text",
      })
    ).id,
  ).toBe("video_test");
  const body = JSON.parse(http.mock.calls[0][1]!.body as string);
  expect(body.seconds).toBe("7");
  expect(body.n).toBe(1);
  expect(body.first_frame).toBeUndefined();
  expect((await p.getStatus("video_test")).url).toContain("clip.mp4");
  expect(String(http.mock.calls[1][0])).toContain(
    "/agnesapi?video_id=video_test&model_name=agnes-video-2.5",
  );
});
it("marks submit timeouts uncertain instead of safe to retry", async () => {
  process.env.AGNES_API_KEY = "test-only";
  const p = new AgnesProvider(vi.fn().mockRejectedValue(new Error("timeout")));
  await expect(
    p.create({ prompt: "city", seconds: 4, aspectRatio: "9:16", mode: "text" }),
  ).rejects.toMatchObject({ uncertain: true });
});
it("bounds structured repair", async () => {
  const provider = { generate: vi.fn().mockResolvedValue("bad") };
  await expect(
    structured(provider, "JSON", z.object({ title: z.string() })),
  ).rejects.toThrow();
  expect(provider.generate).toHaveBeenCalledTimes(3);
});
it("rejects missing reference media before spending", async () => {
  const p = new AgnesProvider();
  await expect(
    p.create({
      prompt: "city",
      seconds: 4,
      aspectRatio: "9:16",
      mode: "reference",
    }),
  ).rejects.toThrow("Reference");
  expect(new ProviderError(429).uncertain).toBe(false);
});
