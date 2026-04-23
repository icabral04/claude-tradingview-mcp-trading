"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  summary: ReactNode;
  title?: string;
}

export function InfoButton({ summary, title = "Resumo executivo" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={title}
        title={title}
        className={`w-6 h-6 rounded-full border text-[11px] font-semibold tabular transition-colors ${
          open
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        }`}
      >
        i
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-80 max-w-[90vw] card p-3 z-30 text-[11px] leading-relaxed shadow-lg border-[var(--color-accent)]/40"
          style={{ background: "var(--color-surface)" }}
        >
          <div className="eyebrow mb-1.5">{title}</div>
          <div className="text-[var(--color-text)] space-y-1.5">{summary}</div>
        </div>
      )}
    </div>
  );
}
