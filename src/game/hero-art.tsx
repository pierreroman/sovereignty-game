/** Decorative stripes, diagonal and curve from the poll's hero. */
export function HeroArt() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <line x1="0" y1="92" x2="100" y2="12" stroke="var(--hero-diagonal)" strokeWidth="0.15" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute inset-y-0 right-[13%] hidden gap-0 sm:flex">
        <span className="h-full w-[18px] bg-signal" />
        <span className="ml-[30px] h-full w-[3px] bg-wire" />
        <span className="ml-[12px] h-full w-[4px] bg-signal" />
      </div>
      <svg className="absolute right-0 top-[38%] hidden h-[62%] w-24 sm:block" viewBox="0 0 100 300" preserveAspectRatio="none">
        <path d="M100 0 C 60 40, 92 160, 96 300" fill="none" stroke="var(--hero-curve)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
