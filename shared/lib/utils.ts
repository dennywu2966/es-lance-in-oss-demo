import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Generate random 128-dimensional vector
export function generateRandomVector(dim = 128): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

// Format search latency
export function formatLatency(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}

// Calculate similarity score display
export function formatScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}
