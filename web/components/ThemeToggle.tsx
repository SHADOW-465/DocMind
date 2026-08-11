"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  // Starts undefined so SSR markup matches; the inline script in layout.tsx
  // already set the real theme on <html> before paint.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) ?? "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("lucent-theme", next);
    } catch {
      /* private mode */
    }
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition hover:text-[var(--ink)]"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 transition-transform duration-300"
        style={{ transform: theme === "dark" ? "rotate(0deg)" : "rotate(180deg)" }}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      >
        {theme === "dark" ? (
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5" />
          </>
        )}
      </svg>
    </button>
  );
}
