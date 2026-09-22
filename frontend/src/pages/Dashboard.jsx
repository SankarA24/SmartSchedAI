"use client"

import { useEffect, useState } from "react"
import api from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Calendar,
  TrendingUp,
  AlertTriangle,
  Plus,
  Dna,
  Users,
  BookOpen,
  Home,
  CheckCircle,
  Bell,
  LayoutDashboard,
  MessageSquare,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Chatbot } from "@/components/Chatbot"
import { AppShell, PageHeader } from "@/components/AppShell"
import { StatusBadge } from "@/components/StatusBadge"
import { statusVariant } from "@/lib/status"

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [faculty, setFaculty] = useState([])
  const [rooms, setRooms] = useState([])
  const [timetables, setTimetables] = useState([])
  const [notifications, setNotifications] = useState([])

  // --- State for Chatbot ---
  const [isChatOpen, setIsChatOpen] = useState(false)
  // -------------------------

  const brand = { title: "SmartSchedAI", subtitle: "Admin" }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [coursesRes, facultyRes, roomsRes, timetablesRes, notificationsRes] = await Promise.all([
          api.get("/courses"),
          api.get("/faculty"),
          api.get("/rooms"),
          api.get("/timetables"),
          api.get("/notifications"),
        ])

        setCourses(coursesRes.data)
        setFaculty(facultyRes.data)
        setRooms(roomsRes.data)
        setTimetables(timetablesRes.data)
        setNotifications(notificationsRes.data)
        setLoading(false)
      } catch (err) {
        console.error("Failed to fetch data:", err)
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const buildNav = (unread) => [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { id: "courses", label: "Courses", icon: BookOpen, path: "/courses" },
    { id: "faculty", label: "Faculty", icon: Users, path: "/faculty" },
    { id: "rooms", label: "Rooms", icon: Home, path: "/rooms" },
    { id: "timetables", label: "Timetables", icon: Calendar, path: "/timetables" },
    { id: "notifications", label: "Notifications", icon: Bell, path: "/notifications", badge: unread },
  ]

  // --- Loading State ---
  if (loading) {
    return (
      <AppShell brand={brand} nav={buildNav(0)}>
        <div className="space-y-6">
          <div className="h-9 w-72 animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-96 animate-pulse rounded-md bg-muted" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      </AppShell>
    )
  }

  const stats = {
    totalCourses: courses.length,
    totalFaculty: faculty.length,
    totalRooms: rooms.length,
    totalTimetables: timetables.length,
    activeConflicts: timetables.reduce((acc, t) => acc + (t.conflicts?.length || 0), 0),
    completedSchedules: timetables.filter((t) => t.status === "published").length,
    utilizationRate: timetables.length
      ? Math.round((timetables.filter((t) => t.schedule?.length).length / timetables.length) * 100)
      : 0,
    pendingTasks: notifications.filter((n) => !n.isRead).length,
  }

  // --- Prepare simplified context for the chatbot ---
  const chatContext = {
    timetables: timetables.map((tt) => ({
      name: tt.name,
      department: tt.department,
      semester: tt.semester,
      status: tt.status,
      schedule:
        tt.schedule?.map((s) => ({
          day: s.day,
          time: s.timeSlot,
          course: courses.find((c) => c._id === s.courseId)?.name,
          faculty: faculty.find((f) => f._id === s.facultyId)?.name,
          room: rooms.find((r) => r._id === s.roomId)?.name,
        })) || [],
    })),
    totalCourses: courses.length,
    totalFaculty: faculty.length,
  }
  // ----------------------------------------------------

  const recentTimetables = timetables.slice(0, 3)
  const recentNotifications = notifications.slice(0, 3)

  const statCards = [
    { title: "Total Courses", value: stats.totalCourses, icon: BookOpen },
    { title: "Total Faculty", value: stats.totalFaculty, icon: Users },
    { title: "Total Rooms", value: stats.totalRooms, icon: Home },
    { title: "Total Timetables", value: stats.totalTimetables, icon: Calendar },
    { title: "Active Conflicts", value: stats.activeConflicts, icon: AlertTriangle },
    { title: "Completed Schedules", value: stats.completedSchedules, icon: CheckCircle },
    { title: "Pending Tasks", value: stats.pendingTasks, icon: Bell },
  ]

  return (
    <AppShell brand={brand} nav={buildNav(stats.pendingTasks)}>
      <PageHeader
        title="Dashboard"
        description="Manage courses, faculty and rooms, and generate optimal timetables."
        actions={
          <>
            <Button asChild>
              <Link to="/timetables">
                <Calendar className="mr-2 size-4" />
                View Timetables
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/timetables">
                <Dna className="mr-2 size-4" />
                Generate New
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => {
          const IconComponent = stat.icon
          return (
            <Card key={index} className="rounded-lg border border-border bg-card shadow-sm">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{stat.value}</p>
                </div>
                <IconComponent className="size-5 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Content Grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="rounded-lg border border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>Recent Timetables</CardTitle>
                  <CardDescription>Latest generated schedules and their status</CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/timetables">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {recentTimetables.length === 0 ? (
                <div className="py-12 text-center">
                  <Calendar className="mx-auto size-8 text-muted-foreground" />
                  <h3 className="mt-4 text-base font-semibold text-foreground">No Timetables Yet</h3>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    Create your first timetable to get started with scheduling your classes and resources.
                  </p>
                  <Button asChild className="mt-4">
                    <Link to="/timetables">
                      <Plus className="mr-2 size-4" />
                      Generate Timetable
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentTimetables.map((t) => (
                    <div
                      key={t._id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-medium text-foreground">{t.name}</h4>
                          <StatusBadge variant={statusVariant(t.status)}>{t.status}</StatusBadge>
                          {t.conflicts?.length > 0 && (
                            <StatusBadge variant="destructive">{t.conflicts.length} conflicts</StatusBadge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t.department} • Semester {t.semester} • {t.schedule?.length || 0} classes scheduled
                        </p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/timetables/`}>View Details</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <Card className="rounded-lg border border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border p-4">
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Frequently used operations</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 p-4">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/courses">
                  <Plus className="mr-2 size-4" />
                  Add Course
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/faculty">
                  <Plus className="mr-2 size-4" />
                  Add Faculty
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/rooms">
                  <Plus className="mr-2 size-4" />
                  Add Room
                </Link>
              </Button>
              <Button asChild className="w-full justify-start">
                <Link to="/timetables">
                  <Dna className="mr-2 size-4" />
                  Generate Timetable
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-lg border border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>Recent system alerts</CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/notifications">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {recentNotifications.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentNotifications.map((n) => (
                    <div
                      key={n._id}
                      className="flex items-start gap-3 rounded-md border border-border bg-background p-3"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        {["error", "warning"].includes(n.type) ? (
                          <AlertTriangle
                            className={`size-4 ${n.type === "error" ? "text-destructive" : "text-warning"}`}
                          />
                        ) : (
                          <TrendingUp
                            className={`size-4 ${n.type === "success" ? "text-success" : "text-muted-foreground"}`}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                      </div>
                      {!n.isRead && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed right-6 bottom-6 z-40 print:hidden">
        <Button
          onClick={() => setIsChatOpen(true)}
          aria-label="Open assistant"
          className="size-12 rounded-full bg-primary text-primary-foreground shadow-md"
        >
          <MessageSquare className="size-5" />
        </Button>
      </div>

      <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} context={chatContext} />
    </AppShell>
  )
}
