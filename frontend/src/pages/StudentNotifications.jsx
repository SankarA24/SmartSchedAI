import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Clock,
  Inbox,
  Info,
} from "lucide-react";

import client from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { useIdentity } from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// =====================================================
// /student-portal/notifications — the student's own mail (U9 re-skin).
//
// Visual migration only. The data path is untouched:
//   * identity via `useIdentity()` (`GET /api/auth/me`), not an inline
//     localStorage parse;
//   * `GET /api/notifications` is audience-scoped server-side, so the list
//     that arrives is already this student's own — no client-side guessing
//     at the audience, and no fabricated rows;
//   * unread is derived from `isRead` and nothing else;
//   * `linked === false` still says "Profile not linked — contact your
//     administrator", and the list still loads, because an unlinked student
//     account does still receive the role-wide announcements.
//
// Layout — the same bento the faculty notifications page uses, so the two
// portals read as one product:
//   Band 1 — the feed (8/12) | unread + read counts, then the inbox summary (4/12)
//
// Colour is semantic only: primary for the unread state, success for read,
// warning for "needs attention", destructive for errors. Every tinted surface
// is an alpha wash of one of those tokens with the matching solid token on
// top, so it stays legible in light and dark.
// =====================================================

const getId = (value) => {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value.$oid) return String(value.$oid);
  if (value._id) return getId(value._id);
  if (value.id) return getId(value.id);
  const s = typeof value.toString === "function" ? value.toString() : "";
  return s && s !== "[object Object]" ? String(s) : null;
};

const api = async (path, options = {}) => {
  const res = await client.request({
    url: path.replace(/^\/api/, ""),
    method: options.method || "GET",
    data: options.body,
    headers: options.headers,
  });
  return res.data;
};

const unwrap = (data, keys = []) => {
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
};

const NOT_LINKED = "Profile not linked — contact your administrator";

/**
 * Notification `type` → icon plus the wash/solid pair for its icon tile.
 * The wash sits over whatever the card colour currently is, so one class
 * works in both themes. Same table as the faculty page.
 */
const NOTIFICATION_TONES = {
  error: { icon: AlertTriangle, tile: "bg-destructive/10 text-destructive" },
  warning: { icon: AlertTriangle, tile: "bg-warning/10 text-warning" },
  success: { icon: CheckCircle2, tile: "bg-success/10 text-success" },
  info: { icon: Info, tile: "bg-primary/10 text-primary" },
};

function toneFor(type) {
  return NOTIFICATION_TONES[String(type || "").toLowerCase()] || NOTIFICATION_TONES.info;
}

const DATETIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DATETIME_FORMAT.format(date);
}

function timestampOf(notification) {
  return new Date(notification?.createdAt || notification?.date || 0).getTime() || 0;
}

function byNewestFirst(a, b) {
  return timestampOf(b) - timestampOf(a);
}

/** Big figure + unit — the same shape the dashboard's summary cells use. */
function BigFigure({ value, unit, tone = "default" }) {
  return (
    <p className="flex items-baseline gap-2">
      <span
        className={cn(
          "text-3xl font-semibold tracking-tight tabular-nums",
          tone === "warning" ? "text-warning" : "text-foreground"
        )}
      >
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </p>
  );
}

function Notifications() {
  const navigate = useNavigate();

  // Identity from the shared hook only — the page no longer re-parses the
  // cached `user` blob out of localStorage.
  const {
    user,
    student,
    linked,
    loading: identityLoading,
    error: identityError,
  } = useIdentity();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Stable boolean so the fetch does not run again when the hook swaps the
  // cached identity for the /auth/me answer.
  const hasUser = Boolean(user);

  // `GET /api/notifications` is audience-scoped server-side (global, this
  // role, or addressed to this user id), so whatever comes back is already
  // this student's own mail. No client-side guessing at the audience.
  useEffect(() => {
    if (identityLoading) return;
    if (!hasUser) {
      navigate("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await api("/api/notifications");
        if (!cancelled) setItems(unwrap(d, ["notifications", "data", "results"]));
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Unable to load notifications.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityLoading, hasUser, navigate]);

  // No "mark as read" action here: Notification.isRead is a single global flag
  // (no recipient/readBy field) and PUT /api/notifications/:id/read has no owner
  // check, so a student marking one read would hide it for every user.
  // `audienceFilter` on that route is a visibility test, not an ownership test:
  // every student matches {audience:"student"} and every user matches
  // {audience:"all"}, so the flip would land on the one shared document.
  // Per-user read state (a `readBy` array on Notification, $addToSet in the
  // route, unread derived per caller) has to exist before this page can offer
  // the control. Read state is therefore still read from `isRead`, and only
  // from `isRead` — and an unread row here is a plain surface, never a button,
  // because there is nothing for a student to click.
  const unread = useMemo(() => items.filter((n) => !n.isRead).length, [items]);
  const read = items.length - unread;

  // Newest first — a stable derived order, matching the faculty feed.
  const ordered = useMemo(() => [...items].sort(byNewestFirst), [items]);

  const { brand, nav, quickActions } = navForRole("student");
  // The sidebar badge is fed from the same `isRead` count the list uses.
  const navWithBadge = useMemo(
    () => nav.map((item) => (item.badgeKey === "unread" ? { ...item, badge: unread } : item)),
    [nav, unread]
  );

  const busy = identityLoading || loading;
  const studentName = student?.name || user?.name || "Student";

  const shellProps = {
    brand,
    nav: navWithBadge,
    quickActions,
    header: { notifications: unread },
    chatbot: { context: { page: "student-notifications", unread } },
  };

  // ---------------------------------------------
  // Loading — the bento's own shape, so nothing reflows when it resolves.
  // ---------------------------------------------
  if (busy) {
    return (
      <AppShell {...shellProps}>
        <PageHeader
          title="Notifications"
          description="Updates addressed to you and to students."
        />

        <div className="grid animate-in gap-5 fade-in duration-200 xl:grid-cols-12">
          <Skeleton className="h-96 w-full rounded-xl xl:col-span-8" />

          <div className="flex flex-col gap-5 xl:col-span-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell {...shellProps}>
      <PageHeader
        title="Notifications"
        description="Updates addressed to you and to students."
      />

      <div className="space-y-5">
        {error && (
          <Callout tone="destructive" title="Could not load notifications">
            {error}
          </Callout>
        )}

        {!error && identityError && (
          <Callout tone="warning" title="Profile could not be refreshed">
            {identityError}
          </Callout>
        )}

        {/* An unlinked student still receives role-wide announcements, so the
            list stays — but the page says plainly that the account has no
            student record behind it. */}
        {!linked && (
          <Callout tone="warning" title="No student record linked">
            {NOT_LINKED}
          </Callout>
        )}

        {/* ============ Band 1 — the feed, and what it adds up to ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- The feed: this page's primary content, the large cell ---- */}
          <SectionCard
            title="Notification feed"
            description={
              error ? "Newest first" : `${items.length} total · ${unread} unread`
            }
            icon={Bell}
            className="animate-in fade-in duration-200 xl:col-span-8"
            actions={
              unread > 0 ? (
                <StatusBadge variant="info" className="tabular-nums">
                  {unread} unread
                </StatusBadge>
              ) : null
            }
          >
            {error ? (
              <EmptyState
                icon={BellOff}
                title="Notifications unavailable"
                description="The feed could not be loaded. Reload the page to try again."
              />
            ) : ordered.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No notifications found"
                description="Announcements addressed to you or to all students will appear here."
              />
            ) : (
              <ul className="space-y-3">
                {ordered.map((n, i) => {
                  const isUnread = !n.isRead;
                  const id = getId(n._id || n.id);
                  const tone = toneFor(n.type);
                  const ToneIcon = tone.icon;
                  const title = n.title || n.subject || n.type || "Notification";

                  return (
                    <li
                      key={id || i}
                      className={cn(
                        "animate-in rounded-lg border p-4 fade-in duration-200",
                        isUnread
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-muted/40"
                      )}
                    >
                      <div className="flex gap-3">
                        <div
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg",
                            isUnread ? tone.tile : "bg-muted text-muted-foreground"
                          )}
                        >
                          <ToneIcon className="size-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={cn(
                                "text-sm font-medium",
                                isUnread ? "text-foreground" : "text-muted-foreground"
                              )}
                            >
                              {title}
                            </p>

                            {isUnread && <StatusBadge variant="info">New</StatusBadge>}
                          </div>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {n.message || n.content || n.description || "No message available."}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                              <Clock className="size-3.5" />
                              {formatDateTime(n.createdAt || n.date) || "Recently"}
                            </p>

                            {!isUnread && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Check className="size-3.5" />
                                Read
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          {/* ---- Counts, then the inbox summary: one idea per cell ---- */}
          <div className="flex flex-col gap-5 xl:col-span-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="Unread"
                value={error ? "—" : unread}
                icon={Inbox}
                tone={unread > 0 ? "warning" : "default"}
              />

              <StatCard
                label="Read"
                value={error ? "—" : read}
                icon={CheckCircle2}
                tone="success"
              />
            </div>

            <SectionCard
              title="Inbox"
              description="Announcements are marked read by your administrator."
              icon={Bell}
              className="animate-in fade-in duration-200"
              footer={
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Signed in as</span>
                  <span className="truncate text-sm font-medium text-foreground">
                    {studentName}
                  </span>
                </div>
              }
            >
              <div className="space-y-3">
                <BigFigure
                  value={error ? "—" : unread}
                  unit="unread"
                  tone={unread > 0 ? "warning" : "default"}
                />

                <p className="text-xs text-muted-foreground tabular-nums">
                  {error ? "Counts unavailable" : `${read} of ${items.length} read`}
                </p>

                <p className="text-xs text-muted-foreground">
                  Only notifications addressed to you personally or to students
                  appear here.
                </p>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default Notifications;
