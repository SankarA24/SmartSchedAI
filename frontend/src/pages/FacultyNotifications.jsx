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
  ShieldAlert,
} from "lucide-react";

import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { navForRole } from "@/lib/nav";
import useIdentity from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// =====================================================
// /faculty-portal/notifications
//
// Scoping (unchanged by this visual pass): `GET /api/notifications` is
// audience-scoped server-side, so this page deliberately filters nothing of
// its own — and an unlinked account is told so rather than shown a list.
// Mark-as-read is still the single `PUT /api/notifications/:id/read` fired by
// clicking an unread row; nothing else on this page writes.
//
// Layout — a bento matching Dashboard.jsx and the admin /notifications page:
//   Band 1 — the feed (8/12) | unread + read counts, then the inbox summary (4/12)
//
// Colour is semantic only: primary for the unread/actionable state, success
// for read, warning for "needs attention", destructive for errors. Every
// tinted surface is an alpha wash of one of those tokens with the matching
// solid token on top, so it stays legible in light and dark.
// =====================================================

/**
 * Notification `type` → icon plus the wash/solid pair for its icon tile.
 * The wash sits over whatever the card colour currently is, so one class
 * works in both themes.
 */
const NOTIFICATION_TONES = {
  error: { icon: AlertTriangle, tile: "bg-destructive/10 text-destructive" },
  warning: { icon: AlertTriangle, tile: "bg-warning/10 text-warning" },
  success: { icon: CheckCircle2, tile: "bg-success/10 text-success" },
  info: { icon: Info, tile: "bg-primary/10 text-primary" },
};

function toneFor(type) {
  return (
    NOTIFICATION_TONES[String(type || "").toLowerCase()] || NOTIFICATION_TONES.info
  );
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

function byNewestFirst(a, b) {
  return new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);
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

export default function FacultyNotifications() {
  const navigate = useNavigate();

  // Who is signed in comes from the shared hook (GET /api/auth/me), not from
  // this page re-reading and re-guessing `localStorage`. `faculty` is the
  // linked Faculty doc, so the page needs no /faculty fetch of its own.
  const {
    user,
    faculty,
    linked,
    loading: identityLoading,
  } = useIdentity();

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  const signedIn = Boolean(user);

  useEffect(() => {
    // Wait for identity to settle before deciding what to fetch.
    if (identityLoading) return undefined;

    if (!signedIn) {
      navigate("/login");
      return undefined;
    }

    // An unlinked faculty account has no data to show — the screen below
    // says so rather than listing anything.
    if (!linked) {
      setNotifications([]);
      setNotificationsLoading(false);
      return undefined;
    }

    let cancelled = false;

    const loadNotifications = async () => {
      try {
        // GET /api/notifications is audience-scoped server-side
        // (`audienceFilter` in backend/routes/notificationsRoute.js): it
        // returns the notifications addressed to everyone, the ones
        // addressed to this caller's role, and the ones addressed to this
        // user by id. So the client has nothing left to guess about
        // ownership, and deliberately filters nothing here.
        const response = await api.get(`/notifications`);

        if (cancelled) return;

        setNotifications(
          Array.isArray(response.data) ? response.data : []
        );
        setFeedError("");
      } catch (error) {
        console.error(
          "Failed to load notifications:",
          error
        );

        if (!cancelled) {
          setNotifications([]);
          // A failed fetch must say so — an empty list here would read as
          // "you have no notifications", which is a different fact.
          setFeedError("Unable to load notifications.");
        }
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

  const markAsRead = async (notification) => {
    try {
      if (notification._id) {
        await api.put(`/notifications/${notification._id}/read`);
      }

      setNotifications((prev) =>
        prev.map((item) =>
          item._id === notification._id
            ? { ...item, isRead: true }
            : item
        )
      );
    } catch (error) {
      console.error(
        "Failed to mark notification as read:",
        error
      );
    }
  };

  const unreadCount = notifications.filter(
    (item) => !item.isRead
  ).length;

  const readCount = notifications.length - unreadCount;

  // Newest first. A stable derived order, so marking a row read restyles it
  // in place instead of making it jump up or down the list.
  const orderedNotifications = useMemo(
    () => [...notifications].sort(byNewestFirst),
    [notifications]
  );

  // ---------------------------------------------
  // Shell — shared sidebar/header, fed by lib/nav.js.
  // ---------------------------------------------

  const { brand, nav } = navForRole("faculty");

  const navItems = useMemo(
    () =>
      nav.map((item) =>
        item.badgeKey === "unread" ? { ...item, badge: unreadCount } : item
      ),
    [nav, unreadCount]
  );

  const shellProps = {
    brand,
    nav: navItems,
    onLogout: handleLogout,
  };

  if (loading) {
    return (
      <AppShell {...shellProps}>
        <div className="animate-in space-y-5 fade-in duration-200">
          <Skeleton className="h-9 w-64" />

          <div className="grid gap-5 xl:grid-cols-12">
            <Skeleton className="h-96 w-full rounded-xl xl:col-span-8" />

            <div className="flex flex-col gap-5 xl:col-span-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
              </div>
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ---------------------------------------------
  // Unlinked account
  //
  // `User.facultyId` is null, so there is no Faculty record behind this
  // login. Nothing is invented in its place.
  // ---------------------------------------------

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
              This account is not linked to a faculty record, so there are no
              notifications to show for it.
            </p>

            <Button onClick={handleLogout} className="mt-6">
              Return to Login
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const facultyName = faculty?.name || user?.name || "Faculty";

  return (
    <AppShell
      {...shellProps}
      chatbot={{
        context: { page: "faculty-notifications", unread: unreadCount },
      }}
    >
      <PageHeader
        title="Notifications"
        description="Updates addressed to you and to faculty."
      />

      <div className="space-y-5">
        {feedError && (
          <Callout tone="destructive" title="Something went wrong">
            {feedError}
          </Callout>
        )}

        {/* ============ Band 1 — the feed, and what it adds up to ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- The feed: this page's primary content, the large cell ---- */}
          <SectionCard
            title="Notification feed"
            description={
              feedError
                ? "Newest first"
                : `${notifications.length} total · ${unreadCount} unread`
            }
            icon={Bell}
            className="animate-in fade-in duration-200 xl:col-span-8"
            actions={
              unreadCount > 0 ? (
                <StatusBadge variant="info" className="tabular-nums">
                  {unreadCount} unread
                </StatusBadge>
              ) : null
            }
          >
            {feedError ? (
              <EmptyState
                icon={BellOff}
                title="Notifications unavailable"
                description="The feed could not be loaded. Reload the page to try again."
              />
            ) : orderedNotifications.length === 0 ? (
              <EmptyState
                icon={BellOff}
                title="All caught up"
                description="You don't have any notifications at the moment."
              />
            ) : (
              <ul className="space-y-3">
                {orderedNotifications.map((notification) => {
                  const unread = !notification.isRead;
                  const tone = toneFor(notification.type);
                  const ToneIcon = tone.icon;
                  const title =
                    notification.title ||
                    notification.subject ||
                    "Notification";

                  const body = (
                    <div className="flex gap-3">
                      <div
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          unread ? tone.tile : "bg-muted text-muted-foreground"
                        )}
                      >
                        <ToneIcon className="size-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              unread ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            {title}
                          </p>

                          {unread && <StatusBadge variant="info">New</StatusBadge>}
                        </div>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {notification.message ||
                            notification.description ||
                            "No message available."}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                            <Clock className="size-3.5" />
                            {formatDateTime(notification.createdAt) || "Recently"}
                          </p>

                          {unread ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-primary">
                              <Check className="size-3.5" />
                              Mark as read
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Check className="size-3.5" />
                              Read
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <li key={notification._id}>
                      {unread ? (
                        <button
                          type="button"
                          onClick={() => markAsRead(notification)}
                          aria-label={`Mark "${title}" as read`}
                          className="w-full animate-in rounded-lg border border-primary/40 bg-primary/5 p-4 text-left transition-colors fade-in duration-200 hover:border-primary/70"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="animate-in rounded-lg border border-border bg-muted/40 p-4 fade-in duration-200">
                          {body}
                        </div>
                      )}
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
                value={feedError ? "—" : unreadCount}
                icon={Inbox}
                tone={unreadCount > 0 ? "warning" : "default"}
              />

              <StatCard
                label="Read"
                value={feedError ? "—" : readCount}
                icon={CheckCircle2}
                tone="success"
              />
            </div>

            <SectionCard
              title="Inbox"
              description="Select an unread notification to mark it as read."
              icon={Bell}
              className="animate-in fade-in duration-200"
              footer={
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Signed in as</span>
                  <span className="truncate text-sm font-medium text-foreground">
                    {facultyName}
                  </span>
                </div>
              }
            >
              <div className="space-y-3">
                <BigFigure
                  value={feedError ? "—" : unreadCount}
                  unit="unread"
                  tone={unreadCount > 0 ? "warning" : "default"}
                />

                <p className="text-xs text-muted-foreground tabular-nums">
                  {feedError
                    ? "Counts unavailable"
                    : `${readCount} of ${notifications.length} read`}
                </p>

                <p className="text-xs text-muted-foreground">
                  Only notifications addressed to you personally or to faculty
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
