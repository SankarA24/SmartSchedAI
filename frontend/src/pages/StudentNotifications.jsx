import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, Inbox } from "lucide-react";

import client from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { useIdentity } from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { Badge } from "@/components/ui/badge";
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
//     administrator".
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

function Notifications() {
  const navigate = useNavigate();

  // Identity from the shared hook only — the page no longer re-parses the
  // cached `user` blob out of localStorage.
  const { user, linked, loading: identityLoading, error: identityError } = useIdentity();

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
  // from `isRead`.
  const unread = useMemo(() => items.filter((n) => !n.isRead).length, [items]);

  const { brand, nav, quickActions } = navForRole("student");
  // The sidebar badge is fed from the same `isRead` count the list uses.
  const navWithBadge = useMemo(
    () => nav.map((item) => (item.badgeKey === "unread" ? { ...item, badge: unread } : item)),
    [nav, unread]
  );

  const busy = identityLoading || loading;

  return (
    <AppShell
      brand={brand}
      nav={navWithBadge}
      quickActions={quickActions}
      header={{ notifications: unread }}
      chatbot={{ context: { page: "student-notifications", unread } }}
    >
      <PageHeader
        title="Notifications"
        description="Important updates and announcements"
        actions={
          <Badge variant={unread > 0 ? "default" : "secondary"}>
            {busy ? "…" : `${unread} unread`}
          </Badge>
        }
      />

      <div className="space-y-6">
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
        {!linked && !busy && (
          <Callout tone="warning" title="No student record linked">
            {NOT_LINKED}
          </Callout>
        )}

        <SectionCard
          title="All Notifications"
          description={busy ? "Loading your notifications…" : `${unread} unread`}
          icon={BellRing}
        >
          {busy ? (
            <div className="space-y-3">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : items.length ? (
            <ul className="space-y-3">
              {items.map((n, i) => {
                const isUnread = !n.isRead;
                const id = getId(n._id || n.id);
                const timestamp = n.createdAt || n.date;
                return (
                  <li
                    key={id || i}
                    className={cn(
                      "animate-in rounded-lg border p-4 fade-in duration-150 transition-colors",
                      isUnread
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-background"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {n.title || n.subject || n.type || "Notification"}
                      </h3>
                      {isUnread && <Badge>New</Badge>}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {n.message || n.content || n.description || "No message available."}
                    </p>
                    {timestamp && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(timestamp).toLocaleString()}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={Inbox}
              title="No notifications found"
              description="Announcements addressed to you or to all students will appear here."
            />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}

export default Notifications;
