import React, { useEffect, useState } from "react"
import api from "@/lib/api"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Trash2,
  Dna,
  Download,
  Printer,
  AlertTriangle,
  Clock,
  User,
  MapPin,
  CalendarDays,
  LayoutDashboard,
  BookOpen,
  Users as UsersIcon,
  Home as HomeIcon,
  Bell,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react"
import { AppShell, PageHeader } from "@/components/AppShell"
import { StatusBadge } from "@/components/StatusBadge"
import { GARunSummary } from "@/components/GARunSummary"
import { statusVariant, courseTypeToken } from "@/lib/status"

const ADMIN_NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { id: "courses", label: "Courses", icon: BookOpen, path: "/courses" },
  { id: "faculty", label: "Faculty", icon: UsersIcon, path: "/faculty" },
  { id: "rooms", label: "Rooms", icon: HomeIcon, path: "/rooms" },
  {
    id: "timetables",
    label: "Timetables",
    icon: CalendarDays,
    path: "/timetables",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    path: "/notifications",
  },
]

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

/*
  Course type stays a three-value information channel, but colour alone does
  not carry it: every cell also shows a 3px left border and the type label, so
  the grid survives greyscale printing and colour-blind viewing.
  Class names are spelled out (not built from the token) so Tailwind emits them.
*/
const TYPE_BORDER = {
  "chart-1": "border-l-chart-1",
  "chart-2": "border-l-chart-2",
  "chart-4": "border-l-chart-4",
}

function typeBorderClass(type) {
  return TYPE_BORDER[courseTypeToken(type)] || TYPE_BORDER["chart-1"]
}

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

  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0">
      <CardHeader className="border-b border-border px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold text-foreground">
                {timetable.name}
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {timetable.department} · Semester {timetable.semester} ·{" "}
                {timetable.year}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge variant={statusVariant(timetable.status)}>
              {timetable.status === "published" && (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {timetable.status}
            </StatusBadge>
            <StatusBadge className="tabular-nums">
              {timetable.schedule?.length || 0} classes
            </StatusBadge>
            <StatusBadge className="tabular-nums">
              {timetable.metadata?.totalHours || 0} hours
            </StatusBadge>
            <StatusBadge className="tabular-nums">
              {timetable.metadata?.utilizationRate || 0}% utilized
            </StatusBadge>
            <StatusBadge
              variant={
                timetable.metadata?.conflictCount > 0 ? "destructive" : "neutral"
              }
              className="tabular-nums"
            >
              {timetable.metadata?.conflictCount || 0} conflicts
            </StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[1220px]">
            <div className="grid min-w-[1245px] grid-cols-[145px_repeat(5,220px)] border-b border-border bg-muted">
              <div className="flex items-center justify-center gap-2 border-r border-border px-3 py-3 text-xs font-medium text-muted-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Time
              </div>

            {DAYS.map((day) => (
              <div
                key={day}
                className="border-r border-border px-3 py-3 text-center text-sm font-medium text-foreground last:border-r-0"
              >
                {day}
              </div>
            ))}
            </div>

            {TIME_SLOTS.map((slot, slotIndex) => {
              const isLunch = slotIndex === 3

              return (
              <div
                key={slot}
                className="grid min-w-[1245px] grid-cols-[145px_repeat(5,220px)]"
              >
                <div
                  className={`flex min-h-[132px] items-center justify-center border-b border-r border-border px-2 text-center ${
                    isLunch ? "bg-muted text-muted-foreground" : "bg-card"
                  }`}
                >
                  <div>
                    <div className="font-mono text-xs tabular-nums text-foreground">
                      {slot}
                    </div>
                    {isLunch && (
                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                        className={`min-h-[132px] border-b border-r border-border p-2 last:border-r-0 ${
                          isLunch ? "bg-muted" : "bg-background"
                        }`}
                      >
                        <div className="flex h-full min-h-[116px] items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                          {isLunch ? "Lunch" : "Free"}
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
                      className="min-h-[132px] border-b border-r border-border bg-background p-2 last:border-r-0"
                    >
                      <div
                        className={`flex h-full min-h-[116px] flex-col justify-between rounded-md border border-border border-l-[3px] bg-card p-3 ${typeBorderClass(
                          type
                        )}`}
                      >
                        <div>
                          <div className="mb-1 font-mono text-[11px] text-muted-foreground">
                            {course?.code || "COURSE"}
                          </div>
                          <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                            {course?.name || entry.courseId}
                          </div>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">
                              {prof?.name || entry.facultyId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">
                              {room?.name || entry.roomId}
                            </span>
                          </div>
                          <span className="inline-block text-xs capitalize text-muted-foreground">
                            {type}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Legend</span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-5 rounded-sm border border-border border-l-[3px] border-l-chart-1 bg-card" />
            Lecture
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-5 rounded-sm border border-border border-l-[3px] border-l-chart-2 bg-card" />
            Lab
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-5 rounded-sm border border-border border-l-[3px] border-l-chart-4 bg-card" />
            Tutorial / Seminar
          </span>
          <span className="ml-auto hidden md:block">
            Every cell also carries its type label, so the grid reads in print.
          </span>
        </div>

        {timetable.conflicts?.length > 0 && (
          <div className="border-t border-destructive/40 bg-destructive/10 p-5">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Validation issues
            </h4>
            <div className="grid gap-2 md:grid-cols-2">
              {timetable.conflicts.map((conflict, index) => (
                <div
                  key={index}
                  className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive"
                >
                  <div className="text-xs font-medium">
                    {(conflict.type || "CONFLICT").replaceAll("_", " ")}
                  </div>
                  <p className="mt-1 text-sm">{conflict.message}</p>
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
  const [errorDetails, setErrorDetails] = useState([])
  const [notice, setNotice] = useState(null)
  const [lastRun, setLastRun] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [form, setForm] = useState({
    department: "Computer Science",
    semester: "1",
    academicYear: new Date().getFullYear(),
    seed: "",
    populationSize: "",
    maxGenerations: "",
  })

  useEffect(() => {
    fetchTimetables()
    fetchSupportingData()
  }, [])

  function clearMessages() {
    setError(null)
    setErrorDetails([])
  }

  async function fetchTimetables() {
    setLoadingList(true)
    clearMessages()

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
    setNotice(null)
    clearMessages()

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

  /** Only fields the operator actually filled in are sent to the solver. */
  function buildGaOptions() {
    const gaOptions = {}
    const numeric = [
      ["seed", form.seed],
      ["populationSize", form.populationSize],
      ["maxGenerations", form.maxGenerations],
    ]

    for (const [key, raw] of numeric) {
      const text = String(raw ?? "").trim()
      if (!text) continue
      const value = Number.parseInt(text, 10)
      if (Number.isFinite(value)) gaOptions[key] = value
    }

    return gaOptions
  }

  async function runGeneration(endpoint) {
    if (!form.department || !form.semester) {
      setError("Please fill in department and semester.")
      setErrorDetails([])
      return
    }

    setGenerating(true)
    setNotice(null)
    clearMessages()

    try {
      const gaOptions = buildGaOptions()

      const response = await api.post(endpoint, {
        department: form.department,
        semester: Number.parseInt(form.semester),
        academicYear: Number.parseInt(form.academicYear),
        ...(Object.keys(gaOptions).length > 0 ? { gaOptions } : {}),
      })

      const stats = response.data?.stats
      const method = response.data?.generationMethod

      setLastRun(
        response.data?._id ? { _id: response.data._id, stats } : null
      )

      await fetchTimetables()

      if (response.data?._id) {
        await viewTimetable(response.data._id)
      }

      const parts = [
        method === "backtracking"
          ? "Backtracking baseline"
          : method === "genetic-algorithm"
            ? "Genetic algorithm"
            : "Timetable generated",
      ]
      if (stats?.seed !== undefined && stats?.seed !== null) {
        parts.push(`seed ${stats.seed}`)
      }
      if (stats?.generations !== undefined) {
        parts.push(`${stats.generations} generations`)
      }
      if (stats?.hardViolations !== undefined) {
        parts.push(`${stats.hardViolations} hard violations`)
      }
      setNotice(parts.join(" · "))
    } catch (err) {
      console.error(err)
      setError(
        err.response?.data?.error || err.message || "Failed to generate timetable"
      )
      const details = err.response?.data?.details
      setErrorDetails(Array.isArray(details) ? details.slice(0, 10) : [])
    } finally {
      setGenerating(false)
    }
  }

  async function generateTimetable(e) {
    e.preventDefault()
    await runGeneration("/timetables/generate")
  }

  async function generateLocalTimetable() {
    await runGeneration("/timetables/generate-local")
  }

  function reproduceRun(seed) {
    setForm((current) => ({ ...current, seed: String(seed) }))
    setShowAdvanced(true)
  }

  async function togglePublish(timetable) {
    setNotice(null)
    clearMessages()

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

    setNotice(null)

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

  return (
    <AppShell brand={{ title: "SmartSchedAI", subtitle: "Admin" }} nav={ADMIN_NAV}>
      <PageHeader
        title="Timetable Generator"
        description="Generate, validate, publish and manage academic timetables using courses, faculty availability and classroom resources."
        actions={
          selected && (
            <div className="print:hidden flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => viewTimetable(selected._id)}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportTimetable}>
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={printTimetable}>
                <Printer className="h-4 w-4" />
                Print / PDF
              </Button>
            </div>
          )
        }
      />

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p>{error}</p>
            {errorDetails.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {errorDetails.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {notice && (
        <div className="mb-6 rounded-md border border-success/40 bg-success/14 px-4 py-3 text-sm text-success">
          {notice}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Courses", courses.length],
          ["Faculty", faculty.length],
          ["Rooms", rooms.length],
          ["Saved timetables", timetables.length],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      <Card className="mb-6 gap-0 rounded-lg py-0">
        <CardHeader className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Dna className="h-4 w-4 text-muted-foreground" />
                Generate new timetable
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure the academic context and generate the schedule.
              </p>
            </div>
            <StatusBadge variant="info">Genetic Algorithm</StatusBadge>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          <form onSubmit={generateTimetable}>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Department
                </label>
                <Input
                  value={form.department}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value })
                  }
                  placeholder="Computer Science"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Semester
                </label>
                <Select
                  value={form.semester}
                  onValueChange={(value) =>
                    setForm({ ...form, semester: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select semester" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                      <SelectItem key={sem} value={String(sem)}>
                        Semester {sem}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Academic year
                </label>
                <Input
                  type="number"
                  value={form.academicYear}
                  onChange={(e) =>
                    setForm({ ...form, academicYear: e.target.value })
                  }
                  min="2020"
                  max="2035"
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="mt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced((open) => !open)}
                aria-expanded={showAdvanced}
              >
                {showAdvanced ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Advanced: genetic algorithm parameters
              </Button>

              {showAdvanced && (
                <div className="mt-3 grid gap-4 rounded-md border border-border p-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Seed
                    </label>
                    <Input
                      type="number"
                      value={form.seed}
                      onChange={(e) =>
                        setForm({ ...form, seed: e.target.value })
                      }
                      placeholder="random"
                      className="tabular-nums"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Blank means random. Same seed + same data = identical
                      timetable.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Population size
                    </label>
                    <Input
                      type="number"
                      value={form.populationSize}
                      onChange={(e) =>
                        setForm({ ...form, populationSize: e.target.value })
                      }
                      placeholder="80"
                      min="10"
                      max="500"
                      className="tabular-nums"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Candidate schedules per generation (10-500).
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Max generations
                    </label>
                    <Input
                      type="number"
                      value={form.maxGenerations}
                      onChange={(e) =>
                        setForm({ ...form, maxGenerations: e.target.value })
                      }
                      placeholder="300"
                      min="1"
                      max="2000"
                      className="tabular-nums"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Upper bound on evolution rounds (1-2000).
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="submit" disabled={generating}>
                <Dna className="h-4 w-4" />
                {generating ? "Generating..." : "Generate timetable"}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={generating}
                onClick={generateLocalTimetable}
              >
                Generate with backtracking (baseline)
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setForm({
                    department: "Computer Science",
                    semester: "1",
                    academicYear: new Date().getFullYear(),
                    seed: "",
                    populationSize: "",
                    maxGenerations: "",
                  })
                }
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="mb-6">
        <div className="mb-3">
          <h2 className="text-foreground">Saved timetables</h2>
          <p className="text-sm text-muted-foreground">
            Select a timetable to display its complete weekly schedule.
          </p>
        </div>

        {loadingList ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center shadow-sm">
            <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="text-sm text-muted-foreground">
              Loading timetables...
            </p>
          </div>
        ) : timetables.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No timetables available
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {timetables.map((timetable) => (
              <div
                key={timetable._id}
                className={`rounded-lg border bg-card p-4 shadow-sm transition-colors duration-150 ${
                  selected?._id === timetable._id
                    ? "border-primary"
                    : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-foreground">
                      {timetable.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {timetable.department} · Semester {timetable.semester} ·{" "}
                      {timetable.year}
                    </p>
                  </div>

                  <StatusBadge variant={statusVariant(timetable.status)}>
                    {timetable.status}
                  </StatusBadge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge className="tabular-nums">
                    {timetable.schedule?.length || 0} classes
                  </StatusBadge>
                  <StatusBadge className="tabular-nums">
                    {timetable.metadata?.totalHours || 0} hours
                  </StatusBadge>
                  <StatusBadge className="tabular-nums">
                    {timetable.metadata?.utilizationRate || 0}% utilized
                  </StatusBadge>
                  <StatusBadge
                    variant={
                      timetable.metadata?.conflictCount > 0
                        ? "destructive"
                        : "neutral"
                    }
                    className="tabular-nums"
                  >
                    {timetable.metadata?.conflictCount || 0} conflicts
                  </StatusBadge>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => viewTimetable(timetable._id)}
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => togglePublish(timetable)}
                  >
                    {timetable.status === "published" ? "Unpublish" : "Publish"}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Delete timetable"
                    onClick={() => deleteTimetable(timetable)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="timetable-preview">
        {loadingDetail ? (
          <Card className="rounded-lg">
            <CardContent className="py-16 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              <p className="text-sm text-muted-foreground">
                Loading timetable details...
              </p>
            </CardContent>
          </Card>
        ) : selected ? (
          <>
            <GARunSummary
              metadata={selected?.metadata}
              stats={
                lastRun && lastRun._id === selected?._id
                  ? lastRun.stats
                  : undefined
              }
              onReproduce={reproduceRun}
            />
            <TimetableGrid
              timetable={selected}
              courses={courses}
              faculty={faculty}
              rooms={rooms}
            />
          </>
        ) : (
          <Card className="rounded-lg border-dashed">
            <CardContent className="py-16 text-center">
              <CalendarDays className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">
                Timetable preview
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Choose a saved timetable above to display the complete
                Monday-Friday schedule.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </AppShell>
  )
}
