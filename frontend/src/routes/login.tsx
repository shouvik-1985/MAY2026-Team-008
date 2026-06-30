import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  useEffect,
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
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { getStudentDashboard, googleLogin, loginAccount, registerAccount } from "@/lib/api";
import { setAuthSession, type AuthResponse } from "@/lib/auth";
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
  const showGoogleAccess = mode === "login" || accountKind === "student";
  const hasTyped = Boolean(
    fullName || email || password || address || gender || highestEducation || expertiseField || licenseDocumentName,
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
  }, [googleClientId]);

  async function finishAuth(auth: AuthResponse) {
    clearStoredDashboard();
    setAuthSession(auth);
    setStoredRole(auth.user.role);
    if (auth.user.role === "faculty") {
      navigate({ to: "/professor", replace: true });
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

  async function handleGoogleCredential(credential: string) {
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
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f7f5] px-4 py-10 text-[#242428]">
      <motion.div
        className="pointer-events-none absolute -left-40 top-0 h-full w-80 bg-black/15 blur-3xl"
        animate={{ opacity: [0.25, 0.42, 0.25] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -right-40 top-0 h-full w-80 bg-black/15 blur-3xl"
        animate={{ opacity: [0.36, 0.2, 0.36] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <Link
        to="/"
        className="absolute left-6 top-6 z-10 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-black/45 transition hover:text-black"
      >
        <span className="size-2 rounded-full bg-[#1f1f23]" />
        CampusVerse
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 28, filter: "blur(16px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className={`relative mx-auto flex min-h-[calc(100vh-5rem)] w-full items-center justify-center ${
          mode === "register" && accountKind === "professor" ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <motion.div
          layout
          onMouseEnter={() => resetFeedback("hover")}
          onMouseMove={updatePointer}
          onMouseLeave={() => {
            setScenePointer({ x: 0, y: 0 });
            if (!busy && !error) setSceneMood("idle");
          }}
          className="relative grid w-full overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.12)] lg:grid-cols-[1.1fr_0.9fr]"
        >
          <CuteLoginScene mood={activeSceneMood} focus={focusedField} pointer={scenePointer} />

          <div className="relative flex min-h-[680px] flex-col justify-center rounded-[1.8rem] bg-white px-7 py-10 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] sm:px-12 lg:min-h-[640px]">
            <motion.div
              className="mx-auto mb-8 grid size-12 place-items-center rounded-2xl bg-[#202025] text-white shadow-[0_14px_30px_rgba(0,0,0,0.18)]"
              animate={{ y: [0, -5, 0], rotate: [0, -4, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <ShieldCheck className="size-6" />
            </motion.div>

            <div className="mb-8 text-center">
              <h1 className="font-display text-4xl font-bold tracking-tight text-[#242428]">
                {mode === "login" ? "Welcome back!" : "Create account"}
              </h1>
              <p className="mt-3 text-xs text-black/45">
                {mode === "login"
                  ? "Please enter your details"
                  : accountKind === "professor"
                    ? "Create your verified professor profile."
                    : "Create your student profile."}
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-full bg-[#f1f1f1] p-1">
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
              <div className="mb-6 grid grid-cols-2 rounded-full bg-[#f1f1f1] p-1">
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
                  if (!busy && !error && !showPw) setSceneMood(focusedField ? "typing" : "hover");
                }}
                className="absolute right-0 top-[36px] text-black/45 transition hover:text-black"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {mode === "register" && accountKind === "professor" && (
              <div className="grid max-h-[340px] gap-5 overflow-y-auto pr-2 md:grid-cols-2">
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
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="group relative mt-2 w-full overflow-hidden rounded-full bg-[#242428] py-3.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:bg-black disabled:opacity-60"
            >
              <span className="relative z-10 inline-flex items-center justify-center gap-3">
                {busy ? "Authenticating" : mode === "login" ? "Log in" : "Create account"}
                {!busy && <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />}
              </span>
            </button>
          </form>

          {showGoogleAccess && (
            <>
              <div className="flex items-center gap-3 pt-6 text-[10px] uppercase tracking-[0.24em] text-black/30">
                <span className="h-px flex-1 bg-black/10" />
                or
                <span className="h-px flex-1 bg-black/10" />
              </div>

              {googleClientId && <div ref={googleButtonRef} className="mt-4 flex justify-center" />}

              {!googleClientId && (
                <p className="mt-6 text-center text-xs text-black/45">
                  Add your Google OAuth client ID to enable real Google login.
                </p>
              )}
            </>
          )}
            <div className="mt-10 text-center text-xs text-black/45">
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
                className="font-semibold text-[#242428] transition hover:text-black"
              >
                {mode === "login" ? "Sign Up" : "Log in"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function CuteLoginScene({
  mood,
  focus,
  pointer,
}: {
  mood: SceneMood;
  focus: FocusField;
  pointer: ScenePointer;
}) {
  const isError = mood === "error";
  const isSuccess = mood === "success";
  const isBusy = mood === "busy";
  const isHover = mood === "hover";
  const isTyping = mood === "typing";
  const isPeek = mood === "peek";

  return (
    <motion.div
      className="relative hidden min-h-[640px] overflow-hidden bg-[#ececec] lg:block"
      animate={{
        backgroundColor: isError ? "#f4e6e6" : isSuccess ? "#eaf5ef" : "#ececec",
      }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        className="absolute inset-x-0 bottom-[19%] mx-auto h-[360px] w-[540px]"
        animate={{
          x: isTyping || isPeek ? 20 : isHover ? pointer.x * 10 : 0,
          y: isSuccess ? [0, -16, 0] : isError ? [0, 4, -4, 3, 0] : isHover ? pointer.y * 8 : 0,
          rotate: isTyping || isPeek ? 1.8 : isError ? [0, -1.5, 1.5, -1, 0] : 0,
        }}
        transition={{
          duration: isSuccess ? 0.7 : isError ? 0.42 : 0.28,
          ease: "easeOut",
        }}
      >
        <CuteBlob
          kind="purple"
          className="left-[32%] top-[45px] h-[255px] w-[120px] rounded-[22px]"
          color="linear-gradient(180deg, #8757f4 0%, #6f43e7 100%)"
          entry={{ x: 45, y: -360, rotate: 8, opacity: 0 }}
          entryDelay={0.18}
          mood={mood}
          focus={focus}
          pointer={pointer}
        />
        <CuteBlob
          kind="pink"
          className="left-[51%] top-[125px] h-[175px] w-[86px] rounded-[16px]"
          color="linear-gradient(180deg, #f1489b 0%, #d72f84 100%)"
          entry={{ x: 0, y: -320, rotate: 0, opacity: 0 }}
          entryDelay={0.34}
          mood={mood}
          focus={focus}
          pointer={pointer}
        />
        <CuteBlob
          kind="yellow"
          className="left-[64%] top-[176px] h-[124px] w-[112px] rounded-t-full rounded-b-[16px]"
          color="linear-gradient(180deg, #ffe55c 0%, #ffd33d 100%)"
          entry={{ x: 170, y: 80, rotate: 0, opacity: 0 }}
          entryDelay={0.52}
          mood={mood}
          focus={focus}
          pointer={pointer}
        />
        <CuteBlob
          kind="orange"
          className="left-[11%] top-[228px] h-[124px] w-[255px] rounded-t-full rounded-b-[18px]"
          color="linear-gradient(180deg, #ff9b3f 0%, #ff762c 100%)"
          entry={{ x: -210, y: 90, rotate: 0, opacity: 0 }}
          entryDelay={0.72}
          wide
          mood={mood}
          focus={focus}
          pointer={pointer}
        />
      </motion.div>

      <motion.div
        className="absolute bottom-[18%] left-1/2 h-8 w-[530px] -translate-x-1/2 rounded-full bg-black/10 blur-xl"
        animate={{
          scaleX: isSuccess ? [0.92, 1.12, 0.92] : [0.92, 1.02, 0.92],
          opacity: isError ? [0.22, 0.3, 0.22] : [0.3, 0.42, 0.3],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

function CuteBlob({
  kind,
  className,
  color,
  entry,
  entryDelay,
  mood,
  focus,
  pointer,
  wide = false,
}: {
  kind: "purple" | "pink" | "yellow" | "orange";
  className: string;
  color: string;
  entry: { x: number; y: number; rotate: number; opacity: number };
  entryDelay: number;
  mood: SceneMood;
  focus: FocusField;
  pointer: ScenePointer;
  wide?: boolean;
}) {
  const isError = mood === "error";
  const isSuccess = mood === "success";
  const isBusy = mood === "busy";
  const isHover = mood === "hover";
  const isTyping = mood === "typing";
  const isPeek = mood === "peek";
  const repeat = isError || isSuccess || isTyping || isPeek ? 0 : Infinity;
  const floatAmount = kind === "pink" ? -8 : kind === "yellow" ? -5 : kind === "orange" ? -4 : -9;
  const fieldTilt =
    focus === "password"
      ? kind === "purple"
        ? -7
        : kind === "pink"
          ? -8
          : kind === "yellow"
            ? 7
            : 0
      : focus === "email"
        ? kind === "purple"
          ? 3
          : kind === "pink"
            ? -5
            : kind === "yellow"
              ? 5
              : 0
        : 0;
  const peekTilt = kind === "purple" ? -12 : kind === "pink" ? -5 : kind === "yellow" ? 8 : 0;
  const successBounce = kind === "purple" || kind === "pink" ? -24 : kind === "orange" ? -8 : -14;

  return (
    <motion.div
      className={`absolute ${className}`}
      initial={entry}
      animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
      transition={{ duration: 1.35, delay: entryDelay, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="relative size-full shadow-[0_22px_40px_rgba(0,0,0,0.12)]"
        style={{ background: color, borderRadius: "inherit", filter: "drop-shadow(0 10px 12px rgba(0,0,0,0.10))" }}
        animate={{
          y: isError
            ? [0, 4, -4, 4, 0]
            : isSuccess
              ? [0, successBounce, 0]
              : isTyping || isPeek
                ? kind === "orange"
                  ? 0
                  : -4
                : isHover
                  ? pointer.y * 10
                  : [0, floatAmount, 0],
          x: isHover ? pointer.x * (kind === "yellow" ? 8 : 5) : isTyping || isPeek ? (kind === "yellow" ? 10 : 6) : 0,
          rotate: isError
            ? [0, -3, 3, -2, 0]
            : isSuccess
              ? [0, 3, -2, 0]
              : isPeek
                ? peekTilt
                : isTyping
                  ? fieldTilt
                  : isHover
                    ? pointer.x * 4
                    : 0,
          scaleX: isPeek && kind === "purple" ? 0.9 : isBusy ? [1, 1.03, 0.98, 1] : 1,
          scaleY: isPeek && kind === "purple" ? 1.05 : isBusy ? [1, 1.06, 0.96, 1] : [1, 1.02, 1],
        }}
        transition={{
          duration: isError ? 0.48 : isSuccess ? 0.78 : isTyping || isPeek ? 0.28 : isHover ? 0.18 : 3.7,
          repeat,
          delay: isHover || isTyping || isPeek || isError || isSuccess ? 0 : entryDelay,
          ease: "easeInOut",
        }}
      >
        <CuteFace kind={kind} mood={mood} focus={focus} pointer={pointer} wide={wide} />
      </motion.div>
    </motion.div>
  );
}

function CuteFace({
  kind,
  mood,
  focus,
  pointer,
  wide,
}: {
  kind: "purple" | "pink" | "yellow" | "orange";
  mood: SceneMood;
  focus: FocusField;
  pointer: ScenePointer;
  wide?: boolean;
}) {
  const isError = mood === "error";
  const isSuccess = mood === "success";
  const isBusy = mood === "busy";
  const isTyping = mood === "typing";
  const isPeek = mood === "peek";
  const lookRight = isTyping || focus || isPeek;
  const pupil = {
    x: isPeek ? (kind === "yellow" ? -1 : 3) : lookRight ? 4 : pointer.x * 2.2,
    y: isPeek ? (kind === "pink" ? -3 : -1) : focus === "password" ? 2.5 : pointer.y * 1.8,
  };
  const eyeTop = wide ? "top-[45%]" : kind === "yellow" ? "top-[26%]" : "top-[18%]";
  const eyeLeft = wide ? "left-[25%]" : kind === "yellow" ? "left-[38%]" : "left-[28%]";
  const eyeGap = kind === "yellow" ? "gap-10" : wide ? "gap-12" : "gap-7";
  const singleEye = kind === "yellow" && !isSuccess;

  return (
    <>
      <div className={`absolute ${eyeLeft} ${eyeTop} flex ${eyeGap}`}>
        {isError ? <StressEye /> : kind === "orange" ? <DotEye mood={mood} pupil={pupil} /> : <BlinkEye mood={mood} pupil={pupil} />}
        {!singleEye &&
          (isError ? (
            <StressEye flip />
          ) : kind === "orange" ? (
            <DotEye mood={mood} pupil={pupil} />
          ) : (
            <BlinkEye mood={mood} pupil={pupil} />
          ))}
      </div>
      <Mouth kind={kind} mood={mood} focus={focus} isBusy={isBusy} />
    </>
  );
}

function Mouth({
  kind,
  mood,
  focus,
  isBusy,
}: {
  kind: "purple" | "pink" | "yellow" | "orange";
  mood: SceneMood;
  focus: FocusField;
  isBusy: boolean;
}) {
  const isError = mood === "error";
  const isSuccess = mood === "success";
  const isTyping = mood === "typing";
  const isPeek = mood === "peek";

  if (kind === "pink" && !isError && !isSuccess && !isPeek) return null;

  if (isPeek) {
    if (kind === "yellow") return <WavyMouth className="left-[48%] top-[48%] w-14" />;
    if (kind === "pink") return <LookUpMouth className="left-[40%] top-[44%]" />;
    return <Frown className={kind === "orange" ? "left-[48%] top-[58%]" : "left-[42%] top-[34%]"} />;
  }

  if (isError) {
    return <Frown className={kind === "orange" ? "left-[49%] top-[58%]" : "left-[42%] top-[34%]"} />;
  }

  if (isSuccess) {
    return <Smile className={kind === "orange" ? "left-[48%] top-[56%]" : kind === "yellow" ? "left-[38%] top-[42%]" : "left-[42%] top-[31%]"} wide={kind === "orange"} />;
  }

  if (kind === "purple" && (isTyping || focus)) {
    return <span className="absolute left-[55%] top-[24%] h-9 w-[6px] rounded-full bg-[#202025]" />;
  }

  if (kind === "yellow") {
    return (
      <motion.span
        className="absolute left-[39%] top-[48%] h-[5px] w-14 rounded-full bg-[#202025]"
        animate={{ width: isBusy ? [42, 56, 42] : isTyping ? 58 : 48 }}
        transition={{ duration: 0.9, repeat: isBusy ? Infinity : 0 }}
      />
    );
  }

  if (kind === "orange" || kind === "purple") {
    return <Smile className={kind === "orange" ? "left-[48%] top-[57%]" : "left-[42%] top-[31%]"} wide={kind === "orange"} />;
  }

  return null;
}

function BlinkEye({ mood, pupil }: { mood: SceneMood; pupil: ScenePointer }) {
  if (mood === "error") {
    return (
      <span className="relative block size-4">
        <span className="absolute left-1/2 top-1/2 h-[3px] w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-[#202025]" />
        <span className="absolute left-1/2 top-1/2 h-[3px] w-4 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-[#202025]" />
      </span>
    );
  }

  return (
    <span className="relative block size-3 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
      <motion.span
        className="absolute left-1/2 top-1/2 block size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#202025]"
        animate={{
          scaleY: mood === "success" ? [1, 0.2, 1] : [1, 1, 0.08, 1],
          x: pupil.x,
          y: pupil.y,
        }}
        transition={{
          duration: mood === "success" ? 0.7 : 4.5,
          repeat: mood === "success" || mood === "typing" || mood === "peek" ? 0 : Infinity,
          times: mood === "success" ? undefined : [0, 0.88, 0.92, 1],
        }}
      />
    </span>
  );
}

function DotEye({ mood, pupil }: { mood: SceneMood; pupil: ScenePointer }) {
  if (mood === "error") {
    return <span className="block h-[4px] w-4 rotate-12 rounded-full bg-[#202025]" />;
  }

  return (
    <motion.span
      className="block size-3 rounded-full bg-[#202025]"
      animate={{
        scaleY: mood === "success" ? [1, 0.18, 1] : [1, 1, 0.12, 1],
        x: pupil.x,
        y: pupil.y,
      }}
      transition={{
        duration: mood === "success" ? 0.7 : 4.4,
        repeat: mood === "success" || mood === "typing" || mood === "peek" ? 0 : Infinity,
        times: mood === "success" ? undefined : [0, 0.9, 0.94, 1],
      }}
    />
  );
}

function StressEye({ flip = false }: { flip?: boolean }) {
  return <span className={`block h-[4px] w-4 rounded-full bg-[#202025] ${flip ? "-rotate-12" : "rotate-12"}`} />;
}

function Smile({ className, wide = false }: { className: string; wide?: boolean }) {
  return (
    <motion.span
      className={`absolute rounded-b-full border-b-[5px] border-[#202025] ${wide ? "h-4 w-9" : "h-3 w-7"} ${className}`}
      animate={{ scaleX: [1, 1.14, 1] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function Frown({ className }: { className: string }) {
  return <span className={`absolute h-3 w-8 rounded-t-full border-t-[5px] border-[#202025] ${className}`} />;
}

function LookUpMouth({ className }: { className: string }) {
  return <span className={`absolute h-[5px] w-8 rounded-full bg-[#202025] ${className}`} />;
}

function WavyMouth({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 56 16" className={`absolute h-4 ${className}`} aria-hidden="true">
      <motion.path
        d="M2 8 C 10 1, 18 15, 26 8 S 42 1, 54 8"
        fill="none"
        stroke="#202025"
        strokeLinecap="round"
        strokeWidth="5"
        animate={{ d: ["M2 8 C 10 1, 18 15, 26 8 S 42 1, 54 8", "M2 8 C 10 15, 18 1, 26 8 S 42 15, 54 8", "M2 8 C 10 1, 18 15, 26 8 S 42 1, 54 8"] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
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
      <div className="mb-1.5 text-sm font-medium text-[#57575f]">{label}</div>
      <div className="rounded-2xl border border-black/10 bg-[#f7f7f7] p-2">
        <div className="mb-2 flex items-center gap-2 px-2 text-xs text-black/45">
          <Icon className="size-4" />
          <span>{value ? options.find((option) => option.value === value)?.label : "Choose gender"}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                value === option.value
                  ? "bg-[#242428] text-white shadow-sm"
                  : "bg-white text-black/55 hover:bg-black/5 hover:text-black"
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
      <div className="mb-1.5 text-sm font-medium text-[#57575f]">{label}</div>
      <div className="relative flex items-center gap-3 rounded-2xl border border-black/10 bg-[#f7f7f7] px-4 py-3">
        <FileCheck2 className="size-4 shrink-0 text-black/45" />
        <span className="flex-1 truncate text-sm text-black/55">
          {fileName || "Upload license / appointment proof"}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/45">Choose</span>
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
      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
        active ? "bg-white text-[#242428] shadow-sm" : "text-black/40 hover:text-black"
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
      <div className="mb-1.5 text-sm font-medium text-[#57575f]">{label}</div>
      <div className="relative">
        <Icon className="absolute left-0 top-1/2 size-4 -translate-y-1/2 text-black/35" />
        <input
          {...rest}
          required
          className="w-full border-0 border-b border-black/25 bg-transparent py-3 pl-7 pr-8 text-sm text-[#242428] placeholder:text-black/25 outline-none transition focus:border-black"
        />
      </div>
    </label>
  );
}
