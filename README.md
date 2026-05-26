# Raycast Tmux

Local Raycast extension: tmux cheatsheet + session manager for the `prefix=Ctrl+a` setup.

## Commands

- **Tmux Cheatsheet** — searchable key/command reference with markdown detail panel.
- **Tmux Sessions** — list / rename / kill / switch-client / copy attach command.

## Install

```sh
cd ~/Projects/raycast-tmux
npm install
npm run dev   # registers as dev extension in Raycast
```

Keep the `dev` process running; closing it unregisters the extension. To make permanent, build and import:

```sh
npm run build       # outputs dist/
# Then in Raycast: Cmd+, → Extensions → ⋯ → Import Extension → pick dist/
```

## Tweaks

- `tmuxBinary` preference if tmux isn't at `/opt/homebrew/bin/tmux`.
- Edit `src/data/cheatsheet.ts` to add/reword entries.
