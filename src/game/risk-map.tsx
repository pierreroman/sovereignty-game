import { Database, KeyRound, Scale, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { RISK_AREAS, type RiskArea } from "./myths";

const ICONS: Record<RiskArea, typeof Database> = {
  data: Database,
  keys: KeyRound,
  operations: Wrench,
  law: Scale,
};

/** The session's four-risk model, with the areas this myth tests highlighted. */
export function RiskMap({ areas }: { areas: RiskArea[] }) {
  return (
    <section aria-labelledby="risk-map-title" className="rounded-2xl border border-surface-border bg-surface p-6">
      <h2 id="risk-map-title" className="eyebrow">
        Risk areas tested
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {RISK_AREAS.map((a) => {
          const on = areas.includes(a.id);
          const Icon = ICONS[a.id];
          return (
            <li
              key={a.id}
              className={cn(
                "flex min-h-20 flex-col justify-between gap-2 rounded-lg border p-3",
                on ? "border-brand bg-choice-selected" : "border-choice-border bg-choice",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{a.label}</span>
                <Icon className={cn("size-4 shrink-0", on ? "text-brand" : "text-lavender")} aria-hidden="true" />
              </span>
              <span className="text-xs text-lavender">{a.question}</span>
              <span className="sr-only">{on ? "Tested by this myth" : "Not the focus of this myth"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
