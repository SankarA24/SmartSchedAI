import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "../models/User.js";

export const authRouter = Router();


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

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role,
        facultyId: user.facultyId,
        studentId: user.studentId,
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

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        facultyId: user.facultyId,
        studentId: user.studentId,
      },
    });

  } catch (error) {

    console.error("Login error:", error);

    res.status(500).json({
      error: "Login failed",
    });
  }
});