

import { useState, useEffect } from "react"
import api from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/Data-table"
import { Plus, GraduationCap } from "lucide-react"
import { AppShell, PageHeader } from "@/components/AppShell"
import { navForRole } from "@/lib/nav"
import { StatusBadge } from "@/components/StatusBadge"

// =====================================================
// STUDENT FORM (inline — mirrors CourseForm's shape)
// =====================================================

const emptyStudent = {
  name: "",
  registerNumber: "",
  email: "",
  department: "",
  semester: 1,
  year: 1,
  academicYear: new Date().getFullYear(),
  section: "A",
}

function StudentForm({ initialData = null, onSubmit, loading }) {
  const [formData, setFormData] = useState(emptyStudent)

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        registerNumber: initialData.registerNumber || "",
        email: initialData.email || "",
        department: initialData.department || "",
        semester: initialData.semester ?? 1,
        year: initialData.year ?? 1,
        academicYear: initialData.academicYear ?? new Date().getFullYear(),
        section: initialData.section || "A",
      })
    } else {
      setFormData(emptyStudent)
    }
  }, [initialData])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === "academicYear" ? Number(value) : value,
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Name *</Label>
          <Input
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Priya Sharma"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Register Number *</Label>
          <Input
            name="registerNumber"
            value={formData.registerNumber}
            onChange={handleChange}
            placeholder="e.g., CS2026001"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Email *</Label>
          <Input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="student@example.com"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Department *</Label>
          <Input
            name="department"
            value={formData.department}
            onChange={handleChange}
            placeholder="e.g., Computer Science"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Semester *</Label>
          <Select
            value={String(formData.semester)}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, semester: Number(value) }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((s) => (
                <SelectItem key={s} value={String(s)}>
                  Semester {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Year *</Label>
          <Select
            value={String(formData.year)}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, year: Number(value) }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  Year {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Academic Year *</Label>
          <Input
            type="number"
            name="academicYear"
            value={formData.academicYear}
            onChange={handleChange}
            required
            min="2020"
            max="2035"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Section</Label>
          <Input name="section" value={formData.section} onChange={handleChange} placeholder="A" />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : initialData ? "Update Student" : "Add Student"}
        </Button>
      </div>
    </form>
  )
}

// =====================================================
// STUDENTS PAGE
// =====================================================

export default function StudentsPage() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)

  const { brand, nav, quickActions } = navForRole("admin")

  // Fetch students from backend
  const fetchStudents = async () => {
    try {
      setLoading(true)
      const res = await api.get("/students/")
      setStudents(res.data)
    } catch (err) {
      console.error("Failed to fetch students:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStudents()
  }, [])

  // Create a new student
  const handleCreateStudent = async (studentData) => {
    try {
      setFormLoading(true)
      await api.post("/students/", studentData)
      setShowForm(false)
      setEditingStudent(null)
      fetchStudents()
    } catch (error) {
      console.error("Failed to create student:", error)
    } finally {
      setFormLoading(false)
    }
  }

  // Update a student
  const handleUpdateStudent = async (id, studentData) => {
    try {
      setFormLoading(true)
      await api.put(`/students/${id}`, studentData)
      setEditingStudent(null)
      setShowForm(false)
      fetchStudents()
    } catch (error) {
      console.error("Failed to update student:", error)
    } finally {
      setFormLoading(false)
    }
  }

  // Delete a student
  const handleDeleteStudent = async (id) => {
    try {
      await api.delete(`/students/${id}`)
      // if deleting the currently editing student, clear form
      if (editingStudent && editingStudent._id === id) {
        setEditingStudent(null)
        setShowForm(false)
      }
      fetchStudents()
    } catch (error) {
      console.error("Failed to delete student:", error)
    }
  }

  // DataTable columns
  const columns = [
    {
      key: "registerNumber",
      label: "Register No.",
      sortable: true,
      render: (student) => <div className="font-mono text-sm text-foreground">{student.registerNumber}</div>,
    },
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (student) => <div className="text-sm font-medium text-foreground">{student.name}</div>,
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (student) => <div className="text-sm text-muted-foreground">{student.email}</div>,
    },
    {
      key: "department",
      label: "Department",
      sortable: true,
      render: (student) => <div className="text-sm text-muted-foreground">{student.department}</div>,
    },
    {
      key: "semester",
      label: "Semester",
      render: (student) => <StatusBadge variant="neutral">Sem {student.semester}</StatusBadge>,
    },
    {
      key: "year",
      label: "Year · AY",
      render: (student) => (
        <StatusBadge variant="neutral">
          Year {student.year}{student.academicYear ? ` · ${student.academicYear}` : ""}
        </StatusBadge>
      ),
    },
    {
      key: "section",
      label: "Section",
      render: (student) => <StatusBadge variant="neutral">{student.section || "A"}</StatusBadge>,
    },
    {
      key: "actions",
      label: "Actions",
      render: (student) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingStudent(student)
              setShowForm(true)
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => handleDeleteStudent(student._id)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ]

  if (loading) {
    return (
      <AppShell brand={brand} nav={nav} quickActions={quickActions}>
        <div className="space-y-6">
          <div className="h-9 w-72 animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-96 animate-pulse rounded-md bg-muted" />
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell brand={brand} nav={nav} quickActions={quickActions}>
      <PageHeader
        title="Students"
        description="Manage student records and their academic details."
        actions={
          <Button
            onClick={() => {
              setEditingStudent(null)
              setShowForm(!showForm)
            }}
          >
            <Plus className="mr-2 size-4" />
            Add Student
          </Button>
        }
      />

      {/* Add/Edit Student Form */}
      {showForm && (
        <Card className="mb-6 rounded-lg border border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border p-4">
            <CardTitle>{editingStudent ? "Edit Student" : "Add New Student"}</CardTitle>
            <CardDescription>Fill in the student details below</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <StudentForm
              initialData={editingStudent}
              onSubmit={(data) => {
                if (editingStudent) {
                  handleUpdateStudent(editingStudent._id, data)
                } else {
                  handleCreateStudent(data)
                }
              }}
              loading={formLoading}
            />
          </CardContent>
        </Card>
      )}

      {/* Students List */}
      <Card className="rounded-lg border border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border p-4">
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="size-4 text-muted-foreground" />
            All Students
          </CardTitle>
          <CardDescription>{students.length} students registered in the system</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <DataTable data={students} columns={columns} searchKey="name" loading={loading} />
        </CardContent>
      </Card>
    </AppShell>
  )
}
