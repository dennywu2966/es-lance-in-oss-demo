import { estimateRemainingSeconds, formatRemainingTime } from "@/features/vector-mgmt/lib/progress-estimate";

describe("progress estimate", () => {
  it("estimates remaining seconds from elapsed time and progress", () => {
    const remaining = estimateRemainingSeconds({
      startedAtMs: 0,
      nowMs: 30_000,
      progressPercent: 50,
    });

    expect(remaining).toBe(30);
  });

  it("returns null estimate when progress is zero", () => {
    const remaining = estimateRemainingSeconds({
      startedAtMs: 0,
      nowMs: 30_000,
      progressPercent: 0,
    });

    expect(remaining).toBeNull();
  });

  it("formats remaining time as mm:ss", () => {
    expect(formatRemainingTime(125)).toBe("2m 05s");
    expect(formatRemainingTime(9)).toBe("9s");
    expect(formatRemainingTime(null)).toBe("Calculating ETA...");
  });
});
