import {
  ArrowRight,
  Bike,
  Check,
  Crosshair,
  Database,
  GitFork,
  House,
  MapPinned,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HeroPreview } from "@/components/site/HeroPreview";
import { LogoMark } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "SafeRoute: plan routes on OpenStreetMap",
  description:
    "SafeRoute finds real routes on OpenStreetMap from your location to anywhere you search. Route safety comparison is in development.",
};

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Crosshair,
    title: "Start from where you are",
    body: "One tap uses your browser's location as the pickup, with an accuracy circle on the map. You can also search for a pickup.",
  },
  {
    icon: Search,
    title: "Search any place",
    body: "Results appear as you type and nearby places come first. Search runs on OpenStreetMap data.",
  },
  {
    icon: MapPinned,
    title: "Choose on the map",
    body: "Tap the map, drop a pin with a long-press or right-click, or drag a marker to the exact entrance.",
  },
  {
    icon: House,
    title: "Home, Work, College",
    body: "Save the places you go most and use them in one tap. They're stored only in your browser.",
  },
  {
    icon: Bike,
    title: "Drive, bike or walk",
    body: "Get routes for your travel mode, each with its distance and estimated travel time.",
  },
  {
    icon: GitFork,
    title: "Compare alternatives",
    body: "When there's more than one sensible way to go, you'll see the options side by side on the map.",
  },
];

const STEPS = [
  { title: "Set your pickup", body: "Use your current location, search for a place, or choose a point on the map." },
  { title: "Pick a destination", body: "Search for it, tap a saved place, or drop a pin." },
  { title: "Find your route", body: "Tap Find Safer Routes to see the route, its distance and the estimated time." },
];

const ROADMAP: Array<{ title: string; body: string; status: "Available" | "In development" | "Planned" }> = [
  {
    title: "Navigation foundation",
    body: "Location, search, map selection, saved places and routes for driving, cycling and walking.",
    status: "Available",
  },
  {
    title: "Route safety comparison",
    body: "Comparing routes on safety factors. We won't show a safety rating until real data backs it.",
    status: "In development",
  },
  {
    title: "SafeRoute server",
    body: "A Java Spring Boot backend that combines routing providers with the safety engine.",
    status: "Planned",
  },
];

const FAQ = [
  {
    q: "Does SafeRoute show safety scores today?",
    a: "No. This version finds real routes with distances and times. Safety comparison is still being built, and we won't show a score until it's based on real data.",
  },
  {
    q: "Do I need an account?",
    a: "No. Open the app and start planning. Saved places stay in your browser.",
  },
  {
    q: "Why does it ask for my location?",
    a: "Only to use where you are as the pickup. It's optional: you can search or choose on the map instead.",
  },
  {
    q: "Are travel times live?",
    a: "They're estimates from road data on OpenStreetMap and don't include live traffic.",
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. It runs in your mobile browser with a full-screen map and a bottom sheet for planning.",
  },
];

const STATUS_STYLES = {
  Available: "bg-brand text-paper",
  "In development": "bg-brand-soft text-brand-strong",
  Planned: "bg-cream-deep text-ink-soft",
} as const;

function OpenAppButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 font-semibold text-paper shadow-[0_6px_16px_-6px_rgb(232_117_36/0.6)] transition-colors hover:bg-brand-strong ${className}`}
    >
      Open SafeRoute <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-cream text-ink">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-line/70 bg-cream/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6" aria-label="Main">
          <Link href="/about" className="flex items-center gap-2" aria-label="SafeRoute home">
            <LogoMark size={30} />
            <span className="text-[17px] font-semibold tracking-tight">SafeRoute</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#how-it-works" className="hover:text-ink">How it works</a>
            <a href="#roadmap" className="hover:text-ink">Roadmap</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </div>
          <OpenAppButton className="h-10 text-sm" />
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-24 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink-soft">
              <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
              Built on OpenStreetMap
            </p>
            <h1 className="mt-5 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
              Plan your trip.
              <br />
              <span className="text-brand">Choose your route.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft text-pretty">
              SafeRoute finds real routes from where you are to wherever you&apos;re going. We&apos;re building it to
              compare those routes by safety.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <OpenAppButton className="h-12 text-[15px]" />
              <a
                href="#how-it-works"
                className="inline-flex h-12 items-center rounded-xl border border-line-strong bg-paper px-5 text-[15px] font-semibold text-ink hover:bg-cream-deep"
              >
                How it works
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
              {["No account needed", "Works in your browser", "Phone and desktop"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="size-4 text-brand" aria-hidden="true" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="pb-8 lg:pb-0">
            <HeroPreview />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-y border-line/70 bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-strong">Available today</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Everything you need to get from A to B</h2>
              <p className="mt-3 text-ink-soft">This is the navigation foundation the safety features will be built on.</p>
            </div>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-3xl border border-line bg-cream/50 p-6">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft">
                    <Icon className="size-5 text-brand-strong" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-strong">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Three steps, one screen</h2>
          </div>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative rounded-3xl border border-line bg-paper p-6 shadow-[0_1px_2px_rgb(36_35_33/0.04)]">
                <span className="flex size-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper">
                  {index + 1}
                </span>
                <h3 className="mt-5 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Roadmap + privacy */}
        <section id="roadmap" className="scroll-mt-20 border-y border-line/70 bg-paper">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-sm font-semibold text-brand-strong">Roadmap</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance">Safety, done carefully</h2>
              <p className="mt-3 max-w-xl text-ink-soft">
                A safety rating is only useful if you can trust it. We&apos;re building the navigation first and adding
                safety comparison once it&apos;s backed by real data.
              </p>
              <ul className="mt-8 flex flex-col gap-3">
                {ROADMAP.map((item) => (
                  <li key={item.title} className="flex flex-col gap-2 rounded-2xl border border-line bg-cream/50 p-5 sm:flex-row sm:items-start sm:gap-4">
                    <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[item.status]}`}>
                      {item.status}
                    </span>
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-3xl bg-ink p-7 text-paper">
                <ShieldCheck className="size-7 text-brand" aria-hidden="true" />
                <h3 className="mt-4 text-xl font-semibold">Your data, kept simple</h3>
                <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-paper/80">
                  <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />No account and no sign-up.</li>
                  <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />Saved places stay in your browser.</li>
                  <li className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />Location is only read when you ask for it, and is sent only to the map services that search and calculate your route.</li>
                </ul>
              </div>
              <div className="rounded-3xl border border-line bg-cream/50 p-7">
                <Database className="size-6 text-ink-soft" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">Built on open data</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                  Maps ©{" "}
                  <a className="underline underline-offset-2 hover:text-ink" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
                  . Search by{" "}
                  <a className="underline underline-offset-2 hover:text-ink" href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a>
                  , routing by{" "}
                  <a className="underline underline-offset-2 hover:text-ink" href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">OSRM (FOSSGIS)</a>
                  , map display by{" "}
                  <a className="underline underline-offset-2 hover:text-ink" href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
          <div className="mt-8 divide-y divide-line rounded-3xl border border-line bg-paper">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cream text-ink-soft transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-brand px-7 py-10 text-paper sm:flex-row sm:items-center sm:px-10">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Where do you want to go?</h2>
              <p className="mt-2 text-paper/85">Open the map and plan your first route.</p>
            </div>
            <Link
              href="/"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-paper px-5 text-[15px] font-semibold text-brand-strong hover:bg-cream"
            >
              Open SafeRoute <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <LogoMark size={22} />
            <span className="font-medium text-ink-soft">SafeRoute</span>
            <span>· © {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/" className="hover:text-ink">Open app</Link>
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#roadmap" className="hover:text-ink">Roadmap</a>
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:text-ink">
              © OpenStreetMap contributors
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
