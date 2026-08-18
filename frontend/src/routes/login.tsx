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
  BriefcaseBusiness,
  Eye,
  EyeOff,
  FileCheck2,
  GraduationCap,
  Landmark,
  Lock,
  Mail,
  MapPin,
  Sparkles,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Auth3DScene } from "@/components/auth/Auth3DScene";
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
  const [authUnlocked, setAuthUnlocked] = useState(false);
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
    if (authUnlocked && !busy && !error && !focusedField && !showPw) setSceneMood("hover");
  }

  function unlockAuthFrame() {
    if (authUnlocked) return;
    setAuthUnlocked(true);
    setSceneMood("hover");
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
    if (!clientId || !authUnlocked) return;

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
  }, [authUnlocked, googleClientId, handleGoogleCredential]);

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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#121417] text-white transition-colors">
      <div className="fixed inset-0 z-[0] bg-[radial-gradient(circle_at_50%_38%,rgba(76,175,80,0.18),transparent_58%),linear-gradient(180deg,#121417_0%,#0d0f12_100%)]" />
      <div className="pointer-events-none fixed inset-0 z-[0] bg-[radial-gradient(circle_at_20%_18%,rgba(255,200,75,0.08),transparent_28%),radial-gradient(circle_at_86%_76%,rgba(76,175,80,0.08),transparent_30%)]" />
      <div className="relative z-[1] flex min-h-screen flex-col overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
        {/* Top Header Bar */}
        <div className="relative z-30 mx-auto flex w-full max-w-5xl items-center pb-6 pt-2">
          <Link
            to="/"
            className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.26em] text-white drop-shadow-md transition hover:opacity-85"
          >
            <span
              className="size-3.5 rounded-full shadow-md shrink-0"
              style={{
                background: "linear-gradient(135deg, #ffc84b, #4caf50)",
                boxShadow: "0 0 16px rgba(76, 175, 80, 0.8)",
              }}
            />
            <span className="font-extrabold tracking-[0.25em]">CampusVerse</span>
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28, filter: "blur(16px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className={`relative mx-auto my-auto w-full ${authUnlocked ? "max-w-5xl" : "max-w-[680px]"}`}
        >
          <motion.div
            layout
            onMouseEnter={() => {
              if (authUnlocked) resetFeedback("hover");
            }}
            onMouseMove={updatePointer}
            onMouseLeave={() => {
              setScenePointer({ x: 0, y: 0 });
              if (authUnlocked && !busy && !error) setSceneMood("idle");
            }}
            className={`relative grid w-full overflow-hidden rounded-[30px] border border-[#4caf50]/25 bg-[rgba(255,255,255,0.045)] shadow-[0_30px_90px_rgba(0,0,0,0.38),0_0_38px_rgba(76,175,80,0.18)] backdrop-blur-[24px] ${
              authUnlocked ? "lg:h-[860px] lg:grid-cols-[0.92fr_1fr]" : "min-h-[680px] lg:h-[760px]"
            }`}
          >
            <Auth3DScene
              mood={activeSceneMood}
              pointer={scenePointer}
              open={authUnlocked}
              onLampPull={unlockAuthFrame}
            />

            {authUnlocked && (
              <motion.div
                initial={{ opacity: 0, x: -160, filter: "blur(12px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
                className="relative flex min-h-[680px] flex-col rounded-[28px] bg-[linear-gradient(180deg,rgba(18,20,23,0.96),rgba(13,15,18,0.98))] px-7 py-10 shadow-[inset_0_0_26px_rgba(255,255,255,0.035)] sm:px-12 lg:h-full lg:min-h-0 lg:overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,rgba(76,175,80,0.16),transparent_60%)]" />
                <div className={`flex min-h-0 w-full flex-col ${isRegistration ? "" : "my-auto"}`}>
                  <motion.div
                    className="mx-auto mb-8 grid size-14 place-items-center rounded-[1.25rem] border border-[#4caf50]/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.11),rgba(255,255,255,0.04))] text-white shadow-[0_14px_30px_rgba(0,0,0,0.28),0_0_22px_rgba(76,175,80,0.14)]"
                    animate={{ y: [0, -5, 0], rotate: [0, -4, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <ShieldCheck className="size-6 text-[#d8efbc]" />
                  </motion.div>

                  <div className="mb-7 text-center">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#4caf50]/18 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-white/40">
                      <Sparkles className="size-3 text-[#ffc84b]" />
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

                  <div className="mb-6 rounded-[1.6rem] border border-[#4caf50]/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-2">
                    <div className="grid grid-cols-2 rounded-full bg-[#0d0f12]/85 p-1">
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
                      <div className="mt-3 grid grid-cols-2 rounded-full bg-[#0d0f12]/85 p-1">
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
                          className="absolute right-4 top-[52px] text-white/40 transition hover:text-[#d8efbc]"
                          aria-label={showPw ? "Hide password" : "Show password"}
                        >
                          {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>

                      {mode === "register" && accountKind === "professor" && (
                        <div className="rounded-[1.6rem] border border-[#4caf50]/15 bg-[linear-gradient(180deg,rgba(18,23,18,0.84),rgba(13,15,18,0.76))] p-4">
                          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white/75">
                            <Landmark className="size-4 text-[#d8efbc]" />
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
                        className="group relative mt-2 w-full overflow-hidden rounded-2xl py-4 text-sm font-semibold text-[#101417] shadow-[0_18px_34px_rgba(0,0,0,0.32),0_0_24px_rgba(76,175,80,0.18)] transition hover:-translate-y-0.5 disabled:opacity-60"
                        style={{
                          background: "linear-gradient(135deg, #4caf50, #d8efbc)",
                        }}
                      >
                        <span className="absolute inset-y-0 left-[-20%] w-1/3 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.32),transparent)] transition-transform duration-700 group-hover:translate-x-[340%]" />
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
                        className="font-semibold text-[#d8efbc] transition hover:text-white"
                      >
                        {mode === "login" ? "Sign Up" : "Log in"}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </div>
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
      <div className="rounded-2xl border border-[#4caf50]/15 bg-white/[0.055] p-2 backdrop-blur-xl">
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
                  ? "bg-[linear-gradient(135deg,#4caf50,#d8efbc)] text-[#101417] shadow-sm"
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
      <div className="relative flex items-center gap-3 rounded-2xl border border-[#4caf50]/15 bg-white/[0.055] px-4 py-3 backdrop-blur-xl">
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
          ? "bg-[linear-gradient(135deg,#4caf50,#d8efbc)] text-[#101417] shadow-[0_10px_24px_rgba(76,175,80,0.2)]"
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
      <div className="relative overflow-hidden rounded-2xl border border-[#4caf50]/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] px-4 transition focus-within:border-[#4caf50]/55 focus-within:bg-white/[0.09]">
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
