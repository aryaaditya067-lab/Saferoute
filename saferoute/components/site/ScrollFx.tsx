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

    // Cards marked [data-spot] get a light that follows the pointer (see .sr-spot).
    const onPointer = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-spot]");
      if (!(el instanceof HTMLElement)) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pointermove", onPointer);
      observer?.disconnect();
      delete root.dataset.fx;
    };
  }, [sections]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-14 z-40 h-0.5" aria-hidden="true">
        <div ref={barRef} className="h-full origin-left scale-x-0 bg-linear-to-r from-[#ffb36b] to-[#f07a2a]" />
      </div>

      <nav
        aria-label="Sections"
        className="fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 flex-col items-end gap-3.5 lg:flex xl:right-6"
      >
        {sections.map((s, i) => {
          const on = i === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={on ? "true" : undefined}
              className="group flex items-center gap-2.5 py-0.5 text-xs font-medium text-white/45 hover:text-white"
            >
              <span
                className={`whitespace-nowrap transition-opacity duration-300 ${
                  on ? "text-white opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                {s.label}
              </span>
              <i
                className={`block h-0.5 rounded-full transition-all duration-300 ${
                  on ? "w-8 bg-[#f07a2a]" : "w-4 bg-white/30 group-hover:w-6"
                }`}
              />
            </a>
          );
        })}
      </nav>
    </>
  );
}
