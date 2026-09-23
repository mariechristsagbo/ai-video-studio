import { describe, expect, it } from "vitest";
import { MIN_VIDEO_SECONDS, MAX_VIDEO_SECONDS, fitShotsToTimeline } from "../src/domain/video";

const shots = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: index, visualDescription: `beat ${index}` }));

describe("fitShotsToTimeline", () => {
  it("keeps the storyboard's own shot count and spreads the narration across it", () => {
    const { shots: fitted, durations } = fitShotsToTimeline(shots(18), 121);
    expect(fitted).toHaveLength(18);
    expect(durations).toHaveLength(18);
    expect(durations.reduce((a, b) => a + b, 0)).toBe(121);
    expect(Math.min(...durations)).toBeGreaterThanOrEqual(MIN_VIDEO_SECONDS);
    expect(Math.max(...durations)).toBeLessThanOrEqual(MAX_VIDEO_SECONDS);
  });

  it("never exceeds the 12 second ceiling: a short board is padded to fit a long narration", () => {
    const { shots: fitted, durations } = fitShotsToTimeline(shots(3), 300);
    expect(fitted).toHaveLength(Math.ceil(300 / MAX_VIDEO_SECONDS));
    expect(durations.reduce((a, b) => a + b, 0)).toBe(300);
    expect(Math.max(...durations)).toBeLessThanOrEqual(MAX_VIDEO_SECONDS);
  });

  it("never goes below the 4 second floor: an over-long board is trimmed", () => {
    const { shots: fitted, durations } = fitShotsToTimeline(shots(40), 60);
    expect(fitted).toHaveLength(Math.floor(60 / MIN_VIDEO_SECONDS));
    expect(durations.reduce((a, b) => a + b, 0)).toBe(60);
    expect(Math.min(...durations)).toBeGreaterThanOrEqual(MIN_VIDEO_SECONDS);
  });

  it("rounds fractional narration lengths", () => {
    const { durations } = fitShotsToTimeline(shots(10), 84.6);
    expect(durations.reduce((a, b) => a + b, 0)).toBe(85);
  });

  it("refuses an empty storyboard and an impossible timeline", () => {
    expect(() => fitShotsToTimeline([], 60)).toThrow(/no shots/);
    expect(() => fitShotsToTimeline(shots(5), 2)).toThrow(/between 4 and 600/);
    expect(() => fitShotsToTimeline(shots(5), 900)).toThrow(/between 4 and 600/);
  });
});
