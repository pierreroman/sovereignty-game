import type { Verdict } from "./myths";

/** One tone map for every verdict mark; colours come from theme variables (dark + light). */
export const VERDICT_TONE: Record<Verdict, { text: string; border: string; dot: string }> = {
  busted: { text: "text-busted", border: "border-busted", dot: "bg-busted" },
  plausible: { text: "text-plausible", border: "border-plausible", dot: "bg-plausible" },
  confirmed: { text: "text-confirmed", border: "border-confirmed", dot: "bg-confirmed" },
};
