import { Crosshair, MapPinned, Route as RouteIcon } from "lucide-react";

/**
 * Decorative product preview for the landing page. It shows the app's real
 * interface labels and an abstract route illustration. It contains no
 * places, times, distances or scores.
 */
export function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]" aria-hidden="true">
      <div className="relative aspect-[4/3.4] overflow-hidden rounded-[28px] border border-line bg-cream-deep shadow-float">
        <svg viewBox="0 0 560 476" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="blocks" width="70" height="70" patternUnits="userSpaceOnUse">
              <rect width="70" height="70" fill="#F1EBDF" />
              <rect x="8" y="8" width="54" height="54" rx="6" fill="#EDE5D6" />
            </pattern>
          </defs>
          <rect width="560" height="476" fill="url(#blocks)" />
          <path d="M-20 300 C 120 280, 200 330, 330 300 S 520 250, 600 270" stroke="#FFFDF8" strokeWidth="16" fill="none" />
          <path d="M150 -20 C 170 120, 120 260, 180 500" stroke="#FFFDF8" strokeWidth="12" fill="none" />
          <path d="M420 -20 C 400 150, 460 300, 430 500" stroke="#FFFDF8" strokeWidth="12" fill="none" />
          <path d="M-20 140 C 140 150, 330 110, 600 150" stroke="#FFFDF8" strokeWidth="10" fill="none" />
          <path d="M175 380 C 230 330, 260 250, 330 225 S 410 170, 432 120" stroke="#9A9385" strokeWidth="9" strokeLinecap="round" fill="none" opacity="0.75" />
          <path d="M175 380 C 210 360, 300 350, 360 300 S 420 190, 432 120" stroke="#FFFDF8" strokeWidth="15" strokeLinecap="round" fill="none" />
          <path d="M175 380 C 210 360, 300 350, 360 300 S 420 190, 432 120" stroke="#E87524" strokeWidth="8" strokeLinecap="round" fill="none" />
          <circle cx="175" cy="380" r="11" fill="#242321" stroke="#FFFDF8" strokeWidth="5" />
          <circle cx="175" cy="380" r="3" fill="#FFFDF8" />
          <g transform="translate(415 76)">
            <path d="M17 1C8.2 1 1 8 1 16.7 1 28.5 17 43 17 43s16-14.5 16-26.3C33 8 25.8 1 17 1z" fill="#E87524" stroke="#FFFDF8" strokeWidth="2" />
            <circle cx="17" cy="16.5" r="5.5" fill="#FFFDF8" />
          </g>
        </svg>
      </div>

      <div className="absolute -bottom-8 -left-2 w-[78%] max-w-[330px] rounded-3xl border border-line bg-paper p-4 shadow-float sm:-left-8">
        <p className="text-[15px] font-semibold text-ink">Where do you want to go?</p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-cream/60 px-3 py-2.5">
            <span className="size-3 rounded-full border-[3px] border-ink bg-paper" />
            <span className="flex-1 text-sm text-ink-muted">Current location</span>
            <Crosshair className="size-4 text-ink-soft" />
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-cream/60 px-3 py-2.5">
            <span className="size-3 rounded-full bg-brand" />
            <span className="flex-1 text-sm text-ink-muted">Search destination</span>
            <MapPinned className="size-4 text-ink-soft" />
          </div>
        </div>
        <div className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-paper">
          <RouteIcon className="size-4" /> Find Safer Routes
        </div>
      </div>
    </div>
  );
}
