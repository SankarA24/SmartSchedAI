import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";

import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  Bell,
  User,
  LogOut,
  GraduationCap,
  Mail,
  Building2,
  BriefcaseBusiness,
  Clock,
  Pencil,
  Save,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";

import useIdentity from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";


// =========================================================
// AVAILABILITY / PREFERENCE HELPERS
//
// `Faculty.availability` is keyed by lowercase day with `[{start, end}]`
// windows in "HH:MM"; the timetable grid uses capitalised day names. These
// helpers bridge the two and express a window set as "which grid slots am I
// available for", which is the only question this editor asks.
// =========================================================

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** "HH:MM" -> minutes since midnight, or null when malformed. */
function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The `"HH:MM-HH:MM"` label used by preference strings and by the UI. */
function slotLabel(slot) {
  return `${slot.start}-${slot.end}`;
}

/** All seven days present, each an array of plain `{start, end}` windows. */
function normalizeAvailability(availability) {
  const source = availability || {};
  const result = {};

  for (const day of DAY_KEYS) {
    const windows = Array.isArray(source[day]) ? source[day] : [];
    result[day] = windows
      .filter((window) => window && window.start && window.end)
      .map((window) => ({ start: window.start, end: window.end }));
  }

  return result;
}

/** True when some window fully contains this grid slot. */
function coversSlot(windows, slot) {
  const slotStart = toMinutes(slot.start);
  const slotEnd = toMinutes(slot.end);
  if (slotStart === null || slotEnd === null) return false;

  return (windows || []).some((window) => {
    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    if (start === null || end === null) return false;
    return start <= slotStart && end >= slotEnd;
  });
}

/**
 * The editable draft: for every day the grid teaches, the stored windows are
 * expanded into the exact grid slots they cover (that is what the editor
 * toggles, and what the validator checks entries against). Days outside the
 * grid keep their stored windows verbatim so saving never silently drops
 * them.
 */
function buildAvailabilityDraft(availability, gridDays, gridSlots) {
  const stored = normalizeAvailability(availability);
  const editable = new Set(
    (gridDays || []).map((day) => String(day).toLowerCase())
  );

  const draft = {};

  for (const day of DAY_KEYS) {
    if (!editable.has(day)) {
      draft[day] = stored[day];
      continue;
    }

    draft[day] = (gridSlots || [])
      .filter((slot) => coversSlot(stored[day], slot))
      .map((slot) => ({ start: slot.start, end: slot.end }));
  }

  return draft;
}

export default function FacultyProfile() {
  const navigate = useNavigate();

  // Identity (and the linked Faculty doc) from the shared hook — this page
  // no longer re-reads `localStorage` or looks itself up by email.
  const {
    user,
    faculty: linkedFaculty,
    linked,
    loading: identityLoading,
  } = useIdentity();

  // The timetable grid the availability editor offers slots from.
  const { grid } = useSystemConfig();

  // Local copy of the profile so a successful save repaints immediately.
  const [faculty, setFaculty] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

  // Editing state — availability and preferences only. Name, email and
  // department are not editable here: `PUT /api/faculty/:id` strips
  // everything else off a faculty caller's body anyway
  // (`allowSelfOrAdmin` in backend/routes/facultyRoute.js).
  const [editing, setEditing] = useState(false);
  const [draftAvailability, setDraftAvailability] = useState(null);
  const [draftPreferred, setDraftPreferred] = useState([]);
  const [draftAvoided, setDraftAvoided] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);

  const signedIn = Boolean(user);
  const facultyId = user?.facultyId ? String(user.facultyId) : null;

  const gridDays = useMemo(() => grid?.days || [], [grid]);
  const gridSlots = useMemo(() => grid?.slots || [], [grid]);

  useEffect(() => {
    setFaculty(linkedFaculty || null);
  }, [linkedFaculty]);

  useEffect(() => {
    if (identityLoading) return undefined;

    if (!signedIn) {
      navigate("/login");
      return undefined;
    }

    if (!linked) {
      setNotifications([]);
      setNotificationsLoading(false);
      return undefined;
    }

    let cancelled = false;

    const loadNotifications = async () => {
      try {
        // Audience-scoped server-side; only used for the sidebar badge.
        const response = await api.get(`/notifications`);
        if (cancelled) return;
        setNotifications(
          Array.isArray(response.data) ? response.data : []
        );
      } catch (error) {
        console.error(
          "Failed to load faculty notifications:",
          error
        );
        if (!cancelled) setNotifications([]);
      } finally {
        if (!cancelled) setNotificationsLoading(false);
      }
    };

    loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [identityLoading, signedIn, linked, navigate]);

  const loading = identityLoading || notificationsLoading;

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const unreadNotifications = notifications.filter(
    (item) => !item.isRead
  ).length;

  // ---------------------------------------------
  // Availability / preferences editing
  // ---------------------------------------------

  const savedAvailability = useMemo(
    () => normalizeAvailability(faculty?.availability),
    [faculty]
  );

  const savedPreferred = useMemo(
    () => faculty?.preferences?.preferredTimeSlots || [],
    [faculty]
  );

  const savedAvoided = useMemo(
    () => faculty?.preferences?.avoidTimeSlots || [],
    [faculty]
  );

  const startEditing = useCallback(() => {
    setDraftAvailability(
      buildAvailabilityDraft(faculty?.availability, gridDays, gridSlots)
    );
    setDraftPreferred([...savedPreferred]);
    setDraftAvoided([...savedAvoided]);
    setSaveError(null);
    setSaveMessage(null);
    setEditing(true);
  }, [faculty, gridDays, gridSlots, savedPreferred, savedAvoided]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setDraftAvailability(null);
    setDraftPreferred([]);
    setDraftAvoided([]);
    setSaveError(null);
  }, []);

  const toggleAvailabilitySlot = useCallback((dayKey, slot) => {
    setDraftAvailability((previous) => {
      const current = previous?.[dayKey] || [];
      const present = current.some(
        (window) => window.start === slot.start && window.end === slot.end
      );

      const next = present
        ? current.filter(
            (window) =>
              !(window.start === slot.start && window.end === slot.end)
          )
        : [...current, { start: slot.start, end: slot.end }].sort(
            (a, b) => toMinutes(a.start) - toMinutes(b.start)
          );

      return { ...previous, [dayKey]: next };
    });
  }, []);

  // A slot is either preferred or avoided, never both — picking one side
  // clears the other.
  const togglePreference = useCallback((label, kind) => {
    if (kind === "preferred") {
      setDraftPreferred((previous) =>
        previous.includes(label)
          ? previous.filter((item) => item !== label)
          : [...previous, label]
      );
      setDraftAvoided((previous) =>
        previous.filter((item) => item !== label)
      );
      return;
    }

    setDraftAvoided((previous) =>
      previous.includes(label)
        ? previous.filter((item) => item !== label)
        : [...previous, label]
    );
    setDraftPreferred((previous) =>
      previous.filter((item) => item !== label)
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!facultyId || !draftAvailability) return;

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      // PUT /api/faculty/:id — a faculty caller may update only their own
      // record, and the route keeps only `availability` and `preferences`
      // off the body.
      const { data } = await api.put(`/faculty/${facultyId}`, {
        availability: draftAvailability,
        preferences: {
          preferredTimeSlots: draftPreferred,
          avoidTimeSlots: draftAvoided,
        },
      });

      setFaculty(data);
      setEditing(false);
      setDraftAvailability(null);
      setSaveMessage("Availability and preferences saved.");
    } catch (error) {
      console.error("Failed to save faculty profile:", error);
      setSaveError(
        error?.response?.data?.error ||
          "Could not save your availability and preferences."
      );
    } finally {
      setSaving(false);
    }
  }, [facultyId, draftAvailability, draftPreferred, draftAvoided]);

  const navigationItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/faculty-portal",
    },
    {
      id: "timetable",
      label: "My Timetable",
      icon: Calendar,
      path: "/faculty-portal/timetable",
    },
    {
      id: "courses",
      label: "My Courses",
      icon: BookOpen,
      path: "/faculty-portal/courses",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      path: "/faculty-portal/notifications",
    },
    {
      id: "profile",
      label: "My Profile",
      icon: User,
      path: "/faculty-portal/profile",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">

        <div className="text-center">

          <div className="w-12 h-12 rounded-full border-4 border-blue-400 border-t-transparent animate-spin mx-auto mb-4" />

          <p className="text-slate-300">
            Loading profile...
          </p>

        </div>

      </div>
    );
  }

  // `User.facultyId` is null: no Faculty record stands behind this login,
  // so there is no profile to show and none is invented.
  if (!linked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">

        <div className="text-center max-w-md">

          <User className="w-16 h-16 text-amber-400 mx-auto mb-5" />

          <h1 className="text-2xl font-bold text-white mb-3">
            Profile not linked — contact your administrator
          </h1>

          <p className="text-slate-400 mb-6">
            This account is not linked to a faculty record, so there is no
            profile to show for it.
          </p>

          <button
            onClick={handleLogout}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
          >
            Return to Login
          </button>

        </div>

      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">

      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5" />

      {/* SIDEBAR */}

      <div className="w-64 bg-slate-800/30 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl relative z-10">

        <div className="p-6 space-y-8">

          {/* Logo */}

          <div className="flex items-center gap-3">

            <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">

              <GraduationCap className="w-6 h-6 text-white" />

            </div>

            <div>

              <h2 className="text-lg font-bold text-white">
                Smart Scheduler
              </h2>

              <p className="text-xs text-slate-400">
                Faculty Portal
              </p>

            </div>

          </div>

          {/* Navigation */}

          <nav className="space-y-2">

            {navigationItems.map((item) => {

              const Icon = item.icon;

              const isActive = item.id === "profile";

              return (
                <Link
                  key={item.id}
                  to={item.path}
                >

                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-white border border-blue-500/30"
                        : "text-slate-300 hover:bg-slate-700/30 hover:text-white"
                    }`}
                  >

                    <Icon
                      className={`w-5 h-5 ${
                        isActive
                          ? "text-blue-400"
                          : "text-slate-400"
                      }`}
                    />

                    <span className="font-medium">
                      {item.label}
                    </span>

                    {item.id === "notifications" &&
                      unreadNotifications > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                          {unreadNotifications}
                        </span>
                      )}

                  </div>

                </Link>
              );
            })}

          </nav>

          {/* Logout */}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:bg-red-500/10 hover:text-red-400 transition-all"
          >

            <LogOut className="w-5 h-5" />

            <span className="font-medium">
              Logout
            </span>

          </button>

        </div>

      </div>

      {/* MAIN */}

      <div className="flex-1 overflow-auto relative z-10">

        <div className="p-8 space-y-8 max-w-7xl mx-auto">

          {/* Header */}

          <div className="flex justify-between items-center">

            <div>

              <h1 className="text-4xl lg:text-5xl font-bold text-white bg-gradient-to-r from-white via-blue-100 to-cyan-100 bg-clip-text text-transparent">
                My Profile
              </h1>

              <p className="text-lg text-slate-300 mt-3">
                Your academic and professional information
              </p>

            </div>

            <div className="px-4 py-3 rounded-xl bg-slate-800/30 border border-slate-700/50">

              <p className="text-xs text-slate-400">
                Faculty
              </p>

              <p className="text-sm font-semibold text-white">
                {faculty?.name || user?.name || "—"}
              </p>

            </div>

          </div>

          {/* Profile Card */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg overflow-hidden">

            <div className="p-8 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 border-b border-slate-700/50">

              <div className="flex items-center gap-6">

                <div className="w-20 h-20 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">

                  <User className="w-10 h-10 text-white" />

                </div>

                <div>

                  <h2 className="text-2xl font-bold text-white">
                    {faculty?.name || user?.name || "—"}
                  </h2>

                  <p className="text-slate-400 mt-1">
                    Faculty Member
                  </p>

                </div>

              </div>

            </div>

            <div className="p-8">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Name */}

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <div className="flex items-center gap-4">

                    <div className="p-3 rounded-xl bg-blue-500/20">

                      <User className="w-5 h-5 text-blue-400" />

                    </div>

                    <div>

                      <p className="text-xs text-slate-400">
                        Full Name
                      </p>

                      <p className="text-white font-semibold mt-1">
                        {faculty?.name || user?.name || "—"}
                      </p>

                    </div>

                  </div>

                </div>

                {/* Email */}

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <div className="flex items-center gap-4">

                    <div className="p-3 rounded-xl bg-cyan-500/20">

                      <Mail className="w-5 h-5 text-cyan-400" />

                    </div>

                    <div className="min-w-0">

                      <p className="text-xs text-slate-400">
                        Email
                      </p>

                      <p className="text-white font-semibold mt-1 truncate">
                        {faculty?.email || "Not specified"}
                      </p>

                    </div>

                  </div>

                </div>

                {/* Department */}

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <div className="flex items-center gap-4">

                    <div className="p-3 rounded-xl bg-emerald-500/20">

                      <Building2 className="w-5 h-5 text-emerald-400" />

                    </div>

                    <div>

                      <p className="text-xs text-slate-400">
                        Department
                      </p>

                      <p className="text-white font-semibold mt-1">
                        {faculty?.department || "Not specified"}
                      </p>

                    </div>

                  </div>

                </div>

                {/* Specialization */}

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <div className="flex items-center gap-4">

                    <div className="p-3 rounded-xl bg-violet-500/20">

                      <GraduationCap className="w-5 h-5 text-violet-400" />

                    </div>

                    <div>

                      <p className="text-xs text-slate-400">
                        Specialization
                      </p>

                      <p className="text-white font-semibold mt-1">
                        {faculty?.specialization?.length
                          ? faculty?.specialization.join(", ")
                          : "Not specified"}
                      </p>

                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

          {/* Faculty Details */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

            <div className="border-b border-slate-700/50 p-6">

              <h2 className="text-xl font-semibold text-white">
                Professional Details
              </h2>

              <p className="text-slate-400 mt-1">
                Additional faculty information
              </p>

            </div>

            <div className="p-6">

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <BriefcaseBusiness className="w-6 h-6 text-blue-400 mb-3" />

                  <p className="text-xs text-slate-400">
                    Faculty ID
                  </p>

                  <p className="text-white font-semibold mt-1 break-all">
                    {faculty?._id || facultyId || "—"}
                  </p>

                </div>

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <Building2 className="w-6 h-6 text-emerald-400 mb-3" />

                  <p className="text-xs text-slate-400">
                    Department
                  </p>

                  <p className="text-white font-semibold mt-1">
                    {faculty?.department || "Not specified"}
                  </p>

                </div>

                <div className="p-5 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                  <GraduationCap className="w-6 h-6 text-violet-400 mb-3" />

                  <p className="text-xs text-slate-400">
                    Specialization
                  </p>

                  <p className="text-white font-semibold mt-1">
                    {faculty?.specialization?.length
                      ? faculty?.specialization.join(", ")
                      : "Not specified"}
                  </p>

                </div>

              </div>

            </div>

          </div>

          {/* ==================================================
              AVAILABILITY  (editable)

              The only fields a faculty member may change are availability
              and preferences — `PUT /api/faculty/:id` keeps nothing else
              off a faculty caller's body. Name, email and department stay
              read-only above.
          ================================================== */}

          <div className="bg-slate-800/30 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-lg">

            <div className="border-b border-slate-700/50 p-6">

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

                <div>

                  <h2 className="text-xl font-semibold text-white">
                    Availability & Preferences
                  </h2>

                  <p className="text-slate-400 mt-1">
                    The slots you can teach, and the ones you would rather
                    teach or avoid
                  </p>

                </div>

                <div className="flex items-center gap-3">

                  {editing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving || !facultyId}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {saving ? "Saving..." : "Save changes"}
                      </button>

                      <button
                        onClick={cancelEditing}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600/50 bg-slate-700/30 text-slate-200 hover:bg-slate-600/40 transition-all disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={startEditing}
                      disabled={!facultyId}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </button>
                  )}

                </div>

              </div>

              {saveError && (
                <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <p className="text-sm text-red-300">
                    {saveError}
                  </p>
                </div>
              )}

              {!editing && saveMessage && (
                <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <p className="text-sm text-emerald-300">
                    {saveMessage}
                  </p>
                </div>
              )}

            </div>

            <div className="p-6 space-y-8">

              {/* Weekly availability */}

              <div className="space-y-4">

                <div className="flex items-center gap-3">

                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Clock className="w-5 h-5 text-blue-400" />
                  </div>

                  <div>

                    <p className="text-white font-semibold">
                      Weekly availability
                    </p>

                    <p className="text-xs text-slate-400 mt-1">
                      {editing
                        ? "Tap a slot to switch it on or off."
                        : "Slots you are currently available to teach."}
                    </p>

                  </div>

                </div>

                {gridSlots.length === 0 ? (

                  <p className="text-slate-400 text-sm">
                    The timetable grid has no teaching slots configured.
                  </p>

                ) : (

                  <div className="space-y-3">

                    {gridDays.map((day) => {

                      const dayKey = String(day).toLowerCase();

                      return (
                        <div
                          key={dayKey}
                          className="p-4 bg-slate-700/20 border border-slate-600/30 rounded-xl"
                        >

                          <p className="text-sm font-semibold text-slate-200 mb-3">
                            {day}
                          </p>

                          <div className="flex flex-wrap gap-2">

                            {gridSlots.map((slot) => {

                              const label = slotLabel(slot);

                              const active = editing
                                ? (draftAvailability?.[dayKey] || []).some(
                                    (window) =>
                                      window.start === slot.start &&
                                      window.end === slot.end
                                  )
                                : coversSlot(savedAvailability[dayKey], slot);

                              const className = `px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                                active
                                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                                  : "bg-slate-800/40 border-slate-600/30 text-slate-500"
                              }`;

                              if (!editing) {
                                return (
                                  <span
                                    key={label}
                                    className={className}
                                  >
                                    {label}
                                  </span>
                                );
                              }

                              return (
                                <button
                                  key={label}
                                  type="button"
                                  onClick={() =>
                                    toggleAvailabilitySlot(dayKey, slot)
                                  }
                                  aria-pressed={active}
                                  className={`${className} hover:border-emerald-500/40 hover:text-emerald-200`}
                                >
                                  {label}
                                </button>
                              );
                            })}

                          </div>

                        </div>
                      );
                    })}

                  </div>

                )}

              </div>

              {/* Teaching preferences */}

              <div className="space-y-4">

                <div className="flex items-center gap-3">

                  <div className="p-2 rounded-lg bg-violet-500/20">
                    <Calendar className="w-5 h-5 text-violet-400" />
                  </div>

                  <div>

                    <p className="text-white font-semibold">
                      Teaching preferences
                    </p>

                    <p className="text-xs text-slate-400 mt-1">
                      Soft constraints: the scheduler favours preferred slots
                      and penalises avoided ones.
                    </p>

                  </div>

                </div>

                {editing ? (

                  <div className="space-y-2">

                    {gridSlots.map((slot) => {

                      const label = slotLabel(slot);
                      const preferred = draftPreferred.includes(label);
                      const avoided = draftAvoided.includes(label);

                      return (
                        <div
                          key={label}
                          className="flex items-center justify-between gap-4 p-3 bg-slate-700/20 border border-slate-600/30 rounded-xl"
                        >

                          <span className="text-sm text-slate-200">
                            {label}
                          </span>

                          <div className="flex gap-2">

                            <button
                              type="button"
                              onClick={() =>
                                togglePreference(label, "preferred")
                              }
                              aria-pressed={preferred}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                preferred
                                  ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                                  : "bg-slate-800/40 border-slate-600/30 text-slate-400 hover:text-blue-300"
                              }`}
                            >
                              Prefer
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                togglePreference(label, "avoid")
                              }
                              aria-pressed={avoided}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                avoided
                                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                                  : "bg-slate-800/40 border-slate-600/30 text-slate-400 hover:text-amber-300"
                              }`}
                            >
                              Avoid
                            </button>

                          </div>

                        </div>
                      );
                    })}

                  </div>

                ) : (

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    <div className="p-4 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                      <p className="text-xs text-slate-400 mb-3">
                        Preferred slots
                      </p>

                      {savedPreferred.length === 0 ? (

                        <p className="text-sm text-slate-500">
                          None set
                        </p>

                      ) : (

                        <div className="flex flex-wrap gap-2">
                          {savedPreferred.map((label) => (
                            <span
                              key={label}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 border border-blue-500/40 text-blue-300"
                            >
                              {label}
                            </span>
                          ))}
                        </div>

                      )}

                    </div>

                    <div className="p-4 bg-slate-700/20 border border-slate-600/30 rounded-xl">

                      <p className="text-xs text-slate-400 mb-3">
                        Slots to avoid
                      </p>

                      {savedAvoided.length === 0 ? (

                        <p className="text-sm text-slate-500">
                          None set
                        </p>

                      ) : (

                        <div className="flex flex-wrap gap-2">
                          {savedAvoided.map((label) => (
                            <span
                              key={label}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300"
                            >
                              {label}
                            </span>
                          ))}
                        </div>

                      )}

                    </div>

                  </div>

                )}

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}