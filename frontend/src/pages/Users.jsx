

import { useState, useEffect } from "react"
import api from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/Data-table"
import { AppShell, PageHeader } from "@/components/AppShell"
import { StatusBadge } from "@/components/StatusBadge"
import {
  Plus,
  UserCog,
  Users as UsersIcon,
  BookOpen,
  Home,
  Calendar,
  LayoutDashboard,
  Bell,
  GraduationCap,
} from "lucide-react"

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "faculty", label: "Faculty" },
  { value: "student", label: "Student" },
]

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
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState("")
  const [formData, setFormData] = useState(emptyFormData)

  // Per-row inline "reset password" state: which user's row has the
  // input open, its current value, and whether a save is in flight.
  const [resetTargetId, setResetTargetId] = useState(null)
  const [resetValue, setResetValue] = useState("")
  const [resetLoading, setResetLoading] = useState(false)

  const brand = { title: "SmartSchedAI", subtitle: "Admin" }

  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { id: "courses", label: "Courses", icon: BookOpen, path: "/courses" },
    { id: "faculty", label: "Faculty", icon: UsersIcon, path: "/faculty" },
    { id: "rooms", label: "Rooms", icon: Home, path: "/rooms" },
    { id: "users", label: "Users", icon: UserCog, path: "/users" },
    { id: "students", label: "Students", icon: GraduationCap, path: "/students" },
    { id: "timetables", label: "Timetables", icon: Calendar, path: "/timetables" },
    { id: "notifications", label: "Notifications", icon: Bell, path: "/notifications" },
  ]

  // Fetch users from backend
  const fetchUsers = async () => {
    try {
      setLoading(true)
      const res = await api.get("/users")
      setUsers(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.error("Failed to fetch users:", err)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

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
      fetchUsers()
    } catch (err) {
      console.error("Failed to create user:", err)
      setFormError(err.response?.data?.error || "Failed to create user")
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Delete user "${user.name}" (${user.email})? This cannot be undone.`)) {
      return
    }
    try {
      await api.delete(`/users/${user._id}`)
      fetchUsers()
    } catch (err) {
      console.error("Failed to delete user:", err)
      window.alert(err.response?.data?.error || "Failed to delete user")
    }
  }

  const openReset = (user) => {
    setResetTargetId(user._id)
    setResetValue("")
  }

  const cancelReset = () => {
    setResetTargetId(null)
    setResetValue("")
  }

  const submitReset = async (user) => {
    if (resetValue.trim().length < 6) {
      window.alert("Password must be at least 6 characters")
      return
    }
    try {
      setResetLoading(true)
      await api.put(`/users/${user._id}`, { resetPassword: resetValue.trim() })
      cancelReset()
    } catch (err) {
      console.error("Failed to reset password:", err)
      window.alert(err.response?.data?.error || "Failed to reset password")
    } finally {
      setResetLoading(false)
    }
  }

  const columns = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (user) => <div className="text-sm font-medium text-foreground">{user.name}</div>,
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (user) => <div className="text-sm text-muted-foreground">{user.email}</div>,
    },
    {
      key: "role",
      label: "Role",
      render: (user) => <StatusBadge variant="info">{user.role}</StatusBadge>,
    },
    {
      key: "linkedProfile",
      label: "Linked Profile",
      render: (user) =>
        user.facultyId || user.studentId ? (
          <StatusBadge variant="success">Yes</StatusBadge>
        ) : (
          <StatusBadge variant="warning">No</StatusBadge>
        ),
    },
    {
      key: "createdAt",
      label: "Created",
      render: (user) => (
        <div className="text-sm text-muted-foreground">
          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (user) => (
        <div className="flex flex-wrap items-center gap-2">
          {resetTargetId === user._id ? (
            <>
              <Input
                type="password"
                placeholder="New password"
                value={resetValue}
                onChange={(e) => setResetValue(e.target.value)}
                className="h-8 w-36"
                autoFocus
              />
              <Button size="sm" onClick={() => submitReset(user)} disabled={resetLoading}>
                {resetLoading ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelReset} disabled={resetLoading}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => openReset(user)}>
              Reset password
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => handleDeleteUser(user)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ]

  if (loading) {
    return (
      <AppShell brand={brand} nav={navigationItems}>
        <div className="space-y-6">
          <div className="h-9 w-72 animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-96 animate-pulse rounded-md bg-muted" />
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell brand={brand} nav={navigationItems}>
      <PageHeader
        title="Users"
        description="Manage admin, faculty and student login accounts."
        actions={
          <Button
            onClick={() => {
              resetForm()
              setShowForm(!showForm)
            }}
          >
            <Plus className="mr-2 size-4" />
            Create User
          </Button>
        }
      />

      {/* Create user form */}
      {showForm && (
        <Card className="mb-6 rounded-lg border border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border p-4">
            <CardTitle>Create User</CardTitle>
            <CardDescription>
              Add a login account, and optionally create its linked faculty or student profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleCreateUser} className="space-y-4">
              {formError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={formData.role} onValueChange={handleRoleChange}>
                    <SelectTrigger className="w-full">
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
              </div>

              {formData.role !== "admin" && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <input
                    id="user-create-profile"
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={formData.createProfile}
                    onChange={(e) => handleFieldChange("createProfile", e.target.checked)}
                  />
                  <Label htmlFor="user-create-profile" className="cursor-pointer text-sm font-normal">
                    Create {formData.role} profile for this user
                  </Label>
                </div>
              )}

              {formData.role !== "admin" && formData.createProfile && (
                <div className="space-y-4 rounded-md border border-border p-4">
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
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="profile-specialization">Specialization (comma-separated)</Label>
                        <Input
                          id="profile-specialization"
                          value={formData.specialization}
                          onChange={(e) => handleFieldChange("specialization", e.target.value)}
                          placeholder="e.g., Data Structures, Algorithms"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="profile-maxHours">Max Hours / Week</Label>
                        <Input
                          id="profile-maxHours"
                          type="number"
                          min={1}
                          max={40}
                          value={formData.maxHoursPerWeek}
                          onChange={(e) => handleFieldChange("maxHoursPerWeek", e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="profile-registerNumber">Register Number</Label>
                        <Input
                          id="profile-registerNumber"
                          value={formData.registerNumber}
                          onChange={(e) => handleFieldChange("registerNumber", e.target.value)}
                          placeholder="Auto-generated if blank"
                        />
                      </div>
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
                        <Label htmlFor="profile-academicYear">Academic Year</Label>
                        <Input
                          id="profile-academicYear"
                          type="number"
                          min={2020}
                          max={2035}
                          value={formData.academicYear}
                          onChange={(e) => handleFieldChange("academicYear", e.target.value)}
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
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={formLoading}>
                  {formLoading ? "Creating..." : "Create User"}
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
          </CardContent>
        </Card>
      )}

      {/* Users list */}
      <Card className="rounded-lg border border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border p-4">
          <CardTitle className="flex items-center gap-2">
            <UserCog className="size-4 text-muted-foreground" />
            All Users
          </CardTitle>
          <CardDescription>{users.length} accounts registered in the system</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <DataTable data={users} columns={columns} searchKey="name" loading={loading} />
        </CardContent>
      </Card>
    </AppShell>
  )
}
