# Lucent UI Redesign — Design Spec

**Date:** 2026-07-01
**Status:** Approved by user — ready for implementation planning
**Builds on:** `docs/2026-06-29-lucent-prd.md` (original product spec), `docs/2026-06-29-lucent-plan.md` (v1 implementation, already shipped)

---

## 1. Context & goal

Lucent v1 is functionally complete and shipped: upload a PDF → get themed summary points → click a point → a bezier beam arcs to the exact source region on the rendered PDF. The interaction model, the citation-integrity guarantee, and the ML pipeline are done and tested — **none of that changes here.**

What's missing is *feel*. Today the app is a single upload screen that replaces itself with a split view — functional, but reads as a one-off tool demo, not a real product. The user's brief: it should feel like **a complete project — a project-management-style dashboard — not a drag-and-drop utility**, with a visual design and set of microinteractions that feel "absolutely stunning" and modern, in a way that suits a *verification* product specifically (the whole point of Lucent is "watch the proof light up").

This spec covers the visual language, information architecture, component-level interaction design, motion system, accessibility, and local-storage approach needed to deliver that — as a layer on top of the existing, tested split-view workspace, not a replacement for it.

### Goals
- A branded dashboard shell (icon rail + home screen) that replaces "single upload page" as the first impression.
- A **dual theme** (light + dark) built on one shared token system, each theme with its own distinct personality, switchable and persisted.
- A **recent documents** home screen, backed by client-side storage only (no backend/account changes — this remains a stateless v1 app from the server's point of view).
- A small, consistent, purposeful set of microinteractions — hover, drag, beam-draw-in, theme-toggle morph, shared-element transitions — that reinforce the "verify" narrative rather than decorate it.
- Full compatibility with `prefers-reduced-motion` and WCAG AA contrast in both themes.

### Non-goals (unchanged from the original PRD, reaffirmed here)
- No accounts, auth, or **server-side** persistence. "Recent documents" is a browser-local convenience feature (IndexedDB on this device), not a backend feature — the `/summarize` contract and ML service are untouched.
- No mobile-first layout. Desktop/tablet remains the target; phones are still out of scope.
- No changes to the ML pipeline, the `/summarize` JSON contract, or the citation-integrity guarantee.
- No multi-document workspace (tabs, side-by-side documents) — opening a recent document replaces the current workspace, same as today's single-document flow.

---

## 2. Information architecture

Two top-level states, both living inside a persistent shell:

```
┌─ Shell ────────────────────────────────────────────────┐
│ Icon rail (Lucent mark · Home · Library)   Theme toggle │
│                                                          │
│  ┌─ Home (/) ─────────────┐  ┌─ Workspace (doc open) ─┐ │
│  │ Dropzone                │  │ ← Home · filename · pp │ │
│  │ Recent documents grid   │  │ PDF canvas | Summary   │ │
│  └──────────────────────────┘  └────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Icon rail** (~56px, always visible): Lucent mark at top, Home and Library icons (icon-only, no labels — tooltips on hover), theme toggle pinned to the top-right of the shell (not the rail itself, so it reads as a global control rather than a nav item).

**Home** (`/`): the new landing state.
- A prominent dropzone at the top (drag-drop or click-to-pick, same `UploadZone` behavior as today, restyled).
- Below it, a responsive grid of **recent document cards**: thumbnail wash (a gradient placeholder tinted by theme — no real PDF thumbnail rendering in v1, that's a future enhancement), filename, date, page count, point count.
- Empty state (no recent documents yet): dropzone only, larger, vertically centered — no empty grid awkwardness.
- Clicking a recent-document card re-opens it instantly from local storage (see §7) — no re-upload, no re-hitting `/summarize`.

**Workspace** (after upload or opening a recent document): today's 60/40 split (PDF canvas left, themed summary cards right) is preserved **exactly as built** — same components, same beam mechanics, same tests. What's new is a slim header strip above it: filename, page count, and a "← Home" affordance, so the workspace no longer feels like the only screen in the app.

Navigating Home → Workspace and back does not reload the page (client-side state transition, not a hard route change) — this is what makes the shared-element transition in §5 possible.

---

## 3. Visual language & theming

One token system, two value sets. Structural tokens (radii, spacing scale, type scale, component shapes, shadow *shape*) are identical across themes; only color, glow intensity, and gradient stops swap. This is what keeps light and dark feeling like one product wearing two outfits, not two different apps.

### Typography (shared across both themes)
- **UI / headings:** Inter Tight — confident, slightly condensed, modern, reads well at both display and body sizes.
- **Data / metadata:** JetBrains Mono for anything measured — confidence scores, page numbers, timings, docIds. This is the one typographic constant tying both themes back to the "this is being verified, not just written" narrative, and it's deliberately *not* theme-dependent — switching fonts on toggle would feel jarring.

### Light theme — "Vibrant Gradient"
| Token | Value |
|---|---|
| Surface | `#F7F7FB` |
| Card | `#FFFFFF` |
| Ink | `#15151E` |
| Muted | `#7A7A8C` |
| Accent gradient (primary) | `#8B5CF6 → #EC4899` |
| Accent gradient (secondary / themes) | `#6366F1 → #06B6D4` |
| Radius | 16–20px |
| Shadow | soft, colored (`rgba(139,92,246,.12)`), not plain grey |

### Dark theme — "Forensic Dark"
| Token | Value |
|---|---|
| Canvas | `#0B0D12` |
| Panel | `#14171F`, 1px border `#232838` |
| Ink | `#E8E9ED` |
| Muted | `#8A93A6` |
| Accent gradient | `#7C5CFF → #22D3EE` (same pair as light's *secondary*, role inverted — deliberate cross-theme thread) |
| Radius | 16–20px (shared with light) |
| Glow | `filter: drop-shadow(...)` on the active beam and active card border — dark mode's signature move |

### Default & switching
- Respect `prefers-color-scheme` on first visit; if there's no signal, default to **dark**.
- Manual toggle always available (top-right of shell), persisted in `localStorage`.
- Switching cross-fades color tokens (~200ms) rather than hard-cutting (see §5).

---

## 4. Components

Existing components (`PdfCanvas`, `SummaryCard`, `SummaryPanel`, `ThemeGroup`, `BeamOverlay`, `UploadZone`, `useBeams`/`geometry.ts`) keep their current responsibilities and tests. They gain theme-token-driven styling (swap hard-coded Tailwind classes for CSS-variable-backed tokens) and the microinteraction polish in §5, but **no behavioral changes** — the beam math, bbox scaling, and click-to-verify logic are untouched.

New components:
- **`AppShell`** — the icon rail + theme toggle + Home/Workspace router (client-side state, not a real Next.js route change, so the shared-element transition works).
- **`HomeView`** — dropzone + recent-documents grid + empty state.
- **`RecentDocCard`** — thumbnail wash, filename, date, page/point counts, hover lift; shares its hover language with `SummaryCard`.
- **`ThemeToggle`** — sun/moon icon morph, writes to `localStorage`, applies a `data-theme` attribute at the document root that all CSS variables key off of.
- **`WorkspaceHeader`** — filename, page count, "← Home".
- **`lib/recentDocs.ts`** — thin wrapper around IndexedDB for storing/listing/opening/clearing recent documents (§7).

---

## 5. Microinteractions & motion system

A small, consistent, purposeful set — not decoration:

| Interaction | Behavior |
|---|---|
| Upload zone drag-over | Border shifts to accent gradient, scale 1.0→1.02 |
| Upload zone drop | Quick "caught it" bounce, then transitions to summarizing state |
| Summary card hover | Lift 2px + soft shadow/glow bloom |
| Summary card click → beam | Beam **draws itself in** along its path (150–250ms `stroke-dashoffset`) instead of snapping into place |
| Confidence bar | Animates fill 0→value (~400ms ease-out) on mount, not pre-filled |
| Theme toggle | Sun/moon icon rotate + cross-fade; whole surface cross-fades color tokens (~200ms) |
| Home → Workspace | The clicked recent-doc card (or dropzone) scales/fades into the workspace header — a shared-element feel, not a hard swap |
| Recent-doc card hover | Lift + thumbnail gradient shimmer — same hover vocabulary as summary cards |

**Motion tech:** Framer Motion for spring-based/shared-element interactions (bounce, Home↔Workspace transition); plain CSS transitions for simple hover/color-swap states, to keep bundle weight down. This is consistent with the original PRD's "subtle framer-motion-style transitions" — this spec makes that concrete and applies it more visibly.

**Duration scale:** 120–150ms micro (hover/tap), 250–300ms macro (panel/theme transitions).

**Reduced motion:** every animation above has a `prefers-reduced-motion` fallback — bounces/springs collapse to plain opacity fades, the beam draws in instantly rather than animating its stroke, the shared-element transition becomes a simple cross-fade.

---

## 6. Accessibility & responsive behavior

- Both themes meet WCAG AA contrast for text and interactive elements.
- Visible focus rings in the active theme's accent color; full keyboard navigation across the rail, home grid, summary cards, and theme toggle.
- An `aria-live="polite"` region announces summarization progress and completion (today's "Summarizing {file}…" text becomes the live-region content, not just visual).
- Each beam/highlight pair carries an accessible label (e.g. "linked to source, page 4") so the citation relationship is available to screen-reader users who can't see the beam itself.
- Responsive floor stays desktop/tablet (phones out of scope, per the original PRD). Below ~1024px: the icon rail stays but tightens, the workspace split stacks PDF-above-cards instead of side-by-side, and the home grid drops to fewer columns.

---

## 7. Data & storage — recent documents

Client-side only, via **IndexedDB** (not `localStorage` — it can hold the original PDF blob plus the full `SummarizeResponse` JSON without size concerns, and reads/writes don't block the main thread).

Schema (one object store, `recentDocuments`):
```ts
interface RecentDocument {
  docId: string;           // from SummarizeResponse.docId — primary key
  filename: string;
  addedAt: number;         // epoch ms, for sorting the grid
  pdfBlob: Blob;           // the original uploaded file, so re-opening needs no re-upload
  summary: SummarizeResponse; // the full response — re-opening needs no re-hit of /summarize
}
```
- Opening a recent-document card reconstructs a `File` from `pdfBlob` and feeds it straight into the existing workspace state (`result`, `file`) — same rendering path as a fresh upload, zero new PDF-canvas logic.
- A successful `/summarize` call in the normal upload flow also writes a `RecentDocument` entry (fire-and-forget; failure to persist is silent and non-blocking — this is a convenience feature, not a critical path).
- "Clear recent" in the Library view wipes the object store.
- This is purely a browser-local convenience layer. It does not touch the ML service, does not require accounts, and does not change the `/summarize` contract — fully consistent with the original PRD's "no server-side persistence" non-goal.

---

## 8. Relationship to existing code & tests

- All 16 existing web tests (`api`, `api.summarize`, `SummaryCard`, `geometry`, `BeamOverlay`, `themeGroup`, `healthGate`) must keep passing unmodified in behavior — this redesign re-skins and re-arranges, it does not change component contracts (props stay the same; only className/token wiring changes), except where §4 explicitly adds new components.
- No changes to `ml/` at all.
- New components (`AppShell`, `HomeView`, `RecentDocCard`, `ThemeToggle`, `WorkspaceHeader`, `lib/recentDocs.ts`) get their own unit tests, following the existing project pattern (Vitest + Testing Library, pure logic isolated from DOM where possible — e.g. `recentDocs.ts`'s IndexedDB wrapper tested with a fake/mock, matching how `geometry.ts` is pure and unit-tested apart from the DOM-touching `BeamOverlay`).
- `app/page.tsx` is restructured to host `AppShell` with Home/Workspace as internal state rather than being the workspace directly; the existing `PdfCanvas`/`SummaryPanel`/`BeamOverlay` wiring moves into the Workspace state largely as-is.

---

## 9. Testing strategy

- Unit tests for new pure logic (`recentDocs.ts` IndexedDB wrapper — mocked, not a real browser IndexedDB in Vitest/jsdom unless `fake-indexeddb` is added as a dev dependency, which is the recommended approach).
- Component tests for `RecentDocCard`, `ThemeToggle`, `HomeView`, `WorkspaceHeader` following the existing `SummaryCard`/`ThemeGroup` test patterns (render, interaction, conditional states).
- Manual smoke: toggle theme in both directions and confirm persistence across reload; upload a PDF, confirm it appears in Home's recent grid on return; reopen a recent document and confirm the workspace renders identically to a fresh upload (same beams, same highlights); confirm `prefers-reduced-motion` (OS-level) disables bounce/spring animations.
- No changes needed to the ML-side test suite.

---

## 10. Risks & mitigations

- **Two themes doubling visual QA surface** → shared structural tokens (radii/spacing/shadow shape) minimize actual divergence; only color/glow swap, so most component logic is theme-agnostic.
- **IndexedDB storage growth** (PDF blobs accumulating) → cap recent documents at 12, evicting the oldest (`addedAt`) on insert past the cap; "Clear recent" always available.
- **Motion overload** → the interaction table in §5 is deliberately short; anything not listed there does not get a bespoke animation. Reduced-motion fallback is mandatory, not optional, for every listed interaction.
- **Scope creep toward a "real" multi-document dashboard** → explicitly out of scope (see Non-goals); recent documents is a convenience list, not a workspace with tabs or concurrent documents.

## 11. Future enhancements (explicitly out of this spec)
Real PDF thumbnail rendering for recent-document cards (v1 uses a gradient placeholder); server-side persistence/accounts if the product ever needs cross-device recent documents; multi-document/tabbed workspace; light/dark theme presets beyond the two defined here.
