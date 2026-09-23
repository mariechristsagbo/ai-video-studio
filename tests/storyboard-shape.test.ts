import { describe, expect, it } from "vitest";
import { normalizeStoryboard, storyboardSchema } from "../src/domain/video";

describe("normalizeStoryboard", () => {
  it("leaves a well-formed answer untouched", () => {
    const answer = {
      scenes: [
        {
          title: "07 h 14",
          narration: "Le GPS disparaît.",
          shots: [{ visualDescription: "une conductrice", videoPrompt: "a driver", duration: 8 }],
        },
      ],
    };
    expect(normalizeStoryboard(answer)).toEqual(answer);
    expect(storyboardSchema.safeParse(normalizeStoryboard(answer)).success).toBe(true);
  });

  it("rebuilds a shot that the model wrote directly on the scene", () => {
    const answer = {
      scenes: [
        {
          shot_id: 1,
          title: "07 h 14 — Le point bleu disparaît",
          narration: "Sept heures quatorze.",
          duration: 8,
          visualDescription: "Gros plan sur une conductrice",
          videoPrompt: "close-up of a driver",
          camera: "over the shoulder",
          environment: "car interior",
          transition: "cut",
        },
      ],
    };
    const parsed = storyboardSchema.safeParse(normalizeStoryboard(answer));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scenes[0].shots).toHaveLength(1);
      expect(parsed.data.scenes[0].shots[0].duration).toBe(8);
      expect(parsed.data.scenes[0].shots[0].videoPrompt).toBe("close-up of a driver");
      expect(parsed.data.scenes[0].title).toBe("07 h 14 — Le point bleu disparaît");
    }
  });

  it("repairs a missing prompt or an out-of-range duration", () => {
    const answer = {
      scenes: [{ videoPrompt: "wide shot of a harbour", duration: 30, narration: "Les ports." }],
    };
    const parsed = storyboardSchema.safeParse(normalizeStoryboard(answer));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const shot = parsed.data.scenes[0].shots[0];
      expect(shot.duration).toBe(8);
      expect(shot.visualDescription).toBe("wide shot of a harbour");
      expect(parsed.data.scenes[0].title).toBe("Scene 1");
    }
  });

  it("accepts a bare array of scenes", () => {
    const answer = [
      { title: "24 h 00", narration: "Le monde s'adapte.", shots: [{ visualDescription: "ville", videoPrompt: "a city", duration: 7 }] },
    ];
    const parsed = storyboardSchema.safeParse(normalizeStoryboard(answer));
    expect(parsed.success).toBe(true);
  });

  it("leaves unusable entries for the schema to reject", () => {
    const parsed = storyboardSchema.safeParse(normalizeStoryboard({ scenes: [{ title: "vide" }] }));
    expect(parsed.success).toBe(false);
  });
});
