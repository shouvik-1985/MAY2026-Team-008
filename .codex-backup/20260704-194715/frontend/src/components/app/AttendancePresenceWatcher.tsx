import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Eye, LocateFixed, MapPin, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  checkStudentAttendanceRadius,
  getStudentAttendanceSettings,
  verifyStudentBiometric,
  type StudentBiometricCheckIn,
} from "@/lib/api";

type LocationPoint = {
  latitude: number;
  longitude: number;
};

function storageKey(kind: string) {
  return `cv-attendance-${kind}-${new Date().toISOString().slice(0, 10)}`;
}

export function AttendancePresenceWatcher() {
  const [popup, setPopup] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanState, setScanState] = useState<"ready" | "scanning" | "verified" | "error">("ready");
  const [checkIn, setCheckIn] = useState<StudentBiometricCheckIn | null>(null);
  const [lastPoint, setLastPoint] = useState<LocationPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    if (window.sessionStorage.getItem(storageKey("verified"))) return;

    let cancelled = false;
    let intervalId: number | undefined;

    async function inspectRadius() {
      if (promptedRef.current || window.sessionStorage.getItem(storageKey("verified"))) return;
      try {
        const settings = await getStudentAttendanceSettings();
        if (!settings.campus_configured) return;
      } catch {
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (cancelled || promptedRef.current) return;
          const point = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setLastPoint(point);
          try {
            const result = await checkStudentAttendanceRadius(point);
            if (!result.withinRadius) return;
            promptedRef.current = true;
            setCheckIn(result.checkIn);
            setPopup(result.message || "You are within the college radius");
            window.sessionStorage.setItem(storageKey("popup"), "shown");
            window.setTimeout(() => {
              if (!cancelled) {
                setPopup(null);
                setScanOpen(true);
              }
            }, 2000);
          } catch {
            // Radius checks should stay quiet if the network is restarting.
          }
        },
        () => {
          // Browser permission failures are intentionally quiet on the dashboard.
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 },
      );
    }

    const startId = window.setTimeout(inspectRadius, 1200);
    intervalId = window.setInterval(inspectRadius, 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(startId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  async function verify() {
    setScanState("scanning");
    setError(null);
    try {
      const result = await verifyStudentBiometric({
        latitude: lastPoint?.latitude,
        longitude: lastPoint?.longitude,
        method: "eye-scan",
      });
      setCheckIn(result.checkIn);
      setScanState("verified");
      window.sessionStorage.setItem(storageKey("verified"), "true");
      window.setTimeout(() => setScanOpen(false), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Biometric verification failed");
      setScanState("error");
    }
  }

  return (
    <>
      <AnimatePresence>
        {popup && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            className="fixed right-5 top-24 z-[95] max-w-sm rounded-3xl border border-emerald-200/25 bg-[#07110d]/90 p-4 text-white shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-300/15">
                <MapPin className="size-5 text-emerald-200" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-emerald-100/60">Campus radius</div>
                <div className="mt-1 font-display text-lg font-semibold">{popup}</div>
                <div className="mt-1 text-xs text-white/45">Biometric verification opens automatically.</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scanOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[96] grid place-items-center bg-black/70 px-4 backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              className="relative w-full max-w-lg overflow-hidden rounded-[32px] border border-white/12 bg-[#09090b]/95 p-6 shadow-2xl"
            >
              <button
                onClick={() => setScanOpen(false)}
                className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/50 transition hover:text-white"
                aria-label="Close biometric verification"
              >
                <X className="size-4" />
              </button>

              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "var(--grad-aurora)" }}>
                  <Eye className="size-6 text-white" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.35em] text-white/40">Biometric eye scan</div>
                  <h2 className="mt-1 font-display text-3xl font-bold">Verify campus entry</h2>
                  <p className="mt-2 text-sm text-white/55">
                    Complete device verification so your name appears in the professor attendance confirmation list.
                  </p>
                </div>
              </div>

              <div className="relative mx-auto mt-7 grid size-56 place-items-center rounded-full border border-cyan-200/20 bg-cyan-300/5">
                <motion.div
                  className="absolute inset-4 rounded-full border border-fuchsia-300/30"
                  animate={{ rotate: 360 }}
                  transition={{ duration: scanState === "scanning" ? 1.1 : 5, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-10 rounded-full border border-cyan-200/30"
                  animate={{ scale: scanState === "scanning" ? [1, 1.12, 1] : [1, 1.04, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="grid size-28 place-items-center rounded-full bg-white/[0.06]">
                  {scanState === "verified" ? (
                    <CheckCircle2 className="size-14 text-emerald-300" />
                  ) : (
                    <Eye className="size-14 text-cyan-100" />
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    <LocateFixed className="size-4 text-cyan-200" />
                    Radius distance
                  </span>
                  <span className="text-white/75">
                    {checkIn?.distanceMeters != null ? `${checkIn.distanceMeters}m` : "Within campus"}
                  </span>
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              )}

              <button
                onClick={verify}
                disabled={scanState === "scanning" || scanState === "verified"}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white transition disabled:cursor-wait disabled:opacity-70"
                style={{ background: "var(--grad-aurora)" }}
              >
                <ShieldCheck className="size-4" />
                {scanState === "scanning" ? "Scanning" : scanState === "verified" ? "Verified" : "Verify biometric"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
