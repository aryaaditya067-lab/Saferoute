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

    // 3D pop-out: [data-tilt] cards lean toward a mouse pointer and lift a little, with a glare
    // that follows it. Uses the separate `rotate`/`translate` properties so it composes with the
    // reveal transform; eased per frame, and only while something is moving.
    const canTilt =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tilts = canTilt
      ? Array.from(document.querySelectorAll<HTMLElement>("[data-tilt]")).map((el) => ({ el, x: 0, y: 0, tx: 0, ty: 0, over: false }))
      : [];
    let tiltRaf = 0;
    const tiltStep = () => {
      tiltRaf = 0;
      let moving = false;
      for (const t of tilts) {
        t.x += (t.tx - t.x) * 0.14;
        t.y += (t.ty - t.y) * 0.14;
        if (Math.abs(t.tx - t.x) > 0.001 || Math.abs(t.ty - t.y) > 0.001) moving = true;
        const angle = Math.hypot(t.x, t.y) * 7; // degrees at the card's edge
        t.el.style.rotate = angle > 0.01 ? `${-t.y} ${t.x} 0 ${angle}deg` : "";
        t.el.style.translate = t.over || angle > 0.01 ? `0 ${-Math.min(1, angle / 4) * 6}px` : "";
      }
      if (moving) tiltRaf = requestAnimationFrame(tiltStep);
    };
    const kickTilt = () => {
      if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltStep);
    };
    const tiltHandlers = tilts.map((t) => {
      const move = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        const r = t.el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        t.over = true;
        t.tx = (px - 0.5) * 2;
        t.ty = (py - 0.5) * 2;
        t.el.style.setProperty("--gx", `${px * 100}%`);
        t.el.style.setProperty("--gy", `${py * 100}%`);
        t.el.style.setProperty("--glare", "1");
        kickTilt();
      };
      const leave = () => {
        t.over = false;
        t.tx = 0;
        t.ty = 0;
        t.el.style.setProperty("--glare", "0");
        kickTilt();
      };
      t.el.addEventListener("pointermove", move);
      t.el.addEventListener("pointerleave", leave);
      return { el: t.el, move, leave };
    });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(tiltRaf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      for (const h of tiltHandlers) {
        h.el.removeEventListener("pointermove", h.move);
        h.el.removeEventListener("pointerleave", h.leave);
      }
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
        className="fixed top-1/2 right-5 z-30 hidden -translate-y-1/2 flex-col items-end gap-1 rounded-2xl border border-black/[0.05] bg-white/60 p-2 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur-md lg:flex"
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
