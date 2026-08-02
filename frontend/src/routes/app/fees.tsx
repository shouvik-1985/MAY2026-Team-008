import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CreditCard, Download, Eye, Loader2 } from "lucide-react";
import { useState } from "react";
import { GlassCard, PageTransition, SectionHeading, Counter } from "@/components/app/cinematic";
import {
  createStudentFeeOrder,
  getStudentDashboard,
  openProtectedResource,
  verifyStudentFeePayment,
} from "@/lib/api";
import { setStoredDashboard, useStudentDashboard } from "@/lib/student-session";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/app/fees")({ component: FeesPage });

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

const RAZORPAY_SCRIPT_ID = "razorpay-checkout-js";

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

function FeesPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { dashboard } = useStudentDashboard();
  const [status, setStatus] = useState<string | null>(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const summary = dashboard?.fee_summary ?? {
    outstanding: 0,
    semester: "Syncing",
    dueDate: "Syncing",
    clearance: "Syncing",
    trend: [0, 0, 0, 0, 0, 0],
  };
  const history = dashboard?.fee_history ?? [];
  const series = summary.trend.length ? summary.trend : [0];
  const max = Math.max(...series, 1);
  const currentInvoice = summary.currentInvoiceId
    ? history.find((invoice) => invoice.id === summary.currentInvoiceId)
    : null;
  const payableInvoice =
    currentInvoice && currentInvoice.status !== "paid"
      ? currentInvoice
      : history.find((invoice) => invoice.status !== "paid") ?? null;
  const hasDue = summary.outstanding > 0 && Boolean(payableInvoice);
  const paying = Boolean(payingInvoiceId);

  async function handlePayNow() {
    if (!payableInvoice || paying) return;
    if (summary.razorpayEnabled === false) {
      setStatus("Razorpay keys are not configured on the backend yet.");
      return;
    }

    setPayingInvoiceId(payableInvoice.id);
    setStatus("Opening secure Razorpay checkout...");
    try {
      const order = await createStudentFeeOrder(payableInvoice.id);
      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay checkout did not initialize");

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "CampusVerse",
        description: `${payableInvoice.semester} fee payment`,
        order_id: order.orderId,
        prefill: {
          name: dashboard?.user.name,
          email: dashboard?.user.email,
        },
        theme: {
          color: "#a855f7",
        },
        modal: {
          ondismiss: () => {
            setStatus("Razorpay checkout closed before payment completion.");
            setPayingInvoiceId(null);
          },
        },
        handler: async (response) => {
          setStatus("Verifying Razorpay payment...");
          try {
            const verified = await verifyStudentFeePayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            const freshDashboard = await getStudentDashboard();
            setStoredDashboard(freshDashboard);
            setStatus(verified.message || "Payment verified and receipt synced.");
          } catch (error) {
            setStatus(error instanceof Error ? error.message : "Payment verification failed");
          } finally {
            setPayingInvoiceId(null);
          }
        },
      });
      checkout.open();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start Razorpay payment");
      setPayingInvoiceId(null);
    }
  }

  return (
    <PageTransition>
      <SectionHeading
        eyebrow="Treasury"
        title="Fee Payment"
        sub="Clear, secure, and beautifully transparent."
      />

      {status ? (
        <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${
          isDark ? "border-white/10 bg-white/[0.05] text-white/70" : "border-emerald-300 bg-emerald-50 text-emerald-950 font-bold"
        }`}>
          {status}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-5 mb-8">
        <GlassCard
          glow
          className={`lg:col-span-2 relative overflow-hidden transition-all ${
            isDark ? "bg-slate-900 text-white shadow-xl" : "border-[#E2E8F0] shadow-md text-[#1F2937]"
          }`}
          style={!isDark ? { background: "linear-gradient(135deg, #FFFFFF 0%, #F7F9FF 45%, #EEF4FF 100%)" } : undefined}
        >
          {isDark && (
            <>
              <div
                className="absolute inset-0 opacity-40"
                style={{ background: "var(--grad-aurora)" }}
              />
              <div className="absolute inset-px rounded-3xl bg-[#0a0a0a]/70" />
            </>
          )}
          {!isDark && (
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(109,93,246,0.08),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(6,182,212,0.06),transparent_40%)]" />
          )}
          <div className="relative">
            <div className={`text-[10px] uppercase tracking-[0.3em] font-extrabold ${isDark ? "text-white/70" : "text-[#64748B]"}`}>
              Outstanding balance
            </div>
            <div className={`font-display text-6xl md:text-7xl font-extrabold mt-3 drop-shadow-sm ${isDark ? "text-white" : "text-[#1F2937]"}`}>
              {"\u20B9"} <Counter value={summary.outstanding} />
            </div>
            <div className={`mt-2 text-sm font-bold ${isDark ? "text-white/70" : "text-[#64748B]"}`}>
              {summary.semester} / {hasDue ? `Due ${summary.dueDate}` : summary.clearance}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={!hasDue || paying}
                onClick={handlePayNow}
                className={`relative inline-flex items-center gap-2 overflow-hidden px-7 py-3 rounded-full text-xs font-extrabold uppercase tracking-[0.25em] shadow-md transition hover:scale-105 disabled:cursor-wait disabled:opacity-55 ${
                  isDark
                    ? "text-black"
                    : "bg-[#6D5DF6] hover:bg-[#5b4be3] text-white"
                }`}
              >
                {isDark ? <span className="absolute inset-0 rounded-full bg-white text-black" /> : null}
                <span className={`relative flex items-center gap-2 ${isDark ? "text-black" : "text-white"}`}>
                  {paying ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                  {paying ? "Opening" : hasDue ? "Pay now" : "Cleared"}
                </span>
              </button>
              <button
                onClick={() => {
                  const invoice = payableInvoice ?? history[0];
                  if (!invoice) return;
                  void openProtectedResource(`/api/student/fees/invoices/${invoice.id}`, {
                    fallbackName: `${invoice.id}.txt`,
                  }).catch((error) =>
                    setStatus(error instanceof Error ? error.message : "Could not view invoice"),
                  );
                }}
                className={`inline-flex items-center gap-2 rounded-full px-7 py-3 text-xs font-extrabold uppercase tracking-[0.25em] transition ${
                  isDark
                    ? "border border-white/30 bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
                    : "border border-[#CBD5E1] bg-white text-[#1E293B] hover:bg-slate-50 shadow-2xs"
                }`}
              >
                <Eye className="size-4" />
                View invoice
              </button>
            </div>
          </div>
        </GlassCard>

        <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
          <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>
            Configured semesters
          </div>
          <div className={`font-display text-xl font-extrabold mt-1 mb-5 ${isDark ? "text-white" : "text-slate-950"}`}>Fee trend</div>
          <div className="flex items-end gap-2 h-32">
            {series.map((v, i) => (
              <motion.div
                key={`${v}-${i}`}
                initial={{ height: 0 }}
                animate={{ height: `${(v / max) * 100}%` }}
                transition={{ delay: i * 0.06, duration: 0.8 }}
                className="flex-1 rounded-t-lg shadow-2xs"
                style={{
                  background: isDark
                    ? "linear-gradient(180deg, oklch(0.85 0.12 60), oklch(0.72 0.27 350 / 0.3))"
                    : "linear-gradient(180deg, #6366f1, #818cf8)",
                }}
              />
            ))}
          </div>
        </GlassCard>
      </div>

      <GlassCard className={!isDark ? "bg-white/95 border-slate-200 shadow-sm" : ""}>
        <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${isDark ? "text-white/40" : "text-slate-500"}`}>History</div>
        <div className={`font-display text-xl font-extrabold mt-1 mb-5 ${isDark ? "text-white" : "text-slate-950"}`}>Payments & receipts</div>
        <div className="space-y-3">
          {history.length === 0 && (
            <div className={`rounded-2xl p-4 text-sm font-medium border ${
              isDark ? "glass border-white/10 text-white/50" : "bg-slate-50 border-slate-200 text-slate-600"
            }`}>
              Receipts will appear here after your backend fee sync completes.
            </div>
          )}
          {history.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center justify-between gap-3 p-4 rounded-2xl border transition ${
                isDark ? "glass border-white/10" : "bg-slate-50 border-slate-200 hover:bg-slate-100/80"
              }`}
            >
              <div>
                <div className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-950"}`}>
                  {f.semester} / {f.id}
                </div>
                <div className={`text-xs mt-0.5 font-medium ${isDark ? "text-white/45" : "text-slate-600"}`}>{f.date}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className={`font-display text-lg font-extrabold ${isDark ? "text-white" : "text-slate-950"}`}>{"\u20B9"} {f.amount.toLocaleString()}</div>
                  <div
                    className={`text-[10px] uppercase tracking-[0.2em] font-extrabold ${
                      f.status === "paid"
                        ? isDark ? "text-emerald-300" : "text-emerald-700"
                        : isDark ? "text-amber-300" : "text-amber-700"
                    }`}
                  >
                    {f.status === "paid" ? "paid" : "due"}
                  </div>
                </div>
                <button
                  onClick={() =>
                    void openProtectedResource(`/api/student/fees/invoices/${f.id}?download=true`, {
                      download: true,
                      fallbackName: `${f.id}.txt`,
                    }).catch((error) =>
                      setStatus(error instanceof Error ? error.message : "Could not download receipt"),
                    )
                  }
                  className={`size-9 rounded-full flex items-center justify-center transition border ${
                    isDark ? "glass border-white/10 text-white/60 hover:text-white" : "bg-white border-slate-300 text-slate-700 hover:text-slate-950 shadow-2xs"
                  }`}
                  aria-label={`Download ${f.id}`}
                >
                  <Download className="size-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </PageTransition>
  );
}
