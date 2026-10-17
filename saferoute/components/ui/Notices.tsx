"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type NoticeTone = "error" | "info" | "success";

export interface Notice {
  id: number;
  tone: NoticeTone;
  message: string;
}

export function useNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setNotices((list) => list.filter((n) => n.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const notify = useCallback(
    (message: string, tone: NoticeTone = "info") => {
      const id = ++seq.current;
      setNotices((list) => [...list.filter((n) => n.message !== message), { id, tone, message }].slice(-3));
      timers.current.set(id, setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  return { notices, notify, dismiss };
}

const TONE_STYLES: Record<NoticeTone, { icon: ReactNode; className: string }> = {
  error: { icon: <CircleAlert className="size-4 text-danger" aria-hidden="true" />, className: "" },
  success: { icon: <CircleCheck className="size-4 text-brand" aria-hidden="true" />, className: "" },
  info: { icon: <Info className="size-4 text-ink-soft" aria-hidden="true" />, className: "" },
};

export function NoticeToast({ notice, onDismiss }: { notice: Notice; onDismiss: (id: number) => void }) {
  const style = TONE_STYLES[notice.tone];
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className="pointer-events-auto flex w-full max-w-md animate-slide-down items-start gap-2.5 rounded-2xl border border-line bg-paper py-2.5 pr-2 pl-3.5 text-sm text-ink shadow-float"
    >
      <span className="mt-0.5">{style.icon}</span>
      <p className="flex-1 leading-snug">{notice.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(notice.id)}
        aria-label="Dismiss"
        className="-my-0.5 inline-flex size-7 items-center justify-center rounded-lg text-ink-muted hover:bg-cream hover:text-ink"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
