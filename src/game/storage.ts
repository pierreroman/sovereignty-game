/** Small, failure-tolerant wrapper around localStorage (private mode, blocked storage, etc.). */
const KEY = "sovereignty-game:v1";

export interface Progress {
  /** Myth ids shown in the current cycle, so refreshes don't repeat until all are seen. */
  seen: string[];
  /** Last verdict the player chose for each myth id. */
  answers: Record<string, { choice: string; correct: boolean }>;
}

const empty = (): Progress => ({ seen: [], answers: {} });

export function loadProgress(): Progress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      seen: Array.isArray(parsed.seen) ? parsed.seen.filter((x) => typeof x === "string") : [],
      answers: parsed.answers && typeof parsed.answers === "object" ? parsed.answers : {},
    };
  } catch {
    return empty();
  }
}

export function saveProgress(p: Progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: progress stays in memory for this visit.
  }
}

export function clearProgress() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
