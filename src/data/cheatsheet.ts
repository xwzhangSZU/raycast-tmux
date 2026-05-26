export type CheatSection =
  | "Core / 核心"
  | "Window / 窗口"
  | "Session"
  | "Copy mode / 复制"
  | "Misc / 杂项"
  | "Command mode / 命令模式"
  | "Resurrect / 持久化"
  | "Workflow / 工作流"
  | "Files / 文件位置";

export type CheatEntry = {
  id: string;
  section: CheatSection;
  title: string;
  /** Key sequence, e.g. "prefix d" — shown in subtitle, copyable */
  shortcut?: string;
  /** Tmux command (after `prefix :`), e.g. "kill-session -a" — shown in subtitle, copyable */
  command?: string;
  /** Shell command, e.g. "ta papers" — copyable */
  shell?: string;
  /** Short one-line description (shown as accessory + in detail). Optional: self-explanatory entries can omit. */
  description?: string;
  /** Optional longer markdown for the detail view */
  details?: string;
  /** Keywords for search (added to Raycast keywords) */
  keywords?: string[];
};

const E = (entry: CheatEntry): CheatEntry => entry;

export const CHEAT_ENTRIES: CheatEntry[] = [
  // ── Core ─────────────────────────────────────────────────────────────────
  E({
    id: "core-detach",
    section: "Core / 核心",
    title: "Detach 临时退出",
    shortcut: "prefix d",
    description: "脱离当前 client，session 在后台继续跑。重新打开 cmux pane 自动接回。",
    keywords: ["detach", "退出", "后台", "background"],
  }),
  E({
    id: "core-reattach",
    section: "Core / 核心",
    title: "Re-attach to papers",
    shell: "ta papers",
    description: "重新接回默认的 papers session。`ta` 是 zshrc 里的函数。",
    keywords: ["attach", "接回", "papers"],
  }),
  E({
    id: "core-list-sessions",
    section: "Core / 核心",
    title: "List sessions",
    shell: "tls",
    description: "列出所有 tmux session（zshrc 函数，等价 `tmux list-sessions`）。",
    keywords: ["list", "ls"],
  }),
  E({
    id: "core-kill-session",
    section: "Core / 核心",
    title: "Kill session by name",
    shell: "tk <name>",
    description: "杀掉指定 session（zshrc 函数）。",
    keywords: ["kill"],
  }),
  E({
    id: "core-new-session",
    section: "Core / 核心",
    title: "New session",
    shell: "tn <name>",
    description: "新建并 attach 一个 session（zshrc 函数）。",
    keywords: ["new", "create"],
  }),
  E({
    id: "core-attach-named",
    section: "Core / 核心",
    title: "Attach session by name",
    shell: "ta <name>",
    description: "Attach 到指定 session（zshrc 函数）。",
    keywords: ["attach"],
  }),

  // ── Window ───────────────────────────────────────────────────────────────
  E({
    id: "win-new",
    section: "Window / 窗口",
    title: "New window",
    shortcut: "prefix c",
    description: "新建 tmux window（即 tab），继承当前 pane 的 cwd。",
    keywords: ["new", "tab"],
  }),
  E({
    id: "win-next",
    section: "Window / 窗口",
    title: "Next window",
    shortcut: "prefix n",
    description: "切到下一个 window。",
  }),
  E({
    id: "win-prev",
    section: "Window / 窗口",
    title: "Previous window",
    shortcut: "prefix p",
    description: "切到上一个 window。",
  }),
  E({
    id: "win-jump",
    section: "Window / 窗口",
    title: "Jump to window N",
    shortcut: "prefix 0..9",
    description: "直接跳到编号 N 的 window。",
    keywords: ["jump", "goto"],
  }),
  E({
    id: "win-picker",
    section: "Window / 窗口",
    title: "Window picker (tree)",
    shortcut: "prefix w",
    description: "交互式 window/session 选择器。",
    keywords: ["choose", "tree"],
  }),
  E({
    id: "win-rename",
    section: "Window / 窗口",
    title: "Rename window",
    shortcut: "prefix ,",
    description: "重命名当前 window。",
  }),
  E({
    id: "win-kill",
    section: "Window / 窗口",
    title: "Kill window",
    shortcut: "prefix &",
    description: "杀掉当前 window（会问确认）。",
    keywords: ["kill", "close"],
  }),

  // ── Session ──────────────────────────────────────────────────────────────
  E({
    id: "sess-picker",
    section: "Session",
    title: "Session picker",
    shortcut: "prefix s",
    description: "交互式 session 选择器。",
  }),
  E({
    id: "sess-prev",
    section: "Session",
    title: "Previous session",
    shortcut: "prefix (",
  }),
  E({
    id: "sess-next",
    section: "Session",
    title: "Next session",
    shortcut: "prefix )",
  }),
  E({
    id: "sess-rename",
    section: "Session",
    title: "Rename current session",
    shortcut: "prefix $",
  }),

  // ── Copy mode ────────────────────────────────────────────────────────────
  E({
    id: "copy-enter",
    section: "Copy mode / 复制",
    title: "Enter copy mode",
    shortcut: "prefix [",
    description: "进入 vi 风格的复制/滚屏模式。",
    keywords: ["scroll", "copy", "滚屏"],
  }),
  E({
    id: "copy-begin",
    section: "Copy mode / 复制",
    title: "Begin selection",
    shortcut: "v",
    description: "进入 copy mode 后按 v 开始视觉选择。",
  }),
  E({
    id: "copy-yank",
    section: "Copy mode / 复制",
    title: "Yank → 系统剪贴板",
    shortcut: "y",
    description: "选完按 y 复制并自动 pbcopy（已在 tmux.conf 配 copy-command）。",
    keywords: ["yank", "pbcopy", "clipboard"],
  }),
  E({
    id: "copy-exit",
    section: "Copy mode / 复制",
    title: "Exit copy mode",
    shortcut: "q / Esc",
  }),
  E({
    id: "copy-search-fwd",
    section: "Copy mode / 复制",
    title: "Search forward",
    shortcut: "/",
  }),
  E({
    id: "copy-search-back",
    section: "Copy mode / 复制",
    title: "Search backward",
    shortcut: "?",
  }),

  // ── Misc ─────────────────────────────────────────────────────────────────
  E({
    id: "misc-help",
    section: "Misc / 杂项",
    title: "Show all key bindings",
    shortcut: "prefix ?",
    description: "弹出当前所有绑定。等价命令模式 `list-keys`。",
  }),
  E({
    id: "misc-cmd",
    section: "Misc / 杂项",
    title: "Enter command mode",
    shortcut: "prefix :",
    description: "进入 tmux 命令行。Tab 补全、↑↓ 翻历史、`;` 链式。",
  }),
  E({
    id: "misc-reload",
    section: "Misc / 杂项",
    title: "Reload config",
    shortcut: "prefix : source ~/.tmux.conf",
    description: "改完 tmux.conf 不重启重载。",
    keywords: ["source", "reload"],
  }),
  E({
    id: "misc-clock",
    section: "Misc / 杂项",
    title: "Show clock",
    shortcut: "prefix t",
  }),

  // ── Command mode ─────────────────────────────────────────────────────────
  E({
    id: "cmd-clear-history",
    section: "Command mode / 命令模式",
    title: "Clear scrollback",
    command: "clear-history",
    description: "清当前 pane 的 scrollback（你设了 1000 万行，定期清）。",
    keywords: ["clear", "scrollback", "清"],
  }),
  E({
    id: "cmd-kill-target",
    section: "Command mode / 命令模式",
    title: "Kill session by name",
    command: "kill-session -t <name>",
    description: "杀掉指定 session。",
  }),
  E({
    id: "cmd-kill-others",
    section: "Command mode / 命令模式",
    title: "Kill all other sessions",
    command: "kill-session -a",
    description: "杀除当前 session 之外所有 session（大扫除）。",
    keywords: ["clean", "扫除"],
  }),
  E({
    id: "cmd-rename-session",
    section: "Command mode / 命令模式",
    title: "Rename session",
    command: "rename-session <new>",
  }),
  E({
    id: "cmd-rename-window",
    section: "Command mode / 命令模式",
    title: "Rename window",
    command: "rename-window <new>",
  }),
  E({
    id: "cmd-move-window",
    section: "Command mode / 命令模式",
    title: "Move window to position",
    command: "move-window -t N",
    description: "把当前 window 挪到 N 号位。",
  }),
  E({
    id: "cmd-swap-window",
    section: "Command mode / 命令模式",
    title: "Swap windows",
    command: "swap-window -s X -t Y",
    description: "把 window X 和 Y 对调。",
  }),
  E({
    id: "cmd-toggle-mouse",
    section: "Command mode / 命令模式",
    title: "Toggle mouse mode",
    command: "set -g mouse off",
    description: "临时关鼠标（想用终端原生选择文本时）；on 打开。",
  }),
  E({
    id: "cmd-toggle-status",
    section: "Command mode / 命令模式",
    title: "Toggle status bar",
    command: "set -g status off",
    description: "临时藏 status bar（截图 / 录屏）；on 打开。",
  }),
  E({
    id: "cmd-find-window",
    section: "Command mode / 命令模式",
    title: "Find window by text",
    command: "find-window <text>",
    description: "跨 window 搜文本，秒跳过去。",
  }),
  E({
    id: "cmd-respawn-pane",
    section: "Command mode / 命令模式",
    title: "Respawn pane",
    command: "respawn-pane -k",
    description: "pane 里命令死了，原地重启 shell（不开新 pane）。",
  }),
  E({
    id: "cmd-display-panes",
    section: "Command mode / 命令模式",
    title: "Display pane numbers",
    command: "display-panes",
    description: "屏幕闪现 pane 编号，按数字直接跳。",
  }),
  E({
    id: "cmd-list-keys",
    section: "Command mode / 命令模式",
    title: "List key bindings",
    command: "list-keys",
    description: "查所有绑定（等价 prefix ?）。配合 `\\| grep` 过滤。",
  }),
  E({
    id: "cmd-move-window-cross",
    section: "Command mode / 命令模式",
    title: "Move window across sessions",
    command: "move-window -s src:N -t dst:",
    description: "把 src session 的 N 号 window 搬到 dst session。",
  }),

  // ── Resurrect ────────────────────────────────────────────────────────────
  E({
    id: "resurrect-save",
    section: "Resurrect / 持久化",
    title: "Resurrect: save layout",
    command: "run-shell ~/.tmux/plugins/tmux-resurrect/scripts/save.sh",
    description: "立刻存当前 session/window/pane 布局。",
    keywords: ["save", "backup"],
  }),
  E({
    id: "resurrect-restore",
    section: "Resurrect / 持久化",
    title: "Resurrect: restore layout",
    command: "run-shell ~/.tmux/plugins/tmux-resurrect/scripts/restore.sh",
    description: "恢复上次保存（也可 `prefix Ctrl+r`）。",
    keywords: ["restore"],
  }),

  // ── Workflow ─────────────────────────────────────────────────────────────
  E({
    id: "flow-cmux-attach",
    section: "Workflow / 工作流",
    title: "cmux pane → auto-attach papers",
    description: "新开 cmux pane (`Cmd+N`) 会自动 exec ~/bin/tmux-start.sh → 接到 papers session。",
    details:
      "检测机制：cmux 启动的 shell 继承 macOS 的 `__CFBundleIdentifier=com.cmuxterm.app`，~/.zshrc 顶部块匹配后 exec tmux-start.sh。",
  }),
  E({
    id: "flow-skip-attach",
    section: "Workflow / 工作流",
    title: "Skip auto-attach (one-off)",
    shell: "CMUX_NO_TMUX=1 <cmd>",
    description: "某次想用纯 shell 不进 tmux。",
  }),
  E({
    id: "flow-skip-attach-shell",
    section: "Workflow / 工作流",
    title: "Skip auto-attach (in pane)",
    shell: "unset __CFBundleIdentifier && exec zsh",
    description: "已经在 pane 里，临时起一个不会自动 attach 的裸 zsh。",
  }),

  // ── Files ────────────────────────────────────────────────────────────────
  E({
    id: "file-zshrc",
    section: "Files / 文件位置",
    title: "~/.zshrc",
    description: "cmux 检测 + 自动 attach 块在文件顶部（p10k instant prompt 之后）。",
  }),
  E({
    id: "file-tmux-start",
    section: "Files / 文件位置",
    title: "~/bin/tmux-start.sh",
    description: "tmux 启动脚本：清理 >48h 闲置 session，attach 到 papers。",
  }),
  E({
    id: "file-tmux-conf",
    section: "Files / 文件位置",
    title: "~/.tmux.conf",
    description: "→ Dropbox/Apps/Terminal-config-sync/tmux.conf。prefix=C-a、vi 复制、unbind 掉 split。",
  }),
  E({
    id: "file-ghostty",
    section: "Files / 文件位置",
    title: "~/.config/ghostty/config",
    description: "Ghostty 渲染配置。`working-directory = ~/Library/CloudStorage/Dropbox`。",
  }),
  E({
    id: "file-cmux",
    section: "Files / 文件位置",
    title: "~/.config/cmux/cmux.json",
    description: "cmux app 配置。",
  }),
];

export const SECTIONS_IN_ORDER: CheatSection[] = [
  "Core / 核心",
  "Window / 窗口",
  "Session",
  "Copy mode / 复制",
  "Misc / 杂项",
  "Command mode / 命令模式",
  "Resurrect / 持久化",
  "Workflow / 工作流",
  "Files / 文件位置",
];
