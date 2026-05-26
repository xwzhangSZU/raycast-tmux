import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Form,
  Icon,
  List,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { homedir } from "node:os";
import {
  TmuxError,
  TmuxSession,
  attachCommand,
  hasAnyClient,
  killOtherSessions,
  killSession,
  listSessions,
  newSession,
  renameSession,
  switchClient,
} from "./lib/tmux";
import { PanesView } from "./panes";

export default function SessionsCommand() {
  const [sessions, setSessions] = useState<TmuxSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSessions();
      setSessions(data);
      setError(null);
    } catch (e) {
      const msg = e instanceof TmuxError ? e.stderr || e.message : e instanceof Error ? e.message : String(e);
      setError(msg);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <List isLoading={loading} searchBarPlaceholder="Search tmux sessions…">
      {error && (
        <List.EmptyView icon={Icon.ExclamationMark} title="Failed to read tmux sessions" description={error} />
      )}
      {!error && sessions && sessions.length === 0 && <EmptyState onChange={refresh} />}
      {sessions?.map((s) => <SessionItem key={s.name} session={s} onChange={refresh} />)}
    </List>
  );
}

function EmptyState({ onChange }: { onChange: () => Promise<void> }) {
  return (
    <List.EmptyView
      icon={Icon.Terminal}
      title="No tmux sessions"
      description="tmux server 没在跑。"
      actions={
        <ActionPanel>
          <Action
            title="Start 'papers' Session"
            icon={Icon.Plus}
            onAction={async () => {
              try {
                await newSession("papers", `${homedir()}/Library/CloudStorage/Dropbox`);
                await showToast({ style: Toast.Style.Success, title: "Started 'papers'" });
                await onChange();
              } catch (e) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Create failed",
                  message: String(e),
                });
              }
            }}
          />
        </ActionPanel>
      }
    />
  );
}

function SessionItem({ session, onChange }: { session: TmuxSession; onChange: () => Promise<void> }) {
  return (
    <List.Item
      title={session.name}
      subtitle={session.currentWindow}
      icon={Icon.Terminal}
      keywords={[session.name, session.currentWindow, session.currentPath]}
      accessories={[
        {
          icon: session.attached
            ? { source: Icon.CircleFilled, tintColor: Color.Green }
            : { source: Icon.Circle, tintColor: Color.SecondaryText },
          tooltip: session.attached ? "Attached" : "Detached",
        },
        { text: `${session.windows}w` },
        { date: session.activity, tooltip: `Last activity ${session.activity.toLocaleString()}` },
      ]}
      actions={<SessionActions session={session} onChange={onChange} />}
    />
  );
}

function SessionActions({ session, onChange }: { session: TmuxSession; onChange: () => Promise<void> }) {
  const handleSwitch = useCallback(async () => {
    try {
      if (!(await hasAnyClient())) {
        await showToast({
          style: Toast.Style.Failure,
          title: "No tmux client attached",
          message: "Use Copy Attach Command and paste in a terminal.",
        });
        return;
      }
      await switchClient(session.name);
      await showToast({ style: Toast.Style.Success, title: `Switched to ${session.name}` });
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Switch failed",
        message: e instanceof TmuxError ? e.stderr || e.message : String(e),
      });
    }
  }, [session.name]);

  const handleKill = useCallback(async () => {
    const ok = await confirmAlert({
      title: `Kill session "${session.name}"?`,
      message: "All windows and panes inside will be terminated.",
      primaryAction: { title: "Kill", style: Alert.ActionStyle.Destructive },
    });
    if (!ok) return;
    try {
      await killSession(session.name);
      await showToast({ style: Toast.Style.Success, title: `Killed ${session.name}` });
      await onChange();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Kill failed",
        message: e instanceof TmuxError ? e.stderr || e.message : String(e),
      });
    }
  }, [session.name, onChange]);

  const handleKillOthers = useCallback(async () => {
    const ok = await confirmAlert({
      title: `Kill all sessions except "${session.name}"?`,
      primaryAction: { title: "Kill others", style: Alert.ActionStyle.Destructive },
    });
    if (!ok) return;
    try {
      await killOtherSessions(session.name);
      await showToast({ style: Toast.Style.Success, title: "Other sessions killed" });
      await onChange();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed",
        message: e instanceof TmuxError ? e.stderr || e.message : String(e),
      });
    }
  }, [session.name, onChange]);

  return (
    <ActionPanel>
      <Action title="Switch Client to Session" icon={Icon.ArrowRight} onAction={handleSwitch} />
      <Action.CopyToClipboard
        title="Copy Attach Command"
        content={attachCommand(session.name)}
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd"], key: "c" }}
      />
      <Action.Push
        title="Rename Session"
        icon={Icon.Pencil}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        target={<RenameForm session={session} onDone={onChange} />}
      />
      <Action.Push
        title="New Session"
        icon={Icon.Plus}
        shortcut={{ modifiers: ["cmd"], key: "n" }}
        target={<NewSessionForm onDone={onChange} />}
      />
      <Action.Push
        title="Show Panes & Processes"
        icon={Icon.AppWindowList}
        shortcut={{ modifiers: ["cmd"], key: "p" }}
        target={<PanesView session={session.name} />}
      />
      <ActionPanel.Section title="Danger">
        <Action
          title="Kill Session"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "x" }}
          onAction={handleKill}
        />
        <Action
          title="Kill All Other Sessions"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
          onAction={handleKillOthers}
        />
      </ActionPanel.Section>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
        onAction={onChange}
      />
    </ActionPanel>
  );
}

function RenameForm({ session, onDone }: { session: TmuxSession; onDone: () => Promise<void> }) {
  const { pop } = useNavigation();
  const [name, setName] = useState(session.name);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名字不能空");
      return;
    }
    if (/[\s:.]/.test(trimmed)) {
      setError("名字不能含空格、冒号、点");
      return;
    }
    try {
      await renameSession(session.name, trimmed);
      await showToast({ style: Toast.Style.Success, title: `Renamed → ${trimmed}` });
      await onDone();
      pop();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Rename failed",
        message: e instanceof TmuxError ? e.stderr || e.message : String(e),
      });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Rename" icon={Icon.Pencil} onSubmit={submit} />
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
      <Form.Description text={`Renaming "${session.name}"`} />
    </Form>
  );
}

function NewSessionForm({ onDone }: { onDone: () => Promise<void> }) {
  const { pop } = useNavigation();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState(`${homedir()}/Library/CloudStorage/Dropbox`);
  const [nameError, setNameError] = useState<string | undefined>();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("名字不能空");
      return;
    }
    if (/[\s:.]/.test(trimmed)) {
      setNameError("名字不能含空格、冒号、点");
      return;
    }
    try {
      await newSession(trimmed, cwd.trim() || undefined);
      await showToast({ style: Toast.Style.Success, title: `Created ${trimmed}` });
      await onDone();
      pop();
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Create failed",
        message: e instanceof TmuxError ? e.stderr || e.message : String(e),
      });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create" icon={Icon.Plus} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Session name"
        value={name}
        onChange={(v) => {
          setName(v);
          setNameError(undefined);
        }}
        error={nameError}
        autoFocus
      />
      <Form.TextField id="cwd" title="Start directory" value={cwd} onChange={setCwd} />
      <Form.Description text="新 session 以 detached 状态创建（-d）。完成后可用 Switch / Copy Attach 进入。" />
    </Form>
  );
}
