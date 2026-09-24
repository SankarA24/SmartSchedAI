
import { useState, useEffect } from "react"
import api from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FacultyForm } from "@/components/Faculty-Form"
import { DataTable } from "@/components/Data-table"
import { Plus, Users, Mail, Clock, Loader2 } from "lucide-react"
import { AppShell, PageHeader } from "@/components/AppShell"
import { navForRole } from "@/lib/nav"
import { StatusBadge } from "@/components/StatusBadge"

export default function FacultyPage() {
  const [faculty, setFaculty] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [editingFaculty, setEditingFaculty] = useState(null)

  const { brand, nav, quickActions } = navForRole("admin")

  const fetchFaculty = async () => {
    setLoading(true)
    try {
      const res = await api.get("/faculty")
      setFaculty(Array.isArray(res.data) ? res.data : [])
    } catch (error) {
      console.error(error)
      setFaculty([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFaculty()
  }, [])

  const handleCreateFaculty = async (data) => {
    setFormLoading(true)
    try {
      if (editingFaculty) {
        await api.put(`/faculty/${editingFaculty._id}`, data)
      } else {
        await api.post("/faculty", data)
      }
      setShowForm(false)
      setEditingFaculty(null)
      fetchFaculty()
    } catch (error) {
      console.error(error)
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async (facultyMember) => {
    try {
      await api.delete(`/faculty/${facultyMember._id}`)
      if (editingFaculty && editingFaculty._id === facultyMember._id) {
        setEditingFaculty(null)
        setShowForm(false)
      }
      fetchFaculty()
    } catch (error) {
      console.error(error)
    }
  }

  const columns = [
    {
      key: "name",
      label: "Name",
      render: (f) => (
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">{f.name}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="size-3" /> {f.email}
          </div>
        </div>
      ),
    },
    {
      key: "department",
      label: "Department",
      render: (f) => <div className="text-sm text-foreground">{f.department}</div>,
    },
    {
      key: "designation",
      label: "Designation",
      render: (f) => <div className="text-sm text-foreground">{f.designation || "N/A"}</div>,
    },
    {
      key: "specialization",
      label: "Specialization",
      render: (f) => (
        <div className="flex flex-wrap gap-1">
          {f.specialization?.slice(0, 2).map((s) => (
            <StatusBadge key={s} variant="neutral">
              {s}
            </StatusBadge>
          ))}
          {f.specialization?.length > 2 && (
            <StatusBadge variant="neutral">+{f.specialization.length - 2}</StatusBadge>
          )}
        </div>
      ),
    },
    {
      key: "maxHoursPerWeek",
      label: "Max Hours/Week",
      render: (f) => (
        <div className="flex items-center gap-2 text-sm tabular-nums text-foreground">
          <Clock className="size-3 text-muted-foreground" /> {f.maxHoursPerWeek}h
        </div>
      ),
    },
    {
      key: "availability",
      label: "Availability",
      render: (f) => (
        <div className="flex flex-col gap-1 text-xs">
          {Object.entries(f.availability || {}).map(([day, slots]) =>
            slots.length ? (
              <div key={day} className="text-muted-foreground">
                <span className="font-medium text-foreground">{day.charAt(0).toUpperCase() + day.slice(1)}:</span>{" "}
                <span className="tabular-nums">{slots.map((s) => `${s.start}-${s.end}`).join(", ")}</span>
              </div>
            ) : null,
          )}
        </div>
      ),
    },
    {
      key: "preferences",
      label: "Preferences",
      render: (f) => (
        <div className="flex flex-col gap-1 text-xs">
          {f.preferences?.preferredTimeSlots?.length > 0 && (
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Preferred:</span>{" "}
              <span className="tabular-nums">{f.preferences.preferredTimeSlots.join(", ")}</span>
            </div>
          )}
          {f.preferences?.avoidTimeSlots?.length > 0 && (
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Avoid:</span>{" "}
              <span className="tabular-nums">{f.preferences.avoidTimeSlots.join(", ")}</span>
            </div>
          )}
        </div>
      ),
    },

    {
      key: "actions",
      label: "Actions",
      render: (f) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingFaculty(f)
              setShowForm(true)
            }}
          >
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(f)}>
            Delete
          </Button>
        </div>
      ),
    },
  ]

  if (loading)
    return (
      <AppShell brand={brand} nav={nav} quickActions={quickActions}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          <p className="text-sm">Loading faculty...</p>
        </div>
      </AppShell>
    )

  return (
    <AppShell brand={brand} nav={nav} quickActions={quickActions}>
      <PageHeader
        title="Faculty"
        description="Manage faculty members and their teaching information."
        actions={
          <Button
            onClick={() => {
              setEditingFaculty(null)
              setShowForm(!showForm)
            }}
          >
            <Plus className="mr-2 size-4" /> Add Faculty
          </Button>
        }
      />

      {/* Add/Edit Form */}
      {showForm && (
        <Card className="mb-6 rounded-lg border border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border p-4">
            <CardTitle>{editingFaculty ? "Edit Faculty" : "Add New Faculty"}</CardTitle>
            <CardDescription>Fill in the faculty details below</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <FacultyForm initialData={editingFaculty} onSubmit={handleCreateFaculty} loading={formLoading} />
          </CardContent>
        </Card>
      )}

      {/* Faculty List */}
      <Card className="rounded-lg border border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border p-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            All Faculty
          </CardTitle>
          <CardDescription>{faculty.length} faculty members registered</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <DataTable data={faculty} columns={columns} searchKey="name" loading={loading} />
        </CardContent>
      </Card>
    </AppShell>
  )
}
