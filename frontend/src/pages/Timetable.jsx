import React, { useEffect, useState } from "react"
import axios from "axios"
import { Link } from "react-router-dom"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Trash2,
  Sparkles,
  Download,
  AlertTriangle,
  Clock,
  User,
  MapPin,
  Calendar as CalendarIconLucide,
  LayoutDashboard,
  BookOpen,
  Users as UsersIcon,
  Home as HomeIcon,
  Bell,
  RefreshCw,
  CheckCircle2,
  Eye,
} from "lucide-react"

const api = axios.create({
  baseURL: "http://localhost:5000/api",
  headers: { "Content-Type": "application/json" },
})

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

const TIME_SLOTS = [
  "09:00-10:00",
  "10:00-11:00",
  "11:15-12:15",
  "12:15-13:15",
  "14:15-15:15",
  "15:15-16:15",
  "16:30-17:30",
]

function TimetableGrid({ timetable, courses, faculty, rooms }) {
  const findCourse = (id) =>
    courses.find((c) => String(c._id) === String(id)) || null

  const findFaculty = (id) =>
    faculty.find((f) => String(f._id) === String(id)) || null

  const findRoom = (id) =>
    rooms.find((r) => String(r._id) === String(id)) || null

  const getEntry = (day, slot) => {
    if (!timetable?.schedule) return null

    return (
      timetable.schedule.find(
        (entry) =>
          entry.day?.toLowerCase() === day.toLowerCase() &&
          `${entry.startTime}-${entry.endTime}` === slot
      ) || null
    )
  }

  const getTypeClass = (type) => {
    switch (String(type).toLowerCase()) {
      case "lab":
        return "border-emerald-400/40 bg-emerald-500/10"
      case "tutorial":
        return "border-violet-400/40 bg-violet-500/10"
      case "seminar":
        return "border-amber-400/40 bg-amber-500/10"
      default:
        return "border-cyan-400/40 bg-cyan-500/10"
    }
  }

  return (
    <Card className="overflow-hidden border-slate-700/70 bg-slate-900 shadow-2xl">
      <CardHeader className="border-b border-slate-700/70 bg-slate-900 px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20">
                <CalendarIconLucide className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-white">
                  {timetable.name}
                </CardTitle>
                <p className="mt-1 text-sm text-slate-400">
                  {timetable.department} · Semester {timetable.semester} ·{" "}
                  {timetable.year}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge
              className={
                timetable.status === "published"
                  ? "border-0 bg-emerald-500/10 text-emerald-300"
                  : "border border-amber-500/20 bg-amber-500/10 text-amber-300"
              }
            >
              {timetable.status === "published" && (
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              )}
              {timetable.status}
            </Badge>
            <Badge className="border border-slate-700 bg-slate-800 text-slate-300">
              {timetable.schedule?.length || 0} classes
            </Badge>
            <Badge className="border border-slate-700 bg-slate-800 text-slate-300">
              {timetable.metadata?.totalHours || 0} hours
            </Badge>
            <Badge className="border border-slate-700 bg-slate-800 text-slate-300">
              {timetable.metadata?.utilizationRate || 0}% utilized
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[1220px]">
            <div className="grid min-w-[1245px] grid-cols-[145px_repeat(5,220px)] border-b border-slate-700/70 bg-slate-800">
              <div className="flex items-center justify-center border-r border-slate-700/70 px-3 py-4 text-sm font-bold text-slate-300">
                <Clock className="mr-2 h-4 w-4 text-cyan-300" />
                Time
              </div>

            {DAYS.map((day) => (
              <div
                key={day}
                className="border-r border-slate-700/70 px-3 py-4 text-center text-sm font-bold text-cyan-200 last:border-r-0"
              >
                {day}
              </div>
            ))}
            </div>

            {TIME_SLOTS.map((slot, slotIndex) => (
              <div
                key={slot}
              className={`grid min-w-[1245px] grid-cols-[145px_repeat(5,220px)] ${
              slotIndex === 3 ? "border-b-4 border-slate-950" : ""
               }`}
              >
                <div className="flex min-h-[132px] items-center justify-center border-b border-r border-slate-700/70 bg-slate-900 px-2 text-center">
                  <div>
                    <Clock className="mx-auto mb-2 h-4 w-4 text-cyan-400" />
                    <div className="text-sm font-semibold text-slate-200">
                      {slot}
                    </div>
                    {slotIndex === 3 && (
                      <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                        Lunch
                      </div>
                    )}
                  </div>
                </div>

                {DAYS.map((day) => {
                  const entry = getEntry(day, slot)

                  if (!entry) {
                    return (
                      <div
                        key={`${day}-${slot}`}
                        className="min-h-[132px] border-b border-r border-slate-700/70 bg-slate-950/30 p-2 last:border-r-0"
                      >
                        <div className="flex h-full min-h-[116px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-xs text-slate-600">
                          Free
                        </div>
                      </div>
                    )
                  }

                  const course = findCourse(entry.courseId)
                  const prof = findFaculty(entry.facultyId)
                  const room = findRoom(entry.roomId)
                  const type = course?.type || entry.type || "lecture"

                  return (
                    <div
                      key={`${day}-${slot}`}
                      className="min-h-[132px] border-b border-r border-slate-700/70 bg-slate-950/30 p-2 last:border-r-0"
                    >
                      <div
                        className={`flex h-full min-h-[116px] flex-col justify-between rounded-xl border p-3 shadow-md transition hover:-translate-y-0.5 hover:border-cyan-300/60 ${getTypeClass(
                          type
                        )}`}
                      >
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                            {course?.code || "COURSE"}
                          </div>
                          <div className="line-clamp-2 text-sm font-bold leading-snug text-white">
                            {course?.name || entry.courseId}
                          </div>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                            <span className="truncate">
                              {prof?.name || entry.facultyId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                            <span className="truncate">
                              {room?.name || entry.roomId}
                            </span>
                          </div>
                          <Badge className="mt-1 border border-slate-600 bg-slate-950/50 text-[10px] capitalize text-slate-200">
                            {type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 border-t border-slate-700/70 bg-slate-900 px-5 py-4 text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Legend</span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-cyan-400/40 bg-cyan-500/20" />
            Lecture
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-emerald-400/40 bg-emerald-500/20" />
            Lab
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-violet-400/40 bg-violet-500/20" />
            Tutorial
          </span>
          <span className="ml-auto hidden md:block">
            Scroll horizontally on smaller screens
          </span>
        </div>

        {timetable.conflicts?.length > 0 && (
          <div className="border-t border-red-500/20 bg-red-500/5 p-5">
            <h4 className="mb-3 flex items-center gap-2 font-semibold text-red-300">
              <AlertTriangle className="h-4 w-4" />
              Validation Issues
            </h4>
            <div className="grid gap-2 md:grid-cols-2">
              {timetable.conflicts.map((conflict, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"
                >
                  <div className="text-xs font-semibold uppercase text-red-300">
                    {(conflict.type || "CONFLICT").replaceAll("_", " ")}
                  </div>
                  <p className="mt-1 text-sm text-red-200/80">
                    {conflict.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function TimetablePage() {
  const [timetables, setTimetables] = useState([])
  const [selected, setSelected] = useState(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [courses, setCourses] = useState([])
  const [faculty, setFaculty] = useState([])
  const [rooms, setRooms] = useState([])
  const [error, setError] = useState(null)
  const [activeNavItem, setActiveNavItem] = useState("timetables")
  const [form, setForm] = useState({
    department: "Computer Science",
    semester: "1",
    academicYear: new Date().getFullYear(),
    constraintsText: "",
  })

  useEffect(() => {
    fetchTimetables()
    fetchSupportingData()
  }, [])

  async function fetchTimetables() {
    setLoadingList(true)
    setError(null)

    try {
      const response = await api.get("/timetables")
      setTimetables(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      console.error(err)
      setError(
        `Failed to load timetables: ${
          err.response?.data?.error || err.message || "Unknown error"
        }`
      )
      setTimetables([])
    } finally {
      setLoadingList(false)
    }
  }

  async function fetchSupportingData() {
    try {
      const [coursesRes, facultyRes, roomsRes] = await Promise.all([
        api.get("/courses"),
        api.get("/faculty"),
        api.get("/rooms"),
      ])
      setCourses(Array.isArray(coursesRes.data) ? coursesRes.data : [])
      setFaculty(Array.isArray(facultyRes.data) ? facultyRes.data : [])
      setRooms(Array.isArray(roomsRes.data) ? roomsRes.data : [])
    } catch (err) {
      console.error(err)
      setError(
        `Failed to load courses, faculty, or rooms: ${
          err.response?.data?.error || err.message || "Unknown error"
        }`
      )
    }
  }

  async function viewTimetable(id) {
    setLoadingDetail(true)
    setSelected(null)
    setError(null)

    try {
      const response = await api.get(`/timetables/${id}`)
      setSelected(response.data)
      setTimeout(() => {
        document
          .getElementById("timetable-preview")
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 50)
    } catch (err) {
      console.error(err)
      setError(
        `Failed to load timetable details: ${
          err.response?.data?.error || err.message || "Unknown error"
        }`
      )
    } finally {
      setLoadingDetail(false)
    }
  }

  async function generateTimetable(e) {
    e.preventDefault()

    if (!form.department || !form.semester) {
      setError("Please fill in department and semester.")
      return
    }

    setGenerating(true)
    setError(null)

    try {
      let constraints = {}

      if (form.constraintsText.trim()) {
        try {
          constraints = JSON.parse(form.constraintsText)
        } catch {
          constraints = { notes: form.constraintsText }
        }
      }

      const response = await api.post("/timetables/generate", {
        department: form.department,
        semester: Number.parseInt(form.semester),
        academicYear: Number.parseInt(form.academicYear),
        constraints,
      })

      await fetchTimetables()

      if (response.data?._id) {
        await viewTimetable(response.data._id)
      }

      alert("Timetable generated successfully.")
    } catch (err) {
      console.error(err)
      setError(
        `Failed to generate timetable: ${
          err.response?.data?.error || err.message || "Unknown error"
        }`
      )
    } finally {
      setGenerating(false)
    }
  }

  async function togglePublish(timetable) {
    setError(null)

    try {
      const newStatus =
        timetable.status === "published" ? "draft" : "published"

      await api.put(`/timetables/${timetable._id}`, {
        ...timetable,
        status: newStatus,
      })

      await fetchTimetables()

      if (selected?._id === timetable._id) {
        await viewTimetable(timetable._id)
      }
    } catch (err) {
      console.error(err)
      setError(
        `Failed to change timetable status: ${
          err.response?.data?.error || err.message || "Unknown error"
        }`
      )
    }
  }

  async function deleteTimetable(timetable) {
    if (
      !window.confirm(
        `Delete timetable "${timetable.name}"? This cannot be undone.`
      )
    ) {
      return
    }

    try {
      await api.delete(`/timetables/${timetable._id}`)
      await fetchTimetables()
      if (selected?._id === timetable._id) setSelected(null)
    } catch (err) {
      console.error(err)
      setError(
        `Failed to delete timetable: ${
          err.response?.data?.error || err.message || "Unknown error"
        }`
      )
    }
  }

  function exportTimetable() {
    if (!selected) return

    const blob = new Blob([JSON.stringify(selected, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${selected.name.replace(/\s+/g, "_")}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function printTimetable() {
    window.print()
  }

  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { id: "courses", label: "Courses", icon: BookOpen, path: "/courses" },
    { id: "faculty", label: "Faculty", icon: UsersIcon, path: "/faculty" },
    { id: "rooms", label: "Rooms", icon: HomeIcon, path: "/rooms" },
    {
      id: "timetables",
      label: "Timetables",
      icon: CalendarIconLucide,
      path: "/timetables",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      path: "/notifications",
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900 p-5 lg:flex lg:flex-col">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-lg shadow-cyan-500/20">
              <CalendarIconLucide className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-white">Scheduler</h2>
              <p className="text-xs text-slate-400">Smart Classroom</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const active = activeNavItem === item.id

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={() => setActiveNavItem(item.id)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 transition ${
                    active
                      ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/30"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div className="mx-auto max-w-[1800px] p-4 sm:p-6 lg:p-8">
            <header className="mb-6 flex flex-col gap-4 border-b border-slate-800 pb-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm text-cyan-400">
                  <CalendarIconLucide className="h-4 w-4" />
                  Academic Scheduling
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Timetable Generator
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-400 sm:text-base">
                  Generate, validate, publish and manage academic timetables
                  using courses, faculty availability and classroom resources.
                </p>
              </div>

              {selected && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => viewTimetable(selected._id)}
                    className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    onClick={exportTimetable}
                    className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                  <Button
                    onClick={printTimetable}
                    className="bg-cyan-600 text-white hover:bg-cyan-500"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Print / PDF
                  </Button>
                </div>
              )}
            </header>

            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Courses", courses.length],
                ["Faculty", faculty.length],
                ["Rooms", rooms.length],
                ["Saved Timetables", timetables.length],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 p-4"
                >
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">{value}</p>
                </div>
              ))}
            </div>

            <Card className="mb-6 border-slate-800 bg-slate-900/80 shadow-xl">
              <CardHeader className="border-b border-slate-800 px-5 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg text-white">
                      <Sparkles className="h-5 w-5 text-cyan-400" />
                      Generate New Timetable
                    </CardTitle>
                    <p className="mt-1 text-sm text-slate-500">
                      Configure the academic context and generate the schedule.
                    </p>
                  </div>
                  <Badge className="w-fit border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
                    AI Assisted
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-5">
                <form onSubmit={generateTimetable}>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">
                        Department
                      </label>
                      <Input
                        value={form.department}
                        onChange={(e) =>
                          setForm({ ...form, department: e.target.value })
                        }
                        placeholder="Computer Science"
                        required
                        className="border-slate-700 bg-slate-950 text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">
                        Semester
                      </label>
                      <Select
                        value={form.semester}
                        onValueChange={(value) =>
                          setForm({ ...form, semester: value })
                        }
                      >
                        <SelectTrigger className="border-slate-700 bg-slate-950 text-white">
                          <SelectValue placeholder="Select semester" />
                        </SelectTrigger>
                        <SelectContent className="border-slate-700 bg-slate-900 text-white">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                            <SelectItem key={sem} value={String(sem)}>
                              Semester {sem}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-300">
                        Academic Year
                      </label>
                      <Input
                        type="number"
                        value={form.academicYear}
                        onChange={(e) =>
                          setForm({ ...form, academicYear: e.target.value })
                        }
                        min="2020"
                        max="2035"
                        className="border-slate-700 bg-slate-950 text-white"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Additional Constraints
                    </label>
                    <Textarea
                      value={form.constraintsText}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          constraintsText: e.target.value,
                        })
                      }
                      placeholder='Example: {"avoidFriday": true} or "No classes after 4 PM"'
                      rows={2}
                      className="border-slate-700 bg-slate-950 text-white"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      disabled={generating}
                      className="bg-cyan-600 px-5 text-white hover:bg-cyan-500"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {generating ? "Generating..." : "Generate Timetable"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setForm({
                          department: "Computer Science",
                          semester: "1",
                          academicYear: new Date().getFullYear(),
                          constraintsText: "",
                        })
                      }
                      className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <section className="mb-6">
              <div className="mb-3">
                <h2 className="text-xl font-bold text-white">
                  Saved Timetables
                </h2>
                <p className="text-sm text-slate-500">
                  Select a timetable to display its complete weekly schedule.
                </p>
              </div>

              {loadingList ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-10 text-center">
                  <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
                  <p className="text-sm text-slate-400">
                    Loading timetables...
                  </p>
                </div>
              ) : timetables.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center">
                  <CalendarIconLucide className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                  <p className="font-medium text-slate-300">
                    No timetables available
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {timetables.map((timetable) => (
                    <div
                      key={timetable._id}
                      className={`rounded-xl border p-4 transition ${
                        selected?._id === timetable._id
                          ? "border-cyan-500/50 bg-cyan-500/5"
                          : "border-slate-800 bg-slate-900/70 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-white">
                            {timetable.name}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {timetable.department} · Semester{" "}
                            {timetable.semester} · {timetable.year}
                          </p>
                        </div>

                        <Badge
                          className={
                            timetable.status === "published"
                              ? "border-0 bg-emerald-500/10 text-emerald-300"
                              : "border border-slate-700 bg-slate-800 text-slate-400"
                          }
                        >
                          {timetable.status}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge className="border border-slate-700 bg-slate-950 text-slate-400">
                          {timetable.schedule?.length || 0} classes
                        </Badge>
                        <Badge className="border border-slate-700 bg-slate-950 text-slate-400">
                          {timetable.metadata?.totalHours || 0} hours
                        </Badge>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => viewTimetable(timetable._id)}
                          className="flex-1 bg-cyan-600 text-white hover:bg-cyan-500"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => togglePublish(timetable)}
                          className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                        >
                          {timetable.status === "published"
                            ? "Unpublish"
                            : "Publish"}
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteTimetable(timetable)}
                          className="bg-red-600 hover:bg-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section id="timetable-preview">
              {loadingDetail ? (
                <Card className="border-slate-800 bg-slate-900/80">
                  <CardContent className="py-16 text-center">
                    <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
                    <p className="text-slate-400">
                      Loading timetable details...
                    </p>
                  </CardContent>
                </Card>
              ) : selected ? (
                <TimetableGrid
                  timetable={selected}
                  courses={courses}
                  faculty={faculty}
                  rooms={rooms}
                />
              ) : (
                <Card className="border-dashed border-slate-700 bg-slate-900/50">
                  <CardContent className="py-16 text-center">
                    <CalendarIconLucide className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                    <h3 className="text-lg font-semibold text-slate-300">
                      Timetable Preview
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                      Choose a saved timetable above to display the complete
                      Monday–Friday schedule.
                    </p>
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}