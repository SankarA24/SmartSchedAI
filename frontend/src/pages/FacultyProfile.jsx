import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
  Loader2,
  Mail,
  Pencil,
  Save,
  ShieldAlert,
  User,
  X,
} from "lucide-react";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import useIdentity from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { SectionCard } from "@/components/common/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";


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

/** One read-only key/value tile. */
function DetailTile({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="size-4" />}
        <span className="text-xs">{label}</span>
      </div>

      <p
        className={cn(
          "mt-1.5 text-sm font-medium text-foreground",
          mono && "break-all font-mono text-xs"
        )}
      >
        {value}
      </p>
    </div>
  );
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

  // ---------------------------------------------
  // Shell — shared sidebar/header, fed by lib/nav.js.
  // ---------------------------------------------

  const { brand, nav } = navForRole("faculty");

  const navItems = useMemo(
    () =>
      nav.map((item) =>
        item.badgeKey === "unread"
          ? { ...item, badge: unreadNotifications }
          : item
      ),
    [nav, unreadNotifications]
  );

  const shellProps = {
    brand,
    nav: navItems,
    onLogout: handleLogout,
    header: {
      notifications: unreadNotifications,
      onNotificationsClick: () => navigate("/faculty-portal/notifications"),
    },
  };

  if (loading) {
    return (
      <AppShell {...shellProps}>
        <div className="animate-in space-y-6 fade-in duration-150">
          <div className="h-9 w-56 animate-pulse rounded-md bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
        </div>
      </AppShell>
    );
  }

  // `User.facultyId` is null: no Faculty record stands behind this login,
  // so there is no profile to show and none is invented.
  if (!linked) {
    return (
      <AppShell {...shellProps}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md text-center">
            <ShieldAlert className="mx-auto mb-4 size-10 text-muted-foreground" />

            <h1 className="text-xl font-semibold text-foreground">
              Profile not linked — contact your administrator
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              This account is not linked to a faculty record, so there is no
              profile to show for it.
            </p>

            <Button onClick={handleLogout} className="mt-6">
              Return to Login
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const displayName = faculty?.name || user?.name || "—";

  const specialization = faculty?.specialization?.length
    ? faculty.specialization.join(", ")
    : "Not specified";

  return (
    <AppShell
      {...shellProps}
      chatbot={{ context: { page: "faculty-profile" } }}
    >
      <PageHeader
        title="My Profile"
        description="Your faculty record, and the availability the scheduler plans around."
      />

      <div className="space-y-6">
        <SectionCard>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <User className="size-7" />
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">
                {displayName}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Faculty member</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <DetailTile icon={User} label="Full name" value={displayName} />

            <DetailTile
              icon={Mail}
              label="Email"
              value={faculty?.email || "Not specified"}
            />

            <DetailTile
              icon={Building2}
              label="Department"
              value={faculty?.department || "Not specified"}
            />

            <DetailTile
              icon={GraduationCap}
              label="Specialization"
              value={specialization}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Professional details"
          description="Additional faculty information held on your record."
          icon={BriefcaseBusiness}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <DetailTile
              icon={BriefcaseBusiness}
              label="Faculty ID"
              value={faculty?._id || facultyId || "—"}
              mono
            />

            <DetailTile
              icon={Building2}
              label="Department"
              value={faculty?.department || "Not specified"}
            />

            <DetailTile
              icon={GraduationCap}
              label="Specialization"
              value={specialization}
            />
          </div>
        </SectionCard>

        {/* ==================================================
            AVAILABILITY  (editable)

            The only fields a faculty member may change are availability
            and preferences — `PUT /api/faculty/:id` keeps nothing else
            off a faculty caller's body. Name, email and department stay
            read-only above.
        ================================================== */}

        <SectionCard
          title="Availability & preferences"
          description="The slots you can teach, and the ones you would rather teach or avoid."
          icon={Clock}
          actions={
            editing ? (
              <div className="flex items-center gap-2">
                <Button onClick={handleSave} disabled={saving || !facultyId}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {saving ? "Saving..." : "Save changes"}
                </Button>

                <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                  <X className="size-4" />
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={startEditing} disabled={!facultyId}>
                <Pencil className="size-4" />
                Edit
              </Button>
            )
          }
        >
          <div className="space-y-6">
            {saveError && (
              <Callout tone="destructive" title="Could not save" icon={AlertCircle}>
                {saveError}
              </Callout>
            )}

            {!editing && saveMessage && (
              <Callout tone="success" title="Saved" icon={CheckCircle2}>
                {saveMessage}
              </Callout>
            )}

            {/* Weekly availability */}

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  Weekly availability
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {editing
                    ? "Select a slot to switch it on or off."
                    : "Slots you are currently available to teach."}
                </p>
              </div>

              {gridSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  The timetable grid has no teaching slots configured.
                </p>
              ) : (
                <div className="space-y-3">
                  {gridDays.map((day) => {
                    const dayKey = String(day).toLowerCase();

                    return (
                      <div
                        key={dayKey}
                        className="rounded-xl border border-border bg-muted/40 p-4"
                      >
                        <p className="mb-3 text-sm font-medium text-foreground">
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

                            const className = cn(
                              "rounded-md border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors duration-150",
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground"
                            );

                            if (!editing) {
                              return (
                                <span key={label} className={className}>
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
                                className={cn(
                                  className,
                                  "hover:border-primary hover:text-foreground"
                                )}
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
            </section>

            {/* Teaching preferences */}

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  Teaching preferences
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Soft constraints: the scheduler favours preferred slots and
                  penalises avoided ones.
                </p>
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
                        className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-3"
                      >
                        <span className="text-sm text-foreground tabular-nums">
                          {label}
                        </span>

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={preferred ? "default" : "outline"}
                            onClick={() => togglePreference(label, "preferred")}
                            aria-pressed={preferred}
                          >
                            Prefer
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant={avoided ? "secondary" : "outline"}
                            onClick={() => togglePreference(label, "avoid")}
                            aria-pressed={avoided}
                          >
                            Avoid
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="size-4" />
                      Preferred slots
                    </p>

                    {savedPreferred.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None set</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {savedPreferred.map((label) => (
                          <Badge key={label} className="tabular-nums">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="size-4" />
                      Slots to avoid
                    </p>

                    {savedAvoided.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None set</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {savedAvoided.map((label) => (
                          <Badge
                            key={label}
                            variant="outline"
                            className="tabular-nums"
                          >
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
