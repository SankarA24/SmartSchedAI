import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Ban,
  Building2,
  CheckCircle2,
  Clock,
  GraduationCap,
  IdCard,
  ListChecks,
  Loader2,
  Mail,
  Pencil,
  Save,
  ShieldAlert,
  ThumbsUp,
  UserRound,
  X,
} from "lucide-react";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import useIdentity from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";


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

// =========================================================
// PRESENTATION
//
// Colour on this page carries exactly three meanings and nothing else:
//   primary   a slot you are available to teach (the selected state)
//   success   a slot you prefer                 (favoured by the scheduler)
//   warning   a slot you would rather avoid     (penalised by the scheduler)
// Each is an alpha wash of the semantic token with the solid token on top,
// so it stays legible in both themes.
// =========================================================

/** One read-only row of the identity card. */
function DetailRow({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
        {Icon ? <Icon className="size-4 shrink-0" /> : null}
        <span>{label}</span>
      </dt>

      <dd
        className={cn(
          "min-w-0 text-sm font-medium break-words text-foreground sm:text-right",
          mono && "font-mono text-xs break-all"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** One line of the legend card: tinted square, name, what it does. */
function LegendRow({ icon: Icon, tone, title, children }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tone
        )}
      >
        {Icon ? <Icon className="size-4" /> : null}
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{children}</p>
      </div>
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
  // Derived figures — counted off whichever set is on screen (the draft
  // while editing, the saved record otherwise) so the tiles never disagree
  // with the panels beside them.
  // ---------------------------------------------

  const availableSlotCount = useMemo(() => {
    let total = 0;
    for (const day of gridDays) {
      const dayKey = String(day).toLowerCase();
      const windows = editing
        ? draftAvailability?.[dayKey]
        : savedAvailability[dayKey];
      total += gridSlots.filter((slot) => coversSlot(windows, slot)).length;
    }
    return total;
  }, [gridDays, gridSlots, editing, draftAvailability, savedAvailability]);

  const gridSlotTotal = gridDays.length * gridSlots.length;
  const shownPreferred = editing ? draftPreferred : savedPreferred;
  const shownAvoided = editing ? draftAvoided : savedAvoided;

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
        <div className="animate-in space-y-5 fade-in duration-200">
          <Skeleton className="h-9 w-56" />

          <div className="grid gap-5 xl:grid-cols-12">
            <div className="flex flex-col gap-5 xl:col-span-5">
              <Skeleton className="h-64 w-full rounded-xl" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-24 w-full rounded-xl sm:col-span-2" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            </div>
            <Skeleton className="h-96 w-full rounded-xl xl:col-span-7" />
          </div>
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
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <ShieldAlert className="size-6" />
            </div>

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

  const department = faculty?.department || null;
  const hasGrid = gridSlots.length > 0 && gridDays.length > 0;

  return (
    <AppShell
      {...shellProps}
      chatbot={{ context: { page: "faculty-profile" } }}
    >
      <PageHeader
        title="My Profile"
        description="Your faculty record, and the availability the scheduler plans around."
        actions={
          editing ? (
            <>
              <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                <X className="size-4" />
                Cancel
              </Button>

              <Button onClick={handleSave} disabled={saving || !facultyId}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={startEditing} disabled={!facultyId}>
              <Pencil className="size-4" />
              Edit availability
            </Button>
          )
        }
      />

      <div className="space-y-5">
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

        {/* ============ Band 1 — identity | availability ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Read-only identity, plus the three figures it explains ---- */}
          <div className="flex flex-col gap-5 xl:col-span-5">
            <SectionCard>
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <UserRound className="size-6" />
                </div>

                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-foreground">
                    {displayName}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {department ? `Faculty · ${department}` : "Faculty member"}
                  </p>
                </div>
              </div>

              <dl className="mt-5 divide-y divide-border border-t border-border">
                <DetailRow
                  icon={Mail}
                  label="Email"
                  value={faculty?.email || "Not specified"}
                />

                <DetailRow
                  icon={Building2}
                  label="Department"
                  value={department || "Not specified"}
                />

                <DetailRow
                  icon={GraduationCap}
                  label="Specialization"
                  value={specialization}
                />

                <DetailRow
                  icon={IdCard}
                  label="Faculty ID"
                  value={faculty?._id || facultyId || "—"}
                  mono
                />
              </dl>
            </SectionCard>

            {/*
              The wide tile carries the figure that matters — how much of the
              grid this member can teach — with the two soft-constraint
              counts beside each other under it.
            */}
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Slots available"
                value={
                  hasGrid
                    ? `${availableSlotCount} of ${gridSlotTotal}`
                    : availableSlotCount
                }
                icon={Clock}
                className="sm:col-span-2"
              />
              <StatCard
                label="Preferred"
                value={shownPreferred.length}
                icon={ThumbsUp}
                tone="success"
              />
              <StatCard
                label="Avoided"
                value={shownAvoided.length}
                icon={Ban}
                tone="warning"
              />
            </div>
          </div>

          {/* ---- Weekly availability (editable) ---- */}
          <SectionCard
            title="Weekly availability"
            description={
              editing
                ? "Select a slot to switch it on or off."
                : "The slots you are currently available to teach."
            }
            icon={Clock}
            className="xl:col-span-7"
          >
            {!hasGrid ? (
              <EmptyState
                icon={Clock}
                title="No teaching slots configured"
                description="The timetable grid has no working days or periods yet, so there is nothing to mark availability against."
              />
            ) : (
              <div className="divide-y divide-border">
                {gridDays.map((day) => {
                  const dayKey = String(day).toLowerCase();

                  return (
                    <div
                      key={dayKey}
                      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <p className="shrink-0 text-sm font-medium text-foreground sm:w-24">
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
                            "rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors duration-150",
                            active
                              ? "border-primary/30 bg-primary/10 text-primary"
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
                                "hover:border-primary/50"
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
          </SectionCard>
        </div>

        {/* ============ Band 2 — preferences | legend ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ==================================================
              TEACHING PREFERENCES  (editable)

              The only fields a faculty member may change are availability
              and preferences — `PUT /api/faculty/:id` keeps nothing else
              off a faculty caller's body. Name, email and department stay
              read-only in the identity card above.
          ================================================== */}
          <SectionCard
            title="Teaching preferences"
            description="Soft constraints: the scheduler favours preferred slots and penalises avoided ones."
            icon={ListChecks}
            className="xl:col-span-8"
          >
            {!hasGrid ? (
              <EmptyState
                icon={ListChecks}
                title="No teaching slots configured"
                description="Preferences are expressed against the grid's periods, and none are defined yet."
              />
            ) : editing ? (
              <div className="divide-y divide-border">
                {gridSlots.map((slot) => {
                  const label = slotLabel(slot);
                  const preferred = draftPreferred.includes(label);
                  const avoided = draftAvoided.includes(label);

                  return (
                    <div
                      key={label}
                      className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="text-sm text-foreground tabular-nums">
                        {label}
                      </span>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => togglePreference(label, "preferred")}
                          aria-pressed={preferred}
                          className={cn(
                            preferred &&
                              "border-success/30 bg-success/10 text-success hover:bg-success/15 hover:text-success"
                          )}
                        >
                          <ThumbsUp className="size-3.5" />
                          Prefer
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => togglePreference(label, "avoid")}
                          aria-pressed={avoided}
                          className={cn(
                            avoided &&
                              "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15 hover:text-warning"
                          )}
                        >
                          <Ban className="size-3.5" />
                          Avoid
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="divide-y divide-border">
                <div className="pb-4">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <ThumbsUp className="size-3.5" />
                    Preferred slots
                  </p>

                  {savedPreferred.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      None set
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {savedPreferred.map((label) => (
                        <span
                          key={label}
                          className="rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success tabular-nums"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Ban className="size-3.5" />
                    Slots to avoid
                  </p>

                  {savedAvoided.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      None set
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {savedAvoided.map((label) => (
                        <span
                          key={label}
                          className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning tabular-nums"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          {/* ---- What each marking means to the scheduler ---- */}
          <SectionCard
            title="How the scheduler reads this"
            className="xl:col-span-4"
          >
            <div className="divide-y divide-border">
              <LegendRow
                icon={Clock}
                tone="bg-primary/10 text-primary"
                title="Available"
              >
                A hard constraint. No class is ever placed outside these
                slots.
              </LegendRow>

              <LegendRow
                icon={ThumbsUp}
                tone="bg-success/10 text-success"
                title="Preferred"
              >
                A soft constraint. The scheduler is rewarded for using these
                slots first.
              </LegendRow>

              <LegendRow
                icon={Ban}
                tone="bg-warning/10 text-warning"
                title="Avoided"
              >
                A soft constraint. Used only when nothing else fits, at a
                penalty.
              </LegendRow>
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
