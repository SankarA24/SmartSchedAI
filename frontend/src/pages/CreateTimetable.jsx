import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Info,
  Settings2,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Callout } from "@/components/common/Callout";
import { CategoryCard } from "@/components/common/CategoryCard";
import { SectionCard } from "@/components/common/SectionCard";
import { Stepper } from "@/components/common/Stepper";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useTimetableData } from "@/hooks/useTimetableData";

// =====================================================
// CONSTANTS
// =====================================================

const DRAFT_KEY = "createTimetable.draft";
const RETURN_TO = "/create-timetable";

// Mirrors backend/utils/schedulingConstants.js#WEEKS — only used as the
// fallback when GET /api/config/grid has not (yet) supplied `weeks`.
const FALLBACK_WEEKS = 13;

// Only used when the Course collection yields no distinct values at all
// (empty database or a failed /courses request); every populated install
// derives its options from the API instead.
const FALLBACK_YEARS = [1, 2, 3, 4];
const FALLBACK_SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

const STEPS = [
  { id: "basic", label: "Basic Info", description: "Target batch", icon: CalendarPlus },
  { id: "teachers", label: "Teachers", description: "Faculty & availability", icon: Users },
  { id: "students", label: "Students", description: "Batch roster", icon: GraduationCap },
  { id: "classrooms", label: "Classrooms", description: "Rooms & labs", icon: Building2 },
  { id: "programs", label: "Programs & Courses", description: "Curriculum", icon: BookOpen },
  { id: "policy", label: "Infrastructure & Policy", description: "Grid & constraints", icon: Settings2 },
];

const STEP_IDS = STEPS.map((step) => step.id);
const CATEGORY_IDS = STEP_IDS.filter((id) => id !== "basic");

const EMPTY_DRAFT = { academicYear: "", department: "", year: "", semester: "" };

// =====================================================
// HELPERS
// =====================================================

function sameText(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function toInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function distinctSorted(values) {
  return Array.from(new Set(values.filter((value) => value !== undefined && value !== null && value !== "")));
}

function hasAvailability(entity) {
  const availability = entity?.availability;
  if (!availability) return false;
  return Object.values(availability).some((slots) => Array.isArray(slots) && slots.length > 0);
}

// Mirrors backend/utils/schedulingHelpers.js#getWeeklySessions so the
// capacity checks below agree with what the generator will actually try
// to schedule. Keep the two in sync.
function weeklySessions(course, weeks) {
  const totalHours = Number(course?.totalHours);
  if (totalHours > 0) return Math.ceil(totalHours / weeks);
  return Number(course?.hoursPerWeek) || 3;
}

function statusFor(count, issues, threshold = 1) {
  if (!count) return "pending";
  if (count >= threshold && issues.length === 0) return "complete";
  return "in-progress";
}

function readDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return { draft: { ...EMPTY_DRAFT }, step: "basic" };
    const parsed = JSON.parse(raw) || {};
    const draft = { ...EMPTY_DRAFT };
    for (const key of Object.keys(EMPTY_DRAFT)) {
      if (typeof parsed[key] === "string") draft[key] = parsed[key];
      else if (typeof parsed[key] === "number") draft[key] = String(parsed[key]);
    }
    return { draft, step: STEP_IDS.includes(parsed.step) ? parsed.step : "basic" };
  } catch {
    // sessionStorage throws in private-browsing / blocked-storage contexts.
    return { draft: { ...EMPTY_DRAFT }, step: "basic" };
  }
}

function writeDraft(draft, step) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, step }));
  } catch {
    // Storage unavailable — the wizard still works, it just won't survive
    // a navigation away and back.
  }
}

// =====================================================
// PAGE
// =====================================================

export default function CreateTimetable() {
  const navigate = useNavigate();
  const shell = navForRole("admin");

  const restored = useMemo(() => readDraft(), []);
  const [draft, setDraft] = useState(restored.draft);
  const [step, setStep] = useState(restored.step);

  const { courses, faculty, rooms, loading, error } = useTimetableData();
  const { grid, config, loading: configLoading } = useSystemConfig();

  const [students, setStudents] = useState([]);
  const [studentsError, setStudentsError] = useState(null);

  // Students are not part of useTimetableData's four collections, so they
  // are fetched here through the same shared client.
  useEffect(() => {
    const controller = new AbortController();

    api
      .get("/students", { signal: controller.signal })
      .then(({ data }) => {
        setStudents(Array.isArray(data) ? data : []);
        setStudentsError(null);
      })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        console.warn("CreateTimetable: failed to load /students", err);
        setStudents([]);
        setStudentsError(err?.response?.data?.error || err?.message || "Failed to load students");
      });

    return () => controller.abort();
  }, []);

  // Every draft change is persisted immediately so leaving for a management
  // page and coming back restores both the selections and the step.
  useEffect(() => {
    writeDraft(draft, step);
  }, [draft, step]);

  const setField = useCallback((key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ---------------------------------------------------
  // Step 1 options — derived from distinct Course values
  // already stored on existing courses, never hard-coded.
  // ---------------------------------------------------

  const departmentOptions = useMemo(
    () => distinctSorted(courses.map((course) => course.department)).sort(),
    [courses]
  );

  const academicYearOptions = useMemo(() => {
    const distinct = distinctSorted(courses.map((course) => course.academicYear)).sort(
      (a, b) => a - b
    );
    return distinct.length > 0 ? distinct : [new Date().getFullYear()];
  }, [courses]);

  const yearOptions = useMemo(() => {
    const scoped = courses.filter(
      (course) => !draft.department || sameText(course.department, draft.department)
    );
    const distinct = distinctSorted(scoped.map((course) => course.year)).sort((a, b) => a - b);
    return distinct.length > 0 ? distinct : FALLBACK_YEARS;
  }, [courses, draft.department]);

  const semesterOptions = useMemo(() => {
    const yearNum = toInt(draft.year);
    const scoped = courses.filter(
      (course) =>
        (!draft.department || sameText(course.department, draft.department)) &&
        (yearNum === null || Number(course.year) === yearNum)
    );
    const distinct = distinctSorted(scoped.map((course) => course.semester)).sort((a, b) => a - b);
    return distinct.length > 0 ? distinct : FALLBACK_SEMESTERS;
  }, [courses, draft.department, draft.year]);

  // Drop a restored selection that no longer exists in the derived options
  // (a department was renamed, a course deleted, …).
  useEffect(() => {
    if (loading) return;
    setDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      if (
        next.department &&
        departmentOptions.length > 0 &&
        !departmentOptions.some((value) => String(value) === next.department)
      ) {
        next.department = "";
        changed = true;
      }
      if (next.year && !yearOptions.some((value) => String(value) === next.year)) {
        next.year = "";
        changed = true;
      }
      if (next.semester && !semesterOptions.some((value) => String(value) === next.semester)) {
        next.semester = "";
        changed = true;
      }
      if (
        next.academicYear &&
        !academicYearOptions.some((value) => String(value) === next.academicYear)
      ) {
        next.academicYear = "";
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [loading, departmentOptions, yearOptions, semesterOptions, academicYearOptions]);

  const department = draft.department;
  const yearNum = toInt(draft.year);
  const semesterNum = toInt(draft.semester);
  const academicYearNum = toInt(draft.academicYear);
  const basicComplete = Boolean(
    draft.department && draft.year && draft.semester && draft.academicYear
  );

  // ---------------------------------------------------
  // Live counts, scoped to the step-1 selections
  // ---------------------------------------------------

  // Scoped by all four step-1 selections, exactly like
  // `loadSchedulingContext` (backend/utils/schedulingContext.js) scopes the
  // courses the generator will actually load. Leaving academicYear out here
  // let the wizard count courses from another year, mark the step complete
  // and enable the CTA, only for /generate-timetable to report no matching
  // courses on the next screen.
  const scopedCourses = useMemo(
    () =>
      courses.filter(
        (course) =>
          (!department || sameText(course.department, department)) &&
          (yearNum === null || Number(course.year) === yearNum) &&
          (semesterNum === null || Number(course.semester) === semesterNum) &&
          (academicYearNum === null || Number(course.academicYear) === academicYearNum)
      ),
    [courses, department, yearNum, semesterNum, academicYearNum]
  );

  // Courses the academic-year filter above drops because they carry no
  // academic year at all. The generator drops them too
  // (`academicYear: Number(academicYear)` is an exact match), so they stay
  // worth reporting even though they are no longer counted.
  const coursesMissingAcademicYear = useMemo(
    () =>
      courses.filter(
        (course) =>
          (!department || sameText(course.department, department)) &&
          (yearNum === null || Number(course.year) === yearNum) &&
          (semesterNum === null || Number(course.semester) === semesterNum) &&
          course.academicYear == null
      ).length,
    [courses, department, yearNum, semesterNum]
  );

  const scopedFaculty = useMemo(
    () => faculty.filter((member) => !department || sameText(member.department, department)),
    [faculty, department]
  );

  const scopedStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          (!department || sameText(student.department, department)) &&
          (semesterNum === null || Number(student.semester) === semesterNum) &&
          (yearNum === null || student.year == null || Number(student.year) === yearNum)
      ),
    [students, department, yearNum, semesterNum]
  );

  const weeks = Number(grid?.weeks) > 0 ? Number(grid.weeks) : FALLBACK_WEEKS;

  const requiredSessions = useMemo(
    () => scopedCourses.reduce((total, course) => total + weeklySessions(course, weeks), 0),
    [scopedCourses, weeks]
  );

  const categories = useMemo(() => {
    // --- Teachers -------------------------------------------------
    const teachersWithAvailability = scopedFaculty.filter(hasAvailability).length;
    const teacherCapacity = scopedFaculty.reduce(
      (total, member) => total + (Number(member.maxHoursPerWeek) || 0),
      0
    );
    const withoutSpecialization = scopedFaculty.filter(
      (member) => !(Array.isArray(member.specialization) && member.specialization.length > 0)
    ).length;

    const teacherIssues = [];
    if (error?.faculty) teacherIssues.push(`Faculty could not be loaded: ${error.faculty}`);
    if (scopedFaculty.length - teachersWithAvailability > 0) {
      teacherIssues.push(
        `${scopedFaculty.length - teachersWithAvailability} teacher(s) have no availability set — they cannot be scheduled.`
      );
    }
    if (withoutSpecialization > 0) {
      teacherIssues.push(
        `${withoutSpecialization} teacher(s) have no specialization — course matching will skip them.`
      );
    }
    if (requiredSessions > 0 && teacherCapacity < requiredSessions) {
      teacherIssues.push(
        `Combined weekly capacity is ${teacherCapacity} h, below the ${requiredSessions} h these courses need.`
      );
    }

    // --- Students -------------------------------------------------
    const sections = distinctSorted(scopedStudents.map((student) => student.section)).sort();
    const missingYear = scopedStudents.filter((student) => student.year == null).length;

    const studentIssues = [];
    if (studentsError) studentIssues.push(`Students could not be loaded: ${studentsError}`);
    if (missingYear > 0) {
      studentIssues.push(`${missingYear} student(s) have no year set — batch scoping is approximate.`);
    }
    if (scopedStudents.length > 0 && sections.length === 0) {
      studentIssues.push("No section is assigned to any student in this batch.");
    }

    // --- Classrooms ------------------------------------------------
    const labRooms = rooms.filter((room) => room.type === "lab").length;
    const seminarCapable = rooms.filter(
      (room) => room.type === "seminar_room" || room.type === "auditorium"
    ).length;
    const roomsWithoutAvailability = rooms.filter((room) => !hasAvailability(room)).length;
    const largestCapacity = rooms.reduce(
      (max, room) => Math.max(max, Number(room.capacity) || 0),
      0
    );
    const needsLab = scopedCourses.some((course) => course.type === "lab");
    const needsSeminar = scopedCourses.some((course) => course.type === "seminar");

    const roomIssues = [];
    if (error?.rooms) roomIssues.push(`Rooms could not be loaded: ${error.rooms}`);
    if (needsLab && labRooms === 0) {
      roomIssues.push("This batch has lab courses but no room of type lab exists.");
    }
    if (needsSeminar && seminarCapable === 0) {
      roomIssues.push("This batch has seminar courses but no seminar room or auditorium exists.");
    }
    if (roomsWithoutAvailability > 0) {
      roomIssues.push(`${roomsWithoutAvailability} room(s) have no availability set.`);
    }
    if (scopedStudents.length > 0 && largestCapacity < scopedStudents.length) {
      roomIssues.push(
        `Largest room seats ${largestCapacity}, below the ${scopedStudents.length} students in this batch.`
      );
    }

    // --- Programs & Courses ----------------------------------------
    const lectureCount = scopedCourses.filter((course) => course.type === "lecture").length;
    const labCount = scopedCourses.filter((course) => course.type === "lab").length;
    const seminarCount = scopedCourses.filter((course) => course.type === "seminar").length;
    const withoutDescription = scopedCourses.filter(
      (course) => !String(course.description || "").trim()
    ).length;
    const withoutAcademicYear = coursesMissingAcademicYear;

    const courseIssues = [];
    if (error?.courses) courseIssues.push(`Courses could not be loaded: ${error.courses}`);
    if (withoutDescription > 0) {
      courseIssues.push(
        `${withoutDescription} course(s) have no description — faculty specialization matching reads it.`
      );
    }
    if (draft.academicYear && withoutAcademicYear > 0) {
      courseIssues.push(
        `${withoutAcademicYear} course(s) in this department, year and semester have no academic year set, so the generator will not load them.`
      );
    }

    // --- Infrastructure & Policy -----------------------------------
    const dayCount = grid?.days?.length || 0;
    const slotCount = grid?.slots?.length || 0;
    const weeklySlots = dayCount * slotCount;

    const policyIssues = [];
    if (!configLoading && !config) {
      policyIssues.push("System configuration could not be loaded — the default grid is shown.");
    }
    if (requiredSessions > 0 && weeklySlots > 0 && weeklySlots < requiredSessions) {
      policyIssues.push(
        `The grid has ${weeklySlots} weekly slots, fewer than the ${requiredSessions} sessions these courses need.`
      );
    }

    return [
      {
        id: "teachers",
        title: "Teachers",
        description: "Faculty, availability and weekly load limits.",
        icon: Users,
        path: "/faculty",
        manageLabel: "Manage faculty",
        count: scopedFaculty.length,
        status: statusFor(scopedFaculty.length, teacherIssues),
        issues: teacherIssues,
        items: [
          { label: department ? `In ${department}` : "Teachers", value: scopedFaculty.length },
          { label: "With availability", value: teachersWithAvailability },
          { label: "Weekly capacity", value: `${teacherCapacity} h` },
        ],
      },
      {
        id: "students",
        title: "Students",
        description: "The batch this timetable is generated for.",
        icon: GraduationCap,
        path: "/students",
        manageLabel: "Manage students",
        count: scopedStudents.length,
        status: statusFor(scopedStudents.length, studentIssues),
        issues: studentIssues,
        items: [
          { label: "In this batch", value: scopedStudents.length },
          { label: "Sections", value: sections.length > 0 ? sections.join(", ") : "—" },
          { label: "Missing year", value: missingYear },
        ],
      },
      {
        id: "classrooms",
        title: "Classrooms",
        description: "Rooms, labs and their capacity.",
        icon: Building2,
        path: "/rooms",
        manageLabel: "Manage rooms",
        count: rooms.length,
        status: statusFor(rooms.length, roomIssues),
        issues: roomIssues,
        items: [
          { label: "Rooms", value: rooms.length },
          { label: "Labs", value: labRooms },
          { label: "Largest capacity", value: largestCapacity || "—" },
        ],
      },
      {
        id: "programs",
        title: "Programs & Courses",
        description: "Courses scheduled for this batch.",
        icon: BookOpen,
        path: "/courses",
        manageLabel: "Manage courses",
        count: scopedCourses.length,
        status: statusFor(scopedCourses.length, courseIssues),
        issues: courseIssues,
        items: [
          { label: "Courses", value: scopedCourses.length },
          {
            label: "Lecture / Lab / Seminar",
            value: `${lectureCount} / ${labCount} / ${seminarCount}`,
          },
          { label: "Weekly sessions", value: requiredSessions },
        ],
      },
      {
        id: "policy",
        title: "Infrastructure & Policy",
        description: "Working days, period grid and constraint flags.",
        icon: Settings2,
        path: "/infrastructure",
        manageLabel: "Open infrastructure",
        count: weeklySlots,
        status: statusFor(weeklySlots, policyIssues),
        issues: policyIssues,
        items: [
          { label: "Working days", value: dayCount },
          { label: "Periods / day", value: slotCount },
          { label: "Weekly slots", value: weeklySlots },
        ],
      },
    ];
  }, [
    scopedFaculty,
    scopedStudents,
    scopedCourses,
    rooms,
    grid,
    config,
    configLoading,
    requiredSessions,
    department,
    draft.academicYear,
    coursesMissingAcademicYear,
    error,
    studentsError,
  ]);

  const categoryById = useMemo(() => {
    const map = new Map();
    for (const category of categories) map.set(category.id, category);
    return map;
  }, [categories]);

  const completedSteps = useMemo(() => {
    const done = categories.filter((c) => c.status === "complete").map((c) => c.id);
    return basicComplete ? ["basic", ...done] : done;
  }, [categories, basicComplete]);

  const blockers = useMemo(() => {
    const list = [];
    if (!basicComplete) list.push("Select academic year, department, year and semester in Basic Info.");
    const pending = categories.filter((c) => c.status === "pending");
    if (pending.length > 0) {
      list.push(`No data yet for: ${pending.map((c) => c.title).join(", ")}.`);
    }
    return list;
  }, [basicComplete, categories]);

  const canGenerate = blockers.length === 0;

  const openManagement = useCallback(
    (path) => {
      navigate(`${path}?returnTo=${encodeURIComponent(RETURN_TO)}`);
    },
    [navigate]
  );

  const goToGenerate = useCallback(() => {
    if (!canGenerate) return;
    const params = new URLSearchParams({
      department: draft.department,
      year: draft.year,
      semester: draft.semester,
      academicYear: draft.academicYear,
    });
    navigate(`/generate-timetable?${params.toString()}`);
  }, [canGenerate, draft, navigate]);

  const stepIndex = STEP_IDS.indexOf(step);
  const activeCategory = categoryById.get(step) || null;

  // ---------------------------------------------------
  // RENDER
  // ---------------------------------------------------

  const selectionSummary = basicComplete
    ? `${draft.department} · Year ${draft.year} · Semester ${draft.semester} · AY ${draft.academicYear}`
    : "No batch selected yet";

  return (
    <AppShell
      brand={shell.brand}
      nav={shell.nav}
      quickActions={shell.quickActions}
      chatbot={{
        context: {
          page: "create-timetable",
          department: draft.department,
          year: draft.year,
          semester: draft.semester,
          academicYear: draft.academicYear,
        },
      }}
    >
      <PageHeader
        title="Create Timetable"
        description="Pick the target batch, then check that every data category is ready before generating."
      />

      <div className="flex flex-col gap-6">
        <SectionCard>
          <Stepper steps={STEPS} current={step} completed={completedSteps} onStepClick={setStep} />
        </SectionCard>

        {step === "basic" ? (
          <SectionCard
            title="Basic Info"
            description="Options come from the courses already in the system."
            icon={CalendarPlus}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Academic year
                </label>
                <Select
                  value={draft.academicYear}
                  onValueChange={(value) => setField("academicYear", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select academic year" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYearOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Department</label>
                <Select
                  value={draft.department}
                  onValueChange={(value) => setField("department", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        departmentOptions.length > 0
                          ? "Select department"
                          : "No departments found"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Year</label>
                <Select value={draft.year} onValueChange={(value) => setField("year", value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        Year {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Semester</label>
                <Select
                  value={draft.semester}
                  onValueChange={(value) => setField("semester", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select semester" />
                  </SelectTrigger>
                  <SelectContent>
                    {semesterOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        Semester {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {error?.courses ? (
                <Callout tone="destructive" title="Courses could not be loaded" icon={TriangleAlert}>
                  {error.courses}. The selects below fall back to defaults until it loads.
                </Callout>
              ) : !loading && courses.length === 0 ? (
                <Callout tone="warning" title="No courses found" icon={TriangleAlert}>
                  Add courses first — department and academic year options are derived from them.
                </Callout>
              ) : (
                <Callout tone="info" title="Target batch" icon={Info}>
                  {selectionSummary}
                </Callout>
              )}

              <div>
                <Button type="button" variant="outline" onClick={() => openManagement("/courses")}>
                  <ExternalLink className="size-4" />
                  Manage courses
                </Button>
              </div>
            </div>
          </SectionCard>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {categories.map((category) => (
                <CategoryCard
                  key={category.id}
                  icon={category.icon}
                  title={category.title}
                  description={category.description}
                  status={category.status}
                  items={category.items}
                  onClick={() => openManagement(category.path)}
                  className={
                    category.id === step ? "border-primary/50 ring-2 ring-ring/30" : undefined
                  }
                />
              ))}
            </div>

            {activeCategory ? (
              <SectionCard
                title={activeCategory.title}
                description={activeCategory.description}
                icon={activeCategory.icon}
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openManagement(activeCategory.path)}
                  >
                    <ExternalLink className="size-4" />
                    {activeCategory.manageLabel}
                  </Button>
                }
              >
                <div className="flex flex-col gap-3">
                  {activeCategory.issues.length > 0 ? (
                    <Callout
                      tone="warning"
                      title={`${activeCategory.issues.length} item(s) need attention`}
                      icon={TriangleAlert}
                    >
                      <ul className="list-disc space-y-1 pl-5">
                        {activeCategory.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </Callout>
                  ) : activeCategory.status === "pending" ? (
                    <Callout tone="warning" title="Nothing here yet" icon={TriangleAlert}>
                      No records match the selected batch. Open {activeCategory.title.toLowerCase()}{" "}
                      to add them.
                    </Callout>
                  ) : (
                    <Callout tone="success" title="Ready" icon={CheckCircle2}>
                      {activeCategory.title} looks complete for {selectionSummary}.
                    </Callout>
                  )}
                </div>
              </SectionCard>
            ) : null}
          </div>
        )}

        <SectionCard
          title="Ready to generate"
          description={selectionSummary}
          icon={Sparkles}
          footer={
            <div className="flex w-full flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={stepIndex <= 0}
                  onClick={() => setStep(STEP_IDS[Math.max(0, stepIndex - 1)])}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={stepIndex >= STEP_IDS.length - 1}
                  onClick={() =>
                    setStep(STEP_IDS[Math.min(STEP_IDS.length - 1, stepIndex + 1)])
                  }
                >
                  Next
                </Button>
              </div>

              <Button type="button" disabled={!canGenerate} onClick={goToGenerate}>
                <Sparkles className="size-4" />
                Generate Timetable
              </Button>
            </div>
          }
        >
          {canGenerate ? (
            <Callout tone="info" title="All categories are ready" icon={Info}>
              {CATEGORY_IDS.length} categories checked against {selectionSummary}. Generation runs on
              the next screen, where you pick the algorithm.
            </Callout>
          ) : (
            <Callout tone="info" title="Finish setup to continue" icon={Info}>
              <ul className="list-disc space-y-1 pl-5">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </Callout>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
