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
    <div style={styles.page}>
      {/* Background decoration */}
      <div style={styles.glowOne}></div>
      <div style={styles.glowTwo}></div>

      <div style={styles.loginWrapper}>
        {/* Left Branding Panel */}
        <div style={styles.brandPanel}>
          <div style={styles.brandIcon}>
            <GraduationCap size={34} strokeWidth={2} />
          </div>

          <h1 style={styles.brandTitle}>
            SmartSched<span style={styles.brandAccent}>AI</span>
          </h1>

          <p style={styles.brandSubtitle}>
            AI-Enabled Smart Classroom &
            <br />
            Timetable Scheduler
          </p>

          <div style={styles.brandDivider}></div>

          <p style={styles.brandDescription}>
            Intelligent scheduling for higher education
            institutions. Manage classrooms, faculty,
            courses and timetables in one place.
          </p>

          <div style={styles.features}>
            <div style={styles.feature}>
              <div style={styles.featureIcon}>
                <GraduationCap size={18} />
              </div>
              <span>Smart Academic Management</span>
            </div>

            <div style={styles.feature}>
              <div style={styles.featureIcon}>
                <Users size={18} />
              </div>
              <span>Faculty & Student Portals</span>
            </div>

            <div style={styles.feature}>
              <div style={styles.featureIcon}>
                <ShieldCheck size={18} />
              </div>
              <span>Secure Role-Based Access</span>
            </div>
          </div>
        </div>

        {/* Login Panel */}
        <div style={styles.loginPanel}>
          <div style={styles.mobileLogo}>
            <div style={styles.mobileLogoIcon}>
              <GraduationCap size={25} />
            </div>

            <div>
              <div style={styles.mobileLogoTitle}>
                SmartSchedAI
              </div>
              <div style={styles.mobileLogoSubtitle}>
                Smart Scheduling Platform
              </div>
            </div>
          </div>

          <div style={styles.loginHeader}>
            <h2 style={styles.loginTitle}>
              Welcome back
            </h2>

            <p style={styles.loginSubtitle}>
              Sign in to access your portal
            </p>
          </div>

          {/* Role Selection */}
          <div style={styles.roleSection}>
            <label style={styles.label}>
              Select Portal
            </label>

            <div style={styles.roleGrid}>
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
                    style={{
                      ...styles.roleButton,
                      ...(active
                        ? styles.roleButtonActive
                        : {}),
                    }}
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
            <div style={styles.errorBox}>
              <AlertCircle size={18} />

              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* Email */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Email Address
              </label>

              <div style={styles.inputWrapper}>
                <Mail
                  size={19}
                  style={styles.inputIcon}
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
                  style={styles.input}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Password
              </label>

              <div style={styles.inputWrapper}>
                <Lock
                  size={19}
                  style={styles.inputIcon}
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
                  style={{
                    ...styles.input,
                    paddingRight: "50px",
                  }}
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  style={styles.passwordButton}
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
            <div style={styles.options}>
              <label style={styles.remember}>
                <input
                  type="checkbox"
                  style={styles.checkbox}
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                style={styles.forgotButton}
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
              style={{
                ...styles.loginButton,
                ...(loading
                  ? styles.loginButtonDisabled
                  : {}),
              }}
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

          <div style={styles.security}>
            <ShieldCheck size={16} />
            <span>
              Secure access to SmartSchedAI
            </span>
          </div>

          <div style={styles.footer}>
            SmartSchedAI • Smart Classroom & Timetable
            Scheduler
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================
   STYLES
===================================================== */

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(135deg, #0f1235 0%, #17184a 45%, #24104d 100%)",
    position: "relative",
    overflow: "hidden",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "30px",
    boxSizing: "border-box",
  },

  glowOne: {
    position: "absolute",
    width: "500px",
    height: "500px",
    borderRadius: "50%",
    background:
      "rgba(37, 99, 235, 0.18)",
    filter: "blur(100px)",
    top: "-220px",
    left: "-180px",
    pointerEvents: "none",
  },

  glowTwo: {
    position: "absolute",
    width: "550px",
    height: "550px",
    borderRadius: "50%",
    background:
      "rgba(124, 58, 237, 0.18)",
    filter: "blur(110px)",
    bottom: "-250px",
    right: "-180px",
    pointerEvents: "none",
  },

  loginWrapper: {
    width: "100%",
    maxWidth: "1050px",
    minHeight: "650px",
    display: "grid",
    gridTemplateColumns: "0.95fr 1.05fr",
    borderRadius: "24px",
    overflow: "hidden",
    background: "rgba(255,255,255,0.97)",
    boxShadow:
      "0 30px 80px rgba(0,0,0,0.35)",
    position: "relative",
    zIndex: 2,
  },

  brandPanel: {
    background:
      "linear-gradient(145deg, #151942 0%, #20205a 55%, #35146a 100%)",
    padding: "55px 48px",
    color: "white",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  brandIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "18px",
    background:
      "linear-gradient(135deg, #0ea5e9, #2563eb)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "0 12px 30px rgba(37,99,235,0.35)",
    marginBottom: "25px",
  },

  brandTitle: {
    margin: 0,
    fontSize: "38px",
    fontWeight: 800,
    letterSpacing: "-1.2px",
  },

  brandAccent: {
    color: "#38bdf8",
  },

  brandSubtitle: {
    fontSize: "18px",
    lineHeight: 1.55,
    color: "#c4c9e8",
    marginTop: "12px",
    marginBottom: "25px",
  },

  brandDivider: {
    width: "55px",
    height: "3px",
    background:
      "linear-gradient(90deg, #38bdf8, #8b5cf6)",
    borderRadius: "10px",
    marginBottom: "25px",
  },

  brandDescription: {
    fontSize: "14px",
    lineHeight: 1.7,
    color: "#aeb5d5",
    maxWidth: "390px",
    margin: 0,
  },

  features: {
    marginTop: "35px",
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  },

  feature: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    color: "#d7dbf0",
    fontSize: "14px",
  },

  featureIcon: {
    width: "34px",
    height: "34px",
    borderRadius: "10px",
    background: "rgba(56,189,248,0.12)",
    border:
      "1px solid rgba(56,189,248,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#38bdf8",
    flexShrink: 0,
  },

  loginPanel: {
    padding: "45px 55px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    background: "#ffffff",
  },

  mobileLogo: {
    display: "none",
  },

  loginHeader: {
    marginBottom: "28px",
  },

  loginTitle: {
    margin: 0,
    color: "#171a3a",
    fontSize: "30px",
    fontWeight: 750,
    letterSpacing: "-0.6px",
  },

  loginSubtitle: {
    margin: "7px 0 0",
    color: "#737891",
    fontSize: "15px",
  },

  roleSection: {
    marginBottom: "22px",
  },

  label: {
    display: "block",
    color: "#292d4d",
    fontSize: "13px",
    fontWeight: 650,
    marginBottom: "8px",
  },

  roleGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, 1fr)",
    gap: "8px",
  },

  roleButton: {
    height: "48px",
    borderRadius: "10px",
    border: "1px solid #e1e4ee",
    background: "#f8f9fc",
    color: "#656b82",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },

  roleButtonActive: {
    background:
      "linear-gradient(135deg, #eef5ff, #f2edff)",
    border:
      "1px solid #7c8ff5",
    color: "#3157d5",
    boxShadow:
      "0 4px 12px rgba(49,87,213,0.10)",
  },

  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    padding: "11px 13px",
    marginBottom: "18px",
    borderRadius: "10px",
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#be123c",
    fontSize: "13px",
  },

  inputGroup: {
    marginBottom: "19px",
  },

  inputWrapper: {
    position: "relative",
    width: "100%",
  },

  inputIcon: {
    position: "absolute",
    left: "15px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#8990a8",
    pointerEvents: "none",
  },

  input: {
    width: "100%",
    height: "50px",
    boxSizing: "border-box",
    border:
      "1px solid #dfe3ed",
    borderRadius: "10px",
    padding:
      "0 15px 0 45px",
    outline: "none",
    background: "#fafbfe",
    color: "#20243d",
    fontSize: "14px",
    transition: "all 0.2s ease",
  },

  passwordButton: {
    position: "absolute",
    right: "13px",
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "transparent",
    color: "#858ba3",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: "4px",
  },

  options: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "23px",
    fontSize: "12px",
  },

  remember: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    color: "#6c7289",
    cursor: "pointer",
  },

  checkbox: {
    width: "14px",
    height: "14px",
    accentColor: "#4f67e8",
    cursor: "pointer",
  },

  forgotButton: {
    border: "none",
    background: "transparent",
    color: "#4161dc",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "12px",
    padding: 0,
  },

  loginButton: {
    width: "100%",
    height: "52px",
    border: "none",
    borderRadius: "10px",
    background:
      "linear-gradient(135deg, #2563eb, #4f46e5)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "9px",
    fontSize: "15px",
    fontWeight: 650,
    cursor: "pointer",
    boxShadow:
      "0 10px 25px rgba(59,78,220,0.25)",
    transition: "all 0.2s ease",
  },

  loginButtonDisabled: {
    opacity: 0.65,
    cursor: "not-allowed",
    boxShadow: "none",
  },

  security: {
    marginTop: "22px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "7px",
    color: "#8a90a6",
    fontSize: "11px",
  },

  footer: {
    marginTop: "18px",
    textAlign: "center",
    color: "#a0a5b7",
    fontSize: "10px",
  },
};

export default Login;