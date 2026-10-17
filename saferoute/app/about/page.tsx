import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/instrument-serif/400-italic.css";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ArrowRight } from "lucide-react";
import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = { themeColor: "#0b0d12" };

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

/** Bar widths only sketch the idea (how much each route favours safety); they are not measurements. */
const ROUTES = [
  { name: "Fastest", note: "Shortest travel time.", color: "bg-[#9a958c]", w: 0.55 },
  { name: "Balanced", note: "A fair trade of time and safety.", color: "bg-[#e9a93a]", w: 0.78 },
  { name: "Safest", note: "Lowest measured risk, even if a little longer.", color: "bg-[#f08a3c]", w: 1 },
];

const TICKER = ["Reported crime areas", "NASA night lights", "Lit main roads", "Police nearby", "Hospitals nearby", "Community reports", "Fastest · Balanced · Safest"];

const pad = "px-5 sm:px-8 lg:pl-16 lg:pr-40";
const section = `relative flex min-h-svh items-center py-28 ${pad}`;
const card =
  "rounded-3xl border border-white/10 bg-[#10131a]/75 p-7 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.8)] ring-1 ring-white/[0.03] ring-inset backdrop-blur-2xl sm:p-9";
const eyebrow = "sr-mono text-[11px] font-medium tracking-[0.2em] text-[#ff9a4d] uppercase";
const h2 = "sr-display mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance text-white sm:text-[2.6rem] sm:leading-[1.05]";
/** Italic serif accent in brand orange. */
const accent = "sr-serif sr-shimmer bg-linear-to-r from-[#ffc58a] via-[#f07a2a] to-[#ffc58a] bg-clip-text pr-1.5 text-transparent";

/** Stagger delay for an element's entrance. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function OpenApp({ size = "lg" }: { size?: "sm" | "lg" }) {
  return (
    <Link
      href="/"
      className={`sr-sheen group inline-flex items-center justify-center gap-2 rounded-full bg-[#f07a2a] font-semibold text-white shadow-[0_0_0_1px_rgb(255_255_255/0.12)_inset,0_12px_36px_-10px_rgb(240_122_42/0.9)] transition-all hover:-translate-y-0.5 hover:bg-[#f38a42] ${
        size === "lg" ? "h-12 px-6 text-[15px]" : "h-9 px-4 text-sm"
      }`}
    >
      Open {size === "lg" ? "SafeRoute" : "app"}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
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
    <div className={`sr-about relative min-h-dvh bg-[#0b0d12] text-white antialiased ${GeistSans.className} ${GeistMono.variable}`}>
      <CityBackdrop />
      {/* Darkens the scene where the text sits: from the left on wide screens, from the top on phones. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(180deg,rgb(11_13_18/0.88)_0%,rgb(11_13_18/0.55)_55%,rgb(11_13_18/0.35)_100%)] md:bg-[radial-gradient(ellipse_75%_110%_at_0%_50%,rgb(11_13_18/0.94)_0%,rgb(11_13_18/0.7)_38%,transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[1] h-40 bg-linear-to-t from-[#0b0d12]/80 to-transparent"
      />

      <header className="fixed inset-x-0 top-0 z-30 border-b border-white/[0.06] bg-[#0b0d12]/55 backdrop-blur-xl">
        <nav className={`flex h-14 items-center justify-between ${pad} lg:pr-16`} aria-label="Main">
          <a href="#top" className="flex items-center gap-2.5" aria-label="SafeRoute, back to top">
            <LogoMark size={26} />
            <span className="text-[16px] font-semibold tracking-tight">SafeRoute</span>
          </a>
          <div className="flex items-center gap-1 sm:gap-6">
            <div className="hidden items-center gap-6 text-sm text-white/60 md:flex">
              <a href="#reports" className="transition-colors hover:text-white">How it works</a>
              <a href="#routes" className="transition-colors hover:text-white">Compare</a>
              <a href="#factors" className="transition-colors hover:text-white">Safety factors</a>
            </div>
            <OpenApp size="sm" />
          </div>
        </nav>
      </header>

      <ScrollFx sections={SECTIONS} />

      <main className="relative z-10">
        {/* 1. Hero */}
        <section id="top" data-scene className={`${section} pb-40`}>
          <div className="max-w-2xl">
            <p
              className="sr-intro sr-mono inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pr-3.5 pl-2.5 text-[11px] font-medium tracking-[0.12em] text-white/70 uppercase backdrop-blur"
              style={delay(100)}
            >
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#f07a2a]/70" />
                <span className="relative size-2 rounded-full bg-[#f07a2a]" />
              </span>
              Safety-first navigation
            </p>
            <h1 className="sr-display mt-6 text-[clamp(3.4rem,8.5vw,7rem)] leading-[0.9] font-semibold tracking-[-0.045em]">
              <span className="sr-mask">
                <span className="bg-linear-to-b from-white to-white/70 bg-clip-text text-transparent" style={delay(200)}>
                  Get there.
                </span>
              </span>
              <span className="sr-mask">
                <span style={delay(380)}>
                  <span className={`${accent} inline-block pb-1 font-normal`}>Safely.</span>
                </span>
              </span>
            </h1>
            <p className="sr-intro mt-6 max-w-lg text-lg leading-relaxed text-white/65 text-pretty sm:text-xl" style={delay(620)}>
              The fastest road isn&apos;t always the one you want to be on. SafeRoute shows you the alternatives, and why
              one is safer.
            </p>
            <div className="sr-intro mt-9 flex flex-wrap gap-3" style={delay(800)}>
              <OpenApp />
              <a
                href="#reports"
                className="inline-flex h-12 items-center rounded-full border border-white/15 bg-white/[0.04] px-6 text-[15px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
              >
                How it works
              </a>
            </div>
            <ul className="sr-intro mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/55" style={delay(980)}>
              <Legend swatch="h-1 w-5 rounded-full bg-[#f07a2a] shadow-[0_0_10px_#f07a2a]" label="Safest route" />
              <Legend swatch="h-1 w-5 rounded-full bg-[#9a958c]" label="Fastest route" />
              <Legend swatch="size-2.5 rounded-full bg-[#e5484d] shadow-[0_0_10px_#e5484d]" label="Reported area" />
            </ul>
          </div>

          <a
            href="#reports"
            className="sr-intro absolute bottom-20 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] font-semibold tracking-[0.25em] text-white/45 uppercase transition-colors hover:text-white sm:flex"
            style={delay(1200)}
          >
            Scroll
            <span className="relative h-8 w-px bg-white/20" aria-hidden="true">
              <span className="sr-scroll-dot absolute -left-[2.5px] top-0 size-1.5 rounded-full bg-[#f07a2a]" />
            </span>
          </a>

          <div
            className="sr-intro absolute inset-x-0 bottom-0 overflow-hidden border-t border-white/[0.06] bg-[#0b0d12]/70 py-3 backdrop-blur-md"
            style={delay(1000)}
            aria-hidden="true"
          >
            <div className="sr-marquee sr-mono flex w-max text-[11px] font-medium tracking-[0.14em] text-white/55 uppercase">
              {[0, 1].map((copy) => (
                <div key={copy} className="flex shrink-0">
                  {[...TICKER, ...TICKER].map((t, i) => (
                    <span key={i} className="flex items-center gap-4 px-4">
                      <span className="size-1 rounded-full bg-[#f07a2a]" />
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
          <div data-reveal="right" data-spot className={`sr-spot ${card} max-w-md`}>
            <p data-reveal className={eyebrow} style={delay(150)}>
              01 · See the area
            </p>
            <h2 data-reveal className={h2} style={delay(260)}>
              Reported crime, <span className={accent}>on the map.</span>
            </h2>
            <p data-reveal className="mt-4 leading-relaxed text-white/65" style={delay(380)}>
              Each red area comes from a news report, with the source linked. It&apos;s news, not official police data,
              and the map says so.
            </p>
            <ul className="mt-7 flex flex-col gap-3 border-t border-white/[0.08] pt-6 text-sm text-white/75">
              <li data-reveal className="flex items-center gap-3" style={delay(500)}>
                <span className="size-3 rounded-full bg-[#e5484d] shadow-[0_0_14px_#e5484d]" aria-hidden="true" />
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
          <div data-reveal="left" data-spot className={`sr-spot ${card} w-full max-w-lg`}>
            <p data-reveal className={eyebrow} style={delay(150)}>
              02 · Compare
            </p>
            <h2 data-reveal className={h2} style={delay(260)}>
              Three routes, <span className={accent}>one honest choice.</span>
            </h2>
            <ul className="mt-7 flex flex-col gap-3">
              {ROUTES.map((r, i) => (
                <li
                  key={r.name}
                  data-reveal
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5"
                  style={{ ...delay(380 + i * 130), "--w": r.w } as CSSProperties}
                >
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="font-semibold text-white">{r.name}</span>
                    <span className="text-right text-sm text-white/55">{r.note}</span>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
                    <div className={`sr-bar h-full rounded-full ${r.color}`} />
                  </div>
                </li>
              ))}
            </ul>
            <p data-reveal className="mt-5 text-sm text-white/45" style={delay(800)}>
              In the app, each route lists what was measured, so you can check the claim.
            </p>
          </div>
        </section>

        {/* 4. Factors */}
        <section id="factors" data-scene className={`${section} justify-end`}>
          <div data-reveal="right" data-spot className={`sr-spot ${card} max-w-md`}>
            <p data-reveal className={eyebrow} style={delay(150)}>
              03 · What counts
            </p>
            <h2 data-reveal className={h2} style={delay(260)}>
              Lit streets <span className={accent}>matter.</span>
            </h2>
            <ul className="mt-7 flex flex-col gap-4">
              {FACTORS.map((f, i) => (
                <li key={f.title} data-reveal className="flex gap-3.5" style={delay(380 + i * 110)}>
                  <span
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f07a2a]/15 text-[11px] font-semibold text-[#ff9a4d] ring-1 ring-[#f07a2a]/30"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-white/60">
                    <b className="font-semibold text-white">{f.title}.</b> {f.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 5. Call to action */}
        <section id="start" data-scene className="relative flex min-h-svh flex-col justify-between pt-28">
          <div className={`flex flex-1 items-center ${pad}`}>
            <div data-reveal="left" data-spot className={`sr-spot ${card} max-w-lg`}>
              <h2 data-reveal className="sr-display text-4xl font-semibold tracking-[-0.035em] text-balance text-white sm:text-5xl" style={delay(150)}>
                Where do you want <span className={accent}>to go?</span>
              </h2>
              <p data-reveal className="mt-4 text-white/60" style={delay(280)}>
                No account needed. Saved places stay in your browser.
              </p>
              <div data-reveal className="mt-7" style={delay(400)}>
                <OpenApp />
              </div>
            </div>
          </div>
          <footer
            className={`flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-[#0b0d12]/80 py-5 text-xs text-white/45 backdrop-blur-xl ${pad} lg:pr-16`}
          >
            <span className="flex items-center gap-2">
              <LogoMark size={18} /> SafeRoute · © {new Date().getFullYear()}
            </span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-white"
            >
              © OpenStreetMap contributors
            </a>
          </footer>
        </section>
      </main>
    </div>
  );
}
