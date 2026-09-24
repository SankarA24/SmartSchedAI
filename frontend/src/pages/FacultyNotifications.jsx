import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Bell,
  CheckCircle,
  Clock,
  Info,
  ShieldAlert,
} from "lucide-react";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import useIdentity from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// =====================================================
// /faculty-portal/notifications
//
// Scoping (unchanged by the U9 re-skin): `GET /api/notifications` is
// audience-scoped server-side, so this page deliberately filters nothing of
// its own — and an unlinked account is told so rather than shown a list.
// =====================================================

export default function FacultyNotifications() {
  const navigate = useNavigate();

  // Who is signed in comes from the shared hook (GET /api/auth/me), not from
  // this page re-reading and re-guessing `localStorage`. `faculty` is the
  // linked Faculty doc, so the header no longer needs its own /faculty fetch.
  const {
    user,
    faculty,
    linked,
    loading: identityLoading,
  } = useIdentity();

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

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
      } catch (error) {
        console.error(
          "Failed to load notifications:",
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
        <div className="animate-in space-y-6 fade-in duration-150">
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>

          <div className="h-80 animate-pulse rounded-xl bg-muted" />
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
            <ShieldAlert className="mx-auto mb-4 size-10 text-muted-foreground" />

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
        actions={
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground">Faculty</span>
            <span className="text-sm font-medium text-foreground">
              {faculty?.name || user?.name || "Faculty"}
            </span>
          </div>
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total notifications"
            value={notifications.length}
            icon={Bell}
          />

          <StatCard
            label="Unread"
            value={unreadCount}
            icon={AlertCircle}
            tone={unreadCount > 0 ? "warning" : "default"}
          />

          <StatCard
            label="Read"
            value={notifications.length - unreadCount}
            icon={CheckCircle}
            tone="success"
          />
        </div>

        <SectionCard
          title="Recent notifications"
          description="Select an unread notification to mark it as read."
          icon={Bell}
          actions={
            unreadCount > 0 ? (
              <Badge variant="secondary" className="tabular-nums">
                {unreadCount} unread
              </Badge>
            ) : null
          }
        >
          {notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications"
              description="You don't have any notifications at the moment."
            />
          ) : (
            <ul className="space-y-3">
              {notifications.map((notification) => {
                const unread = !notification.isRead;

                const body = (
                  <div className="flex gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Info className="size-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {notification.title ||
                            notification.subject ||
                            "Notification"}
                        </p>

                        {unread && <Badge variant="default">New</Badge>}
                      </div>

                      <p className="mt-1 text-sm text-muted-foreground">
                        {notification.message ||
                          notification.description ||
                          "No message available."}
                      </p>

                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        {notification.createdAt
                          ? new Date(notification.createdAt).toLocaleString()
                          : "Recently"}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <li key={notification._id}>
                    {unread ? (
                      <button
                        type="button"
                        onClick={() => markAsRead(notification)}
                        aria-label={`Mark "${
                          notification.title || notification.subject || "notification"
                        }" as read`}
                        className="w-full rounded-xl border border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:bg-accent"
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-4">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
