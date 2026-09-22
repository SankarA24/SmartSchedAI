

import { useState, useEffect } from "react"
import api from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CourseForm } from "@/components/CourseForm"
import { DataTable } from "@/components/Data-table"
import { Plus, BookOpen, Users, Calendar, LayoutDashboard, Home, Bell, UserCog, GraduationCap } from "lucide-react"
import { AppShell, PageHeader } from "@/components/AppShell"
import { StatusBadge } from "@/components/StatusBadge"

export default function CoursesPage() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [editingCourse, setEditingCourse] = useState(null)

  const brand = { title: "SmartSchedAI", subtitle: "Admin" }

  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { id: "courses", label: "Courses", icon: BookOpen, path: "/courses" },
    { id: "faculty", label: "Faculty", icon: Users, path: "/faculty" },
    { id: "rooms", label: "Rooms", icon: Home, path: "/rooms" },
    { id: "users", label: "Users", icon: UserCog, path: "/users" },
    { id: "students", label: "Students", icon: GraduationCap, path: "/students" },
    {
      id: "timetables",
      label: "Timetables",
      icon: Calendar,
      path: "/timetables",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      path: "/notifications",
    },
  ]

  // Fetch courses from backend
  const fetchCourses = async () => {
    try {
      setLoading(true)
      const res = await api.get("/courses/")
      setCourses(res.data)
    } catch (err) {
      console.error("Failed to fetch courses:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCourses()
  }, [])

  // Create a new course
  const handleCreateCourse = async (courseData) => {
    try {
      setFormLoading(true)
      await api.post("/courses/", courseData)
      setShowForm(false)
      setEditingCourse(null)
      fetchCourses()
    } catch (error) {
      console.error("Failed to create course:", error)
    } finally {
      setFormLoading(false)
    }
  }

  // Update a course
  const handleUpdateCourse = async (id, courseData) => {
    try {
      setFormLoading(true)
      await api.put(`/courses/${id}`, courseData)
      setEditingCourse(null)
      setShowForm(false)
      fetchCourses()
    } catch (error) {
      console.error("Failed to update course:", error)
    } finally {
      setFormLoading(false)
    }
  }

  // Delete a course
  const handleDeleteCourse = async (id) => {
    try {
      await api.delete(`/courses/${id}`)
      // if deleting the currently editing course, clear form
      if (editingCourse && editingCourse._id === id) {
        setEditingCourse(null)
        setShowForm(false)
      }
      fetchCourses()
    } catch (error) {
      console.error("Failed to delete course:", error)
    }
  }

  // DataTable columns (note: key for semester is "semester")
  const columns = [
    {
      key: "code",
      label: "Course Code",
      sortable: true,
      render: (course) => <div className="font-mono text-sm text-foreground">{course.code}</div>,
    },
    {
      key: "name",
      label: "Course Name",
      sortable: true,
      render: (course) => <div className="text-sm font-medium text-foreground">{course.name}</div>,
    },
    {
      key: "department",
      label: "Department",
      sortable: true,
      render: (course) => <div className="text-sm text-muted-foreground">{course.department}</div>,
    },
    {
      key: "credits",
      label: "Credits",
      render: (course) => <StatusBadge variant="neutral">{course.credits}</StatusBadge>,
    },
    {
      key: "type",
      label: "Type",
      render: (course) => <StatusBadge variant="neutral">{course.type}</StatusBadge>,
    },
    {
      key: "hoursPerWeek",
      label: "Hours per Week",
      render: (course) => <StatusBadge variant="neutral">{course.hoursPerWeek}</StatusBadge>,
    },
    {
      key: "semester",
      label: "Semester",
      render: (course) => <StatusBadge variant="neutral">Sem {course.semester}</StatusBadge>,
    },
    {
      key: "year",
      label: "Year · AY",
      render: (course) => (
        <StatusBadge variant="neutral">
          Year {course.year}{course.academicYear ? ` · ${course.academicYear}` : ""}
        </StatusBadge>
      ),
    },
    {
      key: "prerequisites",
      label: "Prerequisites",
      render: (course) => (
        <div className="flex max-w-32 flex-wrap gap-1">
          {course.prerequisites?.length > 0 ? (
            course.prerequisites.map((prereq, index) => (
              <StatusBadge key={index} variant="neutral">
                {prereq}
              </StatusBadge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">None</span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (course) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingCourse(course)
              setShowForm(true)
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => handleDeleteCourse(course._id)}
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
        title="Courses"
        description="Manage academic courses and their details."
        actions={
          <Button
            onClick={() => {
              setEditingCourse(null)
              setShowForm(!showForm)
            }}
          >
            <Plus className="mr-2 size-4" />
            Add Course
          </Button>
        }
      />

      {/* Add/Edit Course Form */}
      {showForm && (
        <Card className="mb-6 rounded-lg border border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border p-4">
            <CardTitle>{editingCourse ? "Edit Course" : "Add New Course"}</CardTitle>
            <CardDescription>Fill in the course details below</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <CourseForm
              initialData={editingCourse}
              onSubmit={(data) => {
                if (editingCourse) {
                  handleUpdateCourse(editingCourse._id, data)
                } else {
                  handleCreateCourse(data)
                }
              }}
              loading={formLoading}
            />
          </CardContent>
        </Card>
      )}

      {/* Courses List */}
      <Card className="rounded-lg border border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border p-4">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            All Courses
          </CardTitle>
          <CardDescription>{courses.length} courses registered in the system</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <DataTable data={courses} columns={columns} searchKey="name" loading={loading} />
        </CardContent>
      </Card>
    </AppShell>
  )
}
