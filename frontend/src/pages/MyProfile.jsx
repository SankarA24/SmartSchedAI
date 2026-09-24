import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  GraduationCap,
  Inbox,
  Lock,
  Mail,
  MessageSquare,
  Pencil,
  Send,
  UserRound,
} from "lucide-react";

import client from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { useIdentity } from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// =====================================================
// /student-portal/profile — the student's own record (U9 re-skin, bento pass).
//
// Shell and styling are new; every data rule from the Phase 8 rescope is
// carried over verbatim:
//   * identity from `useIdentity()` (`GET /api/auth/me`), never an inline
//     localStorage parse;
//   * academic fields (department, semester, year, academic year, register
//     number) are READ-ONLY and come straight from the resolved identity /
//     linked Student doc — no invented department, semester, academic year
//     or email anywhere on this page;
//   * the two editable fields persist through `PUT /api/students/me` and
//     never through localStorage;
//   * `linked === false` renders "Profile not linked — contact your
//     administrator" instead of data;
//   * `GET /api/queries` returns this student's own queries only.
//
// Layout, top to bottom (cells stack below xl):
//   Band 1 — identity (4/12) | academic record, read-only (8/12)
//   Band 2 — contact details, editable (5/12) | ask a query (7/12)
//   Band 3 — the student's own queries, full width
//
// Colour is semantic only: primary for actions and the identity tile,
// success for a linked record / an answered query, warning for an
// unlinked record / an open query, destructive for failures. Read-only
// surfaces sit on `muted`, editable ones on the card itself — that
// contrast is what separates the two halves of the page.
// =====================================================

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

// Rendered for anything the record genuinely does not carry. There are no
// invented values on this page any more: no default department, no default
// semester, no current-year guess, and no reading of some other cohort's
// timetable to fill the blanks.
const UNKNOWN = "—";

const show = (value) =>
  value === undefined || value === null || value === "" ? UNKNOWN : String(value);

/** Up to two initials for the identity tile; falls back to a neutral glyph. */
function initialsOf(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return null;
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

/** Read-only field tile — muted surface, because nothing here is editable. */
function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-sm font-medium break-words text-foreground">{show(value)}</div>
    </div>
  );
}

/** Open queries need attention; answered ones are resolved. */
const queryTone = (status) =>
  String(status || "open").toLowerCase() === "answered" ? "success" : "warning";

function MyProfile() {
  const navigate = useNavigate();

  // The single source of truth for who is signed in: `GET /api/auth/me`,
  // which re-reads the linked Student doc server-side.
  const {
    user,
    student,
    linked,
    loading: identityLoading,
    error: identityError,
    refresh,
  } = useIdentity();

  // Only the two fields `PUT /api/students/me` accepts are editable; the
  // academic fields are read-only because only an admin may move a student
  // between cohorts.
  const [form, setForm] = useState({ phone: "", section: "" });
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Queries raised by this student (`GET /api/queries` returns own only).
  const [queries, setQueries] = useState([]);
  const [queryForm, setQueryForm] = useState({ subject: "", message: "" });
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryNotice, setQueryNotice] = useState("");
  const [queryError, setQueryError] = useState("");

  useEffect(() => {
    if (!identityLoading && !user) {
      navigate("/login");
    }
  }, [identityLoading, user, navigate]);

  // Seed the editable fields from the linked Student doc whenever identity
  // resolves or is refreshed.
  useEffect(() => {
    if (!student) return;
    setProfile(student);
    setForm({
      phone: student.phone ?? "",
      section: student.section ?? "",
    });
  }, [student]);

  // Stable boolean so the query list is not refetched when the hook swaps
  // the cached identity for the /auth/me answer.
  const hasUser = Boolean(user);

  useEffect(() => {
    if (identityLoading || !hasUser) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api("/api/queries");
        if (!cancelled) setQueries(unwrap(data, ["queries", "data", "results"]));
      } catch (err) {
        console.error("Queries error:", err);
        if (!cancelled) setQueryError("Unable to load your queries.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identityLoading, hasUser]);

  const { brand, nav, quickActions } = navForRole("student");

  if (identityLoading || !user) {
    return (
      <AppShell brand={brand} nav={nav} quickActions={quickActions}>
        <PageHeader title="My Profile" description="View and manage your student information" />
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-12">
            <Skeleton className="h-56 w-full rounded-xl xl:col-span-4" />
            <Skeleton className="h-56 w-full rounded-xl xl:col-span-8" />
          </div>
          <div className="grid gap-5 xl:grid-cols-12">
            <Skeleton className="h-56 w-full rounded-xl xl:col-span-5" />
            <Skeleton className="h-56 w-full rounded-xl xl:col-span-7" />
          </div>
        </div>
      </AppShell>
    );
  }

  // Academic fields: straight from the resolved identity / linked Student
  // doc, never defaulted.
  const department = user.department ?? profile?.department ?? null;
  const semester = user.semester ?? profile?.semester ?? null;
  const year = user.year ?? profile?.year ?? null;
  const academicYear = user.academicYear ?? profile?.academicYear ?? null;
  const registerNumber = profile?.registerNumber ?? null;
  const name = user.name ?? profile?.name ?? null;
  const email = user.email ?? profile?.email ?? null;
  const role = user.role ?? "student";

  const initials = initialsOf(name);

  // Persist through the backend — this used to write to localStorage only,
  // so every edit was wiped by the next logout.
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await api("/api/students/me", {
        method: "PUT",
        body: { phone: form.phone, section: form.section },
      });

      setProfile(updated);
      setForm({
        phone: updated?.phone ?? "",
        section: updated?.section ?? "",
      });
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);

      // Pull the authoritative copy back so the cached identity and any
      // other page agree with what was just written.
      refresh();
    } catch (err) {
      console.error("Profile save error:", err);
      setError(err?.response?.data?.error || "Unable to save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setForm({
      phone: profile?.phone ?? "",
      section: profile?.section ?? "",
    });
    setEditing(false);
    setError("");
  };

  const submitQuery = async (event) => {
    event.preventDefault();
    const subject = queryForm.subject.trim();
    const message = queryForm.message.trim();

    setQueryNotice("");
    setQueryError("");

    if (!subject || !message) {
      setQueryError("A subject and a message are both required.");
      return;
    }

    setQueryBusy(true);
    try {
      const created = await api("/api/queries", {
        method: "POST",
        body: { subject, message },
      });

      setQueries((list) => [created, ...list]);
      setQueryForm({ subject: "", message: "" });
      setQueryNotice("Your query has been sent to the administrator.");
      setTimeout(() => setQueryNotice(""), 2600);
    } catch (err) {
      console.error("Query submit error:", err);
      setQueryError(err?.response?.data?.error || "Unable to send your query. Please try again.");
    } finally {
      setQueryBusy(false);
    }
  };

  // Editable field — persisted by `save()` through PUT /api/students/me.
  const renderEditableField = (label, key, placeholder) => (
    <div className="rounded-lg border border-border bg-card p-4">
      <Label
        htmlFor={`profile-${key}`}
        className="text-[11px] tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </Label>
      {editing ? (
        <Input
          id={`profile-${key}`}
          className="mt-2"
          placeholder={placeholder}
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      ) : (
        <div className="mt-1 text-sm font-medium break-words text-foreground">
          {show(form[key])}
        </div>
      )}
    </div>
  );

  const notLinkedState = (description) => (
    <EmptyState icon={UserRound} title={NOT_LINKED} description={description} />
  );

  return (
    <AppShell
      brand={brand}
      nav={nav}
      quickActions={quickActions}
      chatbot={{ context: { page: "my-profile", linked } }}
    >
      <PageHeader title="My Profile" description="View and manage your student information" />

      <div className="space-y-5">
        {error && (
          <Callout tone="destructive" title="Could not save your profile">
            {error}
          </Callout>
        )}

        {!error && identityError && (
          <Callout tone="warning" title="Profile could not be refreshed">
            {identityError}
          </Callout>
        )}

        {saved && (
          <Callout tone="success" title="Profile saved" icon={CheckCircle2}>
            Your changes have been stored on your student record.
          </Callout>
        )}

        {/* ============ Band 1 ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Who you are ---- */}
          <SectionCard className="xl:col-span-4">
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-semibold text-primary">
                  {initials || <UserRound className="size-6" />}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
                    {show(name)}
                  </h2>
                  <span className="text-xs text-muted-foreground capitalize">{role}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {linked ? (
                  <StatusBadge variant="success">
                    <CheckCircle2 />
                    Record linked
                  </StatusBadge>
                ) : (
                  <StatusBadge variant="warning">Not linked</StatusBadge>
                )}
              </div>

              <dl className="space-y-3 border-t border-border pt-4 text-sm">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      Email
                    </dt>
                    <dd className="font-medium break-all text-foreground">{show(email)}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <GraduationCap className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                      Register number
                    </dt>
                    <dd className="font-medium break-words text-foreground tabular-nums">
                      {linked ? show(registerNumber) : UNKNOWN}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </SectionCard>

          {/* ---- Academic record (read-only) ---- */}
          <SectionCard
            title="Academic record"
            description={
              linked
                ? "Set by your administrator — these fields cannot be edited here."
                : "No student record is linked to this account."
            }
            icon={Lock}
            className="xl:col-span-8"
          >
            {!linked ? (
              notLinkedState(
                "Your academic details appear here once an administrator links your account to a student record."
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Department" value={department} />
                <Field label="Academic year" value={academicYear} />
                <Field label="Semester" value={semester} />
                <Field label="Year" value={year} />
              </div>
            )}
          </SectionCard>
        </div>

        {/* ============ Band 2 ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Contact details (editable) ---- */}
          <SectionCard
            title="Contact details"
            description="The only fields you can change yourself."
            icon={Pencil}
            className="xl:col-span-5"
            footer={
              linked ? (
                !editing ? (
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="size-4" />
                    Edit details
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={save} disabled={saving}>
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                    <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                )
              ) : null
            }
          >
            {!linked ? (
              notLinkedState(
                "Contact details live on your student record, so they can only be edited once your account is linked."
              )
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {renderEditableField("Section", "section", "e.g. A")}
                {renderEditableField("Phone", "phone", "e.g. 98765 43210")}
              </div>
            )}
          </SectionCard>

          {/* ---- Ask a query ---- */}
          <SectionCard
            title="Ask a query"
            description="Send a question to the administrator; replies appear below."
            icon={MessageSquare}
            className="xl:col-span-7"
          >
            <div className="space-y-4">
              {queryError && (
                <Callout tone="destructive" title="Query failed">
                  {queryError}
                </Callout>
              )}

              {queryNotice && (
                <Callout tone="success" title="Query sent" icon={CheckCircle2}>
                  {queryNotice}
                </Callout>
              )}

              <form onSubmit={submitQuery} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="query-subject">Subject</Label>
                  <Input
                    id="query-subject"
                    value={queryForm.subject}
                    placeholder="What is your query about?"
                    onChange={(e) => setQueryForm({ ...queryForm, subject: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="query-message">Message</Label>
                  <Textarea
                    id="query-message"
                    className="min-h-28"
                    value={queryForm.message}
                    placeholder="Describe your query"
                    onChange={(e) => setQueryForm({ ...queryForm, message: e.target.value })}
                  />
                </div>

                <Button type="submit" disabled={queryBusy}>
                  <Send className="size-4" />
                  {queryBusy ? "Sending…" : "Send query"}
                </Button>
              </form>
            </div>
          </SectionCard>
        </div>

        {/* ============ Band 3 ============ */}
        <SectionCard
          title="Your queries"
          description={
            queries.length
              ? `${queries.length} raised · newest first`
              : "Questions you have raised appear here."
          }
          icon={Inbox}
        >
          {queries.length ? (
            <ul className="grid gap-4 lg:grid-cols-2">
              {queries.map((q, i) => (
                <li
                  key={q?._id || q?.id || i}
                  className="animate-in rounded-lg border border-border bg-card p-4 fade-in duration-150"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 text-sm font-semibold break-words text-foreground">
                      {q?.subject || "Query"}
                    </h3>
                    <StatusBadge variant={queryTone(q?.status)}>
                      {String(q?.status || "open")}
                    </StatusBadge>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed break-words text-muted-foreground">
                    {q?.message}
                  </p>

                  {q?.reply && (
                    <p className="mt-3 rounded-md bg-success/10 p-3 text-sm leading-relaxed break-words text-foreground">
                      <span className="font-medium text-success">Reply · </span>
                      {q.reply}
                    </p>
                  )}

                  {q?.createdAt && (
                    <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                      {new Date(q.createdAt).toLocaleString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="No queries yet"
              description="You have not raised any queries yet."
            />
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}

export default MyProfile;
