import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Heart, Search, Filter, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { type StudentDashboard } from "@/lib/api";
import { useStudentDashboard } from "@/lib/student-session";

export const Route = createFileRoute("/app/marketplace")({ component: MarketplacePage });

type MarketItem = StudentDashboard["marketplace_items"][number];

function MarketplacePage() {
  const { dashboard } = useStudentDashboard();
  const marketplace = dashboard?.marketplace_items ?? [];
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(marketplace.map((m) => m.category)))],
    [marketplace],
  );
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<MarketItem | null>(null);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const items = marketplace.filter(
    (m) => (cat === "All" || m.category === cat) && m.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Campus Market"
        title="Marketplace"
        sub="Buy, sell, swap. Trusted by your batchmates."
      />

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products..."
            className="w-full glass rounded-full pl-11 pr-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em] whitespace-nowrap transition ${cat === c ? "text-white" : "text-white/50 hover:text-white"}`}
              style={cat === c ? { background: "var(--grad-aurora)" } : undefined}
            >
              {c}
            </button>
          ))}
        </div>
        <button className="glass rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white flex items-center gap-2">
          <Filter className="size-3.5" /> Filters
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((m, i) => {
          const liked = wishlist.includes(m.id);
          return (
            <motion.button
              key={m.id}
              onClick={() => setActive(m)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -3 }}
              className="text-left"
            >
              <GlassCard hover className="h-full flex flex-col">
                <div
                  className="h-44 rounded-2xl relative overflow-hidden mb-4"
                  style={{
                    background: `linear-gradient(135deg, oklch(0.65 0.28 305 / 0.4), oklch(0.82 0.18 200 / 0.15))`,
                  }}
                >
                  <div className="absolute inset-0 grid-bg opacity-30" />
                  <ShoppingBag className="absolute inset-0 m-auto size-12 text-white/70" />
                  {m.tag && (
                    <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-black/40">
                      {m.tag}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setWishlist((w) =>
                        w.includes(m.id) ? w.filter((x) => x !== m.id) : [...w, m.id],
                      );
                    }}
                    className="absolute top-3 right-3 size-8 rounded-full glass flex items-center justify-center"
                  >
                    <Heart
                      className={`size-4 ${liked ? "fill-[oklch(0.72_0.27_350)] text-[oklch(0.72_0.27_350)]" : "text-white/70"}`}
                    />
                  </button>
                </div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                  {m.category}
                </div>
                <div className="font-medium mt-1 flex-1">{m.name}</div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="font-display text-lg">{m.price}</div>
                  <div className="text-xs text-white/45">{m.seller}</div>
                </div>
              </GlassCard>
            </motion.button>
          );
        })}
      </div>

      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setActive(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.92, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full max-w-2xl glass-strong rounded-3xl p-8"
          >
            <div
              className="h-56 rounded-2xl mb-6 relative overflow-hidden flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.65 0.28 305 / 0.5), oklch(0.82 0.18 200 / 0.2))",
              }}
            >
              <ShoppingBag className="size-16 text-white" />
            </div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
              {active.category}
            </div>
            <div className="font-display text-3xl mt-1">{active.name}</div>
            <div className="mt-3 text-sm text-white/55">
              Listed by {active.seller}. Verified student. Pickup on campus or hostel handover.
            </div>
            <div className="mt-6 flex items-center justify-between">
              <div className="font-display text-4xl">{active.price}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActive(null)}
                  className="glass rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.2em]"
                >
                  Close
                </button>
                <button className="relative overflow-hidden rounded-full px-7 py-2.5 text-xs uppercase tracking-[0.2em]">
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{ background: "var(--grad-aurora)" }}
                  />
                  <span className="absolute inset-px rounded-full bg-[#0a0a0a]/30" />
                  <span className="relative">Message seller</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </PageTransition>
  );
}
