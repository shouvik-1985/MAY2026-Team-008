import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BookOpen,
  Briefcase,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Megaphone,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStudentDashboard } from "@/lib/student-session";
import type { StudentDashboard } from "@/lib/api";

export type BackendNotification = StudentDashboard["notifications"][number];

type CampusNotification = {
  id: string;
  title: string;
  body: string;
  category: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
};

function backendToLocal(n: BackendNotification): CampusNotification {
  return {
    id: String(n.id),
    title: n.title,
    body: n.body,
    category: (n.category ?? "announcement").toLowerCase(),
    timestamp: n.time ?? n.createdAt,
    read: n.read,
    actionUrl: "#announcements",
  };
}

export function NotificationCenter({
  open,
  onClose,
  onUnreadCountChange,
  externalNotifications,
}: {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
  /** Pass professor dashboard notifications here when in professor context */
  externalNotifications?: BackendNotification[];
}) {
  const { dashboard } = useStudentDashboard();
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("campus_read_notif_ids");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("campus_dismissed_notif_ids");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Save readIds to localStorage
  const saveReadIds = (nextSet: Set<string>) => {
    setReadIds(nextSet);
    try {
      localStorage.setItem("campus_read_notif_ids", JSON.stringify(Array.from(nextSet)));
    } catch {}
  };

  // Save dismissedIds to localStorage
  const saveDismissedIds = (nextSet: Set<string>) => {
    setDismissedIds(nextSet);
    try {
      localStorage.setItem("campus_dismissed_notif_ids", JSON.stringify(Array.from(nextSet)));
    } catch {}
  };

  // Use externalNotifications if provided and non-empty (professor), else fall back to student dashboard
  const raw: CampusNotification[] = useMemo(() => {
    const source = (externalNotifications && externalNotifications.length > 0)
      ? externalNotifications
      : (dashboard?.notifications ?? []);
    return source.map(backendToLocal);
  }, [externalNotifications, dashboard?.notifications]);

  const notifications: CampusNotification[] = useMemo(() => {
    return raw
      .filter((n) => !dismissedIds.has(n.id))
      .map((n) => ({
        ...n,
        read: n.read || readIds.has(n.id),
      }));
  }, [raw, readIds, dismissedIds]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const filteredNotifs = useMemo(() => {
    if (categoryFilter === "all") return notifications;
    return notifications.filter((n) => n.category === categoryFilter);
  }, [notifications, categoryFilter]);

  function markAllAsRead() {
    const next = new Set(readIds);
    notifications.forEach((n) => next.add(n.id));
    saveReadIds(next);
  }

  function markAsRead(id: string) {
    const next = new Set(readIds);
    next.add(id);
    saveReadIds(next);
  }

  function deleteNotif(id: string) {
    const next = new Set(dismissedIds);
    next.add(id);
    saveDismissedIds(next);
  }

  function getCategoryIcon(category: string) {
    switch (category.toLowerCase()) {
      case "academic":
        return <BookOpen className="size-4 text-purple-300" />;
      case "exam":
        return <ShieldAlert className="size-4 text-amber-300" />;
      case "placement":
        return <Briefcase className="size-4 text-cyan-300" />;
      case "events":
        return <Sparkles className="size-4 text-yellow-300" />;
      case "urgent":
        return <ShieldAlert className="size-4 text-rose-400" />;
      case "announcement":
      default:
        return <Megaphone className="size-4 text-fuchsia-300" />;
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] p-4"
          >
            <div className="h-full border border-white/12 bg-[#0a0a0f]/95 backdrop-blur-2xl rounded-3xl flex flex-col overflow-hidden shadow-2xl shadow-black/90">
              {/* Header */}
              <div className="p-5 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative size-10 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                      <Bell className="size-5 text-cyan-200" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-md animate-pulse">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-display text-lg font-semibold text-white">
                        Notifications
                      </div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                        {unreadCount > 0 ? `${unreadCount} unread updates` : "All notifications read"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 transition shadow-[0_0_12px_rgba(6,182,212,0.2)] cursor-pointer"
                        title="Mark all notifications as read"
                      >
                        <CheckCheck className="size-3.5" />
                        <span>Read all</span>
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="size-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/15 text-white/60 hover:text-white flex items-center justify-center transition"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Filter Pills - Scrollbar hidden */}
                <div className="mt-4 flex items-center justify-between gap-2 overflow-x-auto pt-1 pb-1 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex items-center gap-1.5 shrink-0">
                    {[
                      { key: "all", label: `All (${notifications.length})` },
                      { key: "announcement", label: "Announcements" },
                      { key: "academic", label: "Academic" },
                      { key: "exam", label: "Exam" },
                      { key: "placement", label: "Placement" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setCategoryFilter(tab.key)}
                        className={`rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-wider transition shrink-0 ${
                          categoryFilter === tab.key
                            ? "bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.2)] font-bold"
                            : "bg-white/[0.03] border border-white/10 text-white/50 hover:text-white hover:border-white/20"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notification Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filteredNotifs.map((n) => (
                  <motion.div
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => {
                      markAsRead(n.id);
                      if (n.actionUrl) {
                        window.location.hash = n.actionUrl;
                        onClose();
                      }
                    }}
                    className={`group relative rounded-2xl border p-4 transition cursor-pointer ${
                      n.read
                        ? "border-white/8 bg-white/[0.02] text-white/70 hover:border-white/20 hover:bg-white/[0.04]"
                        : "border-cyan-400/40 bg-gradient-to-r from-cyan-500/10 via-purple-500/5 to-transparent text-white shadow-lg shadow-cyan-950/30"
                    }`}
                  >
                    {!n.read && (
                      <span className="absolute top-4 right-4 size-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                    )}
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 size-9 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
                        {getCategoryIcon(n.category)}
                      </div>
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="font-semibold text-sm text-white group-hover:text-cyan-200 transition truncate">{n.title}</div>
                        <p className="mt-1 text-xs text-white/60 leading-relaxed line-clamp-2">{n.body}</p>
                        <div className="mt-2.5 flex items-center justify-between text-[10px] text-white/40 font-mono">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3 text-white/30" />
                            {n.timestamp}
                          </span>
                          {n.actionUrl && (
                            <span className="inline-flex items-center gap-0.5 text-cyan-300 font-sans font-medium group-hover:translate-x-1 transition-transform">
                              View details <ChevronRight className="size-3" />
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotif(n.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-rose-300 transition"
                        title="Dismiss"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}

                {filteredNotifs.length === 0 && (
                  <div className="py-20 text-center text-white/50 space-y-3">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                      <Bell className="size-6 text-white/30" />
                    </div>
                    <div className="text-sm font-semibold text-white/90">All caught up!</div>
                    <div className="text-xs text-white/40 max-w-[220px] mx-auto">
                      You have no unread notifications right now.
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-white/40 font-mono">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync Active
                </span>
                <button
                  onClick={onClose}
                  className="font-sans text-xs text-white/60 hover:text-white transition"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
