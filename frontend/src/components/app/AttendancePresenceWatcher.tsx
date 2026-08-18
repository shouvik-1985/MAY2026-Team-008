import { AnimatePresence, motion } from "framer-motion";
import { Camera, CheckCircle2, Eye, LocateFixed, MapPin, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getStoredUser } from "@/lib/auth";
import { captureFaceTemplate } from "@/lib/face-template";
import { getStoredDashboard, setStoredDashboard } from "@/lib/student-session";
import {
  checkStudentAttendanceRadius,
  getStudentAttendanceSettings,
  resetStudentBiometric,
  verifyStudentBiometric,
  type StudentBiometricCheckIn,
} from "@/lib/api";

type LocationPoint = {
  latitude: number;
  longitude: number;
};

type CachedFaceScan = {
  template: number[];
  capturedAt: number;
};

const RADIUS_CHECK_INTERVAL_MS = 60_000;
const ATTENDANCE_SETTINGS_CACHE_MS = 5 * 60_000;

function storageKey(kind: string) {
  const userId = typeof window !== "undefined" ? getStoredUser()?.id ?? "anon" : "anon";
  return `cv-attendance-${userId}-${kind}-${new Date().toISOString().slice(0, 10)}`;
}

export function AttendancePresenceWatcher() {
  const [popup, setPopup] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanState, setScanState] = useState<"ready" | "scanning" | "verified" | "error">("ready");
  const [checkIn, setCheckIn] = useState<StudentBiometricCheckIn | null>(null);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [lastPoint, setLastPoint] = useState<LocationPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const promptedRef = useRef(false);
  const checkingRef = useRef(false);
  const popupTimeoutRef = useRef<number | null>(null);
  const popupWarmupRef = useRef<number | null>(null);
  const inspectRadiusRef = useRef<(() => Promise<void>) | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraBootRef = useRef<Promise<void> | null>(null);
  const precomputeRef = useRef<Promise<void> | null>(null);
  const cachedFaceScanRef = useRef<CachedFaceScan | null>(null);
  const settingsCacheRef = useRef<{ campusConfigured: boolean; syncedAt: number } | null>(null);

  function stopCamera() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    cameraBootRef.current = null;
    precomputeRef.current = null;
    cachedFaceScanRef.current = null;
    setCameraReady(false);
  }

  async function primeCamera(silent = false) {
    if (streamRef.current) return;
    if (!cameraBootRef.current) {
      cameraBootRef.current = navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 320 },
            height: { ideal: 240 },
          },
          audio: false,
        })
        .then((stream) => {
          streamRef.current = stream;
        })
        .finally(() => {
          cameraBootRef.current = null;
        });
    }

    try {
      await cameraBootRef.current;
    } catch (cameraIssue) {
      if (!silent) {
        setCameraError(
          cameraIssue instanceof Error
            ? cameraIssue.message
            : "Camera permission is required for face recognition attendance.",
        );
      }
    }
  }

  async function attachPreviewStream() {
    if (!streamRef.current || !videoRef.current) return;
    if (videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
    const video = videoRef.current;
    await video.play().catch(() => undefined);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      setCameraReady(true);
      return;
    }
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve();
      };
      const cleanup = () => {
        video.removeEventListener("loadeddata", finish);
        video.removeEventListener("canplay", finish);
      };
      video.addEventListener("loadeddata", finish, { once: true });
      video.addEventListener("canplay", finish, { once: true });
      window.setTimeout(finish, 1800);
    });
    setCameraReady(true);
  }

  async function precomputeFaceScan(force = false) {
    if (!scanOpen || !streamRef.current || !videoRef.current) return;
    if (!force && cachedFaceScanRef.current && Date.now() - cachedFaceScanRef.current.capturedAt < 5000) {
      return;
    }
    if (precomputeRef.current) {
      await precomputeRef.current.catch(() => undefined);
      return;
    }

    precomputeRef.current = (async () => {
      try {
        const faceScan = await captureFaceTemplate(videoRef.current!, biometricEnrolled ? 1 : 2);
        cachedFaceScanRef.current = {
          template: faceScan.template,
          capturedAt: Date.now(),
        };
      } catch {
        cachedFaceScanRef.current = null;
      } finally {
        precomputeRef.current = null;
      }
    })();

    await precomputeRef.current;
  }

  function syncDashboardBiometric(next: { enrolled: boolean; enrolledAt?: string | null }) {
    const stored = getStoredDashboard();
    if (!stored) return;
    setStoredDashboard({
      ...stored,
      user: {
        ...stored.user,
        biometricEnrolled: next.enrolled,
        biometricEnrolledAt: next.enrolledAt ?? null,
      },
    });
  }

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    let intervalId: number | undefined;

    async function inspectRadius() {
      if (cancelled || checkingRef.current || promptedRef.current || window.sessionStorage.getItem(storageKey("verified"))) {
        return;
      }
      checkingRef.current = true;
      try {
        const cachedSettings = settingsCacheRef.current;
        const settings =
          cachedSettings && Date.now() - cachedSettings.syncedAt < ATTENDANCE_SETTINGS_CACHE_MS
            ? { campus_configured: cachedSettings.campusConfigured }
            : await getStudentAttendanceSettings();
        settingsCacheRef.current = {
          campusConfigured: settings.campus_configured,
          syncedAt: Date.now(),
        };
        if (!settings.campus_configured) {
          checkingRef.current = false;
          return;
        }
      } catch {
        checkingRef.current = false;
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (cancelled || promptedRef.current) {
            checkingRef.current = false;
            return;
          }
          const point = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setLastPoint(point);
          try {
            const result = await checkStudentAttendanceRadius(point);
            setBiometricEnrolled(result.biometricEnrolled);
            if (!result.withinRadius) return;
            if (result.checkIn?.biometricVerified) {
              setCheckIn(result.checkIn);
              window.sessionStorage.setItem(storageKey("verified"), "true");
              return;
            }
            promptedRef.current = true;
            setCheckIn(result.checkIn);
            setPopup(result.message || "You are within the college radius");
            window.sessionStorage.setItem(storageKey("popup"), "shown");
            if (popupTimeoutRef.current) {
              window.clearTimeout(popupTimeoutRef.current);
            }
            if (popupWarmupRef.current) {
              window.clearTimeout(popupWarmupRef.current);
            }
            popupWarmupRef.current = window.setTimeout(() => {
              if (!cancelled) {
                void primeCamera(true);
              }
            }, 1400);
            popupTimeoutRef.current = window.setTimeout(() => {
              if (!cancelled) {
                setPopup(null);
                setScanOpen(true);
              }
            }, 2000);
          } catch {
            // Radius checks should stay quiet if the network is restarting.
          } finally {
            checkingRef.current = false;
          }
        },
        () => {
          // Browser permission failures are intentionally quiet on the dashboard.
          checkingRef.current = false;
        },
        { enableHighAccuracy: true, maximumAge: RADIUS_CHECK_INTERVAL_MS, timeout: 12_000 },
      );
    }
    inspectRadiusRef.current = inspectRadius;

    function handleVisible() {
      if (!document.hidden) {
        void inspectRadius();
      }
    }

    const startId = window.setTimeout(inspectRadius, 600);
    intervalId = window.setInterval(() => {
      if (!document.hidden) void inspectRadius();
    }, RADIUS_CHECK_INTERVAL_MS);
    window.addEventListener("focus", inspectRadius);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      cancelled = true;
      inspectRadiusRef.current = null;
      stopCamera();
      window.clearTimeout(startId);
      if (popupTimeoutRef.current) {
        window.clearTimeout(popupTimeoutRef.current);
      }
      if (popupWarmupRef.current) {
        window.clearTimeout(popupWarmupRef.current);
      }
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener("focus", inspectRadius);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !scanOpen) return;

    let cancelled = false;
    let warmTimeout: number | undefined;

    async function bootCamera() {
      setCameraError(null);
      setCameraReady(false);
      await primeCamera(false);
      if (cancelled) return;
      await attachPreviewStream();
      if (cancelled) return;
      warmTimeout = window.setTimeout(() => {
        void precomputeFaceScan(true);
      }, 450);
    }

    void bootCamera();
    return () => {
      cancelled = true;
      if (warmTimeout) {
        window.clearTimeout(warmTimeout);
      }
      stopCamera();
    };
  }, [scanOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function onTemplateReset() {
      window.sessionStorage.removeItem(storageKey("verified"));
      promptedRef.current = false;
      setBiometricEnrolled(false);
      setCheckIn(null);
      setScanState("ready");
      setError(null);
      setNotice(null);
      void inspectRadiusRef.current?.();
    }

    function onCheckNow() {
      window.sessionStorage.removeItem(storageKey("verified"));
      promptedRef.current = false;
      void inspectRadiusRef.current?.();
    }

    window.addEventListener("cv-biometric-template-reset", onTemplateReset);
    window.addEventListener("cv-biometric-check-now", onCheckNow);
    return () => {
      window.removeEventListener("cv-biometric-template-reset", onTemplateReset);
      window.removeEventListener("cv-biometric-check-now", onCheckNow);
    };
  }, []);

  async function verify() {
    setScanState("scanning");
    setError(null);
    setNotice(null);
    try {
      if (!videoRef.current) {
        throw new Error("Camera preview is not ready yet");
      }
      const cached = cachedFaceScanRef.current;
      const useCached = cached && Date.now() - cached.capturedAt < 6000;
      const faceScan = useCached
        ? { template: cached.template }
        : await captureFaceTemplate(videoRef.current, biometricEnrolled ? 1 : 2);
      const result = await verifyStudentBiometric({
        latitude: lastPoint?.latitude,
        longitude: lastPoint?.longitude,
        method: "face-recognition",
        face_template: faceScan.template,
      });
      setCheckIn(result.checkIn);
      setBiometricEnrolled(result.biometricEnrolled);
      cachedFaceScanRef.current = null;
      syncDashboardBiometric({
        enrolled: result.biometricEnrolled,
        enrolledAt: new Date().toISOString(),
      });
      setScanState("verified");
      window.sessionStorage.setItem(storageKey("verified"), "true");
      window.setTimeout(() => {
        setScanOpen(false);
        stopCamera();
      }, 300);
    } catch (err) {
      cachedFaceScanRef.current = null;
      setError(err instanceof Error ? err.message : "Biometric verification failed");
      setScanState("error");
      void precomputeFaceScan(true);
    }
  }

  async function resetTemplate() {
    setScanState("ready");
    setError(null);
    setNotice(null);
    try {
      const result = await resetStudentBiometric();
      setCheckIn(result.checkIn);
      setBiometricEnrolled(result.biometricEnrolled);
      syncDashboardBiometric({ enrolled: false, enrolledAt: null });
      window.sessionStorage.removeItem(storageKey("verified"));
      setNotice("Face template cleared. Scan again to enroll the new face template.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear the enrolled face template");
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
                onClick={() => {
                  setScanOpen(false);
                  promptedRef.current = false;
                  stopCamera();
                }}
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
                  <div className="text-[10px] uppercase tracking-[0.35em] text-white/40">Face recognition scan</div>
                  <h2 className="mt-1 font-display text-3xl font-bold">Verify campus entry</h2>
                  <p className="mt-2 text-sm text-white/55">
                    {biometricEnrolled
                      ? "Use the enrolled face template so your name appears in the professor attendance confirmation list."
                      : "Enroll your face template once through the laptop webcam. The same template will be matched on later attendance scans."}
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
                <div className="relative grid size-36 place-items-center overflow-hidden rounded-full bg-white/[0.06]">
                  <video
                    ref={videoRef}
                    className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${scanState === "verified" ? "opacity-0" : cameraReady ? "opacity-100" : "opacity-0"}`}
                    muted
                    autoPlay
                    playsInline
                  />
                  {scanState === "verified" ? <CheckCircle2 className="size-14 text-emerald-300" /> : null}
                  {scanState !== "verified" && cameraReady ? (
                    <motion.div
                      className="pointer-events-none absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-cyan-200/80 shadow-[0_0_24px_rgba(34,211,238,0.7)]"
                      animate={{ y: [-56, 56, -56] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  ) : null}
                  {scanState !== "verified" && !cameraReady ? (
                    <div className="relative z-[1] grid place-items-center gap-2 text-center text-cyan-100/80">
                      <Camera className="size-10" />
                      <div className="max-w-[7rem] text-[11px] uppercase tracking-[0.22em] text-white/45">
                        {cameraError ? "Camera blocked" : "Opening camera"}
                      </div>
                    </div>
                  ) : null}
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
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-3">
                  <span className="inline-flex items-center gap-2">
                    <Eye className="size-4 text-fuchsia-200" />
                    Face template
                  </span>
                  <span className="text-white/75">{biometricEnrolled ? "Enrolled" : "Enrollment pending"}</span>
                </div>
              </div>

              {(cameraError || error) && (
                <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {cameraError || error}
                </div>
              )}
              {notice ? (
                <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                  {notice}
                </div>
              ) : null}

              <button
                onClick={verify}
                disabled={scanState === "scanning" || scanState === "verified" || !cameraReady}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white transition disabled:cursor-wait disabled:opacity-70"
                style={{ background: "var(--grad-aurora)" }}
              >
                <ShieldCheck className="size-4" />
                {scanState === "scanning"
                  ? biometricEnrolled
                    ? "Matching face"
                    : "Enrolling face"
                  : scanState === "verified"
                    ? "Verified"
                    : biometricEnrolled
                      ? "Verify biometric"
                      : "Enroll and verify"}
              </button>
              {biometricEnrolled ? (
                <button
                  type="button"
                  onClick={() => void resetTemplate()}
                  disabled={scanState === "scanning"}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/75 transition hover:text-white disabled:cursor-wait disabled:opacity-60"
                >
                  <X className="size-4" />
                  Reset enrolled face
                </button>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
