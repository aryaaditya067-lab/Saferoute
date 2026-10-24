"use client";

import { useEffect, useRef, useState } from "react";

export interface ScrollSection {
  id: string;
  label: string;
}

/**
 * Scroll effects for the about page: reveals [data-reveal] elements as they come into
 * view, fills a progress bar under the header and highlights the current section in a
 * side index you can click to jump.
 */
export function ScrollFx({ sections }: { sections: ScrollSection[] }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.fx = "on";

    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    let observer: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-in");
            observer?.unobserve(entry.target);
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      );
      for (const el of items) observer.observe(el);
    } else {
      for (const el of items) el.classList.add("is-in");
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const max = root.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
      const mid = window.innerHeight * 0.5;
      let current = 0;
      sections.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= mid) current = i;
      });
      setActive(current);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      delete root.dataset.fx;
    };
  }, [sections]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-16 z-40 h-0.5" aria-hidden="true">
        <div ref={barRef} className="h-full origin-left scale-x-0 bg-brand" />
      </div>

      <nav
        aria-label="Sections"
        className="fixed top-1/2 right-5 z-30 hidden -translate-y-1/2 flex-col items-end gap-1 rounded-2xl border border-black/[0.05] bg-white/70 p-2 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur-xl lg:flex"
      >
        {sections.map((s, i) => {
          const on = i === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={on ? "true" : undefined}
              className="group relative flex h-6 w-9 items-center justify-end pr-1"
            >
              <span className="pointer-events-none absolute right-full mr-3 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-ink opacity-0 shadow-[0_4px_14px_-6px_rgb(0_0_0/0.3)] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                {s.label}
              </span>
              <i
                className={`block h-1 rounded-full transition-all duration-300 ${
                  on ? "w-7 bg-brand" : "w-3.5 bg-black/20 group-hover:w-5 group-hover:bg-black/35"
                }`}
              />
            </a>
          );
        })}
      </nav>
    </>
  );
}
