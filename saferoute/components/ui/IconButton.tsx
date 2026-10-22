import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
}

/** Square, touch-friendly icon button with an accessible label and tooltip. */
export function IconButton({ label, active = false, className = "", children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "bg-brand-soft text-brand-strong" : "text-ink-soft hover:bg-black/[0.05] hover:text-ink"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
