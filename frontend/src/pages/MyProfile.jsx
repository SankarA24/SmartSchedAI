import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, MessageSquare, Pencil, Send, UserRound } from "lucide-react";

import client from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { useIdentity } from "@/hooks/useIdentity";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// =====================================================
// /student-portal/profile — the student's own record (U9 re-skin).
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

/** Read-only field tile. */
function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{show(value)}</div>
    </div>
  );
}

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
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
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
  const renderEditableField = (label, key) => (
    <div className="rounded-lg border border-border bg-background p-4">
      <Label htmlFor={`profile-${key}`} className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </Label>
      {editing ? (
        <Input
          id={`profile-${key}`}
          className="mt-2"
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      ) : (
        <div className="mt-1 text-sm font-medium text-foreground">{show(form[key])}</div>
      )}
    </div>
  );

  return (
    <AppShell
      brand={brand}
      nav={nav}
      quickActions={quickActions}
      chatbot={{ context: { page: "my-profile", linked } }}
    >
      <PageHeader
        title="My Profile"
        description="View and manage your student information"
        actions={
          linked &&
          (!editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Edit profile
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ))
        }
      />

      <div className="space-y-6">
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

        <SectionCard
          title="Personal & Academic Details"
          description={
            linked
              ? "Academic details come from your student record; only phone and section are editable."
              : "No student record is linked to this account."
          }
          icon={UserRound}
        >
          {!linked ? (
            <EmptyState
              icon={UserRound}
              title={NOT_LINKED}
              description="Your academic details appear here once an administrator links your account to a student record."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" value={name} />
              <Field label="Email" value={email} />
              <Field label="Register Number" value={registerNumber} />
              <Field label="Department" value={department} />
              <Field label="Semester" value={semester} />
              <Field label="Year" value={year} />
              <Field label="Academic Year" value={academicYear} />
              <Field label="Role" value={role} />
              {renderEditableField("Section", "section")}
              {renderEditableField("Phone", "phone")}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Ask a Query"
          description="Send a question to the administrator and read their replies"
          icon={MessageSquare}
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
                  className="min-h-24"
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

            <div className="space-y-3 border-t border-border pt-4">
              <div className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Your Queries
              </div>

              {queries.length ? (
                <ul className="space-y-3">
                  {queries.map((q, i) => (
                    <li
                      key={q?._id || q?.id || i}
                      className="animate-in rounded-lg border border-border bg-background p-4 fade-in duration-150"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold text-foreground">
                          {q?.subject || "Query"}
                        </h3>
                        <Badge variant="secondary">
                          {String(q?.status || "open").toUpperCase()}
                        </Badge>
                      </div>

                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {q?.message}
                      </p>

                      {q?.reply && (
                        <p className="mt-2 rounded-md bg-primary/5 p-3 text-sm leading-relaxed text-foreground">
                          <span className="font-medium">Reply: </span>
                          {q.reply}
                        </p>
                      )}

                      {q?.createdAt && (
                        <p className="mt-2 text-xs text-muted-foreground">
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
            </div>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}

export default MyProfile;
