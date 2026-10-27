import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { VERDICTS, VERDICT_LABEL, type Myth, type Verdict } from "@/game/myths";
import { pinnedMyth, randomMyth } from "@/game/pick";
import { clearProgress, loadProgress, saveProgress, type Progress } from "@/game/storage";
import { RiskMap } from "@/game/risk-map";
import { VerdictStamp } from "@/game/verdict-stamp";
import { VERDICT_TONE } from "@/game/verdict-tone";
import { HeroArt } from "@/game/hero-art";

type Theme = "dark" | "light";
const THEME_KEY = "sovereignty-game:theme";

function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // storage unavailable
  }
  return "dark";
}

function firstMyth(progress: Progress, myths: Myth[]): { myth: Myth; progress: Progress } {
  const pinned = pinnedMyth(window.location.search, myths);
  if (pinned) return { myth: pinned, progress };
  const { myth, resetCycle } = randomMyth(progress.seen, undefined, myths);
  return { myth, progress: resetCycle ? { ...progress, seen: [] } : progress };
}

export function App({ myths }: { myths: Myth[] }) {
  const [initial] = useState(() => firstMyth(loadProgress(), myths));
  const [myth, setMyth] = useState<Myth>(initial.myth);
  const [progress, setProgress] = useState<Progress>(() => ({
    ...initial.progress,
    seen: Array.from(new Set([...initial.progress.seen, initial.myth.id])),
  }));
  const [choice, setChoice] = useState<Verdict | null>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => {
    document.title = `Myth ${myth.number} · Sovereign Cloud Debunkers`;
  }, [myth]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage unavailable
    }
  }, [theme]);

  const answeredCount = Object.keys(progress.answers).length;
  const correctCount = Object.values(progress.answers).filter((a) => a.correct).length;

  const vote = (v: Verdict) => {
    if (choice) return;
    setChoice(v);
    setProgress((p) => ({ ...p, answers: { ...p.answers, [myth.id]: { choice: v, correct: v === myth.verdict } } }));
    setOpen(true);
  };

  const nextMyth = () => {
    const { myth: next, resetCycle } = randomMyth(progress.seen, myth.id, myths);
    setProgress((p) => ({ ...p, seen: [...(resetCycle ? [] : p.seen), next.id] }));
    setMyth(next);
    setChoice(null);
    setOpen(false);
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const restart = () => {
    clearProgress();
    setProgress({ seen: [myth.id], answers: {} });
    setChoice(null);
  };

  const correct = choice === myth.verdict;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#verdict"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
      >
        Skip to your verdict
      </a>

      <header className="border-b border-border bg-header">
        <div className="flex h-[68px] w-full items-center gap-3 px-5 sm:px-8">
          <span className="text-[0.8125rem] tracking-[0.08em] uppercase">
            <span className="font-bold">Sovereign Cloud</span> <span className="ml-1 font-normal">Debunkers</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto rounded-lg border-border bg-transparent"
            aria-pressed={theme === "light"}
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            Switch theme
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <div className="hero-backdrop relative">
          <HeroArt />
          <section aria-labelledby="myth-claim" className="relative px-5 pt-10 pb-8 sm:px-8 sm:pt-12">
            <div className="max-w-[680px]">
              <p className="eyebrow">
                Myth {myth.number} · {myths.length} myths · Separating fact from fiction
              </p>
              <h1
                id="myth-claim"
                ref={headingRef}
                tabIndex={-1}
                className="mt-5 text-[2.25rem] leading-[1.12] font-light tracking-tight outline-none sm:text-[3.25rem]"
              >
                &ldquo;{myth.claim}&rdquo;
              </h1>
              <p className="mt-6 text-[1.0625rem] leading-relaxed text-lavender">
                Busted, Plausible or Confirmed? Pick your verdict and see how it holds up.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1 text-xs">
                <span className="size-1.5 rounded-full bg-signal forced-colors:bg-[CanvasText]" aria-hidden="true" />
                <span aria-live="polite">
                  Score {correctCount} of {answeredCount} correct
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs text-lavender">
                {myths.filter((item) => progress.seen.includes(item.id)).length} of {myths.length} myths seen
                {answeredCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-lavender hover:text-foreground"
                    onClick={restart}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" /> Reset score
                  </Button>
                )}
              </span>
            </div>
            <div className="mt-3 h-[3px] w-full bg-brand" aria-hidden="true" />
          </section>

          <div className="relative grid gap-5 px-5 pb-12 sm:px-8 lg:grid-cols-2">
            <section
              id="verdict"
              aria-labelledby="verdict-title"
              className="flex flex-col rounded-2xl border border-surface-border bg-surface p-6"
            >
              <h2 id="verdict-title" className="eyebrow">
                Your verdict
              </h2>
              <p className="mt-3 text-[1.1875rem] leading-snug font-semibold">&ldquo;{myth.claim}&rdquo;</p>

              <fieldset className="mt-6" disabled={!!choice}>
                <legend className="sr-only">Choose a verdict</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {VERDICTS.map((v) => {
                    const picked = choice === v.id;
                    const isAnswer = !!choice && myth.verdict === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => vote(v.id)}
                        aria-pressed={picked}
                        className={cn(
                          "flex h-12 items-center justify-center gap-2 rounded-lg border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-default sm:h-11",
                          "border-choice-border bg-choice",
                          !choice && "hover:border-brand hover:bg-choice-selected",
                          picked && "border-brand bg-choice-selected",
                          choice && !picked && !isAnswer && "opacity-50",
                        )}
                      >
                        {isAnswer && (
                          <span className={cn("size-2 rounded-full forced-colors:bg-[CanvasText]", VERDICT_TONE[v.id].dot)} aria-hidden="true" />
                        )}
                        {v.label}
                        {picked && <span className="sr-only">(your vote)</span>}
                        {isAnswer && <span className="sr-only">(correct verdict)</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {choice && (
                <div className="mt-5 flex flex-wrap items-center gap-3" aria-live="polite">
                  <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", correct ? "text-confirmed" : "text-busted")}>
                    {correct ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
                    {correct ? "Correct" : "Incorrect"}: {VERDICT_LABEL[myth.verdict]}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" className="rounded-lg bg-transparent" onClick={() => setOpen(true)}>
                      Why?
                    </Button>
                    <Button size="sm" className="rounded-lg" onClick={nextMyth}>
                      Next myth <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <RiskMap areas={myth.areas} />
          </div>
        </div>
      </main>

      <footer className="px-5 pt-6 pb-10 text-center text-xs leading-relaxed text-lavender">
        <p>{myths.length} myths. Three verdicts. Your call.</p>
        <p>Your answers stay on this device.</p>
        <a className="mt-2 inline-block underline" href="/manage">Manage myths</a>
      </footer>

      <ResultDialog myth={myth} choice={choice} open={open} onOpenChange={setOpen} onNext={nextMyth} />
      <Toaster />
    </div>
  );
}

function ResultDialog({
  myth,
  choice,
  open,
  onOpenChange,
  onNext,
}: {
  myth: Myth;
  choice: Verdict | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onNext: () => void;
}) {
  if (!choice) return null;
  const correct = choice === myth.verdict;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-surface-border bg-surface p-6 sm:max-w-xl">
        <DialogHeader className="gap-3 text-left">
          <p className="eyebrow">Myth {myth.number} · The verdict</p>
          <DialogTitle className={cn("flex items-center gap-2 text-3xl font-semibold tracking-tight", correct ? "text-confirmed" : "text-busted")}>
            {correct ? <CheckCircle2 className="size-7" aria-hidden="true" /> : <XCircle className="size-7" aria-hidden="true" />}
            {correct ? "Correct!" : "Incorrect!"}
          </DialogTitle>
          <DialogDescription className="text-sm text-lavender">
            You voted <strong className="text-foreground">{VERDICT_LABEL[choice]}</strong>. The verdict on &ldquo;{myth.claim}&rdquo; is{" "}
            <strong className="text-foreground">
              {VERDICT_LABEL[myth.verdict]}
              {myth.qualifier ? ` (${myth.qualifier})` : ""}
            </strong>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex justify-center py-2">
            <VerdictStamp verdict={myth.verdict} qualifier={myth.qualifier} />
          </div>
          <p className="text-base font-semibold">{myth.summary}</p>
          {myth.rationale.map((para, i) => (
            <p key={i} className="text-sm leading-relaxed text-foreground/90">
              {para}
            </p>
          ))}
          <div className="rounded-lg border border-choice-border bg-choice p-3">
            <p className="text-sm">
              <span className="font-semibold text-brand">The tradeoff: </span>
              {myth.tradeoff}
            </p>
          </div>
          <div>
            <h2 className="eyebrow">Learn more</h2>
            <ul className="mt-2 space-y-1.5">
              {myth.sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1 text-sm text-foreground underline decoration-brand underline-offset-4 hover:text-brand"
                  >
                    {s.label}
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-lg bg-transparent" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="rounded-lg" onClick={onNext}>
            Next myth <ArrowRight aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default App;
