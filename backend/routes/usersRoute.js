import { Router } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import User from "../models/User.js";
import Faculty from "../models/Faculty.js";
import Student from "../models/Student.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const usersRouter = Router();

// Admin-only router: user & student-account management.
usersRouter.use(requireAuth);
usersRouter.use(requireRole("admin"));


// =====================================================
// HELPERS
// =====================================================

// Thrown by the link/create helpers below and translated
// to the matching HTTP status by the POST handler.
class RouteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function defaultFacultyAvailability() {
  const weekdaySlots = () => [{ start: "09:00", end: "17:30" }];
  return {
    monday: weekdaySlots(),
    tuesday: weekdaySlots(),
    wednesday: weekdaySlots(),
    thursday: weekdaySlots(),
    friday: weekdaySlots(),
    saturday: [],
    sunday: [],
  };
}

// registerNumber = <DEPTCODE><academicYear><seq>, e.g. "CS2026001".
async function generateRegisterNumber(department, academicYear) {
  const words = String(department || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const deptCode =
    words.length > 1
      ? words.map((w) => w[0].toUpperCase()).join("")
      : (words[0] || "GEN").slice(0, 3).toUpperCase();

  const prefix = `${deptCode}${academicYear}`;

  const existing = await Student.find({
    registerNumber: new RegExp(`^${prefix}`),
  })
    .select("registerNumber")
    .lean();

  let maxSeq = 0;
  for (const s of existing) {
    const num = parseInt(s.registerNumber.slice(prefix.length), 10);
    if (!Number.isNaN(num) && num > maxSeq) {
      maxSeq = num;
    }
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

// Resolve the Faculty doc a new faculty User should link to:
// explicit facultyId > existing Faculty matched by email >
// (if createProfile) a newly created Faculty doc > null.
async function resolveFacultyLink({ facultyId, email, name, createProfile, profile }) {
  if (facultyId) {
    if (!mongoose.Types.ObjectId.isValid(facultyId)) {
      throw new RouteError(400, "Invalid facultyId");
    }
    const faculty = await Faculty.findById(facultyId);
    if (!faculty) {
      throw new RouteError(400, "facultyId does not reference an existing Faculty");
    }
    return faculty;
  }

  const existing = await Faculty.findOne({ email });
  if (existing) return existing;

  if (!createProfile) return null;

  const department = profile?.department;
  if (!department) {
    throw new RouteError(
      400,
      "profile.department is required to create a Faculty profile"
    );
  }

  const faculty = new Faculty({
    name: profile?.name || name,
    email,
    department,
    specialization: profile?.specialization || [],
    maxHoursPerWeek: profile?.maxHoursPerWeek ?? 20,
    availability: profile?.availability || defaultFacultyAvailability(),
  });

  await faculty.save();
  return faculty;
}

// Same as resolveFacultyLink, for Student.
async function resolveStudentLink({ studentId, email, name, createProfile, profile }) {
  if (studentId) {
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      throw new RouteError(400, "Invalid studentId");
    }
    const student = await Student.findById(studentId);
    if (!student) {
      throw new RouteError(400, "studentId does not reference an existing Student");
    }
    return student;
  }

  const existing = await Student.findOne({ email });
  if (existing) return existing;

  if (!createProfile) return null;

  const department = profile?.department;
  const semester = profile?.semester;
  const academicYear = profile?.academicYear;

  if (!department || semester === undefined || semester === null || !academicYear) {
    throw new RouteError(
      400,
      "profile.department, profile.semester and profile.academicYear are required to create a Student profile"
    );
  }

  const registerNumber =
    profile?.registerNumber || (await generateRegisterNumber(department, academicYear));

  const student = new Student({
    name: profile?.name || name,
    email,
    registerNumber,
    department,
    semester,
    year: profile?.year,
    academicYear,
    section: profile?.section || "A",
  });

  await student.save();
  return student;
}


// =====================================================
// GET / — all users (admin management list)
// =====================================================

usersRouter.get("/", async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});


// =====================================================
// POST / — create a user (admin, faculty, or student)
// Optionally auto-links or creates the linked Faculty /
// Student profile.
// =====================================================

usersRouter.post("/", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      facultyId,
      studentId,
      createProfile,
      profile,
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        error: "name, email, password and role are required",
      });
    }

    const normalizedRole = String(role).toLowerCase();
    if (!["admin", "faculty", "student"].includes(normalizedRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        error: "A user with this email already exists",
      });
    }

    let linkedFacultyId = null;
    let linkedStudentId = null;
    let linkedProfile = null;

    if (normalizedRole === "faculty") {
      const faculty = await resolveFacultyLink({
        facultyId,
        email: normalizedEmail,
        name,
        createProfile,
        profile,
      });
      if (faculty) {
        linkedFacultyId = faculty._id.toString();
        linkedProfile = faculty;
      }
    }

    if (normalizedRole === "student") {
      const student = await resolveStudentLink({
        studentId,
        email: normalizedEmail,
        name,
        createProfile,
        profile,
      });
      if (student) {
        linkedStudentId = student._id.toString();
        linkedProfile = student;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: normalizedRole,
      facultyId: linkedFacultyId,
      studentId: linkedStudentId,
    });

    await user.save();

    const { password: _password, ...safeUser } = user.toObject();

    res.status(201).json({ user: safeUser, profile: linkedProfile });
  } catch (error) {
    if (error instanceof RouteError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});


// =====================================================
// PUT /:id — update name / role / links, optionally reset password
// =====================================================

usersRouter.put("/:id", async (req, res) => {
  try {
    const { name, role, facultyId, studentId, resetPassword } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (role !== undefined) {
      const normalizedRole = String(role).toLowerCase();
      if (!["admin", "faculty", "student"].includes(normalizedRole)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      if (user.role === "admin" && normalizedRole !== "admin") {
        const adminCount = await User.countDocuments({ role: "admin" });
        if (adminCount <= 1) {
          return res.status(400).json({
            error: "Cannot change the role of the last admin account",
          });
        }
      }
      user.role = normalizedRole;
    }

    if (name !== undefined) user.name = name;
    if (facultyId !== undefined) user.facultyId = facultyId;
    if (studentId !== undefined) user.studentId = studentId;

    if (resetPassword) {
      user.password = await bcrypt.hash(resetPassword, 10);
    }

    await user.save();

    const { password: _password, ...safeUser } = user.toObject();

    res.json(safeUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});


// =====================================================
// DELETE /:id — remove a user account.
// Refuses to delete yourself or the last remaining admin.
// The linked Faculty / Student profile is left untouched.
// =====================================================

usersRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.userId) {
      return res.status(400).json({
        error: "You cannot delete your own account",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({
          error: "Cannot delete the last admin account",
        });
      }
    }

    await User.findByIdAndDelete(id);

    res.json({ message: "User deleted" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});
