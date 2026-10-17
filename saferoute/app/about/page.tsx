import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CityBackdrop } from "@/components/site/CityBackdrop";
import { LogoMark } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "SafeRoute: the safer way there",
  description:
    "SafeRoute compares Fastest, Balanced and Safest routes using reported crime areas, street lighting, main roads and nearby help.",
};

const FACTORS = [
  { title: "Reported crime", body: "Areas from news reports, weighted by type and how recent they are." },
  { title: "Night lights", body: "NASA satellite brightness shows the dark stretches of a route." },
  { title: "Lit main roads", body: "Street lighting and road type from OpenStreetMap." },
  { title: "Help nearby", body: "Police stations and hospitals within reach along the way." },
  { title: "Community reports", body: "Count only after several different people confirm the same spot." },
];

const ROUTES = [
  { name: "Fastest", note: "Shortest travel time." },
  { name: "Balanced", note: "A fair trade of time and safety." },
  { name: "Safest", note: "Lowest measured risk, even if a little longer." },
];

const card = "rounded-3xl border border-white/70 bg-paper/70 p-6 shadow-float backdrop-blur-xl sm:p-8";
const eyebrow = "text-xs font-semibold tracking-[0.14em] text-brand-strong uppercase";
const accent = "font-serif font-normal text-brand italic";

function OpenApp({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-colors ${
        light
          ? "bg-paper text-brand-strong hover:bg-cream"
          : "bg-brand text-paper shadow-[0_10px_28px_-8px_rgb(232_117_36/0.7)] hover:bg-brand-strong"
      }`}
    >
      Open SafeRoute <ArrowRight className="size-4" aria-hidden="true" />
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
        className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(180deg,rgb(248_244_236/0.9)_0%,rgb(248_244_236/0.6)_60%,rgb(248_244_236/0.2)_100%)] md:bg-[radial-gradient(ellipse_70%_90%_at_12%_48%,rgb(248_244_236/0.88)_8%,transparent_72%)]"
      />

      <header className="fixed inset-x-0 top-0 z-30 border-b border-line/60 bg-paper/60 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
          <Link href="/about" className="flex items-center gap-2" aria-label="SafeRoute home">
            <LogoMark size={28} />
            <span className="text-[17px] font-semibold tracking-tight">SafeRoute</span>
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-sm font-semibold text-paper hover:bg-brand-strong"
          >
            Open app
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        {/* 1. Hero */}
        <section data-scene className="flex min-h-svh items-center px-4 pt-20 pb-16 sm:px-8 lg:px-16">
          <div className="max-w-xl">
            <p className={eyebrow}>Safety-first navigation</p>
            <h1 className="mt-4 text-5xl leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-7xl">
              Get there.
              <br />
              <span className={accent}>Safely.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft text-pretty">
              The fastest road isn&apos;t always the one you want to be on. SafeRoute shows you the alternatives and why
              one is safer.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <OpenApp />
              <a
                href="#reports"
                className="inline-flex h-12 items-center rounded-full border border-line-strong bg-paper/60 px-6 text-[15px] font-semibold backdrop-blur hover:bg-paper"
              >
                How it works
              </a>
            </div>
          </div>
        </section>

        {/* 2. Reported areas */}
        <section id="reports" data-scene className="flex min-h-svh items-center justify-end px-4 py-20 sm:px-8 lg:px-16">
          <div className={`${card} max-w-md`}>
            <p className={eyebrow}>01 · See the area</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Reported crime, <span className={accent}>on the map.</span>
            </h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Each red area comes from a news report, with the source linked. It&apos;s news, not official police data,
              and the map says so.
            </p>
          </div>
        </section>

        {/* 3. Routes */}
        <section data-scene className="flex min-h-svh items-center px-4 py-20 sm:px-8 lg:px-16">
          <div className={`${card} max-w-lg`}>
            <p className={eyebrow}>02 · Compare</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Three routes, <span className={accent}>one honest choice.</span>
            </h2>
            <ul className="mt-6 divide-y divide-line/80">
              {ROUTES.map((r) => (
                <li key={r.name} className="flex items-baseline justify-between gap-6 py-3">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-right text-sm text-ink-soft">{r.note}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-muted">Each card lists what was measured, so you can check the claim.</p>
          </div>
        </section>

        {/* 4. Factors */}
        <section data-scene className="flex min-h-svh items-center justify-end px-4 py-20 sm:px-8 lg:px-16">
          <div className={`${card} max-w-md`}>
            <p className={eyebrow}>03 · What counts</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Lit streets <span className={accent}>matter.</span>
            </h2>
            <ul className="mt-6 flex flex-col gap-4">
              {FACTORS.map((f) => (
                <li key={f.title} className="flex gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-ink-soft">
                    <b className="font-semibold text-ink">{f.title}.</b> {f.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 5. Call to action */}
        <section data-scene className="flex min-h-svh flex-col justify-between px-4 pt-20 sm:px-8 lg:px-16">
          <div className="flex flex-1 items-center">
            <div className={`${card} max-w-md`}>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Where do you want <span className={accent}>to go?</span>
              </h2>
              <p className="mt-3 text-ink-soft">No account needed. Saved places stay in your browser.</p>
              <div className="mt-6">
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
