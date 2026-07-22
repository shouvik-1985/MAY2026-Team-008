import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Award,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Calendar,
  ClipboardCheck,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  GraduationCap,
  Landmark,
  Library,
  Lock,
  Mail,
  MapPin,
  MessageSquareWarning,
  MoonStar,
  Sparkles,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { CinematicBackdrop } from "@/components/app/cinematic";
import { getStudentDashboard, googleLogin, loginAccount, registerAccount } from "@/lib/api";
import { setAuthSession, type AuthResponse } from "@/lib/auth";
import { resolveRoleHome } from "@/lib/role-home";
import { clearStoredDashboard, setStoredDashboard } from "@/lib/student-session";
import { setStoredRole } from "@/lib/use-role";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme?: string; size?: string; width?: string; text?: string },
          ) => void;
          prompt: (callback?: (notification: unknown) => void) => void;
        };
      };
    };
  }
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in - CampusVerse" },
      { name: "description", content: "Enter the CampusVerse student platform." },
    ],
  }),
  component: LoginPage,
});

type Mode = "login" | "register";
type AccountKind = "student" | "professor";
type SceneMood = "idle" | "hover" | "typing" | "peek" | "busy" | "success" | "error";
type FocusField = "name" | "email" | "password" | "profile" | null;
type ScenePointer = { x: number; y: number };

const reactionPause = () => new Promise((resolve) => window.setTimeout(resolve, 420));

function LoginPage() {
  const navigate = useNavigate();
  const rawGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const googleClientId =
    rawGoogleClientId && !rawGoogleClientId.includes("your-google-client-id")
      ? rawGoogleClientId
      : undefined;
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [accountKind, setAccountKind] = useState<AccountKind>("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
  const [gender, setGender] = useState("");
  const [highestEducation, setHighestEducation] = useState("");
  const [expertiseField, setExpertiseField] = useState("");
  const [department, setDepartment] = useState("Computer Science & AI");
  const [designation, setDesignation] = useState("Assistant Professor");
  const [licenseDocumentName, setLicenseDocumentName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneMood, setSceneMood] = useState<SceneMood>("idle");
  const [focusedField, setFocusedField] = useState<FocusField>(null);
  const [scenePointer, setScenePointer] = useState<ScenePointer>({ x: 0, y: 0 });
  const isProfessorRegistration = mode === "register" && accountKind === "professor";
  const isRegistration = mode === "register";
  const showGoogleAccess = mode === "login" || accountKind === "student";
  const hasTyped = Boolean(
    fullName ||
    email ||
    password ||
    address ||
    gender ||
    highestEducation ||
    expertiseField ||
    licenseDocumentName,
  );
  const activeSceneMood: SceneMood = error
    ? "error"
    : busy
      ? "busy"
      : sceneMood === "success"
        ? "success"
        : showPw
          ? "peek"
          : focusedField || hasTyped
            ? "typing"
            : sceneMood;

  function resetFeedback(nextMood: SceneMood = "typing") {
    if (error) setError(null);
    if (!busy) setSceneMood(nextMood);
  }

  function updatePointer(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setScenePointer({
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    });
    if (!busy && !error && !focusedField && !showPw) setSceneMood("hover");
  }

  const handleGoogleCredential = useEffectEvent(async (credential: string) => {
    setBusy(true);
    setError(null);
    setSceneMood("busy");
    try {
      const auth = await googleLogin({ credential });
      setSceneMood("success");
      await reactionPause();
      await finishAuth(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google login failed");
      setSceneMood("error");
    } finally {
      setBusy(false);
    }
  });

  useEffect(() => {
    const clientId = googleClientId;
    if (!clientId) return;

    function initializeGoogle(validClientId: string) {
      window.google?.accounts.id.initialize({
        client_id: validClientId,
        callback: (response) => handleGoogleCredential(response.credential),
      });
      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = "";
        window.google?.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          width: "360",
          text: "continue_with",
        });
      }
    }

    if (window.google) {
      initializeGoogle(clientId);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => initializeGoogle(clientId);
    document.head.appendChild(script);
  }, [googleClientId, handleGoogleCredential]);

  async function finishAuth(auth: AuthResponse) {
    clearStoredDashboard();
    setAuthSession(auth);
    setStoredRole(auth.user.role);
    if (auth.user.role !== "student") {
      navigate({ to: resolveRoleHome(auth.user.role), replace: true });
      return;
    }
    try {
      setStoredDashboard(await getStudentDashboard());
    } catch {
      // The dashboard route will retry after navigation if the first sync is slow.
    }
    navigate({ to: "/app", replace: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSceneMood("busy");
    try {
      const isProfessor = mode === "register" && accountKind === "professor";
      const auth =
        mode === "register"
          ? await registerAccount({
              full_name: fullName.trim(),
              email,
              password,
              role: isProfessor ? "faculty" : "student",
              address: isProfessor ? address.trim() : undefined,
              gender: isProfessor ? gender : undefined,
              highest_education: isProfessor ? highestEducation.trim() : undefined,
              expertise_field: isProfessor ? expertiseField.trim() : undefined,
              department: isProfessor ? department.trim() : undefined,
              designation: isProfessor ? designation.trim() : undefined,
              license_document_name: isProfessor ? licenseDocumentName : undefined,
            })
          : await loginAccount({ email, password });
      setSceneMood("success");
      await reactionPause();
      await finishAuth(auth);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      if (mode === "register" && message.toLowerCase().includes("already registered")) {
        try {
          const auth = await loginAccount({ email, password });
          setSceneMood("success");
          await reactionPause();
          await finishAuth(auth);
          return;
        } catch {
          setError("That email is already registered. Use Login with the same password.");
          setSceneMood("error");
          return;
        }
      }
      setError(message);
      setSceneMood("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CinematicBackdrop intensity={0.55} />
      <div className="relative min-h-screen flex flex-col overflow-x-hidden px-4 py-6 text-white sm:px-6 sm:py-8">
        <motion.div
          className="pointer-events-none absolute left-[8%] top-[10%] h-44 w-44 rounded-full blur-3xl"
          style={{
            background: "radial-gradient(circle, oklch(0.82 0.18 200 / 0.28), transparent 70%)",
          }}
          animate={{ opacity: [0.24, 0.44, 0.24], scale: [1, 1.08, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute bottom-[8%] right-[6%] h-56 w-56 rounded-full blur-3xl"
          style={{
            background: "radial-gradient(circle, oklch(0.65 0.25 260 / 0.22), transparent 70%)",
          }}
          animate={{ opacity: [0.2, 0.36, 0.2], scale: [1, 1.12, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <Link
          to="/"
          className="absolute left-6 top-6 z-10 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-white/55 transition hover:text-white"
        >
          <span
            className="size-2 rounded-full"
            style={{
              background: "linear-gradient(135deg, oklch(0.82 0.18 200), oklch(0.72 0.16 230))",
              boxShadow: "0 0 12px oklch(0.82 0.18 200 / 0.55)",
            }}
          />
          CampusVerse
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 28, filter: "blur(16px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto my-auto w-full max-w-5xl"
        >
          <motion.div
            layout
            onMouseEnter={() => resetFeedback("hover")}
            onMouseMove={updatePointer}
            onMouseLeave={() => {
              setScenePointer({ x: 0, y: 0 });
              if (!busy && !error) setSceneMood("idle");
            }}
            className="glass-strong relative grid w-full overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.35)] lg:h-[860px] lg:grid-cols-[1.12fr_0.88fr]"
          >
            <CuteLoginScene mood={activeSceneMood} pointer={scenePointer} />

            <div className="relative flex min-h-[680px] flex-col rounded-[1.8rem] bg-[linear-gradient(180deg,oklch(0.1_0.02_280_/_0.95),oklch(0.07_0.01_280_/_0.98))] px-7 py-10 sm:px-12 lg:min-h-0 lg:h-full lg:overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(106,209,255,0.12),transparent_60%)]" />
              <div className={`flex min-h-0 w-full flex-col ${isRegistration ? "" : "my-auto"}`}>
                <motion.div
                  className="mx-auto mb-8 grid size-14 place-items-center rounded-[1.25rem] border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.04))] text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)]"
                  animate={{ y: [0, -5, 0], rotate: [0, -4, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ShieldCheck className="size-6 text-cyan-100" />
                </motion.div>

                <div className="mb-7 text-center">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-white/40">
                    <Sparkles className="size-3 text-cyan-200" />
                    Secure campus access
                  </div>
                  <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-[2.8rem]">
                    {mode === "login" ? "Welcome back" : "Create your account"}
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-white/48">
                    {mode === "login"
                      ? "Access classes, resources, notices, and your campus tools from one polished dashboard."
                      : accountKind === "professor"
                        ? "Set up a verified professor profile with richer professional details."
                        : "Create a student profile built for classes, community, and campus life."}
                  </p>
                </div>

                <div className="mb-6 rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-2">
                  <div className="grid grid-cols-2 rounded-full bg-[#101018]/80 p-1">
                    <ModeButton
                      active={mode === "login"}
                      onClick={() => {
                        setMode("login");
                        setError(null);
                        setFocusedField(null);
                        setSceneMood("hover");
                      }}
                    >
                      Login
                    </ModeButton>
                    <ModeButton
                      active={mode === "register"}
                      onClick={() => {
                        setMode("register");
                        setAccountKind("student");
                        setFullName("");
                        setEmail("");
                        setPassword("");
                        setAddress("");
                        setGender("");
                        setHighestEducation("");
                        setExpertiseField("");
                        setDepartment("Computer Science & AI");
                        setDesignation("Assistant Professor");
                        setLicenseDocumentName("");
                        setError(null);
                        setFocusedField(null);
                        setSceneMood("hover");
                      }}
                    >
                      Sign Up
                    </ModeButton>
                  </div>

                  {mode === "register" && (
                    <div className="mt-3 grid grid-cols-2 rounded-full bg-[#101018]/80 p-1">
                      <ModeButton
                        active={accountKind === "student"}
                        onClick={() => {
                          setAccountKind("student");
                          setError(null);
                          setFocusedField(null);
                          setSceneMood("hover");
                        }}
                      >
                        Student
                      </ModeButton>
                      <ModeButton
                        active={accountKind === "professor"}
                        onClick={() => {
                          setAccountKind("professor");
                          setError(null);
                          setFocusedField(null);
                          setSceneMood("hover");
                        }}
                      >
                        Professor
                      </ModeButton>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <form onSubmit={submit} className="space-y-5">
                    {mode === "register" && (
                      <Field
                        icon={UserPlus}
                        label="Full name"
                        value={fullName}
                        onChange={(e) => {
                          resetFeedback();
                          setFullName(e.target.value);
                        }}
                        onFocus={() => {
                          resetFeedback("typing");
                          setFocusedField("name");
                        }}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Your full name"
                        autoComplete="name"
                      />
                    )}

                    <Field
                      icon={Mail}
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        resetFeedback();
                        setEmail(e.target.value);
                      }}
                      onFocus={() => {
                        resetFeedback("typing");
                        setFocusedField("email");
                      }}
                      onBlur={() => setFocusedField(null)}
                      placeholder="you@university.edu"
                      autoComplete="email"
                    />

                    <div className="relative">
                      <Field
                        icon={Lock}
                        label="Password"
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          resetFeedback();
                          setPassword(e.target.value);
                        }}
                        onFocus={() => {
                          resetFeedback("typing");
                          setFocusedField("password");
                        }}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Minimum 8 characters"
                        autoComplete={mode === "register" ? "new-password" : "current-password"}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowPw((visible) => {
                            const next = !visible;
                            setSceneMood(next ? "peek" : "typing");
                            return next;
                          })
                        }
                        onMouseEnter={() => {
                          if (!busy && !error) setSceneMood("peek");
                        }}
                        onMouseLeave={() => {
                          if (!busy && !error && !showPw)
                            setSceneMood(focusedField ? "typing" : "hover");
                        }}
                        className="absolute right-4 top-[52px] text-white/40 transition hover:text-cyan-100"
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>

                    {mode === "register" && accountKind === "professor" && (
                      <div className="rounded-[1.6rem] border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(8,16,24,0.86),rgba(8,12,18,0.7))] p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white/75">
                          <Landmark className="size-4 text-cyan-200" />
                          Professional details
                        </div>
                        <div className="grid gap-5 md:grid-cols-2">
                          <Field
                            icon={MapPin}
                            label="Address"
                            value={address}
                            onChange={(e) => {
                              resetFeedback();
                              setAddress(e.target.value);
                            }}
                            onFocus={() => {
                              resetFeedback("typing");
                              setFocusedField("profile");
                            }}
                            onBlur={() => setFocusedField(null)}
                            placeholder="Current address"
                            autoComplete="street-address"
                          />
                          <ChoiceField
                            icon={Users}
                            label="Gender"
                            value={gender}
                            onChange={(value) => {
                              resetFeedback();
                              setGender(value);
                            }}
                            options={[
                              { value: "female", label: "Female" },
                              { value: "male", label: "Male" },
                              { value: "non-binary", label: "Non-binary" },
                              { value: "prefer-not-to-say", label: "Prefer not" },
                            ]}
                          />
                          <Field
                            icon={GraduationCap}
                            label="Highest education"
                            value={highestEducation}
                            onChange={(e) => {
                              resetFeedback();
                              setHighestEducation(e.target.value);
                            }}
                            onFocus={() => {
                              resetFeedback("typing");
                              setFocusedField("profile");
                            }}
                            onBlur={() => setFocusedField(null)}
                            placeholder="PhD, M.Tech, MSc..."
                          />
                          <Field
                            icon={BriefcaseBusiness}
                            label="Expertise field"
                            value={expertiseField}
                            onChange={(e) => {
                              resetFeedback();
                              setExpertiseField(e.target.value);
                            }}
                            onFocus={() => {
                              resetFeedback("typing");
                              setFocusedField("profile");
                            }}
                            onBlur={() => setFocusedField(null)}
                            placeholder="AI, Networks, Physics..."
                          />
                          <Field
                            icon={BriefcaseBusiness}
                            label="Department"
                            value={department}
                            onChange={(e) => {
                              resetFeedback();
                              setDepartment(e.target.value);
                            }}
                            onFocus={() => {
                              resetFeedback("typing");
                              setFocusedField("profile");
                            }}
                            onBlur={() => setFocusedField(null)}
                            placeholder="Computer Science & AI"
                          />
                          <Field
                            icon={GraduationCap}
                            label="Designation"
                            value={designation}
                            onChange={(e) => {
                              resetFeedback();
                              setDesignation(e.target.value);
                            }}
                            onFocus={() => {
                              resetFeedback("typing");
                              setFocusedField("profile");
                            }}
                            onBlur={() => setFocusedField(null)}
                            placeholder="Assistant Professor"
                          />
                          <FileField
                            label="Valid professor license"
                            fileName={licenseDocumentName}
                            onChange={(name) => {
                              resetFeedback();
                              setLicenseDocumentName(name);
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={busy}
                      className="group relative mt-2 w-full overflow-hidden rounded-full py-4 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(0,0,0,0.32)] transition hover:-translate-y-0.5 disabled:opacity-60"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.66 0.17 192), oklch(0.62 0.18 235) 55%, oklch(0.72 0.13 170))",
                      }}
                    >
                      <span className="absolute inset-[1px] rounded-full bg-[linear-gradient(180deg,rgba(10,12,18,0.82),rgba(11,16,22,0.92))]" />
                      <span className="absolute inset-y-0 left-[-20%] w-1/3 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)] transition-transform duration-700 group-hover:translate-x-[340%]" />
                      <span className="relative z-10 inline-flex items-center justify-center gap-3">
                        {busy ? "Authenticating" : mode === "login" ? "Log in" : "Create account"}
                        {!busy && (
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                        )}
                      </span>
                    </button>
                  </form>
                </div>

                <div className="mt-5">
                  {showGoogleAccess && (
                    <>
                      <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.24em] text-white/24">
                        <span className="h-px flex-1 bg-white/10" />
                        or continue with
                        <span className="h-px flex-1 bg-white/10" />
                      </div>

                      {googleClientId && (
                        <div ref={googleButtonRef} className="mt-4 flex justify-center" />
                      )}

                      {!googleClientId && (
                        <p className="mt-6 text-center text-xs text-white/45">
                          Add your Google OAuth client ID to enable real Google login.
                        </p>
                      )}
                    </>
                  )}

                  <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-center text-xs text-white/42">
                    {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode(mode === "login" ? "register" : "login");
                        setAccountKind("student");
                        setError(null);
                        setFocusedField(null);
                        setSceneMood("hover");
                      }}
                      className="font-semibold text-cyan-100 transition hover:text-white"
                    >
                      {mode === "login" ? "Sign Up" : "Log in"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}

function CuteLoginScene({ mood, pointer }: { mood: SceneMood; pointer: ScenePointer }) {
  const toneClass =
    mood === "error"
      ? "from-rose-500/18 via-transparent to-transparent"
      : mood === "success"
        ? "from-emerald-400/18 via-transparent to-transparent"
        : "from-cyan-400/12 via-transparent to-[oklch(0.65_0.25_260_/_0.08)]";

  return (
    <motion.div
      className="relative hidden min-h-full w-full overflow-hidden border-r border-white/8 bg-[#07070d] lg:flex lg:flex-col"
      animate={{
        x: pointer.x * 4,
        y: pointer.y * 4,
      }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.12),transparent_30%),linear-gradient(135deg,#040714_0%,#090911_42%,#05050f_100%)]" />
      <div className="absolute inset-0 grid-bg opacity-[0.14]" />
      <div className={`absolute inset-0 bg-gradient-to-br ${toneClass}`} />
      <div
        className="absolute left-10 top-12 h-40 w-40 rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, oklch(0.82 0.18 200 / 0.22), transparent 68%)",
        }}
      />
      <div
        className="absolute bottom-10 right-10 h-52 w-52 rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, oklch(0.65 0.25 260 / 0.14), transparent 68%)",
        }}
      />

      <motion.div
        className="absolute right-14 top-16 h-28 w-28 rounded-full border border-cyan-300/20"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      >
        <motion.div
          className="absolute left-1/2 top-0 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/30 bg-white shadow-[0_0_30px_rgba(90,220,255,0.3)]"
          animate={{ scale: mood === "busy" ? [1, 1.2, 1] : 1 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      <div className="relative flex flex-1 w-full flex-col justify-between p-10 pb-8">
        <div className="w-full max-w-[620px]">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-white/45">
            <span className="size-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
            Campus access
          </div>
          <h2 className="max-w-md font-display text-4xl font-bold leading-[0.95] tracking-tight text-white">
            Step into a connected college experience.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/50">
            Smarter campus life, all in one place.
          </p>
          <div className="mt-8 grid w-full grid-cols-3 gap-4">
            <SceneMetric value="24/7" label="smart access" />
            <SceneMetric value="1 hub" label="campus tools" />
            <SceneMetric value="secure" label="verified flow" />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <motion.div
            className="relative w-full max-w-[620px]"
            animate={{ y: mood === "success" ? [0, -8, 0] : [0, -2, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute inset-x-16 bottom-0 h-14 rounded-full bg-cyan-400/12 blur-3xl" />
            <div className="glass-strong relative overflow-hidden rounded-[30px] border border-white/10 shadow-[0_30px_70px_rgba(0,0,0,0.35),0_0_40px_rgba(99,102,241,0.12)]">
              <div className="relative h-[540px] overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,#0a0b16_0%,#0c0d1b_38%,#080811_100%)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(116,214,255,0.18),transparent_32%)]" />
              <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[linear-gradient(180deg,rgba(9,17,26,0),rgba(11,20,28,0.94)_45%,rgba(11,20,28,1)_100%)]" />
              <div className="absolute left-0 right-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(130,210,255,0.08),transparent)]" />
              <motion.div
                className="absolute inset-x-0 top-0 h-full bg-[linear-gradient(180deg,transparent,rgba(88,221,255,0.08),transparent)]"
                animate={{ y: ["-100%", "100%"] }}
                transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
              />

              <div className="absolute left-8 top-8 right-8 flex items-start justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/45">
                    CampusVerse
                  </div>
                  <div className="mt-2 max-w-xs text-[2rem] font-semibold leading-tight text-white">
                    Smart campus.
                  </div>
                </div>
              </div>

              <div className="absolute left-10 right-10 top-24 h-[230px] rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
                <div className="absolute inset-x-0 top-0 h-[56%] rounded-[28px] bg-[linear-gradient(180deg,rgba(130,210,255,0.08),rgba(130,210,255,0.01))]" />
                <motion.div
                  className="absolute left-[10%] top-[24%] h-[46%] w-[14%] rounded-t-[20px] bg-[#d9dee3]"
                  animate={{ y: [0, -3, 0], scaleY: [1, 1.01, 1] }}
                  transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute left-[24%] top-[12%] h-[58%] w-[18%] rounded-t-[22px] bg-[#eef3f7]"
                  animate={{ y: [0, -7, 0], scaleY: [1, 1.018, 1] }}
                  transition={{ duration: 5.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                />
                <motion.div
                  className="absolute left-[45%] top-[20%] h-[50%] w-[15%] rounded-t-[18px] bg-[#d7e0e8]"
                  animate={{ y: [0, -4, 0], scaleY: [1, 1.012, 1] }}
                  transition={{ duration: 4.9, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
                />
                <motion.div
                  className="absolute left-[63%] top-[8%] h-[62%] w-[20%] rounded-t-[26px] bg-[#f3f7fa]"
                  animate={{ y: [0, -9, 0], scaleY: [1, 1.02, 1] }}
                  transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut", delay: 0.45 }}
                />
                <motion.div
                  className="absolute left-[85%] top-[28%] h-[42%] w-[7%] rounded-t-[14px] bg-[#d5dce2]"
                  animate={{ y: [0, -2, 0], scaleY: [1, 1.008, 1] }}
                  transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.25 }}
                />

                <motion.div
                  className="absolute left-[13%] top-[33%] grid grid-cols-2 gap-1"
                  animate={{ opacity: [0.55, 0.8, 0.55] }}
                  transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                >
                  {Array.from({ length: 8 }).map((_, index) => (
                    <span key={index} className="h-2 w-2 rounded-[2px] bg-cyan-900/25" />
                  ))}
                </motion.div>
                <motion.div
                  className="absolute left-[28%] top-[24%] grid grid-cols-3 gap-1.5"
                  animate={{ opacity: [0.65, 0.95, 0.65] }}
                  transition={{ duration: 4.1, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                >
                  {Array.from({ length: 15 }).map((_, index) => (
                    <span key={index} className="h-2.5 w-2.5 rounded-[2px] bg-cyan-900/22" />
                  ))}
                </motion.div>
                <motion.div
                  className="absolute left-[48%] top-[30%] grid grid-cols-2 gap-1"
                  animate={{ opacity: [0.55, 0.82, 0.55] }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.25 }}
                >
                  {Array.from({ length: 10 }).map((_, index) => (
                    <span key={index} className="h-2 w-2 rounded-[2px] bg-cyan-900/22" />
                  ))}
                </motion.div>
                <motion.div
                  className="absolute left-[67%] top-[20%] grid grid-cols-4 gap-1.5"
                  animate={{ opacity: [0.62, 0.9, 0.62] }}
                  transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut", delay: 0.55 }}
                >
                  {Array.from({ length: 20 }).map((_, index) => (
                    <span key={index} className="h-2.5 w-2.5 rounded-[2px] bg-cyan-900/20" />
                  ))}
                </motion.div>

                <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[linear-gradient(180deg,rgba(19,40,42,0),rgba(31,62,65,0.9))]" />
                <div className="absolute left-0 right-0 bottom-[22%] h-[4px] bg-cyan-200/30" />
              </div>

              <div className="absolute left-10 right-10 bottom-8 grid grid-cols-3 gap-4">
                <SceneInfoCard icon={Building2} title="Academic Block" hint="Classes and labs" />
                <SceneInfoCard icon={Library} title="Library" hint="Resources and reading" />
                <SceneInfoCard icon={BookOpen} title="Student Life" hint="Events and clubs" />
              </div>
            </div>
          </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function SceneMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="group rounded-2xl border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-4 py-3 backdrop-blur-md transition-all duration-300 hover:border-indigo-400/20 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] hover:shadow-[0_4px_16px_rgba(99,102,241,0.1)]">
      <div className="text-lg font-semibold text-white transition-colors group-hover:text-indigo-50">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/40 transition-colors group-hover:text-indigo-200/60">{label}</div>
    </div>
  );
}

function SceneInfoCard({
  icon: Icon,
  title,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2 text-white">
        <Icon className="size-4 text-cyan-200" />
        <div className="text-sm font-medium">{title}</div>
      </div>
      <div className="text-xs leading-5 text-white/48">{hint}</div>
    </div>
  );
}

function ChoiceField({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="block">
      <div className="mb-2 text-sm font-medium text-white/72">{label}</div>
      <div className="rounded-2xl border border-white/10 bg-white/6 p-2 backdrop-blur-xl">
        <div className="mb-2 flex items-center gap-2 px-2 text-xs text-white/45">
          <Icon className="size-4" />
          <span>
            {value ? options.find((option) => option.value === value)?.label : "Choose gender"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                value === option.value
                  ? "bg-[linear-gradient(135deg,rgba(223,248,255,0.96),rgba(241,255,252,0.92))] text-[#0b1018] shadow-sm"
                  : "bg-transparent text-white/55 hover:bg-white/8 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FileField({
  label,
  fileName,
  onChange,
}: {
  label: string;
  fileName: string;
  onChange: (name: string) => void;
}) {
  return (
    <label className="block md:col-span-2">
      <div className="mb-2 text-sm font-medium text-white/72">{label}</div>
      <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 backdrop-blur-xl">
        <FileCheck2 className="size-4 shrink-0 text-white/45" />
        <span className="flex-1 truncate text-sm text-white/60">
          {fileName || "Upload license / appointment proof"}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
          Choose
        </span>
        <input
          required
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(event) => onChange(event.target.files?.[0]?.name ?? "")}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </div>
    </label>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-[linear-gradient(135deg,rgba(247,255,255,0.98),rgba(224,247,255,0.94))] text-[#081018] shadow-[0_10px_24px_rgba(110,214,255,0.18)]"
          : "text-white/40 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  icon: Icon,
  label,
  ...rest
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-white/72">{label}</div>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4">
        <Icon className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/35" />
        <input
          {...rest}
          required
          className="w-full border-0 bg-transparent py-4 pl-8 pr-8 text-sm text-white placeholder:text-white/24 outline-none transition"
        />
      </div>
    </label>
  );
}

function FeatureShowcaseCard({
  icon: Icon,
  title,
  hint,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  className?: string;
}) {
  return (
    <div
      className={`group rounded-[20px] border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/20 hover:shadow-[0_8px_24px_rgba(34,211,238,0.08)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] ${
        className || ""
      }`}
    >
      <div className="mb-2.5 flex items-center gap-2.5 text-white/90 transition-colors group-hover:text-white">
        <Icon className="size-5 text-cyan-200/80 transition-colors group-hover:text-cyan-300" />
        <div className="text-[13px] font-semibold">{title}</div>
      </div>
      <div className="text-xs leading-5 text-white/40 transition-colors group-hover:text-white/55">{hint}</div>
    </div>
  );
}