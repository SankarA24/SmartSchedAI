import { useCallback, useEffect, useMemo, useState } from "react"
import {
  GraduationCap,
  History,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  Users as UsersIcon,
  X,
} from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { navForRole } from "@/lib/nav"
import { AppShell, PageHeader } from "@/components/AppShell"
import { DataTable } from "@/components/Data-table"
import { StatusBadge } from "@/components/StatusBadge"
import { Callout } from "@/components/common/Callout"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { SectionCard } from "@/components/common/SectionCard"
import { StatCard } from "@/components/common/StatCard"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// =====================================================
// /users — the admin account area (admin-only server-side).
//
// Every figure on this page is derived from the one response this page
// fetches, `GET /api/users`. Nothing is invented: when that request fails
// the counts render an em dash and a Callout explains why, rather than a
// zero that would read as "no accounts".
//
// Layout, top to bottom:
//   Band 1 — headline counts (5) | profile links (4) | recently added (3)
//   Band 2 — the account list (8, or 12 when the form is closed)
//            with the create form beside it in its own 4-wide cell
//
// Endpoints, unchanged from the previous version of this page:
//   GET    /api/users            the list
//   POST   /api/users            create (optionally with `createProfile`)
//   PUT    /api/users/:id        { resetPassword }
//   DELETE /api/users/:id        remove an account
// =====================================================

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "faculty", label: "Faculty" },
  { value: "student", label: "Student" },
]

/** Role is a category, not a status, so it is labelled but never coloured. */
const ROLE_LABELS = {
  admin: "Admin",
  faculty: "Faculty",
  student: "Student",
}

/** How many accounts the "Recently added" cell lists. */
const RECENT_LIMIT = 4

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : DATE_FORMAT.format(date)
}

function errorMessage(error, fallback) {
  const data = error?.response?.data
  if (data && typeof data === "object" && typeof data.error === "string") return data.error
  return error?.message || fallback
}

/** An account is "linked" when it resolves to a Faculty or Student document. */
function isLinked(user) {
  return Boolean(user?.facultyId || user?.studentId)
}

const emptyFormData = {
  name: "",
  email: "",
  password: "",
  role: "faculty",
  createProfile: false,
  // Faculty profile fields
  department: "",
  specialization: "",
  maxHoursPerWeek: 20,
  // Student profile fields
  registerNumber: "",
  semester: 1,
  year: 1,
  academicYear: new Date().getFullYear(),
  section: "A",
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState("")
  const [formData, setFormData] = useState(emptyFormData)

  // "Reset password" state: which account the dialog is open for, the value
  // typed into it, and whether the save is in flight.
  const [resetTarget, setResetTarget] = useState(null)
  const [resetValue, setResetValue] = useState("")
  const [resetLoading, setResetLoading] = useState(false)

  // Delete confirmation state.
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const { brand, nav, quickActions } = navForRole("admin")

  // Fetch users from backend
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get("/users")
      setUsers(Array.isArray(res.data) ? res.data : [])
      setListError(null)
    } catch (err) {
      console.error("Failed to fetch users:", err)
      setUsers([])
      setListError(errorMessage(err, "Failed to load accounts"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const resetForm = () => {
    setFormData(emptyFormData)
    setFormError("")
  }

  const handleFieldChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleRoleChange = (role) => {
    setFormData((prev) => ({ ...prev, role, createProfile: false }))
  }

  // Build the POST /api/users payload from form state.
  const buildPayload = () => {
    const payload = {
      name: formData.name,
      email: formData.email,
      password: formData.password,
      role: formData.role,
    }

    if (formData.role !== "admin" && formData.createProfile) {
      payload.createProfile = true

      if (formData.role === "faculty") {
        payload.profile = {
          department: formData.department,
          specialization: formData.specialization
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          maxHoursPerWeek: Number(formData.maxHoursPerWeek) || 20,
        }
      } else {
        payload.profile = {
          department: formData.department,
          registerNumber: formData.registerNumber.trim() || undefined,
          semester: Number(formData.semester) || 1,
          year: Number(formData.year) || 1,
          academicYear: Number(formData.academicYear) || new Date().getFullYear(),
          section: formData.section.trim() || "A",
        }
      }
    }

    return payload
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setFormError("")
    try {
      setFormLoading(true)
      await api.post("/users", buildPayload())
      setShowForm(false)
      resetForm()
      toast.success("Account created.")
      fetchUsers()
    } catch (err) {
      console.error("Failed to create user:", err)
      setFormError(err.response?.data?.error || "Failed to create user")
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteUser = async () => {
    const user = deleteTarget
    if (!user) return
    try {
      setDeleteLoading(true)
      await api.delete(`/users/${user._id}`)
      setDeleteTarget(null)
      toast.success(`"${user.name}" deleted.`)
      fetchUsers()
    } catch (err) {
      console.error("Failed to delete user:", err)
      toast.error(errorMessage(err, "Failed to delete user"))
    } finally {
      setDeleteLoading(false)
    }
  }

  const openReset = (user) => {
    setResetTarget(user)
    setResetValue("")
  }

  const cancelReset = () => {
    setResetTarget(null)
    setResetValue("")
  }

  const submitReset = async (event) => {
    event.preventDefault()
    const user = resetTarget
    if (!user) return

    if (resetValue.trim().length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    try {
      setResetLoading(true)
      await api.put(`/users/${user._id}`, { resetPassword: resetValue.trim() })
      cancelReset()
      toast.success(`Password reset for "${user.name}".`)
    } catch (err) {
      console.error("Failed to reset password:", err)
      toast.error(errorMessage(err, "Failed to reset password"))
    } finally {
      setResetLoading(false)
    }
  }

  // ---------------------------------------------------
  // Derived figures — all of them off the one users response
  // ---------------------------------------------------
  const roleCounts = useMemo(() => {
    const counts = { admin: 0, faculty: 0, student: 0 }
    for (const user of users) {
      const role = String(user?.role || "").toLowerCase()
      if (role in counts) counts[role] += 1
    }
    return counts
  }, [users])

  /**
   * Only faculty and student accounts need a linked profile — an admin has
   * no Faculty/Student document to resolve to, so admins are excluded from
   * both halves of this ratio.
   */
  const profileLinks = useMemo(() => {
    const linkable = users.filter((user) => String(user?.role || "").toLowerCase() !== "admin")
    const linked = linkable.filter(isLinked).length
    return {
      total: linkable.length,
      linked,
      missing: linkable.length - linked,
      percent: linkable.length ? Math.round((linked / linkable.length) * 100) : 0,
    }
  }, [users])

  const recentUsers = useMemo(() => {
    return [...users]
      .sort((a, b) => {
        const left = new Date(a?.createdAt ?? "").getTime() || 0
        const right = new Date(b?.createdAt ?? "").getTime() || 0
        return right - left
      })
      .slice(0, RECENT_LIMIT)
  }, [users])

  const firstLoad = loading && users.length === 0

  const columns = [
    {
      key: "name",
      label: "Account",
      sortable: true,
      render: (user) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      render: (user) => (
        <StatusBadge>{ROLE_LABELS[String(user.role || "").toLowerCase()] || user.role}</StatusBadge>
      ),
    },
    {
      key: "linkedProfile",
      label: "Profile",
      render: (user) =>
        isLinked(user) ? (
          <StatusBadge variant="success">Linked</StatusBadge>
        ) : String(user.role || "").toLowerCase() === "admin" ? (
          <span className="text-xs text-muted-foreground">Not required</span>
        ) : (
          <StatusBadge variant="warning">Not linked</StatusBadge>
        ),
    },
    {
      key: "createdAt",
      label: "Created",
      render: (user) => (
        <div className="text-sm tabular-nums text-muted-foreground">
          {formatDate(user.createdAt) || "—"}
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (user) => (
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Reset password for ${user.name}`}
                onClick={() => openReset(user)}
              >
                <KeyRound className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset password</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${user.name}`}
                className="text-muted-foreground transition-colors hover:text-destructive"
                onClick={() => setDeleteTarget(user)}
              >
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete account</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ]

  return (
    <AppShell brand={brand} nav={nav} quickActions={quickActions}>
      <PageHeader
        title="Users"
        description="Manage admin, faculty and student login accounts."
        actions={
          <>
            <Button variant="outline" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className="size-4" />
              {loading ? "Refreshing" : "Refresh"}
            </Button>
            <Button
              onClick={() => {
                resetForm()
                setShowForm(!showForm)
              }}
            >
              {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
              {showForm ? "Close form" : "Create user"}
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        {listError && (
          <Callout tone="destructive" title="Accounts could not be loaded">
            <div className="space-y-3">
              <p>{listError}</p>
              <Button variant="outline" size="sm" onClick={fetchUsers}>
                <RefreshCw className="size-4" />
                Retry
              </Button>
            </div>
          </Callout>
        )}

        {/* ============ Band 1 ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Headline figures ---- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-5">
            <StatCard
              label="Accounts"
              value={listError ? "—" : users.length}
              icon={UsersIcon}
              loading={firstLoad}
            />
            <StatCard
              label="Admins"
              value={listError ? "—" : roleCounts.admin}
              icon={ShieldCheck}
              loading={firstLoad}
            />
            <StatCard
              label="Faculty"
              value={listError ? "—" : roleCounts.faculty}
              icon={GraduationCap}
              loading={firstLoad}
            />
            <StatCard
              label="Students"
              value={listError ? "—" : roleCounts.student}
              icon={UserRound}
              loading={firstLoad}
            />
          </div>

          {/* ---- Profile links ---- */}
          <SectionCard
            title="Profile links"
            description="Accounts resolved to a faculty or student record"
            icon={Link2}
            className="xl:col-span-4"
          >
            {firstLoad ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : listError ? (
              <p className="text-sm text-muted-foreground">
                Links cannot be checked while the account list is unavailable.
              </p>
            ) : profileLinks.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                Only admin accounts exist so far, and an admin needs no linked profile.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {profileLinks.linked}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    of {profileLinks.total} faculty &amp; student accounts
                  </span>
                </p>
                <Progress value={profileLinks.percent} />
                {profileLinks.missing > 0 ? (
                  <div className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                    {profileLinks.missing} account
                    {profileLinks.missing === 1 ? "" : "s"} without a linked profile. Their
                    portal shows “Profile not linked” instead of a timetable.
                  </div>
                ) : (
                  <div className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
                    Every faculty and student account resolves to a profile.
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* ---- Recently added ---- */}
          <SectionCard
            title="Recently added"
            description="Newest accounts first"
            icon={History}
            className="xl:col-span-3"
          >
            {firstLoad ? (
              <div className="space-y-3">
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} className="h-9 w-full" />
                ))}
              </div>
            ) : listError ? (
              <p className="text-sm text-muted-foreground">
                The account list could not be read.
              </p>
            ) : recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Accounts appear here as soon as the first one is created.
              </p>
            ) : (
              <ul className="space-y-3">
                {recentUsers.map((user) => (
                  <li key={user._id} className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ROLE_LABELS[String(user.role || "").toLowerCase()] || user.role}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDate(user.createdAt) || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* ============ Band 2 — the list, with the form beside it ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/*
            The form is DOM-first so that opening it on a narrow screen puts
            it under the thumb, and `xl:order-2` moves it back to the right
            of the list on wide screens, where the list keeps the large cell.
          */}
          {showForm && (
            <SectionCard
              title="New account"
              description="A login, plus optionally the faculty or student record it links to."
              icon={UserPlus}
              className="order-1 animate-in fade-in duration-200 xl:order-2 xl:col-span-4"
            >
              <form onSubmit={handleCreateUser} className="space-y-4">
                {formError && (
                  <Callout tone="destructive" title="Account not created">
                    {formError}
                  </Callout>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="user-name">Name</Label>
                  <Input
                    id="user-name"
                    value={formData.name}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-email">Email</Label>
                  <Input
                    id="user-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleFieldChange("email", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-password">Password</Label>
                  <Input
                    id="user-password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleFieldChange("password", e.target.value)}
                    minLength={6}
                    required
                  />
                  <p className="text-xs text-muted-foreground">At least 6 characters.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user-role">Role</Label>
                  <Select value={formData.role} onValueChange={handleRoleChange}>
                    <SelectTrigger id="user-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.role !== "admin" && (
                  <div className="flex items-start gap-3 rounded-lg bg-muted px-3 py-3">
                    <Checkbox
                      id="user-create-profile"
                      checked={formData.createProfile}
                      onCheckedChange={(checked) =>
                        handleFieldChange("createProfile", checked === true)
                      }
                    />
                    <div className="min-w-0 space-y-1">
                      <Label
                        htmlFor="user-create-profile"
                        className="cursor-pointer text-sm font-normal"
                      >
                        Create the {formData.role} profile too
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Without it the account has no record to resolve to, and its portal
                        stays empty.
                      </p>
                    </div>
                  </div>
                )}

                {formData.role !== "admin" && formData.createProfile && (
                  <div className="space-y-4 border-t border-border pt-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="profile-department">Department</Label>
                      <Input
                        id="profile-department"
                        value={formData.department}
                        onChange={(e) => handleFieldChange("department", e.target.value)}
                        placeholder="e.g., Computer Science"
                        required
                      />
                    </div>

                    {formData.role === "faculty" ? (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="profile-specialization">Specialization</Label>
                          <Input
                            id="profile-specialization"
                            value={formData.specialization}
                            onChange={(e) =>
                              handleFieldChange("specialization", e.target.value)
                            }
                            placeholder="e.g., Data Structures, Algorithms"
                          />
                          <p className="text-xs text-muted-foreground">
                            Comma-separated. The scheduler matches these against course
                            wording.
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="profile-maxHours">Max hours / week</Label>
                          <Input
                            id="profile-maxHours"
                            type="number"
                            min={1}
                            max={40}
                            value={formData.maxHoursPerWeek}
                            onChange={(e) =>
                              handleFieldChange("maxHoursPerWeek", e.target.value)
                            }
                            required
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="profile-registerNumber">Register number</Label>
                          <Input
                            id="profile-registerNumber"
                            value={formData.registerNumber}
                            onChange={(e) =>
                              handleFieldChange("registerNumber", e.target.value)
                            }
                            placeholder="Auto-generated if blank"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="profile-semester">Semester</Label>
                            <Input
                              id="profile-semester"
                              type="number"
                              min={1}
                              max={8}
                              value={formData.semester}
                              onChange={(e) => handleFieldChange("semester", e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="profile-year">Year</Label>
                            <Input
                              id="profile-year"
                              type="number"
                              min={1}
                              max={4}
                              value={formData.year}
                              onChange={(e) => handleFieldChange("year", e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="profile-academicYear">Academic year</Label>
                            <Input
                              id="profile-academicYear"
                              type="number"
                              min={2020}
                              max={2035}
                              value={formData.academicYear}
                              onChange={(e) =>
                                handleFieldChange("academicYear", e.target.value)
                              }
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="profile-section">Section</Label>
                            <Input
                              id="profile-section"
                              value={formData.section}
                              onChange={(e) => handleFieldChange("section", e.target.value)}
                              placeholder="A"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <Button type="submit" disabled={formLoading}>
                    <UserPlus className="size-4" />
                    {formLoading ? "Creating…" : "Create user"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false)
                      resetForm()
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </SectionCard>
          )}

          {/* ---- The account list ---- */}
          <SectionCard
            title="All accounts"
            description={
              listError
                ? "The account list could not be loaded."
                : `${users.length} account${users.length === 1 ? "" : "s"} registered.`
            }
            icon={UsersIcon}
            className={cn("order-2 xl:order-1", showForm ? "xl:col-span-8" : "xl:col-span-12")}
          >
            <DataTable
              data={users}
              columns={columns}
              searchKey="name"
              loading={loading}
              entityName="accounts"
              empty={
                listError
                  ? {
                      icon: UsersIcon,
                      title: "Accounts unavailable",
                      description: "The list could not be loaded. Refresh to try again.",
                      action: (
                        <Button variant="outline" onClick={fetchUsers}>
                          <RefreshCw className="size-4" />
                          Refresh
                        </Button>
                      ),
                    }
                  : {
                      icon: UsersIcon,
                      title: "No accounts yet",
                      description:
                        "Create a login so somebody can sign in to one of the portals.",
                      action: (
                        <Button
                          onClick={() => {
                            resetForm()
                            setShowForm(true)
                          }}
                        >
                          <Plus className="size-4" />
                          Create user
                        </Button>
                      ),
                    }
              }
            />
          </SectionCard>
        </div>
      </div>

      {/* ============ Reset password ============ */}
      <Dialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => {
          if (!open && !resetLoading) cancelReset()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {resetTarget
                ? `Set a new password for ${resetTarget.name} (${resetTarget.email}).`
                : "Set a new password for this account."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitReset} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="password"
                placeholder="At least 6 characters"
                value={resetValue}
                onChange={(e) => setResetValue(e.target.value)}
                minLength={6}
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={cancelReset}
                disabled={resetLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={resetLoading}>
                <KeyRound className="size-4" />
                {resetLoading ? "Saving…" : "Save password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============ Delete confirmation ============ */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete this account?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" (${deleteTarget.email}) will no longer be able to sign in. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete account"
        destructive
        loading={deleteLoading}
        onConfirm={handleDeleteUser}
      />
    </AppShell>
  )
}
