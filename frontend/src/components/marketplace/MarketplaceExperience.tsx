import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpDown,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  createMarketplaceItem,
  deleteMarketplaceItem,
  getMarketplaceItems,
  getMarketplaceMeta,
  getMarketplaceNotesPreview,
  inquireMarketplaceItem,
  resolveResourceUrl,
  updateMarketplaceItem,
  type MarketplaceItem,
  type NotesPreviewPayload,
} from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { GlassCard, PageTransition, SectionHeading } from "@/components/app/cinematic";

type Props = {
  mode: "student" | "admin";
  embedded?: boolean;
};

type ListingFormState = {
  title: string;
  price: string;
  description: string;
  category: string;
  subcategory: string;
  semester: string;
  subject: string;
  condition: string;
  tag: string;
  thumbnail: File | null;
  images: File[];
  previewImages: File[];
  notesPdf: File | null;
};

const emptyForm: ListingFormState = {
  title: "",
  price: "",
  description: "",
  category: "Notes",
  subcategory: "Handwritten Notes",
  semester: "",
  subject: "",
  condition: "Excellent",
  tag: "Campus Verified",
  thumbnail: null,
  images: [],
  previewImages: [],
  notesPdf: null,
};

const inputClass =
  "w-full rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28";

const studentCreateOptions = ["Handwritten Notes", "Short Notes"];

export function MarketplaceExperience({ mode, embedded = false }: Props) {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selected, setSelected] = useState<MarketplaceItem | null>(null);
  const [preview, setPreview] = useState<NotesPreviewPayload | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"latest" | "priceAsc" | "priceDesc">("latest");
  const [form, setForm] = useState<ListingFormState>(emptyForm);
  const user = getStoredUser();

  const isAdmin = mode === "admin";

  useEffect(() => {
    let live = true;
    setIsLoading(true);
    Promise.all([
      getMarketplaceItems({ includeHidden: isAdmin }),
      getMarketplaceMeta(),
    ])
      .then(([itemsRes, metaRes]) => {
        if (!live) return;
        setItems(itemsRes.items);
        setCategories(["All", ...metaRes.categories]);
        if (isAdmin) {
          setSelected((current) => current ?? itemsRes.items[0] ?? null);
        }
      })
      .catch((error) => {
        if (!live) return;
        setMessage(error instanceof Error ? error.message : "Marketplace failed to load");
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [isAdmin]);

  const filteredItems = useMemo(() => {
    let next = items.filter((item) => {
      const matchesCategory = activeCategory === "All" || item.category === activeCategory;
      const haystack = [
        item.name,
        item.category,
        item.subcategory,
        item.description,
        item.seller,
        item.subject,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesCategory && haystack.includes(query.toLowerCase());
    });
    if (sortBy === "priceAsc") next = [...next].sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    if (sortBy === "priceDesc") next = [...next].sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    return next;
  }, [activeCategory, items, query, sortBy]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!selected && filteredItems[0]) {
      setSelected(filteredItems[0]);
    } else if (selected && !filteredItems.some((item) => item.key === selected.key)) {
      setSelected(filteredItems[0] ?? null);
    }
  }, [filteredItems, isAdmin, selected]);

  async function refreshItems(focusKey?: string) {
    const res = await getMarketplaceItems({ includeHidden: isAdmin });
    setItems(res.items);
    if (focusKey) {
      const match = res.items.find((item) => item.key === focusKey);
      setSelected(match ?? (isAdmin ? res.items[0] ?? null : null));
    } else if (isAdmin && selected) {
      const match = res.items.find((item) => item.key === selected.key);
      setSelected(match ?? res.items[0] ?? null);
    }
  }

  function updateForm<K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>, field: "images" | "previewImages") {
    const nextFiles = Array.from(event.target.files ?? []);
    updateForm(field, nextFiles);
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const data = new FormData();
      data.append("title", form.title);
      data.append("price", form.price);
      data.append("description", form.description);
      data.append("category", isAdmin ? form.category : "Notes");
      data.append("subcategory", isAdmin ? form.subcategory : form.subcategory);
      data.append("semester", form.semester);
      data.append("subject", form.subject);
      data.append("condition", form.condition);
      data.append("tag", form.tag);
      data.append("preview_mode", "watermarked-pages");
      data.append("preview_pages", "2");
      if (form.thumbnail) data.append("thumbnail", form.thumbnail);
      form.images.forEach((file) => data.append("images", file));
      form.previewImages.forEach((file) => data.append("preview_images", file));
      if (form.notesPdf) data.append("notes_pdf", form.notesPdf);
      const res = await createMarketplaceItem(data);
      setMessage(res.message);
      setIsComposerOpen(false);
      setForm({ ...emptyForm, category: isAdmin ? emptyForm.category : "Notes", subcategory: studentCreateOptions[0] });
      await refreshItems(res.item.key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create listing");
    } finally {
      setIsSaving(false);
    }
  }

  async function openPreview(item: MarketplaceItem) {
    if (!item.key || !item.isNotes) return;
    setBusyKey(item.key);
    try {
      const res = await getMarketplaceNotesPreview(item.key);
      setPreview(res);
      setIsPreviewOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open preview");
    } finally {
      setBusyKey(null);
    }
  }

  async function inquire(item: MarketplaceItem) {
    if (!item.key) return;
    setBusyKey(item.key);
    try {
      const res = await inquireMarketplaceItem(item.key, {
        note: `Interested in ${item.name} for ${item.price}`,
      });
      setMessage(res.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send inquiry");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleItem(item: MarketplaceItem, payload: Record<string, unknown>, success: string) {
    if (!item.key) return;
    setBusyKey(item.key);
    try {
      await updateMarketplaceItem(item.key, payload);
      setMessage(success);
      await refreshItems(item.key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeItem(item: MarketplaceItem) {
    if (!item.key) return;
    setBusyKey(item.key);
    try {
      const res = await deleteMarketplaceItem(item.key);
      setMessage(res.message);
      await refreshItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusyKey(null);
    }
  }

  const wrapperClass = embedded ? "" : "pb-8";

  return (
    <PageTransition>
      <div className={wrapperClass}>
        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow={isAdmin ? "Campus Marketplace Control" : "Campus Peer Exchange"}
            title={isAdmin ? "Marketplace" : "Campus Marketplace"}
            sub={
              isAdmin
                ? "One shared marketplace inventory with premium browsing on the left and elevated controls on the right."
                : "Buy, sell, and browse a premium campus marketplace for notes, books, electronics, hostel gear, and more."
            }
          />
          <button
            type="button"
            onClick={() => setIsComposerOpen(true)}
            className="inline-flex items-center gap-2 self-start rounded-full border border-fuchsia-300/20 bg-[var(--grad-aurora)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-2xl"
          >
            <Plus className="size-4" />
            {isAdmin ? "Add New Listing" : "Post Item For Sale"}
          </button>
        </div>

        {message ? (
          <div className="mb-5 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/75">
            <ShieldCheck className="size-4 text-emerald-300" />
            {message}
          </div>
        ) : null}

        <div className="mb-5 flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isAdmin ? "Search listings, sellers, categories..." : "Search products, notes, sellers..."}
              className="w-full rounded-full border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/30"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.22em] transition ${
                  activeCategory === category
                    ? "bg-white text-black"
                    : "border border-white/10 bg-white/[0.04] text-white/60 hover:text-white"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-white/50">
            <ArrowUpDown className="size-3.5" />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className="bg-transparent text-white outline-none"
            >
              <option value="latest">Latest</option>
              <option value="priceAsc">Price Low to High</option>
              <option value="priceDesc">Price High to Low</option>
            </select>
          </div>
        </div>

        {isAdmin ? (
          <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="space-y-3">
              {isLoading ? <LoadingCards /> : null}
              {!isLoading && !filteredItems.length ? <EmptyState text="No marketplace listings matched this filter." /> : null}
              {filteredItems.map((item) => (
                <InventoryRow
                  key={item.key ?? item.id}
                  item={item}
                  selected={selected?.key === item.key}
                  onClick={() => setSelected(item)}
                />
              ))}
            </div>
            <div className="space-y-5">
              {selected ? (
                <>
                  <MarketplaceHeroCard
                    item={selected}
                    adminMode
                    busy={busyKey === selected.key}
                    onPreview={openPreview}
                    onInquire={inquire}
                  />
                  <AdminActions
                    item={selected}
                    busy={busyKey === selected.key}
                    onAction={toggleItem}
                    onDelete={removeItem}
                  />
                </>
              ) : (
                <EmptyState text="Select a listing to preview it and manage the shared marketplace record." />
              )}
            </div>
          </div>
        ) : (
          <>
            {isLoading ? <LoadingCards grid /> : null}
            {!isLoading && !filteredItems.length ? <EmptyState text="No marketplace listings matched this search." /> : null}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => (
                <MarketplaceCard
                  key={item.key ?? item.id}
                  item={item}
                  busy={busyKey === item.key}
                  onView={() => setSelected(item)}
                  onPreview={() => openPreview(item)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {!isAdmin && selected ? (
          <DetailModal
            item={selected}
            busy={busyKey === selected.key}
            onClose={() => setSelected(null)}
            onPreview={openPreview}
            onInquire={inquire}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isPreviewOpen && preview ? (
          <PreviewModal preview={preview} onClose={() => setIsPreviewOpen(false)} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isComposerOpen ? (
          <ComposerModal
            mode={mode}
            form={form}
            saving={isSaving}
            onClose={() => setIsComposerOpen(false)}
            onChange={updateForm}
            onFiles={onFiles}
            onSubmit={submitListing}
          />
        ) : null}
      </AnimatePresence>
    </PageTransition>
  );
}

function MarketplaceCard({
  item,
  busy,
  onView,
  onPreview,
}: {
  item: MarketplaceItem;
  busy: boolean;
  onView: () => void;
  onPreview: () => void;
}) {
  return (
    <GlassCard hover className="group flex h-full flex-col overflow-hidden border border-white/10 p-4">
      <div className="relative h-56 overflow-hidden rounded-[28px] bg-white/[0.04]">
        <img
          src={resolveCardImage(item)}
          alt={item.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <Badge text={item.category} tone="emerald" />
          <Badge text={item.status ?? "Available"} tone="neutral" />
          {item.campusVerified ? <Badge text="Verified" tone="sky" /> : null}
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full bg-black/60 px-3 py-1 text-lg font-bold text-white backdrop-blur-md">
              {item.price}
            </div>
            <div className="mt-2 text-xs text-white/70">{item.seller}</div>
          </div>
          <button
            type="button"
            onClick={onPreview}
            disabled={busy || !item.isNotes}
            className="rounded-full border border-white/15 bg-black/40 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-white/80 disabled:opacity-40"
          >
            {busy ? "Opening..." : item.isNotes ? "Preview" : "Gallery"}
          </button>
        </div>
      </div>
      <div className="mt-4 text-[10px] uppercase tracking-[0.24em] text-white/35">{item.subcategory || item.category}</div>
      <div className="mt-2 font-display text-xl text-white">{item.name}</div>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/55">{item.description}</p>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onPreview}
          className="flex-1 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/70"
        >
          {item.isNotes ? "Preview" : "Gallery"}
        </button>
        <button
          type="button"
          onClick={onView}
          className="flex-1 rounded-full bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-black"
        >
          View Details
        </button>
      </div>
    </GlassCard>
  );
}

function MarketplaceHeroCard({
  item,
  adminMode = false,
  busy,
  onPreview,
  onInquire,
}: {
  item: MarketplaceItem;
  adminMode?: boolean;
  busy: boolean;
  onPreview: (item: MarketplaceItem) => void;
  onInquire: (item: MarketplaceItem) => void;
}) {
  const gallery = item.gallery?.length ? item.gallery : [resolveCardImage(item)];
  return (
    <GlassCard className="overflow-hidden border border-white/10 p-0">
      <div className="grid gap-0 lg:grid-cols-[1.2fr_minmax(0,0.8fr)]">
        <div className="relative min-h-[320px] overflow-hidden">
          <img src={resolveResourceUrl(gallery[0])} alt={item.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
          <div className="absolute left-6 top-6 flex flex-wrap gap-2">
            <Badge text={item.category} tone="emerald" />
            <Badge text={item.visibility || "visible"} tone={item.visibility === "hidden" ? "rose" : "neutral"} />
            <Badge text={item.approvalStatus || "approved"} tone="sky" />
            {item.featured ? <Badge text="Featured" tone="amber" /> : null}
          </div>
        </div>
        <div className="space-y-5 p-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">{item.subcategory || item.category}</div>
            <h2 className="mt-2 font-display text-3xl text-white">{item.name}</h2>
            <div className="mt-3 text-3xl font-bold text-white">{item.price}</div>
          </div>
          <p className="text-sm leading-6 text-white/65">{item.description}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Meta label="Seller" value={item.seller} icon={User} />
            <Meta label="Availability" value={item.availability || item.status || "Available"} icon={CheckCircle2} />
            <Meta label="Condition" value={item.condition || "Campus Listed"} icon={Sparkles} />
            <Meta label="Subject" value={item.subject || item.semester || "General"} icon={FileText} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPreview(item)}
              className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white"
            >
              {item.isNotes ? "Protected Preview" : "Open Gallery"}
            </button>
            {!adminMode ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onInquire(item)}
                className="rounded-full bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-black disabled:opacity-50"
              >
                {busy ? "Sending..." : "Message Seller"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function InventoryRow({
  item,
  selected,
  onClick,
}: {
  item: MarketplaceItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[28px] border p-3 text-left transition ${
        selected
          ? "border-white/20 bg-white/[0.08]"
          : "border-white/10 bg-white/[0.04] hover:border-white/18 hover:bg-white/[0.06]"
      }`}
    >
      <div className="flex gap-3">
        <img src={resolveCardImage(item)} alt={item.name} className="h-20 w-20 rounded-2xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
            <span>{item.category}</span>
            <span>•</span>
            <span>{item.visibility || "visible"}</span>
          </div>
          <div className="mt-1 truncate font-medium text-white">{item.name}</div>
          <div className="mt-1 text-sm text-white/55">{item.seller}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge text={item.price} tone="neutral" />
            <Badge text={item.status || "Available"} tone="emerald" />
            <Badge text={item.approvalStatus || "approved"} tone="sky" />
          </div>
        </div>
      </div>
    </button>
  );
}

function AdminActions({
  item,
  busy,
  onAction,
  onDelete,
}: {
  item: MarketplaceItem;
  busy: boolean;
  onAction: (item: MarketplaceItem, payload: Record<string, unknown>, success: string) => Promise<void>;
  onDelete: (item: MarketplaceItem) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <ActionCard title="Visibility" body="Hide or restore the listing without splitting the dataset.">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAction(item, { visibility: item.visibility === "hidden" ? "visible" : "hidden" }, "Visibility updated")}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/75"
        >
          {item.visibility === "hidden" ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {item.visibility === "hidden" ? "Restore Listing" : "Hide Listing"}
        </button>
      </ActionCard>
      <ActionCard title="Approval" body="Approve or reject student-submitted note listings immediately.">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAction(item, { approvalStatus: item.approvalStatus === "approved" ? "rejected" : "approved" }, "Approval updated")}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/75"
        >
          <ShieldCheck className="size-4" />
          {item.approvalStatus === "approved" ? "Reject Listing" : "Approve Listing"}
        </button>
      </ActionCard>
      <ActionCard title="Feature" body="Push standout listings higher in the shared marketplace experience.">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAction(item, { featured: !item.featured }, "Featured state updated")}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/75"
        >
          <Star className="size-4" />
          {item.featured ? "Unfeature" : "Feature Listing"}
        </button>
      </ActionCard>
      <ActionCard title="Availability" body="Switch availability without touching the shared record identity.">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onAction(
              item,
              { status: item.status === "Sold" ? "Available" : "Sold", availability: item.status === "Sold" ? "in_stock" : "sold" },
              "Availability updated",
            )
          }
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/75"
        >
          <CheckCircle2 className="size-4" />
          {item.status === "Sold" ? "Mark Available" : "Change Availability"}
        </button>
      </ActionCard>
      <ActionCard title="Quick Edit" body="Promote notes to featured inventory or move categories with a lightweight patch.">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAction(item, { category: item.category === "Notes" ? "Books" : "Notes" }, "Category updated")}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/75"
        >
          <Pencil className="size-4" />
          Change Category
        </button>
      </ActionCard>
      <ActionCard title="Delete" body="Soft-delete the listing from the shared marketplace inventory.">
        <button type="button" disabled={busy} onClick={() => void onDelete(item)} className="inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-xs uppercase tracking-[0.18em] text-rose-100">
          <Trash2 className="size-4" />
          Delete Listing
        </button>
      </ActionCard>
    </div>
  );
}

function ComposerModal({
  mode,
  form,
  saving,
  onClose,
  onChange,
  onFiles,
  onSubmit,
}: {
  mode: "student" | "admin";
  form: ListingFormState;
  saving: boolean;
  onClose: () => void;
  onChange: <K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) => void;
  onFiles: (event: ChangeEvent<HTMLInputElement>, field: "images" | "previewImages") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const isAdmin = mode === "admin";
  return (
    <ModalFrame onClose={onClose} title={isAdmin ? "Add New Marketplace Listing" : "Post Item For Sale"}>
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <input value={form.title} onChange={(e) => onChange("title", e.target.value)} required className={inputClass} />
          </Field>
          <Field label="Price">
            <input value={form.price} onChange={(e) => onChange("price", e.target.value)} required className={inputClass} placeholder="e.g. 180" />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={isAdmin ? "Category" : "Listing Type"}>
            <select
              value={isAdmin ? form.category : form.subcategory}
              onChange={(e) => (isAdmin ? onChange("category", e.target.value) : onChange("subcategory", e.target.value))}
              className={inputClass}
            >
              {(isAdmin ? ["Notes", "Books", "Electronics", "Cycles", "Bags", "Hostel Essentials", "Professor Modules", "Accessories", "Other"] : studentCreateOptions).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <input value={form.condition} onChange={(e) => onChange("condition", e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Semester">
            <input value={form.semester} onChange={(e) => onChange("semester", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Subject">
            <input value={form.subject} onChange={(e) => onChange("subject", e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Description">
          <textarea value={form.description} onChange={(e) => onChange("description", e.target.value)} required rows={4} className={`${inputClass} min-h-[120px]`} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <UploadField label="Thumbnail" onChange={(e) => onChange("thumbnail", e.target.files?.[0] ?? null)} />
          <UploadField label="Preview Images" multiple onChange={(e) => onFiles(e, "previewImages")} />
          <UploadField label="Gallery Images" multiple onChange={(e) => onFiles(e, "images")} />
          <UploadField label="Complete Notes PDF (Optional)" accept=".pdf" onChange={(e) => onChange("notesPdf", e.target.files?.[0] ?? null)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white/65">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-full bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-black disabled:opacity-50">
            {saving ? "Publishing..." : "Publish Listing"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function DetailModal({
  item,
  busy,
  onClose,
  onPreview,
  onInquire,
}: {
  item: MarketplaceItem;
  busy: boolean;
  onClose: () => void;
  onPreview: (item: MarketplaceItem) => void;
  onInquire: (item: MarketplaceItem) => void;
}) {
  return (
    <ModalFrame onClose={onClose} title="Listing Details" wide>
      <MarketplaceHeroCard item={item} busy={busy} onPreview={onPreview} onInquire={onInquire} />
    </ModalFrame>
  );
}

function PreviewModal({ preview, onClose }: { preview: NotesPreviewPayload; onClose: () => void }) {
  const pages = preview.gallery.length
    ? preview.gallery
    : [
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop",
        "https://images.unsplash.com/photo-1517842645767-c639042777db?q=80&w=1200&auto=format&fit=crop",
      ];
  return (
    <ModalFrame onClose={onClose} title="Protected Notes Preview" wide>
      <div className="grid gap-4 md:grid-cols-2">
        {pages.slice(0, preview.previewPages).map((image, index) => (
          <div key={`${image}-${index}`} className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
            <img src={resolveResourceUrl(image)} alt={`Preview ${index + 1}`} className="h-72 w-full object-cover opacity-70 blur-[1px]" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.03))]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="-rotate-12 rounded-[30px] border border-white/15 bg-black/55 px-8 py-5 text-center backdrop-blur-md">
                {preview.watermarkLines.map((line) => (
                  <div key={line} className="text-sm font-semibold uppercase tracking-[0.28em] text-white/85">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[28px] border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
        Full notes PDF stays protected until a purchase or access flow grants permission.
      </div>
    </ModalFrame>
  );
}

function ModalFrame({
  children,
  onClose,
  title,
  wide = false,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 p-4 backdrop-blur-lg"
    >
      <div className="flex min-h-full items-center justify-center">
        <motion.div
          initial={{ y: 24, scale: 0.96 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 24, scale: 0.96 }}
          onClick={(event) => event.stopPropagation()}
          className={`relative w-full ${wide ? "max-w-6xl" : "max-w-3xl"} rounded-[34px] border border-white/10 bg-[#0a0b10] p-6 shadow-2xl`}
        >
          <button type="button" onClick={onClose} className="absolute right-5 top-5 rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/70">
            <X className="size-4" />
          </button>
          <div className="mb-5 text-[10px] uppercase tracking-[0.28em] text-white/35">{title}</div>
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}

function Badge({ text, tone }: { text: string; tone: "emerald" | "neutral" | "sky" | "rose" | "amber" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : tone === "sky"
        ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
        : tone === "rose"
          ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
          : tone === "amber"
            ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
            : "border-white/10 bg-black/35 text-white/80";
  return <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${toneClass}`}>{text}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-white/40">{label}</div>
      {children}
    </label>
  );
}

function UploadField({
  label,
  onChange,
  multiple = false,
  accept,
}: {
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  multiple?: boolean;
  accept?: string;
}) {
  return (
    <label className="block rounded-[24px] border border-dashed border-white/12 bg-white/[0.03] p-4">
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/40">
        <ImageIcon className="size-3.5" />
        {label}
      </div>
      <input type="file" multiple={multiple} accept={accept} onChange={onChange} className="w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-black" />
    </label>
  );
}

function ActionCard({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <GlassCard className="border border-white/10 p-5">
      <div className="text-sm font-medium text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/55">{body}</div>
      <div className="mt-4">{children}</div>
    </GlassCard>
  );
}

function Meta({ label, value, icon: Icon }: { label: string; value: string; icon: typeof User }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/40">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-2 text-sm text-white/80">{value}</div>
    </div>
  );
}

function LoadingCards({ grid = false }: { grid?: boolean }) {
  const cards = Array.from({ length: grid ? 6 : 4 });
  return (
    <div className={grid ? "grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
      {cards.map((_, index) => (
        <div key={index} className="animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
          <div className="h-44 rounded-[24px] bg-white/[0.05]" />
          <div className="mt-4 h-4 w-1/3 rounded bg-white/[0.06]" />
          <div className="mt-3 h-6 w-2/3 rounded bg-white/[0.06]" />
          <div className="mt-2 h-4 w-full rounded bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-[30px] border border-dashed border-white/12 bg-white/[0.02] px-5 py-10 text-center text-sm text-white/45">{text}</div>;
}

function parsePrice(value?: string) {
  return Number((value || "").replace(/[^\d]/g, "")) || 0;
}

function resolveCardImage(item: MarketplaceItem) {
  const source = item.thumbnailUrl || item.imageUrl || item.gallery?.[0] || "";
  return resolveResourceUrl(source) || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop";
}
