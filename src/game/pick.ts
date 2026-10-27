import { MYTHS, type Myth } from "./myths.js";

/** A myth pinned by the URL (?myth=3 or ?myth=residency), for per-slide QR codes. */
export function pinnedMyth(search: string, myths: Myth[] = MYTHS): Myth | undefined {
  const value = new URLSearchParams(search).get("myth")?.trim().toLowerCase();
  if (!value) return undefined;
  return myths.find((m) => m.id === value || String(m.number) === value);
}

/** Random myth, preferring ones not yet seen this cycle and never repeating the current one. */
export function randomMyth(seen: string[], currentId?: string, myths: Myth[] = MYTHS): { myth: Myth; resetCycle: boolean } {
  const notCurrent = myths.filter((m) => m.id !== currentId);
  const pool = notCurrent.length ? notCurrent : myths;
  const unseen = pool.filter((m) => !seen.includes(m.id));
  const resetCycle = unseen.length === 0;
  const from = resetCycle ? pool : unseen;
  return { myth: from[Math.floor(Math.random() * from.length)], resetCycle };
}
