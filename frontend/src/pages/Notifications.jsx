import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Info,
  Inbox,
  Lock,
  MessageSquare,
  Plus,
  Radio,
  Send,
  Trash2,
} from "lucide-react";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { useSocket } from "@/hooks/useSocket";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatCard } from "@/components/common/StatCard";
import { SectionCard } from "@/components/common/SectionCard";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// =====================================================
// /notifications — admin notification feed + query inbox (U9)
//
// Visual pass only. Unchanged: the notification CRUD
// (`GET/POST /api/notifications`, `PUT /api/notifications/:id/read`,
// `DELETE /api/notifications/:id`) and the admin query inbox
// (`GET /api/queries`, `PUT /api/queries/:id/reply`) — replying is still the
// only way a query leaves status "open", and the reply notification is
// addressed to the author alone (`recipientUserId`, never a role audience),
// so no other faculty member or student ever reads the subject or the answer.
//
// The unread count is live. `useSocket` gives us the shared connection, and
// `backend/utils/notify.js#createAndEmit` emits the saved document as a
// "notification" event into the caller's role room (`role:admin`) or private
// user room. Prepending it to the list feeds the same derived `unreadCount`
// that drives the header bell and the sidebar badge, so a notification raised
// by a generation run or a query shows up without a refresh.
//
// Layout — a bento of three jobs, one per cell, matching Dashboard.jsx:
//   Band 1 — notification feed (8/12) | counts + compose (4/12)
//   Band 2 — query inbox (8/12)       | reply status + delivery note (4/12)
//
// Colour is semantic only: primary for actions and info, success for
// answered/read, warning for pending, destructive for errors. Tinted surfaces
// are alpha washes of those tokens (bg-*/10) with the solid token on top, so
// they stay legible in both themes.
// =====================================================

/**
 * Notification type → icon plus the wash/solid pair for its icon tile.
 * The wash sits over whatever the card colour currently is, so the same
 * class works in light and dark.
 */
const NOTIFICATION_TONES = {
  error: { icon: AlertTriangle, tile: "bg-destructive/10 text-destructive", variant: "destructive" },
  warning: { icon: AlertTriangle, tile: "bg-warning/10 text-warning", variant: "warning" },
  success: { icon: CheckCircle2, tile: "bg-success/10 text-success", variant: "success" },
  info: { icon: Info, tile: "bg-primary/10 text-primary", variant: "info" },
};

function toneFor(type) {
  return NOTIFICATION_TONES[String(type || "").toLowerCase()] || NOTIFICATION_TONES.info;
}

const PRIORITY_VARIANTS = {
  high: "destructive",
  medium: "warning",
  low: "neutral",
};

function byNewestFirst(a, b) {
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function emptyForm() {
  return { title: "", message: "", type: "info", priority: "low" };
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

export default function NotificationsPage() {
  const { brand, nav, quickActions } = navForRole("admin");
  const { socket, connected } = useSocket();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const [notificationToDelete, setNotificationToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Queries raised by faculty and students. GET /api/queries returns every
  // row for an admin (scopeFilter in backend/routes/queriesRoute.js); the
  // authors themselves only ever get their own.
  const [queries, setQueries] = useState([]);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [queriesError, setQueriesError] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyingId, setReplyingId] = useState(null);

  const resetForm = () => setFormData(emptyForm());

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications");
      setNotifications(
        Array.isArray(res.data) ? [...res.data].sort(byNewestFirst) : []
      );
      setFeedError("");
    } catch (error) {
      console.error("Error fetching notifications:", error);
      setNotifications([]);
      setFeedError("Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQueries = useCallback(async () => {
    setQueriesLoading(true);
    try {
      const res = await api.get("/queries");
      setQueries(Array.isArray(res.data) ? [...res.data].sort(byNewestFirst) : []);
      setQueriesError("");
    } catch (error) {
      console.error("Error fetching queries:", error);
      setQueries([]);
      setQueriesError("Unable to load queries.");
    } finally {
      setQueriesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchQueries();
  }, [fetchNotifications, fetchQueries]);

  // Live feed: every notification this admin is an audience for arrives here
  // as it is created. De-duplicated by `_id` so a socket event that races the
  // POST response cannot show the same row twice.
  useEffect(() => {
    if (!socket) return undefined;

    const onNotification = (incoming) => {
      if (!incoming?._id) return;
      setNotifications((prev) =>
        prev.some((n) => n._id === incoming._id)
          ? prev
          : [incoming, ...prev].sort(byNewestFirst)
      );
    };

    socket.on("notification", onNotification);
    return () => socket.off("notification", onNotification);
  }, [socket]);

  // The reply is delivered to the author alone: the route addresses the
  // notification by recipientUserId only, never by role audience.
  const handleReply = async (id) => {
    const reply = (replyDrafts[id] || "").trim();
    if (!reply) return;
    setReplyingId(id);
    try {
      const res = await api.put(`/queries/${id}/reply`, { reply });
      const updated = res.data;
      setQueries((prev) => prev.map((q) => (q._id === id ? { ...q, ...updated } : q)));
      setReplyDrafts((prev) => ({ ...prev, [id]: "" }));
      setQueriesError("");
    } catch (error) {
      console.error("Error replying to query:", error);
      setQueriesError(error?.response?.data?.error || "Unable to send that reply.");
    } finally {
      setReplyingId(null);
    }
  };

  const handleSubmitNotification = async (event) => {
    event.preventDefault();
    setFormLoading(true);
    try {
      await api.post("/notifications", formData);
      resetForm();
      setShowForm(false);
      setFeedError("");
      fetchNotifications();
    } catch (error) {
      console.error("Error creating notification:", error);
      setFeedError(
        error?.response?.data?.error || "Unable to send that notification."
      );
    } finally {
      setFormLoading(false);
    }
  };

  const confirmDeleteNotification = async () => {
    if (!notificationToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/notifications/${notificationToDelete._id}`);
      setNotifications((prev) => prev.filter((n) => n._id !== notificationToDelete._id));
      setFeedError("");
    } catch (error) {
      console.error("Error deleting notification:", error);
      setFeedError("Unable to delete that notification.");
    } finally {
      setDeleting(false);
      setNotificationToDelete(null);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n._id);
    try {
      await Promise.all(unreadIds.map((id) => api.put(`/notifications/${id}/read`)));
      fetchNotifications();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );
  const openQueryCount = useMemo(
    () => queries.filter((q) => q.status !== "answered").length,
    [queries]
  );
  const answeredQueryCount = queries.length - openQueryCount;

  // The sidebar badge is the same live count as the header bell.
  const navWithBadges = useMemo(
    () =>
      nav.map((item) =>
        item.badgeKey === "unread" ? { ...item, badge: unreadCount } : item
      ),
    [nav, unreadCount]
  );

  return (
    <AppShell
      brand={brand}
      nav={navWithBadges}
      quickActions={quickActions}
      header={{
        notifications: unreadCount,
        onNotificationsClick: fetchNotifications,
        settingsPath: "/infrastructure",
      }}
      chatbot={{ context: { page: "notifications", unread: unreadCount } }}
    >
      <PageHeader
        title="Notifications"
        description="Broadcast system alerts and answer the queries faculty and students raise."
        actions={
          <>
            <StatusBadge variant={connected ? "success" : "neutral"}>
              <Radio className="size-3" />
              {connected ? "Live" : "Offline"}
            </StatusBadge>
            <Button onClick={() => setShowForm((open) => !open)}>
              <Plus className="size-4" />
              Add Notification
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        {feedError && (
          <Callout tone="destructive" title="Something went wrong">
            {feedError}
          </Callout>
        )}

        {/* ============ Band 1 — the feed, and what feeds it ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Notification feed: the page's primary content ---- */}
          <SectionCard
            title="Notification feed"
            description={
              loading
                ? "Loading the feed…"
                : `${notifications.length} total · ${unreadCount} unread`
            }
            icon={Bell}
            className="animate-in fade-in duration-200 xl:col-span-8"
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
              >
                Mark all as read
              </Button>
            }
          >
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState
                icon={BellOff}
                title="All caught up"
                description="There are no notifications right now."
              />
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => {
                  const tone = toneFor(notification.type);
                  const ToneIcon = tone.icon;
                  const read = Boolean(notification.isRead);
                  return (
                    <div
                      key={notification._id}
                      className={cn(
                        "flex animate-in flex-col gap-3 rounded-lg border border-border p-4 transition-colors fade-in duration-200 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
                        read ? "bg-muted/40" : "bg-card hover:border-primary/40"
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg",
                            read ? "bg-muted text-muted-foreground" : tone.tile
                          )}
                        >
                          <ToneIcon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <p
                              className={cn(
                                "font-medium",
                                read ? "text-muted-foreground" : "text-foreground"
                              )}
                            >
                              {notification.title}
                            </p>
                            <StatusBadge
                              variant={PRIORITY_VARIANTS[notification.priority] || "neutral"}
                              className="capitalize"
                            >
                              {notification.priority}
                            </StatusBadge>
                            {!read && <StatusBadge variant="info">New</StatusBadge>}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {notification.message}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                            {formatDateTime(notification.createdAt) || ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                        {!read && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Mark as read"
                            onClick={() => handleMarkAsRead(notification._id)}
                          >
                            <Check className="size-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Delete notification"
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => setNotificationToDelete(notification)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* ---- Counts, then the compose form: one job per cell ---- */}
          <div className="flex flex-col gap-5 xl:col-span-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="Notifications"
                value={feedError ? "—" : notifications.length}
                icon={Bell}
                loading={loading}
              />
              <StatCard
                label="Unread"
                value={feedError ? "—" : unreadCount}
                icon={Inbox}
                tone={unreadCount > 0 ? "warning" : "success"}
                loading={loading}
              />
            </div>

            <SectionCard
              title="Compose"
              description="Broadcast to every portal that is an audience for it."
              icon={Plus}
              className="animate-in fade-in duration-200"
            >
              {showForm ? (
                <form onSubmit={handleSubmitNotification} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="notification-type">Type</Label>
                      <Select
                        value={formData.type}
                        onValueChange={(value) => setFormData({ ...formData, type: value })}
                      >
                        <SelectTrigger id="notification-type" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="success">Success</SelectItem>
                          <SelectItem value="warning">Warning</SelectItem>
                          <SelectItem value="error">Error</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notification-priority">Priority</Label>
                      <Select
                        value={formData.priority}
                        onValueChange={(value) =>
                          setFormData({ ...formData, priority: value })
                        }
                      >
                        <SelectTrigger id="notification-priority" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notification-title">Title</Label>
                    <Input
                      id="notification-title"
                      value={formData.title}
                      onChange={(event) =>
                        setFormData({ ...formData, title: event.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notification-message">Message</Label>
                    <Textarea
                      id="notification-message"
                      value={formData.message}
                      onChange={(event) =>
                        setFormData({ ...formData, message: event.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="flex flex-wrap gap-3 border-t pt-4">
                    <Button type="submit" disabled={formLoading}>
                      {formLoading ? "Sending..." : "Send notification"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    A broadcast reaches the portals its audience covers and lands in this
                    feed straight away.
                  </p>
                  <Button className="w-full" onClick={() => setShowForm(true)}>
                    <Plus className="size-4" />
                    New notification
                  </Button>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ============ Band 2 — the query inbox ============ */}
        {/* Queries raised by faculty and students. Answering one is the only
            way a query leaves status "open". The reply notification goes to
            the author alone (recipientUserId, no role audience), so no other
            faculty member or student ever reads the subject or the answer. */}
        <div className="grid gap-5 xl:grid-cols-12">
          <SectionCard
            title="Query inbox"
            description={
              queriesLoading
                ? "Loading queries…"
                : `${queries.length} total · ${openQueryCount} awaiting a reply`
            }
            icon={MessageSquare}
            className="animate-in fade-in duration-200 xl:col-span-8"
          >
            <div className="space-y-4">
              {queriesError && (
                <Callout tone="destructive" title="Something went wrong">
                  {queriesError}
                </Callout>
              )}

              {queriesLoading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, index) => (
                    <Skeleton key={index} className="h-24 w-full rounded-lg" />
                  ))}
                </div>
              ) : queries.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No queries raised"
                  description="Faculty and students can raise a query from their portal."
                />
              ) : (
                <div className="space-y-4">
                  {queries.map((query) => {
                    const answered = query.status === "answered";
                    return (
                      <div
                        key={query._id}
                        className={cn(
                          "animate-in rounded-lg border border-border p-4 transition-colors fade-in duration-200",
                          answered ? "bg-muted/40" : "bg-card"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-lg",
                              answered
                                ? "bg-success/10 text-success"
                                : "bg-warning/10 text-warning"
                            )}
                          >
                            {answered ? (
                              <CheckCircle2 className="size-4" />
                            ) : (
                              <MessageSquare className="size-4" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p
                                className={cn(
                                  "font-medium",
                                  answered ? "text-muted-foreground" : "text-foreground"
                                )}
                              >
                                {query.subject}
                              </p>
                              <StatusBadge variant="neutral" className="capitalize">
                                {query.role}
                              </StatusBadge>
                              <StatusBadge
                                variant={answered ? "success" : "warning"}
                                className="capitalize"
                              >
                                {query.status}
                              </StatusBadge>
                            </div>

                            <p className="mt-1 text-sm text-muted-foreground">
                              {query.message}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {[query.name, formatDateTime(query.createdAt)]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>

                        {answered ? (
                          <div className="mt-3 rounded-md border border-border bg-background p-3">
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              Your reply
                            </p>
                            <p className="text-sm text-foreground">{query.reply}</p>
                          </div>
                        ) : (
                          <div className="mt-4 space-y-2 border-t pt-4">
                            <Label htmlFor={`reply-${query._id}`}>Reply</Label>
                            <Textarea
                              id={`reply-${query._id}`}
                              value={replyDrafts[query._id] || ""}
                              onChange={(event) =>
                                setReplyDrafts((prev) => ({
                                  ...prev,
                                  [query._id]: event.target.value,
                                }))
                              }
                              placeholder="Write your answer to this query..."
                            />
                            <Button
                              size="sm"
                              onClick={() => handleReply(query._id)}
                              disabled={
                                replyingId === query._id ||
                                !(replyDrafts[query._id] || "").trim()
                              }
                            >
                              <Send className="size-4" />
                              {replyingId === query._id ? "Sending..." : "Send reply"}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SectionCard>

          {/* ---- Reply status + the delivery guarantee ---- */}
          <div className="flex flex-col gap-5 xl:col-span-4">
            <StatCard
              label="Queries awaiting a reply"
              value={queriesError ? "—" : openQueryCount}
              icon={MessageSquare}
              tone={openQueryCount > 0 ? "warning" : "success"}
              loading={queriesLoading}
            />

            <SectionCard
              title="Reply status"
              icon={CheckCircle2}
              className="animate-in fade-in duration-200"
            >
              {queriesError ? (
                <p className="text-sm text-muted-foreground">
                  Counts are unavailable while queries cannot be loaded.
                </p>
              ) : queriesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-5 w-32" />
                </div>
              ) : (
                <div className="space-y-2">
                  <BigFigure
                    value={openQueryCount}
                    unit="open"
                    tone={openQueryCount > 0 ? "warning" : "default"}
                  />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {answeredQueryCount} answered
                  </p>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Who sees a reply"
              icon={Lock}
              className="animate-in fade-in duration-200"
            >
              <p className="text-sm text-muted-foreground">
                A reply is addressed to the author alone. No other faculty member or
                student can read the query or your answer.
              </p>
            </SectionCard>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(notificationToDelete)}
        onOpenChange={(open) => {
          if (!open) setNotificationToDelete(null);
        }}
        title="Delete this notification?"
        description={
          notificationToDelete
            ? `"${notificationToDelete.title}" will be removed for everyone. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete notification"
        destructive
        loading={deleting}
        onConfirm={confirmDeleteNotification}
      />
    </AppShell>
  );
}
