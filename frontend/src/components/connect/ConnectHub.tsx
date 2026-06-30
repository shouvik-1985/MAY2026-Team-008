import { motion } from "framer-motion";
import {
  Ban,
  BadgeCheck,
  BookOpen,
  Check,
  Download,
  Edit3,
  File,
  GraduationCap,
  Hash,
  Image,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType } from "react";
import {
  acceptConnectRequest,
  blockConnectUser,
  deleteConnectMessage,
  editConnectMessage,
  getConnectHub,
  getConnectMessages,
  removeConnectRequest,
  resolveResourceUrl,
  sendConnectMessage,
  sendConnectRequest,
  unblockConnectUser,
  type ConnectHubData,
  type ConnectMessage,
  type ConnectPerson,
  type ConnectRole,
  type ConnectStatus,
} from "@/lib/api";

type PanelMode = "profile" | "chat";

type QueuedFile = {
  id: number;
  file: File;
  name: string;
  type: string;
  size: string;
};

const EMOJIS = ["\u{1F44D}", "\u{1F525}", "\u2728", "\u2705", "\u{1F642}", "\u{1F4CC}"];

export function ConnectHub({
  viewerRole,
  viewerName,
}: {
  viewerRole: ConnectRole;
  viewerName: string;
}) {
  const [hub, setHub] = useState<ConnectHubData | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("profile");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ConnectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const selected = hub?.people.find((person) => person.id === selectedId) ?? hub?.people[0] ?? null;
  const canChat = selected?.status === "friend";
  const displayName = hub?.viewer.name || viewerName;
  const syncedLabel = hub?.syncedAt
    ? new Date(hub.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const visiblePeople = useMemo(() => {
    const people = hub?.people ?? [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return people;
    return people.filter((person) =>
      [
        person.name,
        person.role,
        person.department,
        person.headline,
        person.email,
        person.meta,
        ...Object.values(person.details ?? {}),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [hub?.people, query]);

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        const data = await getConnectHub();
        if (!mounted) return;
        setHub(data);
        setSelectedId((current) => current ?? chooseDefaultPerson(data.people));
        setError(null);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unable to load Connect");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadInitial();
    const timer = window.setInterval(() => {
      void refreshHub(true);
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selected || selected.status !== "friend" || panelMode !== "chat") {
      setMessages([]);
      return;
    }

    let mounted = true;

    async function loadMessages(silent = false) {
      if (!silent) setChatLoading(true);
      try {
        const data = await getConnectMessages(selected.id);
        if (mounted) {
          setMessages(data.messages);
          setError(null);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Unable to load messages");
      } finally {
        if (mounted) setChatLoading(false);
      }
    }

    void loadMessages();
    const timer = window.setInterval(() => {
      void loadMessages(true);
    }, 2500);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [selected?.id, selected?.status, panelMode]);

  useEffect(() => {
    if (panelMode !== "chat") return;
    const node = messagesRef.current;
    if (!node) return;
    window.requestAnimationFrame(() => {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length, selected?.id, panelMode]);

  async function refreshHub(silent = false) {
    if (!silent) setLoading(true);
    try {
      const data = await getConnectHub();
      setHub(data);
      setSelectedId((current) => {
        if (current && data.people.some((person) => person.id === current)) return current;
        return chooseDefaultPerson(data.people);
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sync Connect");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function runAction(actionKey: string, action: () => Promise<unknown>) {
    if (!selected) return;
    setBusyAction(actionKey);
    try {
      await action();
      await refreshHub(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  }

  function selectPerson(personId: number) {
    setSelectedId(personId);
    setPanelMode("profile");
    setFiles([]);
    setDraft("");
  }

  function attachFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setFiles((current) => [
      ...current,
      ...picked.map((file, index) => ({
        id: Date.now() + index,
        file,
        name: file.name,
        type: file.type || "file",
        size: formatBytes(file.size),
      })),
    ]);
    event.target.value = "";
  }

  async function sendMessage() {
    if (!selected || !canChat || busyAction === "send-message") return;
    if (!draft.trim() && files.length === 0) return;

    const payload = new FormData();
    payload.append("receiver_id", String(selected.id));
    payload.append("body", draft.trim());
    files.forEach((item) => payload.append("files", item.file));

    setBusyAction("send-message");
    try {
      const result = await sendConnectMessage(payload);
      setMessages((current) => [...current, result.message]);
      setDraft("");
      setFiles([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be sent");
    } finally {
      setBusyAction(null);
    }
  }

  async function editMessage(message: ConnectMessage) {
    const nextText = window.prompt("Edit message", message.text);
    if (!nextText?.trim()) return;
    try {
      const result = await editConnectMessage(message.id, nextText.trim());
      setMessages((current) => current.map((item) => (item.id === message.id ? result.message : item)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be edited");
    }
  }

  async function deleteForMe(message: ConnectMessage) {
    try {
      await deleteConnectMessage(message.id, "me");
      setMessages((current) => current.filter((item) => item.id !== message.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be deleted");
    }
  }

  async function deleteForEveryone(message: ConnectMessage) {
    try {
      const result = await deleteConnectMessage(message.id, "everyone");
      if (result.message) {
        setMessages((current) => current.map((item) => (item.id === message.id ? result.message! : item)));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be deleted for everyone");
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[540px] max-h-[780px] flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.32em] text-white/45">
          <MessageCircle className="size-3.5" />
          Campus Connect
        </div>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Connect</h1>
        <p className="mt-2 max-w-2xl text-white/55">
          Search registered students and professors, manage requests, view profiles, and chat with persistent files.
        </p>
      </div>

      {error && (
        <div className="shrink-0 rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {loading && !hub ? (
        <div className="glass-strong grid min-h-0 flex-1 place-items-center rounded-3xl">
          <div className="text-center text-white/60">
            <Loader2 className="mx-auto mb-3 size-7 animate-spin" />
            Syncing registered Campus Connect users...
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <PeoplePanel
            displayName={displayName}
            viewerRole={viewerRole}
            syncedLabel={syncedLabel}
            loading={loading}
            query={query}
            onQuery={setQuery}
            hub={hub}
            selectedId={selected?.id ?? null}
            visiblePeople={visiblePeople}
            onRefresh={() => void refreshHub()}
            onSelect={selectPerson}
          />

          {selected ? (
            panelMode === "chat" && canChat ? (
              <ChatPanel
                person={selected}
                messages={messages}
                messagesRef={messagesRef}
                chatLoading={chatLoading}
                busyAction={busyAction}
                draft={draft}
                files={files}
                fileRef={fileRef}
                displayName={displayName}
                onProfile={() => setPanelMode("profile")}
                onDraft={setDraft}
                onAttachFiles={attachFiles}
                onRemoveQueuedFile={(fileId) => setFiles((current) => current.filter((item) => item.id !== fileId))}
                onSend={() => void sendMessage()}
                onEdit={editMessage}
                onDeleteMe={deleteForMe}
                onDeleteEveryone={deleteForEveryone}
              />
            ) : (
              <ProfilePanel
                person={selected}
                viewerRole={viewerRole}
                busyAction={busyAction}
                onMessage={() => setPanelMode("chat")}
                onSend={() => runAction("send-request", () => sendConnectRequest(selected.id))}
                onCancel={() => runAction("remove-request", () => removeConnectRequest(selected.id))}
                onAccept={() => runAction("accept-request", () => acceptConnectRequest(selected.id))}
                onReject={() => runAction("remove-request", () => removeConnectRequest(selected.id))}
                onBlock={() => runAction("block-user", () => blockConnectUser(selected.id))}
                onUnblock={() => runAction("unblock-user", () => unblockConnectUser(selected.id))}
              />
            )
          ) : (
            <div className="glass-strong grid min-h-0 place-items-center rounded-3xl text-center text-white/45">
              No registered students or professors are available yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PeoplePanel({
  displayName,
  viewerRole,
  syncedLabel,
  loading,
  query,
  onQuery,
  hub,
  selectedId,
  visiblePeople,
  onRefresh,
  onSelect,
}: {
  displayName: string;
  viewerRole: ConnectRole;
  syncedLabel: string;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  hub: ConnectHubData | null;
  selectedId: number | null;
  visiblePeople: ConnectPerson[];
  onRefresh: () => void;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="glass-strong flex min-h-0 flex-col overflow-hidden rounded-3xl p-4">
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Signed in as</div>
            <div className="truncate font-medium">
              {displayName} / {viewerRole}
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55 transition hover:text-white"
            title="Refresh Connect"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <label className="glass mt-4 flex items-center gap-3 rounded-2xl px-4 py-3">
          <Search className="size-4 text-white/40" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search name, roll, email, department..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </label>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <MiniCount label="Friends" value={hub?.counts.friends ?? 0} />
          <MiniCount label="Requests" value={hub?.counts.requests ?? 0} />
          <MiniCount label="Sent" value={hub?.counts.sent ?? 0} />
          <MiniCount label="Blocked" value={hub?.counts.blocked ?? 0} />
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {visiblePeople.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => onSelect(person.id)}
            className={`group relative w-full overflow-hidden rounded-2xl border p-3 text-left transition ${
              person.id === selectedId
                ? "border-fuchsia-300/40 bg-fuchsia-400/10"
                : "border-white/8 bg-white/[0.03] hover:border-white/18"
            }`}
          >
            {person.id === selectedId && (
              <span
                className="absolute inset-y-2 left-0 w-1 rounded-r-full"
                style={{ background: "var(--grad-aurora)" }}
              />
            )}
            <div className="flex items-center gap-3">
              <PresenceAvatar person={person} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate font-medium">{person.name}</div>
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/35">
                    {person.role}
                  </span>
                </div>
                <div className="truncate text-xs text-white/45">{person.headline}</div>
              </div>
              <RelationPill status={person.status} />
            </div>
          </button>
        ))}

        {visiblePeople.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/12 p-5 text-center text-sm text-white/45">
            No registered user matched your search.
          </div>
        )}
      </div>

      <div className="mt-4 shrink-0 border-t border-white/10 pt-3 text-xs text-white/35">
        Live sync {syncedLabel ? `at ${syncedLabel}` : "enabled"}
      </div>
    </div>
  );
}

function ProfilePanel({
  person,
  viewerRole,
  busyAction,
  onMessage,
  onSend,
  onCancel,
  onAccept,
  onReject,
  onBlock,
  onUnblock,
}: {
  person: ConnectPerson;
  viewerRole: ConnectRole;
  busyAction: string | null;
  onMessage: () => void;
  onSend: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onReject: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const busy = Boolean(busyAction);
  const detailEntries = Object.entries(person.details ?? {});
  const quickStats = detailEntries.slice(0, 3);
  const presence = presenceForPerson(person);

  return (
    <div className="glass-strong flex min-h-0 flex-col overflow-hidden rounded-3xl">
      <div className="relative shrink-0 overflow-hidden border-b border-white/10 p-6">
        <span className="absolute -right-12 -top-20 size-56 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <span className="absolute -bottom-24 left-10 size-60 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-5">
            <PresenceAvatar person={person} large />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">{person.role} profile</div>
              <div className="mt-1 font-display text-4xl leading-tight">{person.name}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/55">
                <span>{person.headline}</span>
                <span className="size-1 rounded-full bg-white/25" />
                <span className={presence === "Online" ? "text-emerald-200" : "text-white/45"}>{presence}</span>
              </div>
            </div>
          </div>
          <RelationPill status={person.status} />
        </div>

        <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
          {(quickStats.length ? quickStats : [["role", person.role], ["status", person.status], ["viewer", viewerRole]]).map(
            ([key, value]) => (
              <ProfileMetric key={key} label={labelize(key)} value={value} />
            ),
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid gap-3 xl:grid-cols-2">
          <ProfileLine icon={BookOpen} label="Headline" value={person.headline} />
          <ProfileLine icon={GraduationCap} label="Department" value={person.department} />
          <ProfileLine icon={Mail} label="Email" value={person.email} />
          <ProfileLine
            icon={BadgeCheck}
            label={person.role === "student" ? "Academic" : "Expertise"}
            value={person.meta}
          />
          {detailEntries.map(([key, value]) => (
            <ProfileLine key={key} icon={iconForDetail(key)} label={labelize(key)} value={value} />
          ))}
          <ProfileLine icon={UserCheck} label="Viewing as" value={viewerRole} />
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#080808]/70 p-4 backdrop-blur-xl">
        <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-white/35">Connection actions</div>
        <div className="flex flex-wrap gap-2">
          {person.status === "friend" && (
            <ActionButton icon={MessageCircle} label="Message" disabled={busy} onClick={onMessage} />
          )}
          {person.status === "none" && (
            <ActionButton
              icon={UserPlus}
              label="Send request"
              disabled={busy}
              loading={busyAction === "send-request"}
              onClick={onSend}
            />
          )}
          {person.status === "sent" && (
            <ActionButton
              icon={X}
              label="Cancel request"
              disabled={busy}
              loading={busyAction === "remove-request"}
              onClick={onCancel}
              tone="muted"
            />
          )}
          {person.status === "received" && (
            <>
              <ActionButton
                icon={Check}
                label="Accept"
                disabled={busy}
                loading={busyAction === "accept-request"}
                onClick={onAccept}
              />
              <ActionButton
                icon={X}
                label="Reject"
                disabled={busy}
                loading={busyAction === "remove-request"}
                onClick={onReject}
                tone="muted"
              />
            </>
          )}
          {person.status === "blocked" && (
            <ActionButton
              icon={ShieldCheck}
              label="Unblock"
              disabled={busy}
              loading={busyAction === "unblock-user"}
              onClick={onUnblock}
              tone="muted"
            />
          )}
          {person.status === "blocked_by_them" && (
            <ActionButton icon={Ban} label="Blocked by user" disabled onClick={() => undefined} tone="danger" />
          )}
          {person.status !== "blocked" && person.status !== "blocked_by_them" && (
            <ActionButton
              icon={Ban}
              label="Block"
              disabled={busy}
              loading={busyAction === "block-user"}
              onClick={onBlock}
              tone="danger"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ChatPanel({
  person,
  messages,
  messagesRef,
  chatLoading,
  busyAction,
  draft,
  files,
  fileRef,
  displayName,
  onProfile,
  onDraft,
  onAttachFiles,
  onRemoveQueuedFile,
  onSend,
  onEdit,
  onDeleteMe,
  onDeleteEveryone,
}: {
  person: ConnectPerson;
  messages: ConnectMessage[];
  messagesRef: React.RefObject<HTMLDivElement | null>;
  chatLoading: boolean;
  busyAction: string | null;
  draft: string;
  files: QueuedFile[];
  fileRef: React.RefObject<HTMLInputElement | null>;
  displayName: string;
  onProfile: () => void;
  onDraft: (value: string) => void;
  onAttachFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveQueuedFile: (fileId: number) => void;
  onSend: () => void;
  onEdit: (message: ConnectMessage) => void;
  onDeleteMe: (message: ConnectMessage) => void;
  onDeleteEveryone: (message: ConnectMessage) => void;
}) {
  const presence = presenceForPerson(person);

  return (
    <div className="glass-strong flex min-h-0 flex-col overflow-hidden rounded-3xl">
      <div className="shrink-0 border-b border-white/10 p-4">
        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={onProfile} className="flex min-w-0 items-center gap-3 text-left">
            <PresenceAvatar person={person} />
            <div className="min-w-0">
              <div className="font-display text-xl leading-tight">{person.name}</div>
              <div className="mt-1 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/40">
                <span className={presence === "Online" ? "text-emerald-200" : "text-white/40"}>{presence}</span>
                <span className="size-1 rounded-full bg-white/25" />
                <span>Friend chat</span>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={onProfile}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/60 transition hover:text-white"
          >
            View profile
          </button>
        </div>
      </div>

      <div ref={messagesRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {chatLoading && messages.length === 0 && (
          <div className="grid min-h-full place-items-center text-sm text-white/45">
            <span>
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading messages...
            </span>
          </div>
        )}

        {!chatLoading && messages.length === 0 && (
          <div className="grid min-h-full place-items-center rounded-3xl border border-dashed border-white/12 text-center text-sm text-white/45">
            No messages yet. Start the conversation.
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onEdit={() => onEdit(message)}
            onDeleteMe={() => onDeleteMe(message)}
            onDeleteEveryone={() => onDeleteEveryone(message)}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#080808]/80 p-4 backdrop-blur-xl">
        {files.length > 0 && (
          <div className="mb-3 flex max-h-20 flex-wrap gap-2 overflow-y-auto">
            {files.map((file) => (
              <span
                key={file.id}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-white/70"
              >
                <File className="size-3.5" />
                <span className="max-w-[220px] truncate">{file.name}</span>
                <span className="text-white/35">{file.size}</span>
                <button
                  type="button"
                  onClick={() => onRemoveQueuedFile(file.id)}
                  className="text-white/35 hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={onAttachFiles} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="grid size-10 place-items-center rounded-xl text-white/55 transition hover:bg-white/10 hover:text-white"
            title="Attach file"
          >
            <Paperclip className="size-4" />
          </button>
          <div className="flex gap-1">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onDraft(`${draft}${emoji}`)}
                className="rounded-lg px-1.5 py-1 text-sm hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
          <input
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSend();
            }}
            placeholder={`Message as ${displayName.split(" ")[0] || "CampusVerse"}...`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/35"
          />
          <button
            type="button"
            disabled={busyAction === "send-message" || (!draft.trim() && files.length === 0)}
            onClick={onSend}
            className="grid size-10 place-items-center rounded-xl text-white disabled:opacity-35"
            style={{ background: "var(--grad-aurora)" }}
          >
            {busyAction === "send-message" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onEdit,
  onDeleteMe,
  onDeleteEveryone,
}: {
  message: ConnectMessage;
  onEdit: () => void;
  onDeleteMe: () => void;
  onDeleteEveryone: () => void;
}) {
  const mine = message.author === "me";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${mine ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[82%] rounded-3xl px-4 py-3 text-sm ${mine ? "bg-white text-black" : "glass text-white"}`}>
        {message.deletedForEveryone ? (
          <span className={mine ? "text-black/50" : "text-white/40"}>This message was deleted</span>
        ) : (
          <>
            {message.text && <div className="whitespace-pre-wrap break-words">{message.text}</div>}
            {message.files.length > 0 && (
              <div className="mt-2 space-y-2">
                {message.files.map((file) => (
                  <a
                    key={file.id}
                    href={resolveResourceUrl(file.url)}
                    target="_blank"
                    rel="noreferrer"
                    download={file.name}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${
                      mine ? "bg-black/10 text-black" : "bg-white/10 text-white"
                    }`}
                  >
                    {file.type.startsWith("image/") ? (
                      <Image className="size-4" />
                    ) : file.type.startsWith("video/") ? (
                      <Video className="size-4" />
                    ) : (
                      <File className="size-4" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-xs opacity-60">{file.size}</span>
                    <Download className="size-3.5" />
                  </a>
                ))}
              </div>
            )}
          </>
        )}
        <div className={`mt-2 flex flex-wrap items-center gap-2 text-[10px] ${mine ? "text-black/45" : "text-white/35"}`}>
          <span>{message.time}</span>
          {message.edited && <span>edited</span>}
          {!message.deletedForEveryone && (
            <>
              {mine && (
                <button type="button" onClick={onEdit} className="hover:underline">
                  <Edit3 className="inline size-3" /> Edit
                </button>
              )}
              <button type="button" onClick={onDeleteMe} className="hover:underline">
                Delete for me
              </button>
              {mine && (
                <button type="button" onClick={onDeleteEveryone} className="hover:underline">
                  Delete everyone
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function PresenceAvatar({ person, large = false }: { person: ConnectPerson; large?: boolean }) {
  const online = presenceForPerson(person) === "Online";
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar label={person.avatar} large={large} />
      <span
        className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[#111] ${
          large ? "size-4" : "size-3"
        } ${online ? "bg-emerald-400" : "bg-white/35"}`}
      />
    </span>
  );
}

function Avatar({ label, large = false }: { label: string; large?: boolean }) {
  return (
    <span
      className={`${large ? "size-20 text-xl" : "size-11 text-sm"} flex shrink-0 items-center justify-center rounded-2xl font-semibold`}
      style={{ background: "var(--grad-aurora)" }}
    >
      {label}
    </span>
  );
}

function RelationPill({ status }: { status: ConnectStatus }) {
  const label =
    status === "friend"
      ? "Friend"
      : status === "sent"
        ? "Sent"
        : status === "received"
          ? "Request"
          : status === "blocked"
            ? "Blocked"
            : status === "blocked_by_them"
              ? "Blocked"
              : "Open";
  return (
    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/55">
      {label}
    </span>
  );
}

function MiniCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3">
      <div className="truncate text-[9px] uppercase tracking-[0.14em] text-white/35">{label}</div>
      <div className="mt-1 font-display text-2xl">{value}</div>
    </div>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 backdrop-blur">
      <div className="truncate text-[9px] uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-1 truncate font-display text-sm text-white/85">{value}</div>
    </div>
  );
}

function ProfileLine({
  icon: Icon = BadgeCheck,
  label,
  value,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-white/18 hover:bg-white/[0.055]">
      <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-white/55">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</div>
        <div className="mt-1 break-words text-sm text-white/75">{value}</div>
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  tone = "primary",
  disabled = false,
  loading = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "primary" | "danger" | "muted" | "success";
  disabled?: boolean;
  loading?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-300/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
      : tone === "success"
        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
        : tone === "muted"
          ? "border-white/10 bg-white/[0.05] text-white/60 hover:text-white"
          : "border-fuchsia-300/25 bg-fuchsia-400/10 text-white hover:bg-fuchsia-400/20";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-55 ${toneClass}`}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {label}
    </button>
  );
}

function chooseDefaultPerson(people: ConnectPerson[]) {
  return (people.find((person) => person.status === "friend") ?? people[0] ?? null)?.id ?? null;
}

function presenceForPerson(person: ConnectPerson) {
  return person.online ? "Online" : "Offline";
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function iconForDetail(key: string): ComponentType<{ className?: string }> {
  const normalized = key.toLowerCase();
  if (normalized.includes("roll")) return Hash;
  if (normalized.includes("address")) return MapPin;
  if (normalized.includes("education") || normalized.includes("semester")) return GraduationCap;
  if (normalized.includes("expertise") || normalized.includes("designation")) return BadgeCheck;
  if (normalized.includes("document") || normalized.includes("verification")) return BookOpen;
  return BadgeCheck;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
