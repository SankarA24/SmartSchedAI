import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  BookOpen,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Dna,
  Download,
  Eye,
  GitBranch,
  GraduationCap,
  Layers,
  Play,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";

import api from "@/lib/api";
import { navForRole } from "@/lib/nav";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SectionCard } from "@/components/common/SectionCard";
import { Callout } from "@/components/common/Callout";
import { EmptyState } from "@/components/common/EmptyState";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { DataValidationPanel } from "@/components/timetable/DataValidationPanel";
import { AlgorithmCard } from "@/components/timetable/AlgorithmCard";
import { GenerationProgress } from "@/components/timetable/GenerationProgress";
import { QualityScore } from "@/components/timetable/QualityScore";
import { GARunSummary } from "@/components/GARunSummary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIdentity } from "@/hooks/useIdentity";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { useTimetableData } from "@/hooks/useTimetableData";
import { useGenerationProgress } from "@/hooks/useGenerationProgress";

// =====================================================================
// /generate-timetable — validation → engine → settings → run → result.
//
// WHAT THE SERVER ACTUALLY DOES (every control below is wired to one of
// these; nothing on this page collects a value the server throws away):
//
//   POST /api/timetables/generate        202 { jobId, steps }, admin only.
//     Runs Gemini first only when `method === "ai"` AND the server has a
//     GOOGLE_API_KEY; then the genetic algorithm; then, if the GA cannot
//     reach zero hard violations, the backtracking constraint solver.
//     409 while another run holds the lock. Progress streams on the
//     socket room `generation:<jobId>` and is also readable at
//     GET /generate/:jobId/progress.
//   POST /api/timetables/generate-local  201 with the saved timetable.
//     Skips the GA entirely and runs the backtracking solver. This is
//     the ONLY endpoint that runs the constraint solver on its own, so
//     it — not `method: "backtracking"` on /generate, which would still
//     run the GA first — is what the Backtracking card posts to. It is
//     synchronous and reports no intermediate progress.
//   PUT /api/config                      admin only, partial update.
//     Where the optimisation-goal checkboxes below are saved.
//
// There is no greedy engine, no cancel endpoint, and no server-side
// mutation-rate / elitism / time-limit override (see GA_FIXED_SETTINGS),
// so none of those are offered as live controls.
// =====================================================================

// ---------------------------------------------------------------------
// Scheduling predicates duplicated from the backend.
//
// These mirror `backend/utils/schedulingHelpers.js` exactly so the
// readiness checks below predict what the generator will do instead of
// guessing. Like the other duplicated scheduling logic this repo
// documents (DAYS / TIME_SLOTS / getWeeklySessions), they must be
// changed in both places at once.
// ---------------------------------------------------------------------

/** `schedulingHelpers.js#normalizeText` */
function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** `schedulingHelpers.js#GENERIC_WORDS` */
const GENERIC_WORDS = new Set([
  "programming",
  "systems",
  "system",
  "management",
  "design",
  "development",
  "technology",
  "technologies",
  "engineering",
  "science",
  "computer",
  "data",
  "applications",
  "laboratory",
  "lab",
]);

function meaningfulWords(text) {
  return text
    .split(" ")
    .filter((word) => word.length >= 3 && !GENERIC_WORDS.has(word));
}

/** `schedulingHelpers.js#specializationMatches` */
function specializationMatches(course, faculty) {
  const specializations = Array.isArray(faculty?.specialization)
    ? faculty.specialization
    : [];
  if (specializations.length === 0) return false;

  const courseText = normalizeText(
    `${course?.name || ""} ${course?.code || ""} ${course?.description || ""}`
  );
  if (!courseText) return false;

  const courseWords = new Set(meaningfulWords(courseText));

  return specializations.some((specialization) => {
    const specializationText = normalizeText(specialization);
    if (!specializationText) return false;
    if (
      courseText.includes(specializationText) ||
      specializationText.includes(courseText)
    ) {
      return true;
    }
    return meaningfulWords(specializationText).some((word) => courseWords.has(word));
  });
}

/** `schedulingHelpers.js#roomTypeMatches` */
function roomTypeMatches(course, room) {
  const courseType = String(course?.type || "lecture").toLowerCase();
  const roomType = String(room?.type || "").toLowerCase();
  if (courseType === "lab") return roomType === "lab";
  if (courseType === "seminar") {
    return roomType === "seminar_room" || roomType === "auditorium";
  }
  return (
    roomType === "lecture_hall" ||
    roomType === "seminar_room" ||
    roomType === "auditorium"
  );
}

/** `schedulingHelpers.js#getWeeklySessions` (weeks only matter for totalHours) */
function weeklySessions(course, weeks) {
  const totalHours = Number(course?.totalHours);
  if (Number.isFinite(totalHours) && totalHours > 0) {
    return Math.ceil(totalHours / (Number(weeks) > 0 ? Number(weeks) : 13));
  }
  return Number(course?.hoursPerWeek) || 3;
}

const DAY_KEYS = {
  Monday: "monday",
  Tuesday: "tuesday",
  Wednesday: "wednesday",
  Thursday: "thursday",
  Friday: "friday",
  Saturday: "saturday",
  Sunday: "sunday",
};

/** True when the entity declares at least one window on a working day. */
function hasAnyAvailability(entity, days) {
  const availability = entity?.availability;
  if (!availability) return false;
  return days.some((day) => {
    const windows = availability[DAY_KEYS[day] || String(day).toLowerCase()];
    return Array.isArray(windows) && windows.length > 0;
  });
}

// ---------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------

function sameText(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function sameNumber(a, b) {
  return Number(a) === Number(b);
}

/** Sorted distinct non-empty values of one field across a collection. */
function distinct(items, field) {
  const values = new Set();
  for (const item of items || []) {
    const value = item?.[field];
    if (value === undefined || value === null || value === "") continue;
    values.add(String(value));
  }
  return [...values].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

function messageFor(error) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.details ||
    error?.message ||
    "Request failed"
  );
}

const TARGET_FIELDS = [
  { id: "department", label: "Department" },
  { id: "year", label: "Year" },
  { id: "semester", label: "Semester" },
  { id: "academicYear", label: "Academic year" },
];

// ---------------------------------------------------------------------
// Engines
//
// `method` is sent verbatim and stored on the job record. Genetic and
// Hybrid run the same server-side engine chain — the GA with the
// constraint solver behind it — and the honest difference is what this
// page does with the outcome: a Genetic run that ends up finished by the
// solver is reported here as a fallback, a Hybrid run treats it as the
// expected result. The copy on both cards says exactly that.
// ---------------------------------------------------------------------

const ENGINES = [
  {
    id: "genetic",
    name: "Genetic algorithm",
    icon: Dna,
    recommended: true,
    endpoint: "async",
    description:
      "Evolves whole candidate timetables, keeping the best and recombining them.",
    advantages: [
      "Explores the whole timetable at once, not one class at a time",
      "Optimises soft goals (workload balance, gaps) once the hard rules hold",
      "Seeded and reproducible: the same seed gives the same timetable",
    ],
    considerations: [
      "Slowest of the four on large departments",
      "The server always keeps the backtracking solver behind it; if the GA cannot reach zero hard violations the solver finishes the run and the result below is flagged as a fallback",
    ],
  },
  {
    id: "backtracking",
    name: "Backtracking solver",
    icon: GitBranch,
    endpoint: "local",
    description:
      "Our constraint solver: most-constrained course first, depth-first search with backtracking.",
    advantages: [
      "Deterministic — no seed, no randomness",
      "Fast and predictable on well-constrained data",
      "Never returns a schedule that breaks a hard rule: it fails instead",
    ],
    considerations: [
      "Optimises nothing beyond feasibility — the first valid timetable wins",
      "Runs on POST /generate-local, which is synchronous: no live progress, only the finished result",
      "Gives up after 250,000 search nodes on over-constrained data",
    ],
  },
  {
    id: "ai",
    name: "AI-assisted (Gemini)",
    icon: Sparkles,
    endpoint: "async",
    description:
      "Asks Gemini for a full schedule, then validates it against every hard rule.",
    advantages: [
      "Handles fuzzy, human-shaped preferences the solvers do not model",
      "Up to 3 attempts, each fed the previous attempt's validation errors",
    ],
    considerations: [
      "Needs GOOGLE_API_KEY on the server; without it the run silently starts at the genetic algorithm instead",
      "Every proposal is still validated locally, so an invalid one is discarded",
      "Slowest to first result and the only engine that leaves the machine",
    ],
  },
  {
    id: "hybrid",
    name: "Hybrid",
    icon: Layers,
    endpoint: "async",
    description:
      "Genetic search with the backtracking solver as a guaranteed finisher. This is what the server does by default.",
    advantages: [
      "Optimised when the GA succeeds, feasible when it does not",
      "The safest choice when you just need a usable timetable",
    ],
    considerations: [
      "Identical engine chain to Genetic; the difference is only that a solver finish is reported here as the expected outcome rather than a fallback",
    ],
  },
];

const ENGINE_BY_ID = Object.fromEntries(ENGINES.map((engine) => [engine.id, engine]));

// The three GA tunables `sanitizeGaOptions` in
// `backend/routes/timetableRoute.js` actually keeps, with its clamps.
const GA_LIMITS = {
  populationSize: { min: 10, max: 200 },
  maxGenerations: { min: 10, max: 1000 },
};

// GA settings the server fixes (`DEFAULTS` in
// `backend/utils/geneticScheduler.js`). They are shown read-only rather
// than as inputs, because `sanitizeGaOptions` drops them from the
// request body — an editable field here would be a control that does
// nothing.
const GA_FIXED_SETTINGS = [
  { id: "mutationRate", label: "Mutation rate", value: "0.15" },
  { id: "elitism", label: "Elitism", value: "2" },
  { id: "timeLimitMs", label: "Time limit", value: "20000 ms" },
];

// The four SystemConfig booleans. Saving them is real (PUT /api/config
// persists them and GET /api/config/grid returns them), but no engine reads
// them: they appear only in models/SystemConfig.js, routes/configRoute.js and
// utils/schedulingConstants.js — never in geneticScheduler.js,
// localScheduler.js, timetableGenerator.js or qualityScore.js. Each flag
// therefore carries the same `enforcement` disclosure the Advanced
// Constraints tab of /infrastructure shows, so the two pages agree.
const OPTIMIZATION_FLAGS = [
  {
    id: "balanceFacultyWorkload",
    label: "Balance faculty workload",
    hint: "Preference for spreading teaching hours evenly across faculty.",
    enforcement:
      "Flag not read. Both engines already spread load unconditionally: the backtracking scheduler penalises hours already assigned, the genetic one penalises exceeding a faculty member's weekly cap.",
  },
  {
    id: "preferMorningLabs",
    label: "Prefer morning labs",
    hint: "Preference for placing lab sessions before the lunch break.",
    enforcement: "No penalty implemented — nothing reads this flag.",
  },
  {
    id: "avoidFirstLastPeriod",
    label: "Avoid first and last period",
    hint: "Preference for leaving the opening and closing period of a day free.",
    enforcement: "No penalty implemented — nothing reads this flag.",
  },
  {
    id: "prioritizeFacultyPreferences",
    label: "Prioritise faculty preferences",
    hint: "Preference for honouring each faculty member's preferred and avoided time slots.",
    enforcement:
      "Flag not read. Both engines already reward preferred slots and punish avoided ones on every run.",
  },
];

// `metadata.generationMethod` as the server actually writes it:
// "ai" (routes/timetableRoute.js:930 and utils/timetableGenerator.js:1791),
// "genetic-algorithm" | "local-fallback" | "local" (timetableRoute.js:1165).
// There is no "backtracking" value — matching on one made both fallback
// disclosures below unreachable.
const METHOD_LABELS = {
  ai: "Gemini",
  "genetic-algorithm": "genetic algorithm",
  "local-fallback": "backtracking solver",
  local: "backtracking solver",
};

// True for the two values the route writes when the local constraint solver
// produced the schedule, whether the genetic algorithm or the AI ran first.
function finishedBySolver(method) {
  return method === "local-fallback" || method === "local";
}

const BUSY_MESSAGE =
  "A generation is already running. Wait for it to finish, then try again.";

function statusForProgress(status) {
  if (status === "completed") return "done";
  if (status === "failed") return "failed";
  if (status) return "running";
  return undefined;
}

// =====================================================================
// PAGE
// =====================================================================

export default function GenerateTimetable() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user } = useIdentity();
  const shell = navForRole(user?.role || "admin");

  const { grid, refresh: refreshGrid } = useSystemConfig();
  const {
    courses,
    faculty,
    rooms,
    loading: dataLoading,
    error: dataError,
    refresh: refreshData,
  } = useTimetableData();

  // ---- students ------------------------------------------------------
  // `useTimetableData` does not fetch them (no timetable view needs
  // them), but the readiness panel reports the cohort, so this page
  // reads GET /api/students itself.
  const [students, setStudents] = useState([]);
  const [studentsError, setStudentsError] = useState(null);
  const [studentsReloadKey, setStudentsReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/students", { signal: controller.signal })
      .then(({ data }) => setStudents(Array.isArray(data) ? data : []))
      .catch((error) => {
        if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError") return;
        console.warn("GenerateTimetable: failed to load /students", error);
        setStudentsError(messageFor(error));
      });
    return () => controller.abort();
  }, [studentsReloadKey]);

  // ---- system config -------------------------------------------------
  // `useSystemConfig` exposes the derived grid; the raw document is what
  // the optimisation-goal checkboxes bind to and write back.
  const [systemConfig, setSystemConfig] = useState(null);
  const [configReloadKey, setConfigReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get("/config", { signal: controller.signal })
      .then(({ data }) => setSystemConfig(data || null))
      .catch((error) => {
        if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError") return;
        console.warn("GenerateTimetable: failed to load /config", error);
      });
    return () => controller.abort();
  }, [configReloadKey]);

  // =====================================================
  // TARGET (query string wins, then the only option there is)
  // =====================================================

  const [target, setTarget] = useState(() => ({
    department: searchParams.get("department") || "",
    year: searchParams.get("year") || "",
    semester: searchParams.get("semester") || "",
    academicYear: searchParams.get("academicYear") || "",
  }));

  const options = useMemo(
    () => ({
      department: distinct(courses, "department"),
      year: distinct(courses, "year"),
      semester: distinct(courses, "semester"),
      academicYear: distinct(courses, "academicYear"),
    }),
    [courses]
  );

  // Preselect only where the data leaves no choice; anything else stays
  // empty so nobody generates for a group they did not pick.
  useEffect(() => {
    setTarget((current) => {
      let next = current;
      for (const field of TARGET_FIELDS) {
        const available = options[field.id];
        if (!current[field.id] && available.length === 1) {
          if (next === current) next = { ...current };
          next[field.id] = available[0];
        }
      }
      return next;
    });
  }, [options]);

  const targetComplete = TARGET_FIELDS.every((field) => Boolean(target[field.id]));

  // =====================================================
  // READINESS CHECKS (client-side, mirroring the generator)
  // =====================================================

  const scoped = useMemo(() => {
    const scopedCourses = targetComplete
      ? courses.filter(
          (course) =>
            sameText(course.department, target.department) &&
            sameNumber(course.semester, target.semester) &&
            sameNumber(course.year, target.year) &&
            sameNumber(course.academicYear, target.academicYear)
        )
      : [];

    // `loadSchedulingContext` scopes faculty by department only, and
    // uses every room.
    const scopedFaculty = target.department
      ? faculty.filter((member) => sameText(member.department, target.department))
      : [];

    const scopedStudents =
      target.department && target.semester
        ? students.filter(
            (student) =>
              sameText(student.department, target.department) &&
              sameNumber(student.semester, target.semester) &&
              (student.year === undefined ||
                student.year === null ||
                sameNumber(student.year, target.year))
          )
        : [];

    return { courses: scopedCourses, faculty: scopedFaculty, students: scopedStudents };
  }, [courses, faculty, students, target, targetComplete]);

  const checks = useMemo(() => {
    const days = grid?.days || [];
    const slots = grid?.slots || [];
    const weeklyCapacity = days.length * slots.length;
    const cohortSize = scoped.students.length;

    const coursesWithoutFaculty = scoped.courses.filter(
      (course) => !scoped.faculty.some((member) => specializationMatches(course, member))
    );
    const coursesWithoutRoom = scoped.courses.filter(
      (course) => !rooms.some((room) => roomTypeMatches(course, room))
    );
    const facultyWithoutAvailability = scoped.faculty.filter(
      (member) => !hasAnyAvailability(member, days)
    );
    const undersizedRooms =
      cohortSize > 0
        ? rooms.filter((room) => Number(room.capacity) < cohortSize)
        : [];
    const requiredSessions = scoped.courses.reduce(
      (total, course) => total + weeklySessions(course, grid?.weeks),
      0
    );

    const courseIssues = [];
    if (targetComplete && scoped.courses.length === 0) {
      courseIssues.push({
        message: "No courses match this department, year, semester and academic year.",
        blocking: true,
      });
    }
    for (const course of coursesWithoutFaculty) {
      courseIssues.push({
        message: `${course.code || course.name}: no faculty in this department is specialized for it.`,
        blocking: true,
      });
    }
    for (const course of coursesWithoutRoom) {
      courseIssues.push({
        message: `${course.code || course.name}: no ${String(course.type || "lecture")} room exists for it.`,
        blocking: true,
      });
    }

    const facultyIssues = [];
    if (target.department && scoped.faculty.length === 0) {
      facultyIssues.push({
        message: `No faculty records in ${target.department}.`,
        blocking: true,
      });
    }
    if (facultyWithoutAvailability.length > 0) {
      facultyIssues.push({
        message: `${facultyWithoutAvailability.length} faculty member(s) declare no availability on any working day and can never be scheduled.`,
        blocking: false,
      });
    }

    const roomIssues = [];
    if (rooms.length === 0) {
      roomIssues.push({ message: "No rooms exist.", blocking: true });
    }
    if (undersizedRooms.length > 0) {
      roomIssues.push({
        message: `${undersizedRooms.length} of ${rooms.length} rooms seat fewer than the ${cohortSize} students in this group.`,
        blocking: false,
      });
    }

    const studentIssues = [];
    if (targetComplete && cohortSize === 0) {
      studentIssues.push({
        message:
          "No student records for this group — class size is unknown, so room capacity cannot be checked.",
        blocking: false,
      });
    }

    const configIssues = [];
    if (days.length === 0) {
      configIssues.push({
        message: "The scheduling configuration has zero working days.",
        blocking: true,
      });
    }
    if (weeklyCapacity > 0 && requiredSessions > weeklyCapacity) {
      configIssues.push({
        message: `These courses need ${requiredSessions} sessions a week but the grid only has ${weeklyCapacity} slots.`,
        blocking: true,
      });
    }

    const entity = (id, label, icon, count, issues) => ({
      id,
      label,
      icon,
      count,
      issues: issues.map((issue) => issue.message),
      status: issues.some((issue) => issue.blocking)
        ? "error"
        : issues.length > 0
          ? "warning"
          : count > 0
            ? "complete"
            : "pending",
    });

    const entities = [
      entity("courses", "Courses", BookOpen, scoped.courses.length, courseIssues),
      entity("faculty", "Faculty", Users, scoped.faculty.length, facultyIssues),
      entity("rooms", "Rooms", Building2, rooms.length, roomIssues),
      entity("students", "Students", GraduationCap, cohortSize, studentIssues),
      entity(
        "configuration",
        "Configuration",
        Settings2,
        weeklyCapacity,
        configIssues
      ),
    ];

    const allIssues = [
      ...courseIssues,
      ...facultyIssues,
      ...roomIssues,
      ...studentIssues,
      ...configIssues,
    ];

    return {
      entities,
      blocking: allIssues.filter((issue) => issue.blocking).length,
      minor: allIssues.filter((issue) => !issue.blocking).length,
      weeklyCapacity,
      requiredSessions,
      cohortSize,
    };
  }, [grid, rooms, scoped, target.department, targetComplete]);

  const refreshAll = useCallback(() => {
    refreshData();
    refreshGrid();
    setStudentsReloadKey((key) => key + 1);
    setConfigReloadKey((key) => key + 1);
  }, [refreshData, refreshGrid]);

  // =====================================================
  // ENGINE + SETTINGS
  // =====================================================

  const [engineId, setEngineId] = useState("genetic");
  const engine = ENGINE_BY_ID[engineId] || ENGINES[0];

  // `/api/config` does not report whether the server holds a Gemini key
  // today. If it ever starts to, the AI card disables itself with a
  // truthful reason; until then the card stays enabled, because with a
  // key configured the run genuinely does call Gemini, and without one
  // the server falls back to the genetic algorithm and the completion
  // summary below says which engine actually produced the timetable.
  const aiReported = [
    systemConfig?.aiAvailable,
    systemConfig?.geminiConfigured,
    systemConfig?.aiEnabled,
  ].find((value) => typeof value === "boolean");
  const aiDisabled = aiReported === false;

  useEffect(() => {
    if (aiDisabled && engineId === "ai") setEngineId("genetic");
  }, [aiDisabled, engineId]);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [gaOptions, setGaOptions] = useState({
    seed: "",
    populationSize: "",
    maxGenerations: "",
  });

  const usesGa = engine.endpoint === "async";

  const configFlags = useMemo(() => {
    const source = systemConfig || grid?.flags || {};
    return Object.fromEntries(
      OPTIMIZATION_FLAGS.map((flag) => [flag.id, Boolean(source[flag.id])])
    );
  }, [systemConfig, grid]);

  const [flagDraft, setFlagDraft] = useState(configFlags);
  const [flagSaving, setFlagSaving] = useState(false);
  const [flagError, setFlagError] = useState(null);

  useEffect(() => {
    setFlagDraft(configFlags);
  }, [configFlags]);

  const flagsDirty = OPTIMIZATION_FLAGS.some(
    (flag) => Boolean(flagDraft[flag.id]) !== Boolean(configFlags[flag.id])
  );

  const saveFlags = async () => {
    setFlagSaving(true);
    setFlagError(null);
    try {
      const { data } = await api.put("/config", flagDraft);
      if (data?.config) setSystemConfig(data.config);
      else setConfigReloadKey((key) => key + 1);
      refreshGrid();
    } catch (error) {
      setFlagError(messageFor(error));
    } finally {
      setFlagSaving(false);
    }
  };

  // =====================================================
  // RUNNING
  // =====================================================

  const [jobId, setJobId] = useState(null);
  const [steps, setSteps] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  // The synchronous /generate-local path has no job record, so its state
  // is tracked here instead of by useGenerationProgress.
  const [localRun, setLocalRun] = useState(null);
  const [result, setResult] = useState(null);
  const [resultError, setResultError] = useState(null);
  const [ranWith, setRanWith] = useState(null);

  const progress = useGenerationProgress(jobId);
  const {
    generation: liveGeneration,
    bestFitness: liveBestFitness,
    status: jobStatus,
    timetableId,
  } = progress;

  // The job record carries one generation sample at a time, so the live
  // fitness chart is assembled here from the stream itself. It is a real
  // partial series — never padded, never interpolated.
  const [fitnessHistory, setFitnessHistory] = useState([]);

  useEffect(() => {
    setFitnessHistory([]);
  }, [jobId]);

  useEffect(() => {
    if (typeof liveGeneration !== "number" || typeof liveBestFitness !== "number") {
      return;
    }
    setFitnessHistory((previous) => {
      const last = previous[previous.length - 1];
      if (last && last.generation === liveGeneration && last.best === liveBestFitness) {
        return previous;
      }
      if (last && last.generation === liveGeneration) {
        return [...previous.slice(0, -1), { generation: liveGeneration, best: liveBestFitness }];
      }
      return [...previous, { generation: liveGeneration, best: liveBestFitness }];
    });
  }, [liveGeneration, liveBestFitness]);

  // Completion: read the saved timetable so the summary below reports
  // the document rather than a guess at it.
  useEffect(() => {
    if (jobStatus !== "completed" || !timetableId) return;
    let cancelled = false;
    api
      .get(`/timetables/${timetableId}`)
      .then(({ data }) => {
        if (!cancelled) setResult(data || null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("GenerateTimetable: failed to load the generated timetable", error);
        setResultError(messageFor(error));
      });
    return () => {
      cancelled = true;
    };
  }, [jobStatus, timetableId]);

  const running =
    (Boolean(jobId) && !progress.terminal) || localRun?.status === "running";

  const startGeneration = async () => {
    setSubmitError(null);
    setResultError(null);
    setResult(null);
    setJobId(null);
    setSteps([]);
    setLocalRun(null);
    setRanWith(engine.id);
    setSubmitting(true);

    const body = {
      department: target.department,
      semester: target.semester,
      year: target.year,
      academicYear: target.academicYear,
      method: engine.id,
    };

    // The constraint solver has no GA tunables, so nothing is sent for it.
    if (usesGa) {
      const options = {};
      for (const key of ["seed", "populationSize", "maxGenerations"]) {
        const value = Number(gaOptions[key]);
        if (gaOptions[key] !== "" && Number.isFinite(value)) options[key] = value;
      }
      if (Object.keys(options).length > 0) body.gaOptions = options;
    }

    try {
      if (engine.endpoint === "local") {
        setLocalRun({ status: "running" });
        const { data } = await api.post("/timetables/generate-local", body);
        setLocalRun({ status: "completed" });
        setResult(data || null);
      } else {
        const { data } = await api.post("/timetables/generate", body);
        setSteps(Array.isArray(data?.steps) ? data.steps : []);
        setJobId(data?.jobId || null);
      }
    } catch (error) {
      const status = error?.response?.status;
      setLocalRun(
        engine.endpoint === "local"
          ? { status: "failed", error: status === 409 ? BUSY_MESSAGE : messageFor(error) }
          : null
      );
      setSubmitError(status === 409 ? BUSY_MESSAGE : messageFor(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resetRun = () => {
    setJobId(null);
    setSteps([]);
    setLocalRun(null);
    setResult(null);
    setResultError(null);
    setSubmitError(null);
    setRanWith(null);
  };

  // =====================================================
  // RESULT
  // =====================================================

  const resultId = result?._id ? String(result._id) : null;
  const resultMetadata = result?.metadata || null;
  const actualMethod = resultMetadata?.generationMethod || null;

  const [downloading, setDownloading] = useState(null);
  const [downloadError, setDownloadError] = useState(null);

  const download = async (format) => {
    if (!resultId) return;
    setDownloading(format);
    setDownloadError(null);
    try {
      const response = await api.get(`/timetables/${resultId}/export`, {
        params: { format },
        responseType: "blob",
      });
      const blob = new Blob([response.data], {
        type: response.headers?.["content-type"] || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `timetable-${resultId}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(messageFor(error));
    } finally {
      setDownloading(null);
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  const progressStatus = statusForProgress(jobStatus);
  const checklistSteps = steps.map((label, index) => ({ id: `${index}-${label}`, label }));

  const liveRunStats =
    fitnessHistory.length > 0
      ? {
          generationMethod: "genetic-algorithm",
          seed: gaOptions.seed === "" ? undefined : Number(gaOptions.seed),
          generations: liveGeneration,
          populationSize:
            gaOptions.populationSize === "" ? undefined : Number(gaOptions.populationSize),
          bestFitness: liveBestFitness,
          hardViolations: progress.hardViolations,
          softPenalty: progress.softPenalty,
          fitnessHistory,
        }
      : null;

  // Readiness, summarised for the launch card. Severity follows the colour
  // system: blocking issues are errors (destructive), minor ones are
  // warnings, a clean target is success.
  const readiness = !targetComplete
    ? { variant: "neutral", label: "No group selected" }
    : checks.blocking > 0
      ? {
          variant: "destructive",
          label: `${checks.blocking} blocking issue${checks.blocking === 1 ? "" : "s"}`,
        }
      : checks.minor > 0
        ? {
            variant: "warning",
            label: `${checks.minor} minor issue${checks.minor === 1 ? "" : "s"}`,
          }
        : { variant: "success", label: "Ready to generate" };

  // A source that failed to load renders an em dash — an empty collection and
  // an unreachable one must not look the same.
  const scopeRows = [
    {
      id: "courses",
      label: "Courses",
      value: dataError?.courses ? "—" : scoped.courses.length,
    },
    {
      id: "sessions",
      label: "Weekly sessions",
      value: dataError?.courses ? "—" : checks.requiredSessions,
    },
    {
      id: "faculty",
      label: "Faculty",
      value: dataError?.faculty ? "—" : scoped.faculty.length,
    },
    {
      id: "rooms",
      label: "Rooms",
      value: dataError?.rooms ? "—" : rooms.length,
    },
    {
      id: "students",
      label: "Students",
      value: studentsError ? "—" : checks.cohortSize,
    },
    {
      id: "capacity",
      label: "Slots in the week",
      value: checks.weeklyCapacity,
    },
  ];

  return (
    <AppShell
      brand={shell.brand}
      nav={shell.nav}
      quickActions={shell.quickActions}
      chatbot={{ context: "Generate timetable" }}
    >
      <PageHeader
        title="Generate timetable"
        description="Check the data, pick an engine, then run a generation for one student group."
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={dataLoading}>
            <RefreshCw className={dataLoading ? "size-4 animate-spin" : "size-4"} />
            Refresh data
          </Button>
        }
      />

      <div className="space-y-5">
        {/* ============ Band 1 — launch (small) | run (large) ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Launch ---- */}
          <SectionCard
            title="Run a generation"
            description="Courses are scoped by all four fields, faculty by department — exactly how the generator loads its data. One draft timetable is created; nothing is published."
            icon={Play}
            className="xl:col-span-5"
            actions={<StatusBadge variant={readiness.variant}>{readiness.label}</StatusBadge>}
            footer={
              <div className="flex w-full flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="lg"
                    onClick={startGeneration}
                    disabled={!targetComplete || submitting || running}
                  >
                    <Play className="size-4" />
                    {submitting
                      ? "Starting…"
                      : running
                        ? "Generation running…"
                        : "Generate timetable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdvancedOpen((open) => !open)}
                    aria-expanded={advancedOpen}
                  >
                    {advancedOpen ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                    Advanced settings
                  </Button>
                </div>
                {!targetComplete && (
                  <p className="text-xs text-muted-foreground">
                    Select a department, year, semester and academic year first.
                  </p>
                )}
                {targetComplete && checks.blocking > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {checks.blocking} blocking issue(s) below will very likely fail this run.
                  </p>
                )}
              </div>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {TARGET_FIELDS.map((field) => (
                  <div key={field.id} className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor={`target-${field.id}`}>{field.label}</Label>
                    <Select
                      value={target[field.id] ?? ""}
                      onValueChange={(value) =>
                        setTarget((current) => ({ ...current, [field.id]: value }))
                      }
                    >
                      <SelectTrigger id={`target-${field.id}`} className="w-full">
                        <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {options[field.id].map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {!dataLoading && options.department.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  There are no courses yet, so there is nothing to generate for.{" "}
                  <Link to="/courses" className="text-primary underline-offset-4 hover:underline">
                    Add courses
                  </Link>{" "}
                  first.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Engine</span>
                <StatusBadge variant="info">{engine.name}</StatusBadge>
              </div>

              {submitError && (
                <Callout tone="destructive" title="Generation was not started" icon={TriangleAlert}>
                  {submitError}
                </Callout>
              )}
            </div>
          </SectionCard>

          {/* ---- Run: live progress, then the finished timetable ---- */}
          <div className="flex min-w-0 flex-col gap-5 xl:col-span-7">
            {jobId ? (
              <>
                <GenerationProgress
                  steps={checklistSteps}
                  currentIndex={progress.stepIndex ?? 0}
                  percentage={progress.percentage}
                  generation={progress.generation ?? undefined}
                  maxGenerations={progress.maxGenerations ?? undefined}
                  bestFitness={progress.bestFitness ?? undefined}
                  hardViolations={progress.hardViolations ?? undefined}
                  status={progressStatus}
                  error={progress.error || undefined}
                />

                {progress.polling && !progress.terminal && (
                  <p className="text-xs text-muted-foreground">
                    Live socket unavailable — reading progress from the server instead.
                  </p>
                )}
                {progress.transportError && !progress.terminal && (
                  <p className="text-xs text-muted-foreground">
                    Last progress read failed: {progress.transportError}
                  </p>
                )}

                {liveRunStats && <GARunSummary stats={liveRunStats} live={!progress.terminal} />}
              </>
            ) : localRun ? (
              <SectionCard
                title="Generation progress"
                description="Backtracking solver"
                icon={GitBranch}
              >
                {localRun.status === "running" ? (
                  <p className="text-sm text-muted-foreground">
                    Running the backtracking solver. This endpoint is synchronous and
                    reports no intermediate steps — the finished timetable appears below.
                  </p>
                ) : localRun.status === "failed" ? (
                  <Callout tone="destructive" title="Generation failed" icon={TriangleAlert}>
                    {localRun.error}
                  </Callout>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The backtracking solver finished.
                  </p>
                )}
              </SectionCard>
            ) : (
              <SectionCard
                title="Generation run"
                description="Live progress and the finished timetable appear here."
                icon={Activity}
              >
                <EmptyState
                  icon={Play}
                  title="No run yet"
                  description="Pick a target group and an engine, then start a generation. Steps, genetic-algorithm telemetry and the saved draft all land in this panel."
                />
              </SectionCard>
            )}

            {result && (
              <SectionCard
                title="Timetable generated"
                description={result.name || undefined}
                icon={CheckCircle2}
                actions={<StatusBadge variant="success">draft saved</StatusBadge>}
                footer={
                  <div className="flex w-full flex-wrap gap-3">
                    <Button
                      onClick={() => resultId && navigate(`/view-timetable/${resultId}`)}
                      disabled={!resultId}
                    >
                      <Eye className="size-4" />
                      View timetable
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => download("csv")}
                      disabled={!resultId || downloading !== null}
                    >
                      <Download className="size-4" />
                      {downloading === "csv" ? "Preparing…" : "Download CSV"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => download("json")}
                      disabled={!resultId || downloading !== null}
                    >
                      <Download className="size-4" />
                      {downloading === "json" ? "Preparing…" : "Download JSON"}
                    </Button>
                    <Button variant="ghost" onClick={resetRun}>
                      <RefreshCw className="size-4" />
                      Regenerate
                    </Button>
                  </div>
                }
              >
                <div className="flex flex-col gap-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                      label="Classes scheduled"
                      value={result.schedule?.length ?? resultMetadata?.totalHours ?? 0}
                      icon={CalendarCheck}
                    />
                    <StatCard
                      label="Quality score"
                      value={
                        typeof resultMetadata?.qualityScore === "number"
                          ? resultMetadata.qualityScore
                          : "—"
                      }
                      icon={Sparkles}
                      tone="success"
                    />
                    <StatCard
                      label="Conflicts"
                      value={resultMetadata?.conflictCount ?? 0}
                      icon={TriangleAlert}
                      tone={resultMetadata?.conflictCount ? "warning" : "default"}
                    />
                  </div>

                  {typeof resultMetadata?.qualityScore === "number" && (
                    <QualityScore
                      score={resultMetadata.qualityScore}
                      breakdown={resultMetadata.qualityBreakdown}
                      size="lg"
                    />
                  )}

                  {ranWith === "genetic" && finishedBySolver(actualMethod) && (
                    <Callout
                      tone="warning"
                      title="Finished by the constraint solver"
                      icon={TriangleAlert}
                    >
                      The genetic algorithm could not reach a conflict-free schedule, so the
                      backtracking solver finished the run. The timetable is valid but not
                      optimised.
                    </Callout>
                  )}

                  {ranWith === "ai" && actualMethod && actualMethod !== "ai" && (
                    <Callout tone="info" title="AI was not used" icon={Sparkles}>
                      Gemini was unavailable or returned an invalid schedule, so this
                      timetable came from the{" "}
                      {METHOD_LABELS[actualMethod] || "fallback scheduler"}.
                    </Callout>
                  )}

                  <GARunSummary metadata={resultMetadata} />

                  {downloadError && (
                    <Callout tone="destructive" title="Export failed" icon={TriangleAlert}>
                      {downloadError}
                    </Callout>
                  )}
                </div>
              </SectionCard>
            )}

            {resultError && (
              <Callout
                tone="warning"
                title="Timetable saved, but could not be read back"
                icon={TriangleAlert}
              >
                {resultError}
                {timetableId && (
                  <>
                    {" "}
                    <Link
                      to={`/view-timetable/${timetableId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Open it directly
                    </Link>
                    .
                  </>
                )}
              </Callout>
            )}
          </div>
        </div>

        {/* ============ Band 2 — readiness (large) | scope (small) ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-7">
            <DataValidationPanel
              entities={checks.entities}
              onRefresh={refreshAll}
              loading={dataLoading}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-5 xl:col-span-5">
            <SectionCard
              title="Selected group"
              description={
                targetComplete
                  ? `${target.department} · Year ${target.year} · Semester ${target.semester} · ${target.academicYear}`
                  : "Pick a department, year, semester and academic year to scope these figures."
              }
              icon={GraduationCap}
            >
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
                {scopeRows.map((row) => (
                  <div key={row.id} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="truncate text-xs text-muted-foreground">{row.label}</dt>
                    <dd className="text-lg font-semibold tracking-tight text-foreground tabular-nums">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </SectionCard>

            {!targetComplete ? (
              <Callout tone="info" title="Pick a target group" icon={CalendarCheck}>
                The checks beside this run against the selected department, year, semester
                and academic year.
              </Callout>
            ) : checks.blocking > 0 ? (
              <Callout
                tone="destructive"
                title={`${checks.blocking} blocking issue${checks.blocking === 1 ? "" : "s"}`}
                icon={TriangleAlert}
              >
                Generation will fail on these. Fix the data, then refresh.
              </Callout>
            ) : checks.minor > 0 ? (
              <Callout
                tone="warning"
                title={`${checks.minor} minor issue${checks.minor === 1 ? "" : "s"} — generation may fall back`}
                icon={TriangleAlert}
              >
                Nothing here stops a run, but the genetic algorithm may not reach a
                conflict-free schedule and hand over to the constraint solver.
              </Callout>
            ) : (
              <Callout tone="success" title="Ready to generate" icon={CheckCircle2}>
                Every course has eligible faculty and a room of the right type, and the grid
                has room for {checks.requiredSessions} of {checks.weeklyCapacity} weekly
                slots.
              </Callout>
            )}

            {dataError && (
              <Callout
                tone="destructive"
                title="Some data could not be loaded"
                icon={TriangleAlert}
              >
                {Object.entries(dataError)
                  .filter(([, message]) => Boolean(message))
                  .map(([source, message]) => `${source}: ${message}`)
                  .join(" · ")}
              </Callout>
            )}

            {studentsError && (
              <Callout tone="warning" title="Students could not be loaded" icon={TriangleAlert}>
                {studentsError} — class size is unknown, so room capacity is not checked.
              </Callout>
            )}
          </div>
        </div>

        {/* ============ Band 3 — engine picker ============ */}
        <SectionCard
          title="Generation engine"
          description="Four engines exist in this codebase. Whichever you pick, every result is validated against the same hard rules before it is saved."
          icon={Dna}
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {ENGINES.map((item) => (
              <AlgorithmCard
                key={item.id}
                id={item.id}
                name={item.name}
                description={item.description}
                icon={item.icon}
                advantages={item.advantages}
                considerations={item.considerations}
                recommended={item.recommended}
                selected={engineId === item.id}
                onSelect={setEngineId}
                disabled={item.id === "ai" && aiDisabled}
                disabledReason={
                  item.id === "ai" && aiDisabled
                    ? "The server reports no Gemini API key, so an AI run would only fall back to the genetic algorithm."
                    : undefined
                }
              />
            ))}
          </div>
        </SectionCard>

        {/* ============ Band 4 — advanced (opened from the launch card) ============ */}
        {advancedOpen && (
          <div className="grid animate-in gap-5 fade-in duration-200 xl:grid-cols-12">
            <SectionCard
              title="Genetic algorithm"
              description="Per-run tunables. The backtracking solver takes none of them."
              icon={SlidersHorizontal}
              className="xl:col-span-7"
            >
              <div className="flex flex-col gap-4">
                {!usesGa && (
                  <p className="text-xs text-muted-foreground">
                    The backtracking solver takes no genetic parameters, so these are
                    disabled while it is selected.
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="ga-seed">Seed</Label>
                    <Input
                      id="ga-seed"
                      type="number"
                      inputMode="numeric"
                      placeholder="random"
                      disabled={!usesGa}
                      value={gaOptions.seed}
                      onChange={(event) =>
                        setGaOptions((current) => ({ ...current, seed: event.target.value }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Same seed and same data reproduce the same timetable.
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="ga-population">Population size</Label>
                    <Input
                      id="ga-population"
                      type="number"
                      inputMode="numeric"
                      min={GA_LIMITS.populationSize.min}
                      max={GA_LIMITS.populationSize.max}
                      placeholder="60"
                      disabled={!usesGa}
                      value={gaOptions.populationSize}
                      onChange={(event) =>
                        setGaOptions((current) => ({
                          ...current,
                          populationSize: event.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Clamped server-side to {GA_LIMITS.populationSize.min}–
                      {GA_LIMITS.populationSize.max}.
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="ga-generations">Max generations</Label>
                    <Input
                      id="ga-generations"
                      type="number"
                      inputMode="numeric"
                      min={GA_LIMITS.maxGenerations.min}
                      max={GA_LIMITS.maxGenerations.max}
                      placeholder="300"
                      disabled={!usesGa}
                      value={gaOptions.maxGenerations}
                      onChange={(event) =>
                        setGaOptions((current) => ({
                          ...current,
                          maxGenerations: event.target.value,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Clamped server-side to {GA_LIMITS.maxGenerations.min}–
                      {GA_LIMITS.maxGenerations.max}.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    Fixed server-side — the generate route drops these from the request
                    body, so they are shown rather than offered:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {GA_FIXED_SETTINGS.map((setting) => (
                      <StatusBadge key={setting.id} variant="neutral">
                        {setting.label}: {setting.value}
                      </StatusBadge>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Optimisation goals"
              description="System configuration, not per-run options: saving writes to the shared configuration, for every department."
              icon={Settings2}
              className="xl:col-span-5"
              actions={
                <Link
                  to="/infrastructure"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Infrastructure &amp; policy
                </Link>
              }
              footer={
                <div className="flex w-full flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveFlags}
                    disabled={!flagsDirty || flagSaving}
                  >
                    {flagSaving ? "Saving…" : "Save to system config"}
                  </Button>
                  {flagsDirty && !flagSaving && (
                    <span className="text-xs text-muted-foreground">Unsaved changes</span>
                  )}
                  {flagError && <span className="text-xs text-destructive">{flagError}</span>}
                </div>
              }
            >
              <div className="flex flex-col gap-4">
                <Callout tone="warning" title="Recorded, not yet enforced" icon={TriangleAlert}>
                  These four flags are stored in the system configuration and returned by{" "}
                  <code>GET /api/config/grid</code>, but no scheduler reads them today.
                  Changing them will not change the timetable the generator produces.
                </Callout>

                <div className="flex flex-col gap-3">
                  {OPTIMIZATION_FLAGS.map((flag) => (
                    <div key={flag.id} className="flex items-start gap-2.5">
                      <Checkbox
                        id={`flag-${flag.id}`}
                        className="mt-0.5"
                        checked={Boolean(flagDraft[flag.id])}
                        onCheckedChange={(checked) =>
                          setFlagDraft((current) => ({
                            ...current,
                            [flag.id]: checked === true,
                          }))
                        }
                      />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <Label htmlFor={`flag-${flag.id}`} className="font-medium">
                          {flag.label}
                        </Label>
                        <span className="text-xs text-muted-foreground">{flag.hint}</span>
                        <span className="text-xs text-warning">{flag.enforcement}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </AppShell>
  );
}
