import { cn } from "@/lib/utils";
import { VERDICT_LABEL, type Verdict } from "./myths";
import { VERDICT_TONE } from "./verdict-tone";

export function VerdictStamp({ verdict, qualifier, className }: { verdict: Verdict; qualifier?: string; className?: string }) {
  const tone = VERDICT_TONE[verdict];
  return (
    <div
      className={cn(
        "inline-flex -rotate-6 flex-col items-center rounded-lg border-[3px] px-5 py-1.5 motion-safe:animate-in motion-safe:zoom-in-150 motion-safe:fade-in-0 motion-safe:duration-300",
        tone.border,
        tone.text,
        className,
      )}
    >
      <span className="text-2xl font-bold uppercase tracking-[0.22em]">{VERDICT_LABEL[verdict]}</span>
      {qualifier && <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em]">{qualifier}</span>}
    </div>
  );
}
