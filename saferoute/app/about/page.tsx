import {
  ArrowRight,
  Lightbulb,
  MessageCircleWarning,
  MessageSquareWarning,
  MoonStar,
  Siren,
  type LucideIcon,
} from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CityBackdrop } from "@/components/site/CityBackdrop";
import { ScrollFx, type ScrollSection } from "@/components/site/ScrollFx";
import { LogoMark } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "SafeRoute: the safer way there",
  description:
    "SafeRoute compares Fastest, Balanced and Safest routes using reported crime areas, street lighting, main roads and nearby help.",
};

export const viewport: Viewport = { themeColor: "#eef1f4" };

/** One per [data-scene] section, in order; the 3D camera moves between them. */
const SECTIONS: ScrollSection[] = [
  { id: "top", label: "Home" },
  { id: "reports", label: "See the area" },
  { id: "routes", label: "Compare" },
  { id: "factors", label: "What counts" },
  { id: "start", label: "Start" },
];

const FACTORS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: MessageCircleWarning, title: "Reported crime", body: "Areas from news reports, weighted by type and how recent they are." },
  { icon: MoonStar, title: "Dark stretches", body: "NASA satellite brightness shows the parts of a route that are dark at night." },
  { icon: Lightbulb, title: "Lit main roads", body: "Street lighting and road type from OpenStreetMap." },
  { icon: Siren, title: "Help nearby", body: "Police stations and hospitals within reach along the way." },
  { icon: MessageSquareWarning, title: "Community reports", body: "Count only after several different people confirm the same spot." },
];

/** Bar widths only sketch the idea (how much each route favours safety); they are not measurements. */
const ROUTES = [
  { name: "Fastest", note: "Shortest travel time", color: "bg-[#8e8a84]", w: 0.55 },
  { name: "Balanced", note: "A fair trade of time and safety", color: "bg-[#e9a93a]", w: 0.78 },
  { name: "Safest", note: "Lowest measured risk", color: "bg-brand", w: 1 },
];

const container = "sr-persp mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-12";
/** A full-height scroll section; on phones the card sits low so the city shows above it. */
const section = "relative flex min-h-svh items-end pt-24 pb-10 sm:items-center sm:py-28";
const card =
  "sr-glass-card sr-glare w-full rounded-[28px] p-7 sm:p-10";
const eyebrow = "flex items-center gap-2.5 text-[13px] font-semibold text-brand-strong";
const h2 = "sr-display mt-4 text-[1.9rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-ink sm:text-[2.4rem]";

/** Stagger delay for an element's entrance. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function OpenApp({ size = "lg" }: { size?: "sm" | "lg" }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center justify-center gap-2 rounded-full bg-brand font-semibold text-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_20px_-6px_rgb(232_117_36/0.55)] transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-brand-strong ${
        size === "lg" ? "h-12 px-6 text-[15px]" : "h-9 px-4 text-[14px]"
      }`}
    >
      Open {size === "lg" ? "SafeRoute" : "app"}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function Step({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p data-reveal className={eyebrow} style={delay(120)}>
      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-soft px-1.5 text-[12px] tabular-nums">{n}</span>
      {children}
    </p>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={swatch} aria-hidden="true" />
      {label}
    </li>
  );
}

export default function AboutPage() {
  return (
    <div className="sr-about relative min-h-dvh bg-[#eef1f4] font-sans text-ink antialiased">
      <CityBackdrop />

      <header className="fixed inset-x-0 top-0 z-30 border-b border-white/50 bg-white/60 backdrop-blur-md backdrop-saturate-150">
        <nav className={`${container} flex h-16 items-center justify-between`} aria-label="Main">
          <a href="#top" className="flex items-center gap-2.5" aria-label="SafeRoute, back to top">
            <LogoMark size={28} />
            <span className="text-[17px] font-semibold tracking-tight">SafeRoute</span>
          </a>
          <div className="flex items-center gap-2 sm:gap-8">
            <div className="hidden items-center gap-7 text-[14px] text-ink-soft md:flex">
              <a href="#reports" className="transition-colors hover:text-ink">How it works</a>
              <a href="#routes" className="transition-colors hover:text-ink">Compare</a>
              <a href="#factors" className="transition-colors hover:text-ink">Safety factors</a>
            </div>
            <OpenApp size="sm" />
          </div>
        </nav>
      </header>

      <ScrollFx sections={SECTIONS} />

      <main className="relative z-10">
        {/* 1. Hero */}
        <section id="top" data-scene className="relative flex min-h-svh items-start pt-28 pb-16 sm:items-center sm:pt-24">
          <div className={container}>
            {/* Frosted glass panel: the city stays visible, softly blurred, behind the text. */}
            <div data-tilt className="sr-glass-card sr-glare max-w-[38rem] rounded-[32px] p-7 sm:p-10">
              <p
                className="sr-intro inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/80 py-1.5 pr-3.5 pl-2.5 text-[13px] font-medium text-ink-soft shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur"
                style={delay(80)}
              >
                <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
                Safety-first navigation for Bengaluru
              </p>
              <h1 className="sr-display mt-7 text-[clamp(2.9rem,7vw,5.5rem)] leading-[0.98] font-semibold tracking-[-0.04em]">
                <span className="sr-mask">
                  <span className="sr-depth" style={delay(160)}>Get there.</span>
                </span>
                <span className="sr-mask">
                  <span className="sr-depth-brand text-brand" style={delay(300)}>
                    Safely.
                  </span>
                </span>
              </h1>
              <p className="sr-intro mt-7 max-w-[32rem] text-[18px] leading-[1.6] text-ink-soft text-pretty sm:text-[19px]" style={delay(480)}>
                The fastest road isn&apos;t always the one you want to be on. SafeRoute shows you the alternatives, and why
                one is safer.
              </p>
              <div className="sr-intro mt-10 flex flex-wrap gap-3" style={delay(620)}>
                <OpenApp />
                <a
                  href="#reports"
                  className="inline-flex h-12 items-center rounded-full border border-black/[0.08] bg-white/85 px-6 text-[15px] font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur transition-colors hover:bg-white"
                >
                  How it works
                </a>
              </div>
              <ul className="sr-intro mt-12 hidden flex-wrap gap-x-6 gap-y-2.5 text-[13px] font-medium text-ink-soft sm:flex" style={delay(760)}>
                <Legend swatch="h-1.5 w-6 rounded-full bg-brand" label="Safest route" />
                <Legend swatch="h-1.5 w-6 rounded-full bg-[#8e8a84]" label="Fastest route" />
                <Legend swatch="size-3 rounded-full bg-[#e5484d]/70 ring-2 ring-[#e5484d]/25" label="Reported area" />
              </ul>
            </div>
          </div>
        </section>

        {/* 2. Reported areas */}
        <section id="reports" data-scene className={section}>
          <div className={`${container} flex justify-end lg:pr-24 2xl:pr-12`}>
            <div data-reveal="right" data-tilt className={`${card} max-w-[30rem]`}>
              <Step n="01">See the area</Step>
              <h2 data-reveal className={h2} style={delay(220)}>
                Reported crime, <span className="text-brand">on the map.</span>
              </h2>
              <p data-reveal className="mt-4 text-[16px] leading-relaxed text-ink-soft sm:text-[17px]" style={delay(320)}>
                Each red area comes from a news report, with the source linked. It&apos;s news, not official police data, and
                the map says so.
              </p>
              <ul className="mt-8 flex flex-col gap-3.5 border-t border-black/[0.06] pt-6 text-[15px] text-ink-soft">
                <li data-reveal className="flex items-center gap-3" style={delay(420)}>
                  <span className="size-3 shrink-0 rounded-full bg-[#e5484d]/80 ring-4 ring-[#e5484d]/15" aria-hidden="true" />
                  A red area marks a reported incident
                </li>
                <li data-reveal className="flex items-center gap-3" style={delay(500)}>
                  <MessageCircleWarning className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  Tap its marker to read the report and its source
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 3. Routes */}
        <section id="routes" data-scene className={section}>
          <div className={container}>
            <div data-reveal="left" data-tilt className={`${card} max-w-[32rem]`}>
              <Step n="02">Compare</Step>
              <h2 data-reveal className={h2} style={delay(220)}>
                Three routes, <span className="text-brand">one honest choice.</span>
              </h2>
              <ul className="mt-8 flex flex-col gap-2.5">
                {ROUTES.map((r, i) => (
                  <li
                    key={r.name}
                    data-reveal
                    className="rounded-2xl bg-white/45 px-4 py-3.5 ring-1 ring-white/60"
                    style={{ ...delay(320 + i * 110), "--w": r.w } as CSSProperties}
                  >
                    <div className="flex items-baseline justify-between gap-6">
                      <span className="text-[15px] font-semibold text-ink">{r.name}</span>
                      <span className="text-right text-[13px] text-ink-muted">{r.note}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.06]" aria-hidden="true">
                      <div className={`sr-bar h-full rounded-full ${r.color}`} />
                    </div>
                  </li>
                ))}
              </ul>
              <p data-reveal className="mt-6 text-[14px] leading-relaxed text-ink-muted" style={delay(700)}>
                In the app, each route lists what was measured, so you can check the claim yourself.
              </p>
            </div>
          </div>
        </section>

        {/* 4. Factors */}
        <section id="factors" data-scene className={section}>
          <div className={`${container} flex justify-end lg:pr-24 2xl:pr-12`}>
            <div data-reveal="right" data-tilt className={`${card} max-w-[30rem]`}>
              <Step n="03">What counts</Step>
              <h2 data-reveal className={h2} style={delay(220)}>
                Lit streets <span className="text-brand">matter.</span>
              </h2>
              <ul className="mt-8 flex flex-col gap-5">
                {FACTORS.map((f, i) => (
                  <li key={f.title} data-reveal className="flex gap-4" style={delay(320 + i * 90)}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong" aria-hidden="true">
                      <f.icon className="size-[18px]" />
                    </span>
                    <p className="text-[15px] leading-relaxed text-ink-soft">
                      <b className="block font-semibold text-ink">{f.title}</b>
                      {f.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 5. Call to action */}
        <section id="start" data-scene className="relative flex min-h-svh flex-col justify-between pt-24">
          <div className={`${container} flex flex-1 items-end pb-10 sm:items-center sm:pb-0`}>
            <div data-reveal="left" data-tilt className={`${card} max-w-[32rem]`}>
              <h2 data-reveal className="sr-display text-[2.2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-ink sm:text-[3rem]" style={delay(120)}>
                Where do you want <span className="text-brand">to go?</span>
              </h2>
              <p data-reveal className="mt-4 text-[17px] leading-relaxed text-ink-soft" style={delay(240)}>
                No account needed. Saved places stay in your browser.
              </p>
              <div data-reveal className="mt-8" style={delay(340)}>
                <OpenApp />
              </div>
            </div>
          </div>
          <footer className="mt-16 border-t border-white/50 bg-white/65 backdrop-blur-md">
            <div className={`${container} flex flex-wrap items-center justify-between gap-3 py-6 text-[13px] text-ink-muted`}>
              <span className="flex items-center gap-2">
                <LogoMark size={18} /> SafeRoute · © {new Date().getFullYear()}
              </span>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="transition-colors hover:text-ink">
                Map data © OpenStreetMap contributors
              </a>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
