import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CityBackdrop } from "@/components/site/CityBackdrop";
import { ScrollFx, type ScrollSection } from "@/components/site/ScrollFx";
import { LogoMark } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "SafeRoute: the safer way there",
  description:
    "SafeRoute compares Fastest, Balanced and Safest routes using reported crime areas, street lighting, main roads and nearby help.",
};

/** One per [data-scene] section, in order; the 3D camera moves between them. */
const SECTIONS: ScrollSection[] = [
  { id: "top", label: "Home" },
  { id: "reports", label: "See the area" },
  { id: "routes", label: "Compare" },
  { id: "factors", label: "What counts" },
  { id: "start", label: "Start" },
];

const FACTORS = [
  { title: "Reported crime", body: "Areas from news reports, weighted by type and how recent they are." },
  { title: "Night lights", body: "NASA satellite brightness shows the dark stretches of a route." },
  { title: "Lit main roads", body: "Street lighting and road type from OpenStreetMap." },
  { title: "Help nearby", body: "Police stations and hospitals within reach along the way." },
  { title: "Community reports", body: "Count only after several different people confirm the same spot." },
];

/** Bar widths only sketch the idea (how much each route favours speed); they are not measurements. */
const ROUTES = [
  { name: "Fastest", note: "Shortest travel time.", color: "bg-[#8f8a80]", w: 0.55 },
  { name: "Balanced", note: "A fair trade of time and safety.", color: "bg-[#e0a030]", w: 0.78 },
  { name: "Safest", note: "Lowest measured risk, even if a little longer.", color: "bg-brand", w: 1 },
];

const TICKER = ["Reported crime areas", "NASA night lights", "Lit main roads", "Police nearby", "Hospitals nearby", "Community reports", "Fastest · Balanced · Safest"];

const card = "rounded-3xl border border-white/70 bg-paper/70 p-6 shadow-float backdrop-blur-xl sm:p-8";
const eyebrow = "text-xs font-semibold tracking-[0.14em] text-brand-strong uppercase";
const accent = "font-serif font-normal text-brand italic";
const section = "relative flex min-h-svh items-center px-4 py-24 sm:px-8 lg:pr-40 lg:pl-16";

/** Stagger delay for an element's entrance. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function OpenApp() {
  return (
    <Link
      href="/"
      className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-[15px] font-semibold text-paper shadow-[0_10px_28px_-8px_rgb(232_117_36/0.7)] transition-all hover:-translate-y-0.5 hover:bg-brand-strong hover:shadow-[0_14px_32px_-8px_rgb(232_117_36/0.8)]"
    >
      Open SafeRoute
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

export default function AboutPage() {
  return (
    <div className="relative min-h-dvh text-ink">
      <CityBackdrop />
      {/* Keeps text readable over the scene: soft cream on the left on wide screens, from the top on phones. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(180deg,rgb(248_244_236/0.9)_0%,rgb(248_244_236/0.6)_60%,rgb(248_244_236/0.2)_100%)] md:bg-[radial-gradient(ellipse_75%_95%_at_10%_50%,rgb(248_244_236/0.94)_12%,rgb(248_244_236/0.55)_45%,transparent_75%)]"
      />

      <header className="fixed inset-x-0 top-0 z-30 border-b border-line/60 bg-paper/60 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
          <a href="#top" className="flex items-center gap-2" aria-label="SafeRoute, back to top">
            <LogoMark size={28} />
            <span className="text-[17px] font-semibold tracking-tight">SafeRoute</span>
          </a>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-sm font-semibold text-paper hover:bg-brand-strong"
          >
            Open app
          </Link>
        </nav>
      </header>

      <ScrollFx sections={SECTIONS} />

      <main className="relative z-10">
        {/* 1. Hero */}
        <section id="top" data-scene className={`${section} pt-28 pb-36`}>
          <div className="max-w-xl">
            <p className={`${eyebrow} sr-intro`} style={delay(100)}>
              Safety-first navigation
            </p>
            <h1 className="mt-4 text-5xl leading-[0.98] font-semibold tracking-[-0.04em] sm:text-7xl">
              <span className="sr-intro block" style={delay(250)}>
                Get there.
              </span>
              <span className={`${accent} sr-intro block pr-2`} style={delay(450)}>
                Safely.
              </span>
            </h1>
            <p className="sr-intro mt-6 max-w-md text-lg leading-relaxed text-ink-soft text-pretty" style={delay(650)}>
              The fastest road isn&apos;t always the one you want to be on. SafeRoute shows you the alternatives and why
              one is safer.
            </p>
            <div className="sr-intro mt-8 flex flex-wrap gap-3" style={delay(820)}>
              <OpenApp />
              <a
                href="#reports"
                className="inline-flex h-12 items-center rounded-full border border-line-strong bg-paper/60 px-6 text-[15px] font-semibold backdrop-blur transition-colors hover:bg-paper"
              >
                How it works
              </a>
            </div>
          </div>

          <a
            href="#reports"
            className="sr-intro absolute bottom-16 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-ink-muted uppercase hover:text-ink sm:flex"
            style={delay(1200)}
          >
            Scroll
            <span className="relative h-7 w-px bg-ink-muted/40" aria-hidden="true">
              <span className="sr-scroll-dot absolute -left-[2.5px] top-0 size-1.5 rounded-full bg-brand" />
            </span>
          </a>

          <div
            className="sr-intro absolute inset-x-0 bottom-0 overflow-hidden border-t border-line/60 bg-paper/50 py-2.5 backdrop-blur-md"
            style={delay(1000)}
            aria-hidden="true"
          >
            <div className="sr-marquee flex w-max text-xs font-semibold text-ink-soft">
              {[0, 1].map((copy) => (
                <div key={copy} className="flex shrink-0">
                  {[...TICKER, ...TICKER].map((t, i) => (
                    <span key={i} className="flex items-center gap-3 px-3">
                      <span className="size-1 rounded-full bg-brand" />
                      {t}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 2. Reported areas */}
        <section id="reports" data-scene className={`${section} justify-end`}>
          <div data-reveal="right" className={`${card} max-w-md`}>
            <p data-reveal className={eyebrow} style={delay(150)}>
              01 · See the area
            </p>
            <h2 data-reveal className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl" style={delay(260)}>
              Reported crime, <span className={accent}>on the map.</span>
            </h2>
            <p data-reveal className="mt-4 leading-relaxed text-ink-soft" style={delay(380)}>
              Each red area comes from a news report, with the source linked. It&apos;s news, not official police data,
              and the map says so.
            </p>
            <ul className="mt-6 flex flex-col gap-2.5 text-sm">
              <li data-reveal className="flex items-center gap-3" style={delay(500)}>
                <span className="size-3 rounded-full bg-[#e5484d]/70 ring-4 ring-[#e5484d]/20" aria-hidden="true" />
                Red glow: a reported area
              </li>
              <li data-reveal className="flex items-center gap-3" style={delay(600)}>
                <span className="text-base leading-none" aria-hidden="true">💬</span>
                Tap a marker to read the report
              </li>
            </ul>
          </div>
        </section>

        {/* 3. Routes */}
        <section id="routes" data-scene className={section}>
          <div data-reveal="left" className={`${card} w-full max-w-lg`}>
            <p data-reveal className={eyebrow} style={delay(150)}>
              02 · Compare
            </p>
            <h2 data-reveal className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl" style={delay(260)}>
              Three routes, <span className={accent}>one honest choice.</span>
            </h2>
            <ul className="mt-6 flex flex-col gap-3">
              {ROUTES.map((r, i) => (
                <li
                  key={r.name}
                  data-reveal
                  className="rounded-2xl border border-line/80 bg-paper/70 px-4 py-3"
                  style={{ ...delay(380 + i * 130), "--w": r.w } as CSSProperties}
                >
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-right text-sm text-ink-soft">{r.note}</span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-cream-deep" aria-hidden="true">
                    <div className={`sr-bar h-full rounded-full ${r.color}`} />
                  </div>
                </li>
              ))}
            </ul>
            <p data-reveal className="mt-4 text-sm text-ink-muted" style={delay(800)}>
              In the app, each route lists what was measured, so you can check the claim.
            </p>
          </div>
        </section>

        {/* 4. Factors */}
        <section id="factors" data-scene className={`${section} justify-end`}>
          <div data-reveal="right" className={`${card} max-w-md`}>
            <p data-reveal className={eyebrow} style={delay(150)}>
              03 · What counts
            </p>
            <h2 data-reveal className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl" style={delay(260)}>
              Lit streets <span className={accent}>matter.</span>
            </h2>
            <ul className="mt-6 flex flex-col gap-4">
              {FACTORS.map((f, i) => (
                <li key={f.title} data-reveal className="flex gap-3" style={delay(380 + i * 110)}>
                  <span
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-strong"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-ink-soft">
                    <b className="font-semibold text-ink">{f.title}.</b> {f.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 5. Call to action */}
        <section id="start" data-scene className="relative flex min-h-svh flex-col justify-between px-4 pt-24 sm:px-8 lg:px-16">
          <div className="flex flex-1 items-center">
            <div data-reveal="left" className={`${card} max-w-md`}>
              <h2 data-reveal className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl" style={delay(150)}>
                Where do you want <span className={accent}>to go?</span>
              </h2>
              <p data-reveal className="mt-3 text-ink-soft" style={delay(280)}>
                No account needed. Saved places stay in your browser.
              </p>
              <div data-reveal className="mt-6" style={delay(400)}>
                <OpenApp />
              </div>
            </div>
          </div>
          <footer className="-mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 bg-paper/70 px-4 py-4 text-xs text-ink-soft backdrop-blur-xl sm:-mx-8 sm:px-8 lg:-mx-16 lg:px-16">
            <span>SafeRoute · © {new Date().getFullYear()}</span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink"
            >
              © OpenStreetMap contributors
            </a>
          </footer>
        </section>
      </main>
    </div>
  );
}
