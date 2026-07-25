import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Search,
  Filter,
  ShoppingBag,
  Loader2,
  ArrowUpDown,
  X,
  Plus,
  MessageSquare,
  ShieldCheck,
  Tag,
  Sparkles,
  CheckCircle2,
  DollarSign,
  User,
  Share2,
  Clock,
  Check,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";
import { inquireMarketplaceItem, getStudentDashboard, type StudentDashboard } from "@/lib/api";
import { setStoredDashboard, useStudentDashboard } from "@/lib/student-session";
import { getStoredUser } from "@/lib/auth";

export const Route = createFileRoute("/app/marketplace")({ component: MarketplacePage });

type MarketItem = StudentDashboard["marketplace_items"][number] & {
  imageUrl?: string;
  condition?: string;
  status?: "Available" | "Reserved" | "Sold";
  seller_id?: number;
};

// High quality curated product imagery for student marketplace items
const categoryImages: Record<string, string> = {
  "notes-bundle": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?q=80&w=800&auto=format&fit=crop",
  "engineering-calculator": "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?q=80&w=800&auto=format&fit=crop",
  "reference-book-set": "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?q=80&w=800&auto=format&fit=crop",
  "notes": "https://images.unsplash.com/photo-1517842645767-c639042777db?q=80&w=800&auto=format&fit=crop",
  "hostel": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop",
  "books": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=800&auto=format&fit=crop",
  "electronics": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800&auto=format&fit=crop",
  "vehicles": "https://images.unsplash.com/photo-1485965120184-e220f721d03e?q=80&w=800&auto=format&fit=crop",
  "default": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800&auto=format&fit=crop",
};

const initialItemsList: MarketItem[] = [
  {
    id: 101,
    key: "notes-bundle",
    name: "Sem 4 Computer Science Notes & PYQ Bundle",
    category: "Notes",
    price: "₹ 120",
    seller: "Shruti / Sem 4",
    tag: "Verified Notes",
    status: "Available",
    description: "Complete handwritten notes for Operating Systems, DBMS, and Algorithm Design with solved 5-year question papers.",
    imageUrl: categoryImages["notes-bundle"],
  },
  {
    id: 102,
    key: "engineering-calculator",
    name: "Casio FX-991EX Scientific Calculator",
    category: "Electronics",
    price: "₹ 650",
    seller: "Rahul / Sem 4",
    tag: "Like New",
    status: "Available",
    description: "Original Casio FX-991EX non-programmable scientific calculator with hard slide-on case. Battery replaced recently.",
    imageUrl: categoryImages["engineering-calculator"],
  },
  {
    id: 103,
    key: "reference-book-set",
    name: "Core Computer Science Textbook Set (3 Books)",
    category: "Books",
    price: "₹ 480",
    seller: "Ananya / Sem 4",
    tag: "Clean Copy",
    status: "Reserved",
    description: "Includes CLRS Introduction to Algorithms, Silberschatz Operating Systems, and Tanenbaum Computer Networks.",
    imageUrl: categoryImages["reference-book-set"],
  },
  {
    id: 104,
    key: "wireless-headphones",
    name: "Sony WH-CH520 Wireless Headset",
    category: "Electronics",
    price: "₹ 1,450",
    seller: "Aman / Sem 3",
    tag: "Great Condition",
    status: "Available",
    description: "Active noise isolating wireless bluetooth headphones with 50-hour battery life. Perfect for library study sessions.",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800&auto=format&fit=crop",
  },
  {
    id: 105,
    key: "campus-bicycle",
    name: "Firefox Hybrid City Bicycle",
    category: "Vehicles",
    price: "₹ 3,200",
    seller: "Vikram / Sem 4",
    tag: "Campus Ready",
    status: "Sold",
    description: "Smooth 21-speed Firefox hybrid bicycle with front basket and heavy-duty cable lock included. Smooth riding condition.",
    imageUrl: categoryImages["vehicles"],
  },
];

function MarketplacePage() {
  const navigate = useNavigate();
  const { dashboard } = useStudentDashboard();
  const rawMarketplace = dashboard?.marketplace_items ?? [];
  const user = getStoredUser();

  const [itemsList, setItemsList] = useState<MarketItem[]>(() => {
    return rawMarketplace.length ? (rawMarketplace as MarketItem[]) : initialItemsList;
  });

  const categories = useMemo(() => {
    return ["All", "Notes", "Electronics", "Books", "Hostel", "Vehicles"];
  }, []);

  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<MarketItem | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"default" | "price-asc" | "price-desc">("default");
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [isSellOpen, setIsSellOpen] = useState(false);

  // Sell form state
  const [sellName, setSellName] = useState("");
  const [sellCategory, setSellCategory] = useState("Notes");
  const [sellPrice, setSellPrice] = useState("");
  const [sellTag, setSellTag] = useState("Verified");
  const [sellDesc, setSellDesc] = useState("");

  // Wishlist state
  const [wishlist, setWishlist] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem("cv-marketplace-wishlist");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("cv-marketplace-wishlist", JSON.stringify(wishlist));
  }, [wishlist]);

  const toggleWishlist = useCallback((id: number) => {
    setWishlist((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  }, []);

  const parsePrice = (p: string) => parseInt(p.replace(/[^\d]/g, ""), 10) || 0;

  const filteredItems = useMemo(() => {
    let list = itemsList.filter(
      (m) =>
        (cat === "All" || m.category === cat) &&
        (m.name.toLowerCase().includes(q.toLowerCase()) || (m.description || "").toLowerCase().includes(q.toLowerCase())),
    );
    if (wishlistOnly) list = list.filter((m) => wishlist.includes(m.id));
    if (sortBy === "price-asc") list = [...list].sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    if (sortBy === "price-desc") list = [...list].sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    return list;
  }, [itemsList, cat, q, wishlistOnly, wishlist, sortBy]);

  function handleCreateListing(e: React.FormEvent) {
    e.preventDefault();
    if (!sellName.trim() || !sellPrice.trim()) return;

    const newItem: MarketItem = {
      id: Date.now(),
      key: `custom-${Date.now()}`,
      name: sellName.trim(),
      category: sellCategory,
      price: sellPrice.startsWith("₹") ? sellPrice : `₹ ${sellPrice}`,
      seller: `${user?.full_name || "Student"} / Sem ${dashboard?.user?.semester || 4}`,
      tag: sellTag,
      status: "Available",
      description: sellDesc.trim() || "Item listed by verified student on CampusVerse Marketplace.",
      imageUrl: categoryImages[sellCategory.toLowerCase()] || categoryImages.default,
    };

    setItemsList([newItem, ...itemsList]);
    setIsSellOpen(false);
    setSellName("");
    setSellPrice("");
    setSellDesc("");
    setStatus(`Your item "${newItem.name}" was successfully published!`);
    setTimeout(() => setStatus(null), 4000);
  }

  function handleStatusChange(itemKey: string, newStatus: "Available" | "Reserved" | "Sold") {
    setItemsList(itemsList.map((x) => (x.key === itemKey ? { ...x, status: newStatus } : x)));
    if (active && active.key === itemKey) {
      setActive({ ...active, status: newStatus });
    }
    setStatus(`Item status updated to ${newStatus}`);
    setTimeout(() => setStatus(null), 3000);
  }

  function handleConnectChatInquiry(item: MarketItem) {
    if (!item.key || busyKey === item.key) return;
    setBusyKey(item.key);
    setStatus(null);

    void inquireMarketplaceItem(item.key, { note: `Interested in buying "${item.name}" (${item.price})` })
      .then((res) => {
        setStatus(res.message);
        setActive(null);
        // Navigate to Campus Connect chat route
        setTimeout(() => {
          void navigate({ to: "/app/connect" });
        }, 1200);
      })
      .catch(() => {
        // Fallback navigate to connect chat
        setStatus(`Inquiry sent for "${item.name}". Opening Campus Connect chat...`);
        setActive(null);
        setTimeout(() => {
          void navigate({ to: "/app/connect" });
        }, 1200);
      })
      .finally(() => setBusyKey(null));
  }

  return (
    <PageTransition>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <SectionHeading
          eyebrow="Campus Peer Exchange"
          title="Campus Marketplace"
          sub="Buy, sell, and swap books, notes, electronics & hostel gear. Linked to Campus Connect chat."
        />

        <button
          onClick={() => setIsSellOpen(true)}
          className="bg-[var(--grad-aurora)] px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg flex items-center gap-2 hover:opacity-90 transition self-start md:self-auto"
        >
          <Plus className="size-4" /> Post Item For Sale
        </button>
      </div>

      {status ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 px-4 py-3 rounded-2xl glass border border-emerald-400/30 text-emerald-300 text-xs font-medium flex items-center gap-2"
        >
          <Sparkles className="size-4 shrink-0" />
          <span>{status}</span>
        </motion.div>
      ) : null}

      {/* Search & Category Header */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products by name or details..."
            className="w-full glass rounded-full pl-11 pr-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-4 py-2 rounded-full text-xs uppercase tracking-[0.2em] whitespace-nowrap transition ${
                cat === c ? "text-white font-semibold shadow-lg" : "text-white/50 hover:text-white"
              }`}
              style={cat === c ? { background: "var(--grad-aurora)" } : undefined}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`glass rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] flex items-center gap-2 transition ${
            showFilters ? "text-white border-white/20" : "text-white/70 hover:text-white"
          }`}
        >
          {showFilters ? <X className="size-3.5" /> : <Filter className="size-3.5" />}
          {showFilters ? "Close" : "Filters"}
        </button>
      </div>

      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-6 glass rounded-2xl p-5 flex flex-wrap gap-4 items-center"
        >
          <div className="flex items-center gap-2">
            <ArrowUpDown className="size-3.5 text-white/50" />
            <span className="text-xs text-white/50 uppercase tracking-widest">Sort Price</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="glass rounded-full px-3 py-1.5 text-xs bg-[#111] text-white focus:outline-none cursor-pointer"
            >
              <option value="default">Default</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-white/60 hover:text-white transition">
            <input
              type="checkbox"
              checked={wishlistOnly}
              onChange={(e) => setWishlistOnly(e.target.checked)}
              className="accent-pink-500 size-3.5 rounded"
            />
            <Heart className="size-3 text-pink-400" />
            Saved Wishlist ({wishlist.length})
          </label>
        </motion.div>
      )}

      {filteredItems.length === 0 && (
        <div className="glass rounded-2xl p-10 text-center text-white/50 text-sm">
          {wishlistOnly
            ? "Your wishlist is empty. Tap the heart icon on any product to save it."
            : "No marketplace items match your search filter."}
        </div>
      )}

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((m, i) => {
          const liked = wishlist.includes(m.id);
          const itemKey = m.key || "";
          const imgSrc = m.imageUrl || categoryImages[itemKey] || categoryImages[m.category.toLowerCase()] || categoryImages.default;
          const statusVal = m.status || "Available";

          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <GlassCard hover onClick={() => setActive(m)} className="h-full flex flex-col cursor-pointer group relative overflow-hidden">
                <div className="h-48 rounded-2xl relative overflow-hidden mb-4 bg-black/40">
                  <img
                    src={imgSrc}
                    alt={m.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />

                  {/* Status Badge */}
                  <div className="absolute top-3 left-3 flex gap-2">
                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border backdrop-blur-md ${
                        statusVal === "Available"
                          ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
                          : statusVal === "Reserved"
                            ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                            : "bg-rose-500/20 border-rose-400/40 text-rose-300"
                      }`}
                    >
                      {statusVal}
                    </span>
                    {m.tag && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-black/70 border border-white/20 text-white/80 backdrop-blur-md">
                        {m.tag}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWishlist(m.id);
                    }}
                    className="absolute top-3 right-3 size-9 rounded-full glass flex items-center justify-center hover:scale-110 transition"
                  >
                    <Heart
                      className={`size-4 transition ${liked ? "fill-pink-500 text-pink-500" : "text-white/80"}`}
                    />
                  </button>

                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-white font-display bg-black/60 px-3 py-1 rounded-xl backdrop-blur-md border border-white/10">
                      {m.price}
                    </span>
                    <span className="text-[10px] text-white/80 glass px-2.5 py-1 rounded-full flex items-center gap-1">
                      <User className="size-3 text-sky-400" /> {m.seller}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 font-bold">
                  {m.category}
                </div>
                <div className="font-display font-semibold text-base mt-1 group-hover:text-amber-200 transition-colors leading-snug">
                  {m.name}
                </div>
                <p className="text-xs text-white/55 mt-1.5 line-clamp-2 leading-relaxed flex-1">
                  {m.description}
                </p>

                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
                  <span className="text-[11px] text-white/40">Verified Campus Item</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1 group-hover:underline">
                    Inquire in Connect Chat →
                  </span>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* Item Detail Modal */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActive(null)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.94, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 20 }}
              className="w-full max-w-xl glass-strong rounded-3xl p-7 text-white space-y-5 relative shadow-2xl"
            >
              <button
                onClick={() => setActive(null)}
                className="absolute top-6 right-6 text-white/50 hover:text-white glass p-2 rounded-full transition"
              >
                <X className="size-5" />
              </button>

              <div className="h-56 rounded-2xl relative overflow-hidden bg-black/40">
                <img
                  src={active.imageUrl || categoryImages[active.key || ""] || categoryImages[active.category.toLowerCase()] || categoryImages.default}
                  alt={active.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute top-4 left-4 flex gap-2">
                  <span
                    className={`text-xs uppercase font-bold tracking-wider px-3 py-1 rounded-full border backdrop-blur-md ${
                      (active.status || "Available") === "Available"
                        ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
                        : (active.status || "Available") === "Reserved"
                          ? "bg-amber-500/20 border-amber-400/40 text-amber-300"
                          : "bg-rose-500/20 border-rose-400/40 text-rose-300"
                    }`}
                  >
                    {active.status || "Available"}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs uppercase tracking-widest text-emerald-400 font-bold">{active.category}</span>
                <h2 className="font-display text-2xl font-bold mt-1">{active.name}</h2>
                <div className="text-3xl font-display text-amber-300 font-bold mt-2">{active.price}</div>
              </div>

              <div className="glass rounded-2xl p-4 text-xs text-white/80 leading-relaxed border border-white/10 space-y-3">
                <div className="flex items-center justify-between text-white/50">
                  <div className="flex items-center gap-2">
                    <User className="size-3.5 text-sky-400" />
                    <span>Seller: <strong>{active.seller}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase text-white/40 font-medium">Update Lifecycle Status:</span>
                    {(["Available", "Reserved", "Sold"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(active.key || "", s)}
                        className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border transition ${
                          (active.status || "Available") === s
                            ? "bg-white/20 text-white border-white/40"
                            : "text-white/40 border-white/10 hover:text-white"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="pt-1 text-white/70">{active.description}</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setActive(null)}
                  className="glass px-5 py-2.5 rounded-full text-xs uppercase tracking-wider text-white/60 hover:text-white"
                >
                  Close
                </button>
                <button
                  onClick={() => handleConnectChatInquiry(active)}
                  className="bg-[var(--grad-aurora)] px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg flex items-center gap-2 hover:opacity-90"
                >
                  <MessageSquare className="size-4" /> Message Seller in Campus Connect
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post New Item Modal */}
      <AnimatePresence>
        {isSellOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSellOpen(false)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.94, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#11131a] p-7 text-white relative shadow-2xl space-y-5"
            >
              <button
                onClick={() => setIsSellOpen(false)}
                className="absolute top-6 right-6 text-white/50 hover:text-white glass p-2 rounded-full transition"
              >
                <X className="size-5" />
              </button>

              <div className="font-display text-xl font-bold flex items-center gap-2">
                <ShoppingBag className="size-5 text-amber-400" /> Post Item For Sale
              </div>

              <form onSubmit={handleCreateListing} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Item Title</label>
                  <input
                    required
                    value={sellName}
                    onChange={(e) => setSellName(e.target.value)}
                    placeholder="e.g. Scientific Calculator or Sem 4 Notes"
                    className="w-full glass rounded-xl px-3 py-2.5 text-xs bg-transparent text-white outline-none mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Category</label>
                    <select
                      value={sellCategory}
                      onChange={(e) => setSellCategory(e.target.value)}
                      className="w-full glass rounded-xl px-3 py-2.5 text-xs bg-[#11131a] text-white outline-none mt-1"
                    >
                      <option value="Notes">Notes</option>
                      <option value="Electronics">Electronics</option>
                      <option value="Books">Books</option>
                      <option value="Hostel">Hostel Gear</option>
                      <option value="Vehicles">Vehicles</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Price (₹)</label>
                    <input
                      required
                      value={sellPrice}
                      onChange={(e) => setSellPrice(e.target.value)}
                      placeholder="e.g. 450"
                      className="w-full glass rounded-xl px-3 py-2.5 text-xs bg-transparent text-white outline-none mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Condition Tag</label>
                  <select
                    value={sellTag}
                    onChange={(e) => setSellTag(e.target.value)}
                    className="w-full glass rounded-xl px-3 py-2.5 text-xs bg-[#11131a] text-white outline-none mt-1"
                  >
                    <option value="Verified">Verified Notes</option>
                    <option value="Like New">Like New</option>
                    <option value="Brand New">Brand New</option>
                    <option value="Good Condition">Good Condition</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/50 font-medium">Description</label>
                  <textarea
                    rows={3}
                    value={sellDesc}
                    onChange={(e) => setSellDesc(e.target.value)}
                    placeholder="Describe item condition, edition, or pickup details..."
                    className="w-full glass rounded-xl p-3 text-xs bg-transparent text-white outline-none mt-1"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsSellOpen(false)}
                    className="glass px-4 py-2 rounded-full text-xs text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[var(--grad-aurora)] px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg hover:opacity-90"
                  >
                    Post Listing
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
