import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import User from "../models/User.js";
import Faculty from "../models/Faculty.js";
import Student from "../models/Student.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();


// =====================================================
// HELPERS
// =====================================================

const isValidObjectId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

// Load the Faculty / Student doc linked to a user.
// Prefers the explicit facultyId / studentId link and
// falls back to matching by email (test users from
// createTestUsers.js leave the link fields null).
async function loadLinkedProfile(user) {
  const email = (user.email || "").toLowerCase().trim();

  if (user.role === "faculty") {
    let faculty = null;
    if (isValidObjectId(user.facultyId)) {
      faculty = await Faculty.findById(user.facultyId).lean();
    }
    if (!faculty && email) {
      faculty = await Faculty.findOne({ email }).lean();
    }
    return faculty ? { type: "faculty", doc: faculty } : null;
  }

  if (user.role === "student") {
    let student = null;
    if (isValidObjectId(user.studentId)) {
      student = await Student.findById(user.studentId).lean();
    }
    if (!student && email) {
      student = await Student.findOne({ email }).lean();
    }
    return student ? { type: "student", doc: student } : null;
  }

  return null;
}

// Build the user object returned to the client (and the
// fields embedded in the JWT). Profile fields are null
// when no linked Faculty / Student doc exists.
async function buildUserPayload(user) {
  const linked = await loadLinkedProfile(user);
  const doc = linked?.doc || null;

  const facultyId =
    user.facultyId ||
    (linked?.type === "faculty" ? doc._id.toString() : null);
  const studentId =
    user.studentId ||
    (linked?.type === "student" ? doc._id.toString() : null);

  return {
    payload: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      facultyId,
      studentId,
      department: doc?.department ?? null,
      semester: doc?.semester ?? null,
      year: doc?.year ?? null,
      academicYear: doc?.academicYear ?? null,
      section: doc?.section ?? null,
    },
    profile: doc,
  };
}


// =====================================================
// LOGIN
// =====================================================

authRouter.post("/login", async (req, res) => {
  try {
    const {
      email,
      password,
      role: selectedRole,
    } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    // Validate selected role
    if (
      selectedRole &&
      !["admin", "faculty", "student"].includes(
        selectedRole.toLowerCase()
      )
    ) {
      return res.status(400).json({
        error: "Invalid role selected",
      });
    }

    // Find user
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // Check password
    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // =================================================
    // CHECK SELECTED ROLE
    // =================================================

    if (
      selectedRole &&
      user.role.toLowerCase() !==
        selectedRole.toLowerCase()
    ) {
      return res.status(403).json({
        error: `This account is registered as ${user.role}. Please select the ${user.role} portal.`,
      });
    }

    // =================================================
    // CREATE JWT
    // =================================================

    const { payload } = await buildUserPayload(user);

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role,
        facultyId: payload.facultyId,
        studentId: payload.studentId,
        name: payload.name,
        email: payload.email,
        department: payload.department,
        semester: payload.semester,
        year: payload.year,
        academicYear: payload.academicYear,
        section: payload.section,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // =================================================
    // SEND RESPONSE
    // =================================================

    res.json({
      message: "Login successful",

      token,

      user: payload,
    });

  } catch (error) {

    console.error("Login error:", error);

    res.status(500).json({
      error: "Login failed",
    });
  }
});


// =====================================================
// ME — refreshed user + linked profile
// =====================================================

authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(401).json({
        error: "User no longer exists",
      });
    }

    const { payload, profile } = await buildUserPayload(user);

    res.json({
      user: payload,
      profile,
    });

  } catch (error) {

    console.error("Fetch current user error:", error);

    res.status(500).json({
      error: "Failed to load current user",
    });
  }
});
