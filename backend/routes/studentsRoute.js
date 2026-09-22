import { Router } from "express";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const studentsRouter = Router();

studentsRouter.use(requireAuth);
const adminOnly = requireRole("admin");
const studentOnly = requireRole("student");

const isValidObjectId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

// Resolve the Student doc linked to the authenticated student user.
// Prefers the explicit studentId on the JWT and falls back to
// matching by email (test users may leave the link field null).
async function loadOwnStudent(req) {
  if (isValidObjectId(req.user?.studentId)) {
    const student = await Student.findById(req.user.studentId);
    if (student) return student;
  }

  const email = (req.user?.email || "").toLowerCase().trim();
  if (email) {
    return Student.findOne({ email });
  }

  return null;
}

// If a User exists with this email, link their studentId to this
// student record. Keeps User.studentId in sync with admin edits.
async function syncUserStudentId(email, studentId) {
  if (!email) return;
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (user && user.studentId !== String(studentId)) {
    user.studentId = String(studentId);
    await user.save();
  }
}


// =====================================================
// SELF-SERVICE (must be defined before "/:id")
// =====================================================

studentsRouter.get("/me", studentOnly, async (req, res) => {
  try {
    const student = await loadOwnStudent(req);
    if (!student) {
      return res.status(404).json({ error: "Student profile not found" });
    }
    res.json(student);
  } catch (error) {
    console.error("Error fetching own student profile:", error);
    res.status(500).json({ error: "Failed to fetch student profile" });
  }
});


studentsRouter.put("/me", studentOnly, async (req, res) => {
  try {
    const student = await loadOwnStudent(req);
    if (!student) {
      return res.status(404).json({ error: "Student profile not found" });
    }

    // A student may change only phone and section.
    const { phone, section } = req.body || {};
    if (phone !== undefined) student.phone = phone;
    if (section !== undefined) student.section = section;

    await student.save();
    res.json(student);
  } catch (error) {
    console.error("Error updating own student profile:", error);
    res.status(500).json({ error: "Failed to update student profile" });
  }
});


// =====================================================
// ADMIN CRUD
// =====================================================

studentsRouter.get("/", adminOnly, async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});


studentsRouter.get("/:id", adminOnly, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(student);
  } catch (error) {
    console.error("Error fetching student:", error);
    res.status(500).json({ error: "Failed to fetch student" });
  }
});


studentsRouter.post("/", adminOnly, async (req, res) => {
  try {
    const student = new Student(req.body);
    await student.save();
    await syncUserStudentId(student.email, student._id);
    res.status(201).json(student);
  } catch (error) {
    console.error("Error creating student:", error);
    res.status(500).json({ error: "Failed to create student" });
  }
});


studentsRouter.put("/:id", adminOnly, async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    await syncUserStudentId(student.email, student._id);
    res.json(student);
  } catch (error) {
    console.error("Error updating student:", error);
    res.status(500).json({ error: "Failed to update student" });
  }
});


studentsRouter.delete("/:id", adminOnly, async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting student:", error);
    res.status(500).json({ error: "Failed to delete student" });
  }
});
