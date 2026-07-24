import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Megaphone,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

export interface CampusNotification {
  id: string;
  title: string;
  body: string;
  category: "attendance" | "submission" | "announcement" | "system";
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  priority?: "urgent" | "normal";
}

const DEFAULT_NOTIFICATIONS: CampusNotification[] = [
  {
    id: "notif-1",
    title: "⚡ Biometric Check-In Alert",
    body: "3 assigned students checked into campus radius and are waiting for attendance confirmation.",
    category: "attendance",
    timestamp: "5 mins ago",
    read: false,
    actionUrl: "#academics",
    priority: "urgent",
  },
  {
    id: "notif-2",
    title: "📝 New Assignment Submission",
    body: "Aayush submitted 'Transformer Architecture & Distributed Systems Report' for review.",
    category: "submission",
    timestamp: "18 mins ago",
    read: false,
    actionUrl: "#reviews",
  },
  {
    id: "notif-3",
    title: "📢 Exam Schedule Released",
    body: "End-Semester Examination Schedule for July 2026 published to all students.",
    category: "announcement",
    timestamp: "1 hour ago",
    read: false,
    actionUrl: "#announcements",
  },
  {
    id: "notif-4",
    title: "🛡️ Campus Geo-Fence Active",
    body: "Biometric GPS radius verified for CampusVerse Central Building (radius: 200m).",
    category: "system",
    timestamp: "3 hours ago",
    read: true,
  },
];

export function NotificationCenter({
  open,
  onClose,
  onUnreadCountChange,
}: {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [notifications, setNotifications] = useState<CampusNotification[]>(DEFAULT_NOTIFICATIONS);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifs = notifications.filter((n) => {
    if (categoryFilter === "all") return true;
    return n.category === categoryFilter;
  });

  function markAllAsRead() {
    const next = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(next);
    onUnreadCountChange?.(0);
  }

  function markAsRead(id: string) {
    const next = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    setNotifications(next);
    onUnreadCountChange?.(next.filter((n) => !n.read).length);
  }

  function deleteNotif(id: string) {
    const next = notifications.filter((n) => n.id !== id);
    setNotifications(next);
    onUnreadCountChange?.(next.filter((n) => !n.read).length);
  }

  function getCategoryIcon(category: CampusNotification["category"]) {
    switch (category) {
      case "attendance":
        return <GraduationCap className="size-4 text-cyan-300" />;
      case "submission":
        return <ClipboardCheck className="size-4 text-emerald-300" />;
      case "announcement":
        return <Megaphone className="size-4 text-fuchsia-300" />;
      case "system":
        return <ShieldAlert className="size-4 text-amber-300" />;
      default:
        return <Bell className="size-4 text-white/70" />;
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
            <div className="h-full border border-white/10 bg-[#08080c]/95 backdrop-blur-2xl rounded-3xl flex flex-col overflow-hidden shadow-2xl shadow-black/80">
              {/* Header */}
              <div className="p-5 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative size-10 rounded-2xl bg-white/10 flex items-center justify-center">
                      <Bell className="size-5 text-cyan-200" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-md">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-display text-xl font-semibold text-white">
                        Campus Notifications
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                        {unreadCount > 0 ? `${unreadCount} unread updates` : "All notifications read"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="size-9 rounded-full bg-white/5 hover:bg-white/12 text-white/60 hover:text-white flex items-center justify-center transition"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Filter Pills */}
                <div className="mt-4 flex items-center justify-between gap-2 overflow-x-auto pt-2">
                  <div className="flex items-center gap-1.5">
                    {[
                      { key: "all", label: `All (${notifications.length})` },
                      { key: "attendance", label: "Attendance" },
                      { key: "submission", label: "Submissions" },
                      { key: "announcement", label: "Announcements" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setCategoryFilter(tab.key)}
                        className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.15em] transition shrink-0 ${
                          categoryFilter === tab.key
                            ? "bg-cyan-400/20 border border-cyan-400/40 text-cyan-200"
                            : "bg-white/[0.04] border border-white/10 text-white/50 hover:text-white"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline shrink-0"
                    >
                      <CheckCheck className="size-3.5" />
                      Read all
                    </button>
                  )}
                </div>
              </div>

              {/* Notification Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                        ? "border-white/5 bg-white/[0.02] text-white/70"
                        : "border-cyan-400/30 bg-cyan-400/[0.05] text-white shadow-lg shadow-cyan-950/20"
                    }`}
                  >
                    {!n.read && (
                      <span className="absolute top-4 right-4 size-2 rounded-full bg-cyan-400 pulse-glow" />
                    )}
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 size-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                        {getCategoryIcon(n.category)}
                      </div>
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm text-white truncate">{n.title}</div>
                        </div>
                        <p className="mt-1 text-xs text-white/60 leading-relaxed">{n.body}</p>
                        <div className="mt-2.5 flex items-center justify-between text-[10px] text-white/40">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3 text-white/30" />
                            {n.timestamp}
                          </span>
                          {n.actionUrl && (
                            <span className="inline-flex items-center gap-0.5 text-cyan-300 font-medium group-hover:translate-x-1 transition-transform">
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
                  <div className="py-16 text-center text-sm text-white/40 space-y-2">
                    <CheckCircle2 className="mx-auto size-8 text-white/20" />
                    <div>No notifications in this category.</div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-white/40">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  CampusVerse Real-Time Sync
                </span>
                <button
                  onClick={onClose}
                  className="text-white/60 hover:text-white transition"
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
