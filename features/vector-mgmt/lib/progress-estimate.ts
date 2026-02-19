interface EstimateRemainingSecondsInput {
  startedAtMs: number | null;
  nowMs: number;
  progressPercent: number;
}

export function estimateRemainingSeconds({
  startedAtMs,
  nowMs,
  progressPercent,
}: EstimateRemainingSecondsInput): number | null {
  if (startedAtMs === null || progressPercent <= 0 || progressPercent >= 100) {
    return null;
  }

  const elapsedSec = Math.max(0, (nowMs - startedAtMs) / 1000);
  if (elapsedSec <= 0) {
    return null;
  }

  const totalEstimatedSec = elapsedSec / (progressPercent / 100);
  const remainingSec = Math.max(0, Math.round(totalEstimatedSec - elapsedSec));
  return Number.isFinite(remainingSec) ? remainingSec : null;
}

export function formatRemainingTime(seconds: number | null): string {
  if (seconds === null) {
    return "Calculating ETA...";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}
