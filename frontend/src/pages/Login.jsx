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
// Tokenization only. The markup, the copy, the role selector and the whole
// submit path below are byte-for-byte the behaviour of the previous version;
// the only thing that changed is that the `styles` object of inline CSS is
// gone and every colour now comes from a design token, so this page follows
// the light/dark theme like the rest of the app. Layout geometry (the
// 1050x650 two-column card, the 0.95fr/1.05fr split, every spacing value) is
// reproduced exactly.
// =====================================================

/** Shared geometry for both text inputs; only the right padding differs. */
const INPUT_CLASS =
  "h-[50px] w-full rounded-[10px] border border-border bg-background pl-[45px] text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40";

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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-[30px]">
      {/* Background decoration */}
      <div className="pointer-events-none absolute -top-[220px] -left-[180px] size-[500px] rounded-full bg-primary/15 blur-[100px]"></div>
      <div className="pointer-events-none absolute -right-[180px] -bottom-[250px] size-[550px] rounded-full bg-chart-4/15 blur-[110px]"></div>

      <div className="relative z-[2] grid min-h-[650px] w-full max-w-[1050px] grid-cols-[0.95fr_1.05fr] overflow-hidden rounded-3xl border border-border bg-card shadow-md">
        {/* Left Branding Panel */}
        <div className="flex flex-col justify-center bg-primary px-12 py-[55px] text-primary-foreground">
          <div className="mb-[25px] flex size-16 items-center justify-center rounded-[18px] bg-primary-foreground/15">
            <GraduationCap size={34} strokeWidth={2} />
          </div>

          <h1 className="m-0 text-[38px] font-extrabold tracking-[-1.2px] text-primary-foreground/80">
            SmartSched<span className="text-primary-foreground">AI</span>
          </h1>

          <p className="mt-3 mb-[25px] text-[18px] leading-[1.55] text-primary-foreground/80">
            AI-Enabled Smart Classroom &
            <br />
            Timetable Scheduler
          </p>

          <div className="mb-[25px] h-[3px] w-[55px] rounded-[10px] bg-primary-foreground/40"></div>

          <p className="m-0 max-w-[390px] text-sm leading-[1.7] text-primary-foreground/70">
            Intelligent scheduling for higher education
            institutions. Manage classrooms, faculty,
            courses and timetables in one place.
          </p>

          <div className="mt-[35px] flex flex-col gap-[15px]">
            <div className="flex items-center gap-3 text-sm text-primary-foreground/90">
              <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
                <GraduationCap size={18} />
              </div>
              <span>Smart Academic Management</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-primary-foreground/90">
              <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
                <Users size={18} />
              </div>
              <span>Faculty & Student Portals</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-primary-foreground/90">
              <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
                <ShieldCheck size={18} />
              </div>
              <span>Secure Role-Based Access</span>
            </div>
          </div>
        </div>

        {/* Login Panel */}
        <div className="flex flex-col justify-center bg-card px-[55px] py-[45px]">
          <div className="hidden">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-primary text-primary-foreground">
              <GraduationCap size={25} />
            </div>

            <div>
              <div className="text-base font-semibold text-foreground">
                SmartSchedAI
              </div>
              <div className="text-xs text-muted-foreground">
                Smart Scheduling Platform
              </div>
            </div>
          </div>

          <div className="mb-7">
            <h2 className="m-0 text-[30px] font-bold tracking-[-0.6px] text-foreground">
              Welcome back
            </h2>

            <p className="mt-[7px] mb-0 text-[15px] text-muted-foreground">
              Sign in to access your portal
            </p>
          </div>

          {/* Role Selection */}
          <div className="mb-[22px]">
            <label className="mb-2 block text-[13px] font-semibold text-foreground">
              Select Portal
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
                    className={cn(
                      "flex h-12 cursor-pointer items-center justify-center gap-[7px] rounded-[10px] border border-border bg-muted text-[13px] font-semibold text-muted-foreground transition-colors duration-200",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon
                      size={18}
                      strokeWidth={2}
                    />

                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="mb-[18px] flex items-center gap-[9px] rounded-[10px] border border-destructive/30 bg-destructive/10 px-[13px] py-[11px] text-[13px] text-destructive">
              <AlertCircle size={18} />

              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* Email */}
            <div className="mb-[19px]">
              <label className="mb-2 block text-[13px] font-semibold text-foreground">
                Email Address
              </label>

              <div className="relative w-full">
                <Mail
                  size={19}
                  className="pointer-events-none absolute top-1/2 left-[15px] -translate-y-1/2 text-muted-foreground"
                />

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
                  className={cn(INPUT_CLASS, "pr-[15px]")}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="mb-[19px]">
              <label className="mb-2 block text-[13px] font-semibold text-foreground">
                Password
              </label>

              <div className="relative w-full">
                <Lock
                  size={19}
                  className="pointer-events-none absolute top-1/2 left-[15px] -translate-y-1/2 text-muted-foreground"
                />

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
                  className={cn(INPUT_CLASS, "pr-[50px]")}
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  className="absolute top-1/2 right-[13px] flex -translate-y-1/2 cursor-pointer items-center border-0 bg-transparent p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            {/* Options */}
            <div className="mb-[23px] flex items-center justify-between text-xs">
              <label className="flex cursor-pointer items-center gap-[7px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-[14px] cursor-pointer accent-primary"
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                onClick={() =>
                  setError(
                    "Please contact your administrator to reset your password."
                  )
                }
              >
                Forgot password?
              </button>
            </div>

            {/* Login */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex h-[52px] w-full items-center justify-center gap-[9px] rounded-[10px] border-0 bg-primary text-[15px] font-semibold text-primary-foreground shadow-sm transition-colors duration-200",
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
                <ArrowRight size={19} />
              )}
            </button>
          </form>

          <div className="mt-[22px] flex items-center justify-center gap-[7px] text-[11px] text-muted-foreground">
            <ShieldCheck size={16} />
            <span>
              Secure access to SmartSchedAI
            </span>
          </div>

          <div className="mt-[18px] text-center text-[10px] text-muted-foreground">
            SmartSchedAI • Smart Classroom & Timetable
            Scheduler
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
