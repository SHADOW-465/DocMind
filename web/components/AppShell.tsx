"use client";
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

export type View = "home" | "library" | "workspace";

const NAV: { id: Exclude<View, "workspace">; label: string; path: string }[] = [
  { id: "home", label: "Home", path: "M3 11.5 12 4l9 7.5M5.5 10V20h13V10" },
  { id: "library", label: "Library", path: "M4 5h5v15H4zM11 5h4v15h-4zM17.5 5.5l3 14.5" },
];

export function AppShell({
  view,
  onNavigate,
  children,
}: {
  view: View;
  onNavigate: (v: Exclude<View, "workspace">) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <nav
        aria-label="Main"
        className="flex w-[var(--rail)] shrink-0 flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--surface-2)] py-4"
      >
        <div
          className="mb-4 grid h-8 w-8 place-items-center rounded-xl text-[13px] font-bold text-white"
          style={{ background: "var(--grad)" }}
          title="Lucent"
          aria-hidden
        >
          L
        </div>
        {NAV.map((n) => {
          const active = view === n.id || (view === "workspace" && n.id === "home");
          return (
            <button
              key={n.id}
              onClick={() => onNavigate(n.id)}
              title={n.label}
              aria-label={n.label}
              aria-current={view === n.id ? "page" : undefined}
              className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <path d={n.path} />
              </svg>
            </button>
          );
        })}
        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </nav>
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
