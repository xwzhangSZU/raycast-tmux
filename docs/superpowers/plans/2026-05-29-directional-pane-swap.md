# Directional Pane Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Swap ← / → / ↑ / ↓** actions to the Panes view that swap the selected pane with its nearest neighbor in that direction (same window), in one step, without changing tmux focus.

**Architecture:** A pure `findNeighbor()` helper computes the neighbor from pane coordinates; a thin `swapPanes()` wraps `swap-pane -s <sel> -t <neighbor> -d`. The oversized `panes.tsx` (681 lines) is split into focused component/lib files first (behavior-preserving), then the directional actions are wired into the extracted `PaneItem`.

**Tech Stack:** TypeScript, React 19, `@raycast/api`, tmux 3.6 via `execFile`.

**Testing note (read first):** This project has **no test runner** (`package.json` has only dev/build/lint) and the user explicitly chose **manual verification over adding vitest**. Therefore tasks do NOT write automated tests and you MUST NOT add a test framework. "Verify" steps are: `npx tsc --noEmit` (types), `npm run lint` (eslint/prettier), and — for the feature tasks — a manual smoke test in `npm run dev` against the live `develop:0` 3-pane session. `findNeighbor` is written as a pure function so it stays unit-testable if a runner is added later.

**Commit policy:** All work happens on a feature branch (Task 0). Commit messages use Conventional Commits.

---

### Task 0: Feature branch + commit design docs

**Files:**
- Commit: `docs/superpowers/specs/2026-05-29-tmux-directional-swap-pane-design.md`
- Commit: `docs/superpowers/plans/2026-05-29-directional-pane-swap.md`

- [ ] **Step 1: Create the branch** (currently on `main`)

Run:
```bash
git checkout -b feat/directional-pane-swap
```
Expected: `Switched to a new branch 'feat/directional-pane-swap'`

- [ ] **Step 2: Commit the spec + plan**

```bash
git add docs/superpowers/specs/2026-05-29-tmux-directional-swap-pane-design.md docs/superpowers/plans/2026-05-29-directional-pane-swap.md
git commit -m "docs: add directional pane swap design + implementation plan"
```

---

### Task 1: Pane coordinates + `swapPanes()` in the tmux layer

**Files:**
- Modify: `src/lib/tmux.ts` (`TmuxPane` type, `PANE_FORMAT`, `listPanes` parse, new `swapPanes`)

- [ ] **Step 1: Add `left`/`top` to the `TmuxPane` type**

In `src/lib/tmux.ts`, change the `TmuxPane` type — add `left` and `top` after `height`:

```ts
  active: boolean;
  width: number;
  height: number;
  left: number;
  top: number;
  marked: boolean;
```

- [ ] **Step 2: Add `pane_left`/`pane_top` to `PANE_FORMAT`**

Replace the existing `PANE_FORMAT` array with (note `pane_left`/`pane_top` inserted after `pane_height`, so `pane_marked` and `session_id` shift to indices 12 and 13):

```ts
const PANE_FORMAT = [
  "#{pane_id}",
  "#{pane_index}",
  "#{window_index}",
  "#{window_name}",
  "#{pane_current_command}",
  "#{pane_current_path}",
  "#{pane_pid}",
  "#{pane_active}",
  "#{pane_width}",
  "#{pane_height}",
  "#{pane_left}",
  "#{pane_top}",
  "#{pane_marked}",
  "#{session_id}",
].join(FIELD_SEP);
```

- [ ] **Step 3: Parse the two new fields (and the shifted indices)**

In `listPanes`, replace the returned object literal with:

```ts
      return {
        id: p[0],
        index: Number(p[1]),
        windowIndex: Number(p[2]),
        windowName: p[3] ?? "",
        command: p[4] ?? "",
        path: p[5] ?? "",
        pid: Number(p[6]),
        active: Number(p[7]) > 0,
        width: Number(p[8]),
        height: Number(p[9]),
        left: Number(p[10]),
        top: Number(p[11]),
        marked: Number(p[12]) > 0,
        sessionId: p[13] ?? "",
      };
```

- [ ] **Step 4: Add the `swapPanes` helper**

Directly below the existing `swapWithMarkedPane` function in the `── Panes ──` section, add:

```ts
// Swap two panes by id. swap-pane keeps the window layout (the cells) intact
// and only exchanges the two panes' contents/processes. -d leaves the active
// pane unchanged so we never yank focus on an attached client.
export async function swapPanes(srcId: string, dstId: string): Promise<void> {
  await run(["swap-pane", "-s", srcId, "-t", dstId, "-d"]);
}
```

- [ ] **Step 5: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors; lint passes. (Runtime parsing of `pane_left`/`pane_top` is verified in the Task 7 smoke test, since `getPreferenceValues` only resolves inside the Raycast runtime.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/tmux.ts
git commit -m "feat(tmux): expose pane left/top coordinates and swapPanes helper"
```

---

### Task 2: Pure `findNeighbor()` in a new layout module

**Files:**
- Create: `src/lib/layout.ts`

- [ ] **Step 1: Create `src/lib/layout.ts`**

```ts
import type { TmuxPane } from "./tmux";

export type Direction = "left" | "right" | "up" | "down";

// Find the nearest pane in the given direction within the SAME window, matching
// tmux's own `select-pane -L/-R/-U/-D` selection: a candidate must lie strictly
// in that direction AND overlap on the perpendicular axis; among those, the
// closest one (largest/smallest facing edge) wins. Returns null when there is
// no such neighbor (e.g. the pane is already at that edge, or is alone).
export function findNeighbor(
  panes: TmuxPane[],
  pane: TmuxPane,
  dir: Direction,
): TmuxPane | null {
  const right = (p: TmuxPane) => p.left + p.width - 1;
  const bottom = (p: TmuxPane) => p.top + p.height - 1;

  const vOverlap = (q: TmuxPane) =>
    q.top <= bottom(pane) && bottom(q) >= pane.top;
  const hOverlap = (q: TmuxPane) =>
    q.left <= right(pane) && right(q) >= pane.left;

  const candidates = panes.filter(
    (q) => q.windowIndex === pane.windowIndex && q.id !== pane.id,
  );

  let best: TmuxPane | null = null;
  for (const q of candidates) {
    switch (dir) {
      case "left":
        if (right(q) < pane.left && vOverlap(q)) {
          if (!best || right(q) > right(best)) best = q;
        }
        break;
      case "right":
        if (q.left > right(pane) && vOverlap(q)) {
          if (!best || q.left < best.left) best = q;
        }
        break;
      case "up":
        if (bottom(q) < pane.top && hOverlap(q)) {
          if (!best || bottom(q) > bottom(best)) best = q;
        }
        break;
      case "down":
        if (q.top > bottom(pane) && hOverlap(q)) {
          if (!best || q.top < best.top) best = q;
        }
        break;
    }
  }
  return best;
}
```

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors; lint passes.

- [ ] **Step 3: Reason through the logic against real geometry** (no test runner; hand-verify)

Using the live `develop:0` layout — `LEFT{left:0,top:1,width:95,height:48}`, `TR{left:96,top:1,width:94,height:23}`, `BR{left:96,top:25,width:94,height:24}`, all `windowIndex:0`:
- `findNeighbor(panes, BR, "left")` → `LEFT` (right(LEFT)=94 < 96, vertical overlap 25–48 ⊆ 1–48). ✔ This is the user's core case.
- `findNeighbor(panes, LEFT, "left")` → `null` (no pane with right edge < 0 → Swap Left hidden on the left-edge pane). ✔
- `findNeighbor(panes, TR, "down")` → `BR` (top 25 > bottom(TR)=23, horizontal overlap). ✔
- `findNeighbor(panes, LEFT, "right")` → `TR` (both TR/BR qualify; min `left` ties at 96, first wins). ✔

- [ ] **Step 4: Commit**

```bash
git add src/lib/layout.ts
git commit -m "feat(layout): add pure findNeighbor for directional pane lookup"
```

---

### Task 3: Extract the shared `toastError` helper

**Files:**
- Create: `src/lib/ui.ts`
- Modify: `src/panes.tsx` (remove local `toastError`, import it)

- [ ] **Step 1: Create `src/lib/ui.ts`**

```ts
import { Toast, showToast } from "@raycast/api";
import { TmuxError } from "./tmux";

// Shared failure toast: unwraps TmuxError.stderr when present so the user sees
// tmux's own message, not a generic wrapper.
export async function toastError(title: string, e: unknown): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title,
    message: e instanceof TmuxError ? e.stderr || e.message : String(e),
  });
}
```

- [ ] **Step 2: Remove the local `toastError` from `src/panes.tsx`**

Delete this function (currently at `src/panes.tsx:538-544`):

```ts
async function toastError(title: string, e: unknown): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title,
    message: e instanceof TmuxError ? e.stderr || e.message : String(e),
  });
}
```

- [ ] **Step 3: Import `toastError` in `src/panes.tsx`**

Add to the imports at the top of `src/panes.tsx` (after the `./lib/tmux` import block):

```ts
import { toastError } from "./lib/ui";
```

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (If `TmuxError` is now unused in `panes.tsx`, leave it — `PanesView`'s `refresh` still uses it. If lint flags an unused import, run `npm run fix-lint`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui.ts src/panes.tsx
git commit -m "refactor: extract shared toastError into lib/ui"
```

---

### Task 4: Extract `PaneDetail` into a component file

**Files:**
- Create: `src/components/pane-detail.tsx`
- Modify: `src/panes.tsx` (remove `PaneDetail`, import it)

- [ ] **Step 1: Create `src/components/pane-detail.tsx`**

```tsx
import {
  Action,
  ActionPanel,
  Alert,
  Detail,
  Icon,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { TmuxError, capturePane, killPane } from "../lib/tmux";
import { toastError } from "../lib/ui";

export function PaneDetail({
  paneId,
  command,
  onChange,
}: {
  paneId: string;
  command: string;
  onChange: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const text = await capturePane(paneId);
      setContent(text);
      setError(null);
    } catch (e) {
      setError(e instanceof TmuxError ? e.stderr || e.message : String(e));
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, [paneId]);

  useEffect(() => {
    void load();
  }, [load]);

  const markdown = error
    ? `## Failed to capture pane\n\n\`\`\`\n${error}\n\`\`\``
    : `\`\`\`\n${content ?? ""}\n\`\`\``;

  return (
    <Detail
      isLoading={loading}
      navigationTitle={`Pane ${paneId} · ${command || "(no command)"}`}
      markdown={markdown}
      actions={
        <ActionPanel>
          {content != null && !error && (
            <Action.CopyToClipboard title="Copy Content" content={content} />
          )}
          <Action
            title="Reload Capture"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={load}
          />
          <Action
            title="Kill Pane"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
            onAction={async () => {
              const ok = await confirmAlert({
                title: `Kill pane ${paneId}?`,
                message: `Running: ${command || "(none)"}`,
                primaryAction: {
                  title: "Kill",
                  style: Alert.ActionStyle.Destructive,
                },
              });
              if (!ok) return;
              try {
                await killPane(paneId);
                await showToast({
                  style: Toast.Style.Success,
                  title: `Killed ${paneId}`,
                });
                await onChange();
                pop();
              } catch (e) {
                await toastError("Kill failed", e);
              }
            }}
          />
        </ActionPanel>
      }
    />
  );
}
```

- [ ] **Step 2: Remove `PaneDetail` from `src/panes.tsx`**

Delete the entire `function PaneDetail(...) { ... }` definition (currently `src/panes.tsx:438-522`).

- [ ] **Step 3: Import `PaneDetail` in `src/panes.tsx`**

Add to the imports at the top of `src/panes.tsx`:

```ts
import { PaneDetail } from "./components/pane-detail";
```

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. `PaneItem` still references `<PaneDetail .../>`, now resolved via the import.

- [ ] **Step 5: Commit**

```bash
git add src/components/pane-detail.tsx src/panes.tsx
git commit -m "refactor: extract PaneDetail into components/pane-detail"
```

---

### Task 5: Extract the window forms into a component file

**Files:**
- Create: `src/components/window-forms.tsx`
- Modify: `src/panes.tsx` (remove both forms, import them)

- [ ] **Step 1: Create `src/components/window-forms.tsx`**

```tsx
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { newWindow, renameWindow } from "../lib/tmux";
import { toastError } from "../lib/ui";

export function RenameWindowForm({
  sessionId,
  sessionName,
  windowIndex,
  currentName,
  onDone,
}: {
  sessionId: string;
  sessionName: string;
  windowIndex: number;
  currentName: string;
  onDone: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    try {
      await renameWindow(sessionId, windowIndex, trimmed);
      await showToast({
        style: Toast.Style.Success,
        title: `Renamed window ${windowIndex} → ${trimmed}`,
      });
      await onDone();
      pop();
    } catch (e) {
      await toastError("Rename failed", e);
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Rename"
            icon={Icon.Pencil}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="New name"
        value={name}
        onChange={(v) => {
          setName(v);
          setError(undefined);
        }}
        error={error}
        autoFocus
      />
      <Form.Description
        text={`Renaming window ${windowIndex} in session "${sessionName}"`}
      />
    </Form>
  );
}

export function NewWindowForm({
  sessionId,
  sessionName,
  onDone,
}: {
  sessionId: string;
  sessionName: string;
  onDone: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState<string[]>([]);

  const submit = async () => {
    try {
      await newWindow(
        sessionId,
        name.trim() || undefined,
        cwd[0]?.trim() || undefined,
      );
      await showToast({
        style: Toast.Style.Success,
        title: name.trim()
          ? `Created window "${name.trim()}"`
          : "Created window",
      });
      await onDone();
      pop();
    } catch (e) {
      await toastError("Create window failed", e);
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create"
            icon={Icon.Plus}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Window name"
        placeholder="Leave blank to auto-name from running command"
        value={name}
        onChange={setName}
        autoFocus
      />
      <Form.FilePicker
        id="cwd"
        title="Start directory"
        value={cwd}
        onChange={setCwd}
        canChooseFiles={false}
        canChooseDirectories={true}
        allowMultipleSelection={false}
        showHiddenFiles={false}
      />
      <Form.Description
        text={`Creating a new window in session "${sessionName}". The new window is created detached (-d) so the session's current window does not change; use Switch to Window afterwards if you want to land on it.`}
      />
    </Form>
  );
}
```

- [ ] **Step 2: Remove both forms from `src/panes.tsx`**

Delete `function RenameWindowForm(...) { ... }` and `function NewWindowForm(...) { ... }` (currently `src/panes.tsx:546-680`).

- [ ] **Step 3: Import the forms in `src/panes.tsx`**

```ts
import { NewWindowForm, RenameWindowForm } from "./components/window-forms";
```

- [ ] **Step 4: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. `PaneItem` still references `<RenameWindowForm .../>` and `<NewWindowForm .../>`, now resolved via imports.

- [ ] **Step 5: Commit**

```bash
git add src/components/window-forms.tsx src/panes.tsx
git commit -m "refactor: extract window forms into components/window-forms"
```

---

### Task 6: Extract `PaneItem` (+ `copyContent`) into a component file — verbatim move

**Files:**
- Create: `src/components/pane-item.tsx`
- Modify: `src/panes.tsx` (remove `PaneItem`/`copyContent`, import `PaneItem`, trim imports)

- [ ] **Step 1: Create `src/components/pane-item.tsx` with this exact import header**

```tsx
import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Color,
  Icon,
  List,
  Toast,
  confirmAlert,
  showToast,
} from "@raycast/api";
import {
  TmuxPane,
  breakPane,
  capturePane,
  clearMarkedPane,
  clearPaneHistory,
  killOtherPanes,
  killPane,
  killWindow,
  markPane,
  swapWithMarkedPane,
  switchToWindow,
} from "../lib/tmux";
import { toastError } from "../lib/ui";
import { PaneDetail } from "./pane-detail";
import { NewWindowForm, RenameWindowForm } from "./window-forms";
```

- [ ] **Step 2: Paste the existing `PaneItem` and `copyContent` bodies unchanged**

Below the imports, paste the `function PaneItem({ ... }) { ... }` definition exactly as it currently exists in `src/panes.tsx:115-436`, and the `async function copyContent(...) { ... }` exactly as in `src/panes.tsx:524-536`. Do not edit their logic in this task. (`PaneItem` does not call `useNavigation`; that is why it is absent from the import header above.)

- [ ] **Step 3: Remove `PaneItem` and `copyContent` from `src/panes.tsx`**

Delete the `function PaneItem(...)` (lines `115-436`) and `async function copyContent(...)` (lines `524-536`) definitions from `src/panes.tsx`.

- [ ] **Step 4: Fix `src/panes.tsx` imports**

`PanesView` is now all that remains. Replace the top-of-file import block of `src/panes.tsx` with exactly:

```tsx
import { Icon, List } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { TmuxError, TmuxPane, listPanes } from "./lib/tmux";
import { PaneItem } from "./components/pane-item";
```

(The `./lib/ui`, `./components/pane-detail`, and `./components/window-forms` imports added in earlier tasks are no longer needed in `panes.tsx` — they moved into `pane-item.tsx`. Remove them.)

- [ ] **Step 5: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. If lint flags formatting, run `npm run fix-lint`.

- [ ] **Step 6: Commit**

```bash
git add src/components/pane-item.tsx src/panes.tsx
git commit -m "refactor: extract PaneItem into components/pane-item"
```

---

### Task 7: Wire the directional swap actions

**Files:**
- Modify: `src/components/pane-item.tsx` (imports, `SWAP_DIRECTIONS`, `windowPanes` prop, new "Move / Swap" + "Pane" sections)
- Modify: `src/panes.tsx` (pass `windowPanes`)

- [ ] **Step 1: Add the three new imports to `src/components/pane-item.tsx`**

Add `Keyboard` to the `@raycast/api` import list; add `swapPanes` to the `../lib/tmux` import list; add a new import for the layout helper. The resulting import block:

```tsx
import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Color,
  Icon,
  Keyboard,
  List,
  Toast,
  confirmAlert,
  showToast,
} from "@raycast/api";
import {
  TmuxPane,
  breakPane,
  capturePane,
  clearMarkedPane,
  clearPaneHistory,
  killOtherPanes,
  killPane,
  killWindow,
  markPane,
  swapPanes,
  swapWithMarkedPane,
  switchToWindow,
} from "../lib/tmux";
import { Direction, findNeighbor } from "../lib/layout";
import { toastError } from "../lib/ui";
import { PaneDetail } from "./pane-detail";
import { NewWindowForm, RenameWindowForm } from "./window-forms";
```

- [ ] **Step 2: Add the `SWAP_DIRECTIONS` table (module scope)**

Immediately after the import block in `src/components/pane-item.tsx`, add:

```tsx
const SWAP_DIRECTIONS: {
  dir: Direction;
  title: string;
  key: Keyboard.KeyEquivalent;
}[] = [
  { dir: "left", title: "Swap Left", key: "arrowLeft" },
  { dir: "right", title: "Swap Right", key: "arrowRight" },
  { dir: "up", title: "Swap Up", key: "arrowUp" },
  { dir: "down", title: "Swap Down", key: "arrowDown" },
];
```

- [ ] **Step 3: Add the `windowPanes` prop to `PaneItem`**

Change the `PaneItem` signature to accept `windowPanes` (the panes of this pane's window):

```tsx
function PaneItem({
  pane,
  session,
  windowPanes,
  hasMarkedElsewhere,
  onChange,
}: {
  pane: TmuxPane;
  session: string;
  windowPanes: TmuxPane[];
  hasMarkedElsewhere: boolean;
  onChange: () => Promise<void>;
}) {
```

- [ ] **Step 4: Replace the old swap/break section with "Move / Swap" + "Pane"**

In `pane-item.tsx`, find the `<ActionPanel.Section>` that currently contains **Break to New Window**, **Mark/Unmark Pane**, **Swap with Marked Pane**, and **Clear Pane History** (moved verbatim from `panes.tsx:201-291`). Replace that entire single `<ActionPanel.Section> ... </ActionPanel.Section>` with these two sections:

```tsx
          <ActionPanel.Section title="Move / Swap">
            {SWAP_DIRECTIONS.map(({ dir, title, key }) => {
              const neighbor = findNeighbor(windowPanes, pane, dir);
              if (!neighbor) return null;
              return (
                <Action
                  key={dir}
                  title={title}
                  icon={Icon.Switch}
                  shortcut={{ modifiers: ["ctrl", "opt"], key }}
                  onAction={async () => {
                    try {
                      await swapPanes(pane.id, neighbor.id);
                      await showToast({
                        style: Toast.Style.Success,
                        title: `Swapped ${pane.id} ${dir} with ${neighbor.id}`,
                      });
                      await onChange();
                    } catch (e) {
                      await toastError("Swap failed", e);
                    }
                  }}
                />
              );
            })}
            {pane.marked ? (
              <Action
                title="Unmark Pane"
                icon={Icon.XMarkCircle}
                shortcut={{ modifiers: ["cmd"], key: "m" }}
                onAction={async () => {
                  try {
                    await clearMarkedPane();
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Unmarked",
                    });
                    await onChange();
                  } catch (e) {
                    await toastError("Unmark failed", e);
                  }
                }}
              />
            ) : (
              <Action
                title="Mark Pane"
                icon={Icon.Bookmark}
                shortcut={{ modifiers: ["cmd"], key: "m" }}
                onAction={async () => {
                  try {
                    await markPane(pane.id);
                    await showToast({
                      style: Toast.Style.Success,
                      title: `Marked ${pane.id}`,
                    });
                    await onChange();
                  } catch (e) {
                    await toastError("Mark failed", e);
                  }
                }}
              />
            )}
            {hasMarkedElsewhere && !pane.marked && (
              <Action
                title="Swap with Marked Pane"
                icon={Icon.Switch}
                shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
                onAction={async () => {
                  try {
                    await swapWithMarkedPane(pane.id);
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Swapped with marked pane",
                    });
                    await onChange();
                  } catch (e) {
                    await toastError("Swap failed", e);
                  }
                }}
              />
            )}
          </ActionPanel.Section>

          <ActionPanel.Section title="Pane">
            <Action
              title="Break to New Window"
              icon={Icon.NewDocument}
              shortcut={{ modifiers: ["cmd"], key: "b" }}
              onAction={async () => {
                try {
                  await breakPane(pane.id);
                  await showToast({
                    style: Toast.Style.Success,
                    title: `Broke ${pane.id} into new window`,
                  });
                  await onChange();
                } catch (e) {
                  await toastError("Break failed", e);
                }
              }}
            />
            <Action
              title="Clear Pane History"
              icon={Icon.Eraser}
              shortcut={{ modifiers: ["cmd", "shift"], key: "k" }}
              onAction={async () => {
                try {
                  await clearPaneHistory(pane.id);
                  await showToast({
                    style: Toast.Style.Success,
                    title: `Cleared history of ${pane.id}`,
                  });
                } catch (e) {
                  await toastError("Clear history failed", e);
                }
              }}
            />
          </ActionPanel.Section>
```

- [ ] **Step 5: Pass `windowPanes` from `PanesView` in `src/panes.tsx`**

In the `group.panes` map, add the `windowPanes={group.panes}` prop:

```tsx
          {group.panes
            .sort((a, b) => a.index - b.index)
            .map((p) => (
              <PaneItem
                key={p.id}
                pane={p}
                session={session}
                windowPanes={group.panes}
                hasMarkedElsewhere={panes.some(
                  (q) => q.marked && q.id !== p.id,
                )}
                onChange={refresh}
              />
            ))}
```

- [ ] **Step 6: Verify types + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. If lint flags formatting, run `npm run fix-lint`.

- [ ] **Step 7: Smoke test against the live session**

Run: `npm run dev` (launches `ray develop`; keep it running).
In Raycast: **Tmux Sessions** → select the `develop` session → **Cmd+B** (Show Panes & Processes). Then:
1. On the **bottom-right** pane (`%23`, the `2.1.156` command at `96,25`), open the action panel → **Move / Swap** → **Swap Left** (or `Ctrl+Opt+←`). Expected: success toast; the bottom-right pane's content now occupies the **left** column, the previously-left pane is now bottom-right. (Verify in the actual terminal showing `develop:0`.)
2. Reopen the action panel on the pane now in the **left** column. Expected: **no "Swap Left"** action (it is at the left edge); **Swap Right** is present.
3. Confirm **Swap Up/Down** appear only where a vertical neighbor exists (e.g. on a right-column pane), and that focus/active pane did not jump after any swap.
4. Confirm the existing **Mark Pane**, **Swap with Marked Pane**, **Break to New Window**, **Clear Pane History** still work from their new sections.

If `Ctrl+Opt+Arrow` does not trigger (Raycast may reserve it), change `modifiers: ["ctrl", "opt"]` to `modifiers: ["cmd", "shift"]` in Step 4 and re-test; note the change for the README in Task 8.

- [ ] **Step 8: Commit**

```bash
git add src/components/pane-item.tsx src/panes.tsx
git commit -m "feat(panes): add directional Swap Left/Right/Up/Down actions"
```

---

### Task 8: Docs + final build verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: README — "Why Tmux Kit" panes line**

Replace the Panes bullet (`README.md:36`):

```markdown
- **Panes** — view content (capture-pane in a Detail view) / copy content / mark / swap-with-marked / clear-history / break-to-new-window / kill (one) / kill-others-in-window.
```

with:

```markdown
- **Panes** — view content (capture-pane in a Detail view) / copy content / mark / swap-with-marked / directional swap (←→↑↓) / clear-history / break-to-new-window / kill (one) / kill-others-in-window.
```

- [ ] **Step 2: README — vibe-coding bullet**

Replace (`README.md:44`):

```markdown
- _Swap two panes without attaching_ → **Mark Pane** on one, **Swap with Marked Pane** on the other.
```

with:

```markdown
- _Swap two panes without attaching_ → **Mark Pane** on one, **Swap with Marked Pane** on the other — or just **Ctrl+Opt+Arrow** to swap a pane with an adjacent one in a single step.
```

- [ ] **Step 3: README — "What you can do — at a glance" Panes checklist**

After the line (`README.md:73`):

```markdown
- [x] Swap a pane with the currently marked pane
```

add:

```markdown
- [x] Swap a pane with its adjacent pane in any direction (left / right / up / down)
```

- [ ] **Step 4: README — Pane-level actions table**

After the **Swap with Marked Pane** row (`README.md:142`), add this row:

```markdown
| Swap Left / Right / Up / Down | Ctrl+Opt+← / → / ↑ / ↓ | `swap-pane -s <pane> -t <neighbor> -d` — swap the selected pane with its nearest neighbor in that direction (same window). Shown only when a neighbor exists; never changes the active pane. |
```

(If the shortcut was changed to `Cmd+Shift+Arrow` in Task 7 Step 7, use that here instead.)

- [ ] **Step 5: README — workflow #5**

After the workflow #5 block (`README.md:180-183`, "Rearrange panes without attaching"), add:

```markdown
> **Faster for adjacent panes:** skip the mark step — on a pane, press **Ctrl+Opt+Arrow** (or use **Swap Left/Right/Up/Down**) to swap it with its neighbor in that direction in one step.
```

- [ ] **Step 6: CHANGELOG entry**

Replace the Pane-actions line (`CHANGELOG.md:6`):

```markdown
- Pane actions: view pane content in a Detail view, copy pane content to clipboard, break pane to new window, mark / swap with marked pane, clear pane scrollback, kill pane or kill all other panes in the window
```

with:

```markdown
- Pane actions: view pane content in a Detail view, copy pane content to clipboard, break pane to new window, mark / swap with marked pane, directional swap (swap a pane with its adjacent pane left/right/up/down via `swap-pane -s/-t -d`), clear pane scrollback, kill pane or kill all other panes in the window
```

- [ ] **Step 7: Final full build + lint**

Run: `npm run build && npm run lint`
Expected: `ray build` completes (this is the authoritative TypeScript `--noEmit` gate per the README) and lint passes.

- [ ] **Step 8: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document directional pane swap in README and CHANGELOG"
```

---

## Self-Review

**Spec coverage:**
- Directional swap action (Swap ←/→/↑/↓) → Task 7. ✔
- Geometry fields `left`/`top` + `swapPanes` → Task 1. ✔
- Pure `findNeighbor` (same-window, tmux-like semantics) → Task 2. ✔
- "Move / Swap" action regrouping → Task 7 Step 4. ✔
- File split (pane-item / pane-detail / window-forms / lib/ui / lib/layout) → Tasks 2–6. ✔
- Shortcuts `Ctrl+Opt+arrows` + fallback → Task 7 Steps 4/7. ✔
- Conditional rendering when no neighbor → Task 7 Step 4 (`if (!neighbor) return null`). ✔
- Error handling via `toastError` → reused throughout. ✔
- Manual verification (no test runner / no vitest) → Task 7 Step 7, Task 8 Step 7. ✔
- README + CHANGELOG → Task 8. ✔

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✔

**Type consistency:** `TmuxPane` gains `left`/`top` (Task 1) used by `findNeighbor` (Task 2); `Direction`/`findNeighbor` (Task 2) consumed in Task 7; `swapPanes(srcId, dstId)` (Task 1) called as `swapPanes(pane.id, neighbor.id)` (Task 7); `windowPanes: TmuxPane[]` prop defined (Task 7 Step 3) and passed as `group.panes` (Task 7 Step 5). Consistent. ✔
