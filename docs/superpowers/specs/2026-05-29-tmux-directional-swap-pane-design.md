# Directional Pane Swap — Design

- **Date:** 2026-05-29
- **Status:** Draft (awaiting user review)
- **Scope:** `src/panes.tsx`, `src/lib/tmux.ts`, new `src/lib/layout.ts`, optional `src/components/*` split
- **Out of scope:** `sessions`, `run-command`, `resurrect-*`, `cheatsheet` commands

## Problem

A user with a multi-pane tmux window wants to move a pane in a spatial
direction — e.g. "the left pane is empty, push the bottom-right pane into it."
tmux has no single "move pane left/right" primitive; the idiomatic move is
`swap-pane`. The extension should expose this as a one-step, direction-based
action that matches the user's mental model.

## Background — what already exists

`PanesView` (reached from the **Sessions** command via `Action.Push`,
`src/sessions.tsx:242`) lists every pane in a session grouped by window, and
already supports the canonical tmux **mark → swap** flow:

- **Mark Pane** (`⌘M`) → `select-pane -m -t <id>` (`markPane`)
- **Swap with Marked Pane** (`⌘⇧S`) → `swap-pane -t <id>` (`swapWithMarkedPane`),
  shown only when a marked pane exists elsewhere.

This works but is a two-step flow across two list items and does not match the
"move it that direction" intuition.

## Decision — directional swap (Approach A: geometry-based)

Add **Swap ← / → / ↑ / ↓** actions that swap the selected pane with its nearest
spatial neighbor **within the same window**, by computing neighbors from pane
coordinates and calling `swap-pane -s <selected> -t <neighbor> -d`.

**Why A over the alternatives:**

- **A (chosen) — compute neighbor from geometry.** Actions appear only when a
  neighbor exists in that direction; never changes the active pane (uses `-d`);
  neighbor logic is a pure, testable function. Cost: a little more code (one
  pure helper + two new pane coordinate fields).
- **B — tmux `{left-of}` tokens.** `select-pane -t <sel>` then
  `swap-pane -s <sel> -t '{left-of}' -d`. Less code, but the directional tokens
  are resolved relative to the *active* pane, so it forces a focus change on the
  attached client, and "no neighbor" can only be discovered from a tmux error
  (can't hide the action up front). Rejected.
- **C — always show all four, toast on error.** Minimal UI code, noisiest UX.
  Rejected.

A is consistent with the extension's existing "never yank the user's focus"
posture (`newWindow` uses `-d`, swap uses `-d`).

## Design

### Module layout

| File | Responsibility |
|------|----------------|
| `src/lib/tmux.ts` | tmux process layer. Add 2 coordinate fields + `swapPanes()`. |
| `src/lib/layout.ts` *(new)* | Pure `findNeighbor()` + `Direction` type. No tmux/React deps. |
| `src/components/pane-item.tsx` *(new)* | `PaneItem` + its ActionPanel (incl. swap actions) + `copyContent`. |
| `src/components/pane-detail.tsx` *(new)* | `PaneDetail`. |
| `src/components/window-forms.tsx` *(new)* | `RenameWindowForm`, `NewWindowForm`. |
| `src/lib/ui.ts` *(new)* | Shared `toastError()` helper. |
| `src/panes.tsx` | Keeps `PanesView` only (list + window grouping). |

The file split is the "refactor for ease of use / maintainability" the user
authorized: `panes.tsx` is currently 681 lines (the coding-style guideline is
200–400). It is **behavior-preserving code movement** — the only behavioral
change is the new swap actions and the Action-panel regrouping below. This split
is trimmable at review (see Open Questions).

### Data model (`src/lib/tmux.ts`)

Add two fields to `TmuxPane` and `PANE_FORMAT`:

```
left: number;   // #{pane_left}  — column of the pane's left edge in the window
top:  number;   // #{pane_top}   — row of the pane's top edge in the window
```

(`pane_left` / `pane_top` are verified to emit integers in this environment.
`width` / `height` already exist, so right = `left + width - 1`,
bottom = `top + height - 1` are derived in the pure helper — no extra fields.)

New command helper:

```ts
// swap-pane keeps the window layout (cells) intact and only swaps the two
// panes' contents/processes. -d leaves the active pane unchanged so we never
// yank focus on an attached client.
export async function swapPanes(srcId: string, dstId: string): Promise<void> {
  await run(["swap-pane", "-s", srcId, "-t", dstId, "-d"]);
}
```

### Neighbor resolution (`src/lib/layout.ts`)

```ts
export type Direction = "left" | "right" | "up" | "down";

// Mirrors tmux's own `select-pane -L/-R/-U/-D` selection: among panes in the
// SAME window that lie strictly in the given direction AND overlap on the
// perpendicular axis, return the closest one (largest/smallest facing edge).
export function findNeighbor(
  panes: TmuxPane[],
  pane: TmuxPane,
  dir: Direction,
): TmuxPane | null;
```

Rules (right = `left+width-1`, bottom = `top+height-1`):

- **left:** candidate `q.right < pane.left`, vertical overlap
  (`q.top <= pane.bottom && q.bottom >= pane.top`); pick max `q.right`.
- **right:** `q.left > pane.right`, vertical overlap; pick min `q.left`.
- **up:** `q.bottom < pane.top`, horizontal overlap
  (`q.left <= pane.right && q.right >= pane.left`); pick max `q.bottom`.
- **down:** `q.top > pane.bottom`, horizontal overlap; pick min `q.top`.

Same-window scoping: `panes.filter(q => q.windowIndex === pane.windowIndex && q.id !== pane.id)`.
Returns `null` when there is no neighbor in that direction.

### UI — Action panel regroup (`src/components/pane-item.tsx`)

Introduce a dedicated **"Move / Swap"** section so the whole swap story is in
one place:

```
Move / Swap
  Swap Left   (⌃⌥←)   — rendered only if findNeighbor(...,"left")  != null
  Swap Right  (⌃⌥→)   — rendered only if findNeighbor(...,"right") != null
  Swap Up     (⌃⌥↑)   — rendered only if findNeighbor(...,"up")    != null
  Swap Down   (⌃⌥↓)   — rendered only if findNeighbor(...,"down")  != null
  Mark Pane / Unmark Pane          (⌘M)     — unchanged
  Swap with Marked Pane            (⌘⇧S)    — unchanged (for far / cross-window)
```

`Break to New Window` (`⌘B`) and `Clear Pane History` (`⌘⇧K`) move to a
neighbouring "Pane" section. Copy / Window / Danger Zone sections, the default
primary action (Copy Path), and all existing shortcuts are unchanged.

Each directional action: `await swapPanes(pane.id, neighbor.id)` →
success toast (e.g. `Swapped with pane to the left`) → `onChange()` to refresh
(geometry re-reads, so the four actions re-evaluate after the swap).

`PanesView` already holds the full `panes` array and groups them per window, so
it passes the current window's panes to `PaneItem` as a new prop; `PaneItem`
then calls `findNeighbor(windowPanes, pane, dir)`. No new tmux fetch is needed —
the data is already loaded — only a new `windowPanes` prop on `PaneItem`.

### Shortcuts

Default `⌃⌥ + arrowLeft / arrowRight / arrowUp / arrowDown`. No collision with
existing bindings (`⌘M`, `⌘⇧S`, `⌘B`, `⌘D`, `⌘⇧C`, `⌘I`, `⌘⇧I`, `⌘⇧W`, `⌘⇧R`,
`⌘⇧N`, `⌃X`, `⌃⇧X`, `⌃W`, `⌘R`, `⌘⇧K`). Adjustable if Raycast reserves arrows in
this context (fallback: `⌘⇧` + arrows).

## Edge cases

- Single pane in window, or pane at the edge for a given direction → that
  direction's action is not rendered.
- Pane spanning full height/width → neighbors found via perpendicular overlap.
- Cross-window: never considered (same-window filter).
- A neighbor existing but layout changing between render and action → tmux
  resolves by pane id; worst case a harmless error toast + refresh.

## Error handling

Reuse the existing pattern: `try { await swapPanes(...) } catch (e)` →
`toastError("Swap failed", e)` (unwraps `TmuxError.stderr`). Success →
`showToast` + `await onChange()`. No "no neighbor" error path exists because the
action is hidden when `findNeighbor` returns `null`.

## Testing / verification

The project has **no test runner** (`package.json` scripts: dev/build/lint).
Default plan, matching the user's minimal-infra preference:

1. `findNeighbor` is written as a pure function (testable later if wanted).
2. Manual verification with `ray develop` against the real `develop:0`
   3-pane session: select the bottom-right pane, **Swap Left**, confirm its
   content lands in the left column and the empty shell moves to bottom-right;
   confirm edge panes hide the impossible directions.
3. `npm run build` and `npm run lint` must pass.

Opt-in: add `vitest` + a `findNeighbor` unit test (adds devDeps + config).

## Risks

- **Arrow-key shortcuts** may be reserved by Raycast list navigation in some
  contexts → verify during `ray develop`; fall back to `⌘⇧`+arrows.
- **File split** could regress an existing pane/window/danger action → mitigate
  by keeping it pure code movement and smoke-testing each action.
- **Zoomed pane** (`window_zoomed_flag`) may report full-window geometry →
  swap still operates on ids; acceptable, note as minor.

## Open questions (for reviewer)

1. **Refactor depth** — OK to split `panes.tsx` into `components/*` + `lib/ui.ts`
   + `lib/layout.ts` as tabled above, or keep all changes inside `panes.tsx`
   (smaller diff, file stays > 600 lines)?
2. **Shortcuts** — `⌃⌥`+arrows acceptable?
3. **Testing** — manual-only (default), or add `vitest` for `findNeighbor`?
