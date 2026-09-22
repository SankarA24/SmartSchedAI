import dotenv from "dotenv";
import bcrypt from "bcryptjs";

import dbConnect from "./utils/dbConnect.js";
import User from "./models/User.js";
import Faculty from "./models/Faculty.js";
import Student from "./models/Student.js";

dotenv.config({ quiet: true });

const FULL_WEEK_AVAILABILITY = {
  monday: [{ start: "09:00", end: "17:30" }],
  tuesday: [{ start: "09:00", end: "17:30" }],
  wednesday: [{ start: "09:00", end: "17:30" }],
  thursday: [{ start: "09:00", end: "17:30" }],
  friday: [{ start: "09:00", end: "17:30" }],
  saturday: [],
  sunday: [],
};

const createUsers = async () => {
  try {
    await dbConnect();

    const password = await bcrypt.hash("123456", 10);

    const users = [
      {
        name: "Admin",
        email: "admin@smartscheduler.com",
        password,
        role: "admin",
      },

      {
        name: "Dr John",
        email: "faculty@smartscheduler.com",
        password,
        role: "faculty",
      },

      {
        name: "Sankar Student",
        email: "student@smartscheduler.com",
        password,
        role: "student",
      },
    ];

    for (const userData of users) {
      const existingUser = await User.findOne({
        email: userData.email,
      });

      if (existingUser) {
        console.log(`User already exists: ${userData.email}`);
        continue;
      }

      const user = new User(userData);

      await user.save();

      console.log(`Created user: ${userData.email}`);
    }

    console.log("Test users setup completed.");

    // Link the faculty test user to a Faculty profile doc.
    const facultyDoc = await Faculty.findOneAndUpdate(
      { email: "faculty@smartscheduler.com" },
      {
        email: "faculty@smartscheduler.com",
        name: "Dr John",
        department: "Computer Science",
        specialization: [
          "Programming",
          "Data Structures",
          "Algorithms",
          "Database Systems",
        ],
        maxHoursPerWeek: 20,
        availability: FULL_WEEK_AVAILABILITY,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`Faculty profile upserted: ${facultyDoc.email}`);

    const facultyUser = await User.findOne({ email: "faculty@smartscheduler.com" });

    if (facultyUser && !facultyUser.facultyId) {
      facultyUser.facultyId = facultyDoc._id.toString();
      await facultyUser.save();
      console.log(`Linked facultyId for user: ${facultyUser.email}`);
    } else if (facultyUser) {
      console.log(`facultyId already set for user: ${facultyUser.email} (skipped)`);
    }

    // Link the student test user to a Student profile doc.
    const studentDoc = await Student.findOneAndUpdate(
      { email: "student@smartscheduler.com" },
      {
        registerNumber: "CS2026001",
        email: "student@smartscheduler.com",
        name: "Sankar Student",
        department: "Computer Science",
        semester: 1,
        year: 1,
        academicYear: 2026,
        section: "A",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`Student profile upserted: ${studentDoc.email}`);

    const studentUser = await User.findOne({ email: "student@smartscheduler.com" });

    if (studentUser && !studentUser.studentId) {
      studentUser.studentId = studentDoc._id.toString();
      await studentUser.save();
      console.log(`Linked studentId for user: ${studentUser.email}`);
    } else if (studentUser) {
      console.log(`studentId already set for user: ${studentUser.email} (skipped)`);
    }

    process.exit(0);

  } catch (error) {
    console.error("Error creating test users:", error);
    process.exit(1);
  }
};

createUsers();