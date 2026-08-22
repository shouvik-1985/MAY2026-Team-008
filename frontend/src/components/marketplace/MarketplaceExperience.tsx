import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  createMarketplacePurchaseOrder,
  createMarketplaceItem,
  deleteMarketplaceItem,
  editMarketplaceItem,
  getMarketplaceItems,
  getMarketplaceMeta,
  getMarketplaceNotesPreview,
  getMarketplacePurchases,
  resolveResourceUrl,
  updateMarketplaceItem,
  verifyMarketplacePurchasePayment,
  type MarketplaceItem,
  type MarketplacePurchase,
  type NotesPreviewPayload,
} from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
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

const studentCreateOptions = ["Handwritten Notes", "Short Notes"];
const RAZORPAY_SCRIPT_ID = "razorpay-checkout-js";
const MARKETPLACE_TOAST_TIMEOUT_MS = 5_000;

type MarketplaceToastTone = "danger" | "success" | "error";
type MarketplaceToastState = {
  id: number;
  message: string;
  tone: MarketplaceToastTone;
  busy?: boolean;
};

type RazorpayCheckoutResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
  };
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
  handler: (response: RazorpayCheckoutResponse) => void | Promise<void>;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

function loadRazorpayCheckout() {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay checkout is available in the browser only"));
  if (window.Razorpay) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(RAZORPAY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Could not load Razorpay checkout")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = RAZORPAY_SCRIPT_ID;
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

function getInputClass(isDark: boolean) {
  return [
    "w-full rounded-[22px] border px-4 py-3 text-sm outline-none transition",
    isDark
      ? "border-white/10 bg-white/[0.04] text-white placeholder:text-white/28 focus:border-emerald-200/40"
      : "border-slate-300 bg-slate-100 text-slate-900 placeholder:text-slate-500 focus:border-emerald-500",
  ].join(" ");
}

export function MarketplaceExperience({ mode, embedded = false }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const inputClass = getInputClass(isDark);
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selected, setSelected] = useState<MarketplaceItem | null>(null);
  const [preview, setPreview] = useState<NotesPreviewPayload | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MarketplaceItem | null>(null);
  const [galleryItem, setGalleryItem] = useState<MarketplaceItem | null>(null);
  const [isPurchasesOpen, setIsPurchasesOpen] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<MarketplacePurchase[]>([]);
  const [isPurchaseLoading, setIsPurchaseLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<MarketplaceToastState | null>(null);
  const [sortBy, setSortBy] = useState<"latest" | "priceAsc" | "priceDesc">("latest");
  const [form, setForm] = useState<ListingFormState>(emptyForm);
  const user = getStoredUser();

  const isAdmin = mode === "admin";

  function showToast(message: string, tone: MarketplaceToastTone = "success", busy = false) {
    setToast({
      id: Date.now(),
      message,
      tone,
      busy,
    });
  }

  function clearToast() {
    setToast(null);
  }

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
        showToast(error instanceof Error ? error.message : "Marketplace failed to load", "error");
      })
      .finally(() => {
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, MARKETPLACE_TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  function patchMarketplaceItem(updatedItem: MarketplaceItem) {
    setItems((current) => current.map((item) => (sameMarketplaceItem(item, updatedItem) ? updatedItem : item)));
    setSelected((current) => (current && sameMarketplaceItem(current, updatedItem) ? updatedItem : current));
  }

  function removeMarketplaceItemLocally(itemToRemove: MarketplaceItem) {
    const remainingItems = items.filter((item) => !sameMarketplaceItem(item, itemToRemove));
    setItems(remainingItems);
    setSelected((current) => (current && sameMarketplaceItem(current, itemToRemove) ? remainingItems[0] ?? null : current));
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
    clearToast();
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
      const res = editingItem?.key
        ? await editMarketplaceItem(editingItem.key, data)
        : await createMarketplaceItem(data);
      showToast(res.message);
      setIsComposerOpen(false);
      setEditingItem(null);
      setForm({ ...emptyForm, category: isAdmin ? emptyForm.category : "Notes", subcategory: studentCreateOptions[0] });
      await refreshItems(res.item.key);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create listing", "error");
    } finally {
      setIsSaving(false);
    }
  }

  function openEdit(item: MarketplaceItem) {
    setEditingItem(item);
    setForm({
      title: item.name,
      price: item.price.replace(/^[^\d]*/, ""),
      description: item.description || "",
      category: item.category || "Notes",
      subcategory: item.subcategory || (item.category === "Notes" ? "Handwritten Notes" : "General"),
      semester: item.semester || "",
      subject: item.subject || "",
      condition: item.condition || "Excellent",
      tag: item.tag || "Campus Verified",
      thumbnail: null,
      images: [],
      previewImages: [],
      notesPdf: null,
    });
    setIsComposerOpen(true);
  }

  function openGallery(item: MarketplaceItem) {
    if (!getGalleryImages(item).length) return;
    setGalleryItem(item);
  }

  async function openPreview(item: MarketplaceItem) {
    if (!item.key || !item.isNotes) return;
    setBusyKey(item.key);
    try {
      const res = await getMarketplaceNotesPreview(item.key);
      setPreview(res);
      setIsPreviewOpen(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not open preview", "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function openPurchaseHistory() {
    if (!isAdmin) return;
    setIsPurchasesOpen(true);
    setIsPurchaseLoading(true);
    clearToast();
    try {
      const res = await getMarketplacePurchases();
      setPurchaseHistory(res.purchases);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load marketplace purchases", "error");
    } finally {
      setIsPurchaseLoading(false);
    }
  }

  async function purchase(item: MarketplaceItem) {
    if (!item.key) return;
    if (isSoldListing(item)) {
      showToast("This listing is already sold.", "danger");
      return;
    }

    setBusyKey(item.key);
    showToast("Opening secure Razorpay checkout...", "success", true);
    try {
      const order = await createMarketplacePurchaseOrder(item.key);
      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay checkout did not initialize");

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "CampusVerse",
        description: `${item.name} marketplace purchase`,
        order_id: order.orderId,
        prefill: {
          name: user?.full_name,
          email: user?.email,
        },
        theme: {
          color: "#4caf50",
        },
        modal: {
          ondismiss: () => {
            showToast("Razorpay checkout closed before purchase completion.", "danger");
            setBusyKey(null);
          },
        },
        handler: async (response) => {
          showToast("Verifying marketplace purchase...", "success", true);
          try {
            const verified = await verifyMarketplacePurchasePayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            showToast(verified.message || "Marketplace purchase verified.");
            await refreshItems(verified.item.key);
            setSelected((current) => (current?.key === verified.item.key ? verified.item : current));
          } catch (error) {
            showToast(error instanceof Error ? error.message : "Marketplace purchase verification failed", "error");
          } finally {
            setBusyKey(null);
          }
        },
      });
      checkout.open();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not start marketplace purchase", "error");
      setBusyKey(null);
    }
  }

  async function toggleItem(item: MarketplaceItem, payload: Record<string, unknown>, success: string, tone: MarketplaceToastTone = "success") {
    if (!item.key) return;
    setBusyKey(item.key);
    try {
      const res = await updateMarketplaceItem(item.key, payload);
      patchMarketplaceItem(res.item);
      showToast(res.message || success, tone);
      void refreshItems(item.key).catch(() => undefined);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Update failed", "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeItem(item: MarketplaceItem) {
    if (!item.key) return;
    setBusyKey(item.key);
    try {
      const res = await deleteMarketplaceItem(item.key);
      removeMarketplaceItemLocally(item);
      showToast(res.message, "danger");
      void refreshItems().catch(() => undefined);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Delete failed", "error");
    } finally {
      setBusyKey(null);
    }
  }

  const wrapperClass = embedded ? "" : "pb-8";

  return (
    <PageTransition>
      <div className={wrapperClass}>
        <AnimatePresence>
          {toast ? <MarketplaceActionToast toast={toast} /> : null}
        </AnimatePresence>

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
          <div className="flex flex-wrap gap-2 self-start">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => void openPurchaseHistory()}
                className={`inline-flex items-center gap-2 rounded-full border px-5 py-3 text-xs font-extrabold uppercase tracking-[0.2em] transition ${
                  isDark
                    ? "border-white/10 bg-white/[0.05] text-white/75 hover:border-white/20 hover:text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100 shadow-2xs"
                }`}
              >
                <ReceiptText className="size-4" />
                Purchases
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsComposerOpen(true)}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-xs font-extrabold uppercase tracking-[0.2em] text-white shadow-md transition hover:opacity-90 ${
                isDark ? "border border-emerald-300/20 bg-[var(--grad-aurora)] shadow-2xl" : "bg-gradient-to-r from-green-600 via-emerald-500 to-lime-400"
              }`}
            >
              <Plus className="size-4" />
              {isAdmin ? "Add New Listing" : "Post Item For Sale"}
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1">
            <Search className={`absolute left-4 top-1/2 size-4 -translate-y-1/2 ${isDark ? "text-white/35" : "text-slate-400"}`} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isAdmin ? "Search listings, sellers, categories..." : "Search products, notes, sellers..."}
              className={`w-full rounded-full border py-3 pl-11 pr-4 text-sm outline-none transition ${
                isDark
                  ? "border-white/10 bg-white/[0.04] text-white placeholder:text-white/30"
                  : "border-slate-300 bg-white text-slate-950 font-semibold placeholder:text-slate-400 shadow-2xs focus:border-indigo-600"
              }`}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] transition ${
                  activeCategory === category
                    ? "bg-gradient-to-r from-green-600 via-emerald-500 to-lime-400 text-slate-950 shadow-md"
                    : isDark
                      ? "border border-white/10 bg-white/[0.04] text-white/60 hover:text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:text-slate-950 shadow-2xs"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold uppercase tracking-[0.18em] ${
            isDark ? "border-white/10 bg-white/[0.04] text-white/50" : "border-slate-300 bg-white text-slate-700 shadow-2xs"
          }`}>
            <ArrowUpDown className="size-3.5" />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className="bg-transparent text-slate-900 dark:text-white outline-none font-bold"
              style={{ color: isDark ? "#ffffff" : "#0f172a" }}
            >
              <option value="latest" style={{ backgroundColor: isDark ? "#101010" : "#ffffff", color: isDark ? "#ffffff" : "#0f172a" }}>Latest</option>
              <option value="priceAsc" style={{ backgroundColor: isDark ? "#101010" : "#ffffff", color: isDark ? "#ffffff" : "#0f172a" }}>Price Low to High</option>
              <option value="priceDesc" style={{ backgroundColor: isDark ? "#101010" : "#ffffff", color: isDark ? "#ffffff" : "#0f172a" }}>Price High to Low</option>
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
                    onGallery={openGallery}
                    onPurchase={purchase}
                  />
                  <AdminActions
                    item={selected}
                    busy={busyKey === selected.key}
                    onAction={toggleItem}
                    onDelete={removeItem}
                    onEdit={openEdit}
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
                  onGallery={() => openGallery(item)}
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
            onGallery={openGallery}
            onPurchase={purchase}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {galleryItem ? (
          <GalleryModal item={galleryItem} onClose={() => setGalleryItem(null)} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isPreviewOpen && preview ? (
          <PreviewModal preview={preview} onClose={() => setIsPreviewOpen(false)} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isAdmin && isPurchasesOpen ? (
          <PurchaseHistoryModal
            purchases={purchaseHistory}
            loading={isPurchaseLoading}
            onClose={() => setIsPurchasesOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isComposerOpen ? (
          <ComposerModal
            mode={mode}
            editing={Boolean(editingItem)}
            form={form}
            saving={isSaving}
            onClose={() => {
              setIsComposerOpen(false);
              setEditingItem(null);
            }}
            onChange={updateForm}
            onFiles={onFiles}
            onSubmit={submitListing}
          />
        ) : null}
      </AnimatePresence>
    </PageTransition>
  );
}

function CardImage({ item }: { item: MarketplaceItem }) {
  const [failed, setFailed] = useState(false);
  const src = resolveCardImage(item);

  if (failed || !src) {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center p-4 text-center"
        style={{ background: "linear-gradient(135deg, #4caf50, #68c56d, #d8efbc)" }}
      >
        <ImageIcon className="size-10 text-white/80 mb-2" />
        <span className="font-display font-bold text-white text-base line-clamp-1">{item.name}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={item.name}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
    />
  );
}

function MarketplaceCard({
  item,
  busy,
  onView,
  onPreview,
  onGallery,
}: {
  item: MarketplaceItem;
  busy: boolean;
  onView: () => void;
  onPreview: () => void;
  onGallery: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const hasGallery = getGalleryImages(item).length > 0;

  return (
    <GlassCard hover className={`group flex h-full flex-col overflow-hidden border p-4 ${
      isDark ? "border-white/10" : "bg-white/95 border-slate-200 shadow-sm"
    }`}>
      <div className="relative h-56 overflow-hidden rounded-[28px] bg-slate-900">
        <CardImage item={item} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <Badge text={item.category} tone="emerald" />
          <Badge text={item.status ?? "Available"} tone="neutral" />
          {item.campusVerified ? <Badge text="Verified" tone="sky" /> : null}
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full bg-black/75 px-3 py-1 text-lg font-bold text-white backdrop-blur-md">
              {item.price}
            </div>
            <div className="mt-2 text-xs font-medium text-white/80">{item.seller}</div>
          </div>
          <button
            type="button"
            onClick={onPreview}
            disabled={busy || !item.isNotes}
            className="rounded-full border border-white/20 bg-black/60 px-3 py-2 text-[10px] uppercase tracking-[0.18em] font-bold text-white backdrop-blur-md disabled:opacity-40"
          >
            {busy ? "Opening..." : item.isNotes ? "Preview" : "Gallery"}
          </button>
        </div>
      </div>
      <div className={`mt-4 text-[10px] uppercase tracking-[0.24em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>{item.subcategory || item.category}</div>
      <div className={`mt-2 font-display text-xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>{item.name}</div>
      <p className={`mt-2 line-clamp-3 text-sm leading-6 font-medium ${isDark ? "text-white/55" : "text-slate-700"}`}>{item.description}</p>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={item.isNotes ? onPreview : onGallery}
          disabled={!item.isNotes && !hasGallery}
          className={`flex-1 rounded-full border px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] transition ${
            isDark ? "border-white/10 bg-white/[0.05] text-white/70" : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 shadow-2xs"
          } disabled:opacity-40`}
        >
          {item.isNotes ? "Preview" : "Gallery"}
        </button>
        <button
          type="button"
          onClick={onView}
          className="flex-1 rounded-full bg-gradient-to-r from-green-600 via-emerald-500 to-lime-400 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.18em] text-slate-950 shadow-md hover:opacity-90 transition"
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
  onGallery,
  onPurchase,
}: {
  item: MarketplaceItem;
  adminMode?: boolean;
  busy: boolean;
  onPreview: (item: MarketplaceItem) => void;
  onGallery: (item: MarketplaceItem) => void;
  onPurchase: (item: MarketplaceItem) => void;
}) {
  const gallery = item.gallery?.length ? item.gallery : [resolveCardImage(item)];
  const hasGallery = getGalleryImages(item).length > 0;
  const sold = isSoldListing(item);
  return (
    <GlassCard className="overflow-hidden border border-white/10 p-0">
      <div className="grid gap-0 lg:grid-cols-[1.2fr_minmax(0,0.8fr)]">
        <div className="relative h-[360px] overflow-hidden bg-slate-100 sm:h-[440px] lg:h-[520px] lg:self-start">
          <img src={resolveResourceUrl(gallery[0])} alt={item.name} className="h-full w-full object-contain" />
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
          <div className="grid grid-cols-1 gap-3">
            <Meta label="Seller" value={item.seller} icon={User} />
            <Meta label="Availability" value={item.availability || item.status || "Available"} icon={CheckCircle2} />
            <Meta label="Condition" value={item.condition || "Campus Listed"} icon={Sparkles} />
            <Meta label="Subject" value={item.subject || item.semester || "General"} icon={FileText} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => (item.isNotes ? onPreview(item) : onGallery(item))}
              disabled={!item.isNotes && !hasGallery}
              className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-xs uppercase tracking-[0.18em] text-white disabled:opacity-40"
            >
              {item.isNotes ? "Protected Preview" : "Open Gallery"}
            </button>
            {!adminMode ? (
              <button
                type="button"
                disabled={busy || sold}
                onClick={() => onPurchase(item)}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-black disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
                {busy ? "Opening..." : sold ? "Sold" : "Purchase"}
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
  onEdit,
}: {
  item: MarketplaceItem;
  busy: boolean;
  onAction: (item: MarketplaceItem, payload: Record<string, unknown>, success: string, tone?: MarketplaceToastTone) => Promise<void>;
  onDelete: (item: MarketplaceItem) => Promise<void>;
  onEdit: (item: MarketplaceItem) => void;
}) {
  const isHidden = item.visibility === "hidden";
  const isApproved = item.approvalStatus === "approved";
  const isSold = item.status === "Sold";

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-white/45">Admin actions</div>
        {busy ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
            <Loader2 className="size-3 animate-spin" />
            Working
          </span>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <AdminActionButton title="Edit listing details" disabled={busy} icon={Pencil} onClick={() => onEdit(item)}>
          Edit
        </AdminActionButton>
        <AdminActionButton
          title={isHidden ? "Restore listing visibility" : "Hide listing from students"}
          disabled={busy}
          icon={isHidden ? Eye : EyeOff}
          tone={isHidden ? "positive" : "danger"}
          onClick={() =>
            void onAction(
              item,
              { visibility: isHidden ? "visible" : "hidden", deleted: false },
              isHidden ? "Listing restored" : "Listing hidden",
              isHidden ? "success" : "danger",
            )
          }
        >
          {isHidden ? "Restore" : "Hide"}
        </AdminActionButton>
        <AdminActionButton
          title={isApproved ? "Reject listing approval" : "Approve listing"}
          disabled={busy}
          icon={ShieldCheck}
          tone={isApproved ? "danger" : "positive"}
          onClick={() =>
            void onAction(
              item,
              { approvalStatus: isApproved ? "rejected" : "approved" },
              isApproved ? "Listing rejected" : "Listing approved",
              isApproved ? "danger" : "success",
            )
          }
        >
          {isApproved ? "Reject" : "Approve"}
        </AdminActionButton>
        <AdminActionButton
          title={isSold ? "Mark listing as available" : "Mark listing as sold"}
          disabled={busy}
          icon={CheckCircle2}
          onClick={() =>
            void onAction(
              item,
              { status: isSold ? "Available" : "Sold", availability: isSold ? "in_stock" : "sold" },
              isSold ? "Listing available" : "Listing marked sold",
            )
          }
        >
          {isSold ? "Available" : "Sold"}
        </AdminActionButton>
        <AdminActionButton title="Delete listing" disabled={busy} icon={Trash2} tone="danger" onClick={() => void onDelete(item)}>
          Delete
        </AdminActionButton>
      </div>
    </div>
  );
}

function AdminActionButton({
  children,
  disabled,
  icon: Icon,
  onClick,
  title,
  tone = "neutral",
}: {
  children: ReactNode;
  disabled: boolean;
  icon: typeof Pencil;
  onClick: () => void;
  title: string;
  tone?: "neutral" | "positive" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-300/20 bg-rose-500/10 text-rose-100 hover:border-rose-300/35 hover:bg-rose-500/15"
      : tone === "positive"
        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100 hover:border-emerald-300/35 hover:bg-emerald-400/15"
        : "border-white/10 bg-white/[0.05] text-white/75 hover:border-white/20 hover:bg-white/[0.075] hover:text-white";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.16em] transition disabled:cursor-wait disabled:opacity-50 ${toneClass}`}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </button>
  );
}

function MarketplaceActionToast({ toast }: { toast: MarketplaceToastState }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isNegative = toast.tone === "error" || toast.tone === "danger";
  const Icon = toast.busy ? Loader2 : isNegative ? AlertCircle : ShieldCheck;
  const label = toast.busy ? "Working" : toast.tone === "error" ? "Action failed" : "Marketplace updated";
  const toneClass = isNegative
    ? isDark
      ? "border-rose-300/25 bg-rose-950/85 text-rose-50 shadow-rose-950/30"
      : "border-rose-200 bg-rose-50 text-rose-950 shadow-rose-200/60"
    : isDark
      ? "border-emerald-300/25 bg-slate-950/90 text-emerald-50 shadow-emerald-950/30"
      : "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-emerald-200/60";
  const iconClass = isNegative ? "text-rose-300" : "text-emerald-300";

  return (
    <motion.div
      key={toast.id}
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      role={isNegative ? "alert" : "status"}
      aria-live="polite"
      className={`fixed right-5 top-5 z-[90] flex w-[min(92vw,420px)] items-center gap-3 rounded-[22px] border px-4 py-3 shadow-2xl backdrop-blur-2xl ${toneClass}`}
    >
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${isDark ? "bg-white/10" : "bg-white/70"}`}>
        <Icon className={`size-4 ${iconClass} ${toast.busy ? "animate-spin" : ""}`} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.28em] opacity-60">{label}</div>
        <div className="mt-1 truncate text-sm font-semibold">{toast.message}</div>
      </div>
    </motion.div>
  );
}

function ComposerModal({
  mode,
  editing,
  form,
  saving,
  onClose,
  onChange,
  onFiles,
  onSubmit,
}: {
  mode: "student" | "admin";
  editing: boolean;
  form: ListingFormState;
  saving: boolean;
  onClose: () => void;
  onChange: <K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) => void;
  onFiles: (event: ChangeEvent<HTMLInputElement>, field: "images" | "previewImages") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const inputClass = getInputClass(isDark);
  const isAdmin = mode === "admin";

  return (
    <ModalFrame onClose={onClose} title={editing ? "Edit Marketplace Listing" : isAdmin ? "Add New Marketplace Listing" : "Post Item For Sale"}>
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
                <option
                  key={option}
                  value={option}
                  className={isDark ? "bg-[#0a0b10] text-white" : "bg-white text-slate-900"}
                >
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
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full border px-4 py-3 text-xs uppercase tracking-[0.18em] transition ${
              isDark
                ? "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"
                : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`rounded-full px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition shadow-sm ${
              isDark
                ? "bg-white text-black"
                : "bg-slate-500 text-white hover:bg-slate-400"
            } disabled:opacity-50`}
          >
            {saving ? (editing ? "Saving..." : "Publishing...") : editing ? "Save Changes" : "Publish Listing"}
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
  onGallery,
  onPurchase,
}: {
  item: MarketplaceItem;
  busy: boolean;
  onClose: () => void;
  onPreview: (item: MarketplaceItem) => void;
  onGallery: (item: MarketplaceItem) => void;
  onPurchase: (item: MarketplaceItem) => void;
}) {
  return (
    <ModalFrame onClose={onClose} title="Listing Details" wide>
      <MarketplaceHeroCard item={item} busy={busy} onPreview={onPreview} onGallery={onGallery} onPurchase={onPurchase} />
    </ModalFrame>
  );
}

function GalleryModal({ item, onClose }: { item: MarketplaceItem; onClose: () => void }) {
  const images = getGalleryImages(item);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    setActiveIndex(0);
    setZoomed(false);
  }, [item.key]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setActiveIndex((current) => (current - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") setActiveIndex((current) => (current + 1) % images.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [images.length, onClose]);

  if (!images.length) return null;

  const activeImage = images[activeIndex];
  const canNavigate = images.length > 1;

  function goPrev() {
    setZoomed(false);
    setActiveIndex((current) => (current - 1 + images.length) % images.length);
  }

  function goNext() {
    setZoomed(false);
    setActiveIndex((current) => (current + 1) % images.length);
  }

  return (
    <ModalFrame onClose={onClose} title="Product Gallery" wide>
      <div className="space-y-4">
        <div
          className="relative overflow-hidden rounded-[30px] border border-white/10 bg-black"
          onTouchStart={(event) => setTouchStartX(event.changedTouches[0]?.clientX ?? null)}
          onTouchEnd={(event) => {
            const endX = event.changedTouches[0]?.clientX ?? null;
            if (touchStartX === null || endX === null) return;
            const delta = endX - touchStartX;
            if (Math.abs(delta) < 40) return;
            if (delta > 0) goPrev();
            else goNext();
          }}
        >
          <img
            src={resolveResourceUrl(activeImage)}
            alt={`${item.name} ${activeIndex + 1}`}
            onClick={() => setZoomed((current) => !current)}
            className={`h-[55vh] w-full object-contain transition duration-300 ${zoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"}`}
          />
          {canNavigate ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/55 p-3 text-white/80 backdrop-blur-md"
                aria-label="Previous image"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/55 p-3 text-white/80 backdrop-blur-md"
                aria-label="Next image"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          ) : null}
          <div className="absolute bottom-4 right-4 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/80 backdrop-blur-md">
            {activeIndex + 1} / {images.length}
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => {
                setZoomed(false);
                setActiveIndex(index);
              }}
              className={`overflow-hidden rounded-[20px] border transition ${
                activeIndex === index ? "border-white/30 bg-white/[0.08]" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <img src={resolveResourceUrl(image)} alt={`${item.name} thumbnail ${index + 1}`} className="h-20 w-20 object-cover" />
            </button>
          ))}
        </div>
      </div>
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

function PurchaseHistoryModal({
  purchases,
  loading,
  onClose,
}: {
  purchases: MarketplacePurchase[];
  loading: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const paidPurchases = purchases.filter((purchase) => purchase.status === "paid");
  const totalCollected = paidPurchases.reduce((sum, purchase) => sum + purchase.amount, 0);

  return (
    <ModalFrame onClose={onClose} title="Purchase Details" wide>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <PurchaseMetric label="Orders" value={String(purchases.length)} />
          <PurchaseMetric label="Verified" value={String(paidPurchases.length)} />
          <PurchaseMetric label="Collected" value={formatMarketplaceAmount(totalCollected, "INR")} />
        </div>

        <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
                <div className="h-4 w-1/4 rounded bg-white/[0.08]" />
                <div className="mt-3 h-6 w-2/3 rounded bg-white/[0.08]" />
                <div className="mt-3 h-4 w-1/2 rounded bg-white/[0.06]" />
              </div>
            ))
          ) : null}
          {!loading && !purchases.length ? (
            <div className={`rounded-[26px] border border-dashed p-8 text-center text-sm font-bold ${
              isDark ? "border-white/12 bg-white/[0.03] text-white/45" : "border-slate-300 bg-slate-50 text-slate-700"
            }`}>
              No marketplace purchases recorded yet.
            </div>
          ) : null}
          {!loading
            ? purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className={`rounded-[26px] border p-4 ${
                    isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className={`text-[10px] uppercase tracking-[0.22em] ${
                        isDark ? "text-white/35" : "text-slate-500"
                      }`}>
                        {purchase.itemCategory}
                      </div>
                      <div className={`mt-1 truncate font-display text-xl font-extrabold ${
                        isDark ? "text-white" : "text-slate-950"
                      }`}>
                        {purchase.itemName}
                      </div>
                      <div className={`mt-1 text-sm font-medium ${isDark ? "text-white/50" : "text-slate-600"}`}>
                        Seller: {purchase.sellerLabel}
                      </div>
                    </div>
                    <div className="min-w-0 lg:min-w-[260px]">
                      <div className={`text-sm font-bold ${isDark ? "text-white/85" : "text-slate-950"}`}>
                        {purchase.buyerName}
                        {purchase.buyerStudentCode ? ` / ${purchase.buyerStudentCode}` : ""}
                      </div>
                      <div className={`mt-1 truncate text-xs font-medium ${isDark ? "text-white/45" : "text-slate-600"}`}>
                        {purchase.buyerEmail}
                      </div>
                      <div className={`mt-2 text-xs font-semibold ${isDark ? "text-white/55" : "text-slate-700"}`}>
                        {formatMarketplaceDate(purchase.purchasedAt ?? purchase.createdAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 lg:justify-end">
                      <Badge text={purchase.status} tone={purchaseStatusTone(purchase.status)} />
                      <div className="text-right">
                        <div className={`font-display text-lg font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>
                          {formatMarketplaceAmount(purchase.amount, purchase.currency)}
                        </div>
                        <div className={`mt-1 max-w-[220px] truncate text-[10px] uppercase tracking-[0.18em] ${
                          isDark ? "text-white/35" : "text-slate-500"
                        }`}>
                          {purchase.razorpayPaymentId || purchase.razorpayOrderId || "Awaiting payment"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            : null}
        </div>
      </div>
    </ModalFrame>
  );
}

function PurchaseMetric({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-[24px] border p-4 ${
      isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50"
    }`}>
      <div className={`text-[10px] uppercase tracking-[0.24em] ${isDark ? "text-white/35" : "text-slate-500"}`}>
        {label}
      </div>
      <div className={`mt-2 font-display text-2xl font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>
        {value}
      </div>
    </div>
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
  const { theme } = useTheme();
  const isDark = theme === "dark";

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
          className={`relative w-full ${wide ? "max-w-6xl" : "max-w-3xl"} rounded-[34px] border p-6 shadow-2xl ${
            isDark ? "border-white/10 bg-[#0a0b10]" : "border-slate-200 bg-white"
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`absolute right-5 top-5 rounded-full border p-2 ${
              isDark ? "border-white/10 bg-white/[0.04] text-white/70" : "border-slate-300 bg-slate-100 text-slate-800"
            }`}
          >
            <X className="size-4" />
          </button>
          <div className={`mb-5 text-[10px] uppercase tracking-[0.28em] ${isDark ? "text-white/35" : "text-slate-500"}`}>{title}</div>
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}

function Badge({ text, tone }: { text: string; tone: "emerald" | "neutral" | "sky" | "rose" | "amber" }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const toneClass =
    tone === "emerald"
      ? isDark
        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
        : "border-emerald-300/20 bg-emerald-100/60 text-emerald-700"
      : tone === "sky"
        ? isDark
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
          : "border-emerald-300/20 bg-green-100/60 text-emerald-700"
        : tone === "rose"
          ? isDark
            ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
            : "border-rose-300/20 bg-rose-100/60 text-rose-700"
          : tone === "amber"
            ? isDark
              ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
              : "border-amber-300/20 bg-amber-100/60 text-amber-700"
            : isDark
              ? "border-white/10 bg-black/35 text-white/80"
              : "border-slate-300 bg-slate-100 text-slate-700";
  return <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${toneClass}`}>{text}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <label className="block">
      <div className={`mb-2 text-[10px] uppercase tracking-[0.24em] ${isDark ? "text-white/40" : "text-slate-500"}`}>{label}</div>
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
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <label className={`block rounded-[24px] border border-dashed p-4 ${
      isDark ? "border-white/12 bg-white/[0.03]" : "border-slate-300 bg-slate-100"
    }`}>
      <div className={`mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] ${
        isDark ? "text-white/40" : "text-slate-500"
      }`}>
        <ImageIcon className="size-3.5" />
        {label}
      </div>
      <input
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={onChange}
        className={`w-full text-sm ${isDark ? "text-white/60" : "text-slate-900"} file:mr-3 file:rounded-full file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-900`}
      />
    </label>
  );
}

function Meta({ label, value, icon: Icon }: { label: string; value: string; icon: typeof User }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`min-w-0 rounded-[20px] border p-4 ${isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50"}`}>
      <div className={`flex min-w-0 items-center gap-2 text-[10px] uppercase tracking-[0.16em] ${isDark ? "text-white/40" : "text-slate-500"}`}>
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={`mt-2 break-words text-sm font-medium ${isDark ? "text-white/80" : "text-slate-800"}`}>{value}</div>
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <div className={`rounded-[30px] border border-dashed px-5 py-10 text-center text-sm font-bold ${
      isDark
        ? "border-white/12 bg-white/[0.02] text-white/45"
        : "border-slate-300 bg-white/95 text-slate-800 shadow-2xs"
    }`}>
      {text}
    </div>
  );
}

function parsePrice(value?: string) {
  return Number((value || "").replace(/[^\d]/g, "")) || 0;
}

function isSoldListing(item: MarketplaceItem) {
  return (item.status || "").toLowerCase() === "sold" || (item.availability || "").toLowerCase() === "sold";
}

function sameMarketplaceItem(left?: MarketplaceItem | null, right?: MarketplaceItem | null) {
  if (!left || !right) return false;
  if (left.key && right.key) return left.key === right.key;
  return left.id === right.id;
}

function purchaseStatusTone(status: string): "emerald" | "neutral" | "sky" | "rose" | "amber" {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return "emerald";
  if (normalized === "failed") return "rose";
  if (normalized === "created" || normalized === "pending") return "amber";
  return "neutral";
}

function formatMarketplaceDate(value?: string | null) {
  if (!value) return "Awaiting payment";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMarketplaceAmount(value: number, currency?: string) {
  const prefix = (currency || "INR").toUpperCase() === "INR" ? "\u20B9" : currency || "INR";
  return `${prefix} ${Math.round(value || 0).toLocaleString("en-IN")}`;
}

function getGalleryImages(item: MarketplaceItem) {
  const unique = new Set<string>();
  const images = [...(item.gallery ?? []), item.thumbnailUrl ?? "", item.imageUrl ?? ""]
    .map((image) => image?.trim())
    .filter((image): image is string => Boolean(image));
  return images.filter((image) => {
    const resolved = resolveResourceUrl(image);
    if (!resolved || unique.has(resolved)) return false;
    unique.add(resolved);
    return true;
  });
}

function resolveCardImage(item: MarketplaceItem) {
  const source = item.thumbnailUrl || item.imageUrl || item.gallery?.[0] || "";
  return resolveResourceUrl(source) || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop";
}
