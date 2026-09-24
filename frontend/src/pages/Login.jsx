import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap,
  ShieldCheck,
  Users,
  UserRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

// =====================================================
// /login (U9)
//
// The public landing page and the only screen an unauthenticated visitor
// sees, so it is deliberately quiet: the branding half is a muted surface
// rather than a full-bleed saturated panel, and full-strength `primary` is
// spent on exactly one element — the sign-in button. Everything else that
// carries the accent does so as a 10% wash with the solid token on top
// (`bg-primary/10 text-primary`), the same pattern the dashboard uses for its
// card icons, which stays legible in both themes because the wash sits over
// whatever the card colour currently is.
//
// The submit path, the role selector, the validation and the error copy —
// including the message that distinguishes an unreachable API from bad
// credentials — are unchanged from the previous version. This is a visual
// pass only.
// =====================================================

/** Shared geometry for both text inputs; only the right padding differs. */
const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-border bg-background pl-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40";

/** What the product does, as three plain statements. */
const HIGHLIGHTS = [
  { id: "academic", label: "Smart academic management", icon: GraduationCap },
  { id: "portals", label: "Faculty & student portals", icon: Users },
  { id: "access", label: "Secure role-based access", icon: ShieldCheck },
];

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("faculty");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const roles = [
    {
      id: "admin",
      label: "Admin",
      icon: ShieldCheck,
    },
    {
      id: "faculty",
      label: "Faculty",
      icon: Users,
    },
    {
      id: "student",
      label: "Student",
      icon: UserRound,
    },
  ];

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      let data;
      try {
        const response = await api.post("/auth/login", {
          email: email.trim(),
          password,
          role,
        });
        data = response.data;
      } catch (requestError) {
        // No response at all means the request never reached the API
        // (server down, wrong port, CORS) - not a credentials problem.
        if (!requestError.response) {
          throw new Error(
            "Cannot reach the server. Make sure the backend is running on port 5000 and open the app at http://localhost:5173."
          );
        }
        const errData = requestError.response.data || {};
        throw new Error(
          errData.error ||
            errData.message ||
            "Invalid email or password."
        );
      }

      // Save authentication information
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      console.log("Login successful:", data.user);

      // Redirect according to the role returned by backend
      const loggedInRole = String(
        data.user?.role || ""
      ).toLowerCase();

      if (loggedInRole === "admin") {
        navigate("/");
      } else if (loggedInRole === "faculty") {
        navigate("/faculty-portal");
      } else if (loggedInRole === "student") {
        navigate("/student-portal");
      } else {
        navigate("/");
      }
    } catch (error) {
      console.error("Login error:", error);
      setError(
        error.message || "Unable to login. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid w-full max-w-5xl animate-in overflow-hidden rounded-xl border border-border bg-card shadow-sm fade-in duration-200 lg:grid-cols-[0.9fr_1.1fr]">
        {/* ---- Branding panel ---- */}
        <div className="flex flex-col justify-center gap-6 border-b border-border bg-muted px-6 py-8 sm:px-10 lg:border-r lg:border-b-0 lg:py-12">
          <div className="min-w-0">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="size-6" />
            </div>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
              SmartSched<span className="text-primary">AI</span>
            </h1>

            <p className="mt-2 text-base text-muted-foreground">
              AI-Enabled Smart Classroom &amp; Timetable Scheduler
            </p>
          </div>

          <div className="h-px w-12 rounded-full bg-border"></div>

          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Intelligent scheduling for higher education institutions. Manage
            classrooms, faculty, courses and timetables in one place.
          </p>

          {/*
            Hidden below lg so the phone layout is the wordmark and the form,
            nothing between them.
          */}
          <ul className="hidden list-none flex-col gap-3 p-0 lg:flex">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;

              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 text-sm text-foreground"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>

                  <span>{item.label}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ---- Sign-in panel ---- */}
        <div className="flex flex-col justify-center bg-card px-6 py-8 sm:px-10 lg:py-12">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Welcome back
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to access your portal
            </p>
          </div>

          {/* Role Selection */}
          <div className="mb-5">
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              Select portal
            </label>

            <div className="grid grid-cols-3 gap-2">
              {roles.map((item) => {
                const Icon = item.icon;
                const active = role === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setRole(item.id);
                      setError("");
                    }}
                    aria-pressed={active}
                    className={cn(
                      "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border text-[13px] font-medium transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />

                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] leading-relaxed text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />

              <span className="min-w-0">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* Email */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-muted-foreground">
                Email address
              </label>

              <div className="relative w-full">
                <Mail className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" />

                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder={
                    role === "student"
                      ? "Enter your university email"
                      : "Enter your email address"
                  }
                  className={cn(INPUT_CLASS, "pr-3")}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-muted-foreground">
                Password
              </label>

              <div className="relative w-full">
                <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  placeholder="Enter your password"
                  className={cn(INPUT_CLASS, "pr-11")}
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  className="absolute inset-y-0 right-3 flex cursor-pointer items-center border-0 bg-transparent p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Options */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3.5 cursor-pointer accent-primary"
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                onClick={() =>
                  setError(
                    "Please contact your administrator to reset your password."
                  )
                }
              >
                Forgot password?
              </button>
            </div>

            {/*
              The one element on this page that carries full-strength primary.
            */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex h-11 w-full items-center justify-center gap-2 rounded-lg border-0 bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors",
                loading
                  ? "cursor-not-allowed opacity-65 shadow-none"
                  : "cursor-pointer hover:bg-primary/90"
              )}
            >
              <span>
                {loading
                  ? "Signing in..."
                  : `Sign in as ${
                      role.charAt(0).toUpperCase() +
                      role.slice(1)
                    }`}
              </span>

              {!loading && (
                <ArrowRight className="size-4" />
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-border pt-4 text-center">
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              <span>Secure access to SmartSchedAI</span>
            </p>

            <p className="mt-1.5 text-[11px] text-muted-foreground">
              SmartSchedAI • Smart Classroom &amp; Timetable Scheduler
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
