import dotenv from "dotenv";
dotenv.config();

import dbConnect from "./utils/dbConnect.js";

import Course from "./models/course.js";
import Faculty from "./models/Faculty.js";
import Room from "./models/Room.js";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

const FULL_DAY = {
  monday: [{ start: "09:00", end: "17:30" }],
  tuesday: [{ start: "09:00", end: "17:30" }],
  wednesday: [{ start: "09:00", end: "17:30" }],
  thursday: [{ start: "09:00", end: "17:30" }],
  friday: [{ start: "09:00", end: "17:30" }],
};

const availability = (overrides = {}) => ({
  ...FULL_DAY,
  ...overrides,
  saturday: [],
  sunday: [],
});

const courses = [
  {
    name: "Java Programming",
    code: "CS301",
    department: "Computer Science",
    credits: 4,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "Object-oriented programming using Java",
    duration: 13,
    prerequisites: ["Programming Fundamentals"],
    type: "lecture",
    hoursPerWeek: 3,
  },
  {
    name: "Database Management System",
    code: "CS302",
    department: "Computer Science",
    credits: 4,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "Database design, SQL and database management",
    duration: 13,
    prerequisites: [],
    type: "lecture",
    hoursPerWeek: 3,
  },
  {
    name: "Data Structures",
    code: "CS303",
    department: "Computer Science",
    credits: 4,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "Arrays, linked lists, stacks, queues, trees and graphs",
    duration: 13,
    prerequisites: ["C Programming"],
    type: "lecture",
    hoursPerWeek: 3,
  },
  {
    name: "Compiler Design",
    code: "CS304",
    department: "Computer Science",
    credits: 3,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "Lexical analysis, parsing and compiler construction",
    duration: 13,
    prerequisites: ["Data Structures"],
    type: "lecture",
    hoursPerWeek: 3,
  },
  {
    name: "C Programming",
    code: "CS305",
    department: "Computer Science",
    credits: 4,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "Programming fundamentals using C",
    duration: 13,
    prerequisites: [],
    type: "lecture",
    hoursPerWeek: 3,
  },
  {
    name: "Operating Systems",
    code: "CS306",
    department: "Computer Science",
    credits: 4,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "Processes, memory management, scheduling and file systems",
    duration: 13,
    prerequisites: ["Data Structures"],
    type: "lecture",
    hoursPerWeek: 3,
  },
  {
    name: "Computer Networks",
    code: "CS307",
    department: "Computer Science",
    credits: 4,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "Computer networking, protocols and network architecture",
    duration: 13,
    prerequisites: [],
    type: "lecture",
    hoursPerWeek: 3,
  },
  {
    name: "Web Technologies",
    code: "CS308",
    department: "Computer Science",
    credits: 3,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "HTML, CSS, JavaScript and modern web development",
    duration: 13,
    prerequisites: ["Programming Fundamentals"],
    type: "lecture",
    hoursPerWeek: 3,
  },
  {
    name: "Programming Lab",
    code: "CS309",
    department: "Computer Science",
    credits: 2,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "Practical programming laboratory",
    duration: 13,
    prerequisites: [],
    type: "lab",
    hoursPerWeek: 2,
  },
  {
    name: "Database Lab",
    code: "CS310",
    department: "Computer Science",
    credits: 2,
    semester: 1,
    year: 1,
    academicYear: 2026,
    description: "Practical SQL and database laboratory",
    duration: 13,
    prerequisites: ["Database Management System"],
    type: "lab",
    hoursPerWeek: 2,
  },
];

const faculty = [
  {
    name: "Dr John",
    email: "john@college.edu",
    department: "Computer Science",
    specialization: ["Java Programming"],
    availability: availability({
      wednesday: [{ start: "09:00", end: "15:15" }],
    }),
    maxHoursPerWeek: 20,
    preferences: {
      preferredTimeSlots: ["09:00-10:00", "10:00-11:00"],
      avoidTimeSlots: [],
    },
  },
  {
    name: "Ms Priya",
    email: "priya@college.edu",
    department: "Computer Science",
    specialization: ["Database Management System", "Database Systems"],
    availability: availability({
      friday: [{ start: "09:00", end: "15:15" }],
    }),
    maxHoursPerWeek: 20,
    preferences: {
      preferredTimeSlots: ["10:00-11:00", "11:15-12:15"],
      avoidTimeSlots: [],
    },
  },
  {
    name: "Mr Ram",
    email: "ram@college.edu",
    department: "Computer Science",
    specialization: ["Compiler Design"],
    availability: availability({
      monday: [{ start: "10:00", end: "17:30" }],
    }),
    maxHoursPerWeek: 20,
    preferences: {
      preferredTimeSlots: [],
      avoidTimeSlots: ["09:00-10:00"],
    },
  },
  {
    name: "Dr Paul",
    email: "paul@college.edu",
    department: "Computer Science",
    specialization: ["C Programming", "Data Structures"],
    availability: availability({
      tuesday: [{ start: "09:00", end: "17:30" }],
      thursday: [{ start: "09:00", end: "15:15" }],
    }),
    maxHoursPerWeek: 20,
    preferences: {
      preferredTimeSlots: ["09:00-10:00"],
      avoidTimeSlots: [],
    },
  },
  {
    name: "Dr Kumar",
    email: "kumar@college.edu",
    department: "Computer Science",
    specialization: ["Operating Systems"],
    availability: availability({
      monday: [{ start: "09:00", end: "15:15" }],
      wednesday: [{ start: "09:00", end: "17:30" }],
    }),
    maxHoursPerWeek: 20,
    preferences: {
      preferredTimeSlots: ["11:15-12:15"],
      avoidTimeSlots: [],
    },
  },
  {
    name: "Ms Anitha",
    email: "anitha@college.edu",
    department: "Computer Science",
    specialization: ["Computer Networks"],
    availability: availability({
      tuesday: [{ start: "10:00", end: "17:30" }],
      thursday: [{ start: "09:00", end: "17:30" }],
    }),
    maxHoursPerWeek: 20,
    preferences: {
      preferredTimeSlots: [],
      avoidTimeSlots: ["09:00-10:00"],
    },
  },
  {
    name: "Mr Arun",
    email: "arun@college.edu",
    department: "Computer Science",
    specialization: ["Web Technologies", "Web Development"],
    availability: availability({
      wednesday: [{ start: "09:00", end: "17:30" }],
      friday: [{ start: "09:00", end: "17:30" }],
    }),
    maxHoursPerWeek: 20,
    preferences: {
      preferredTimeSlots: ["14:15-15:15"],
      avoidTimeSlots: [],
    },
  },
  {
    name: "Dr Meena",
    email: "meena@college.edu",
    department: "Computer Science",
    specialization: [
      "Programming",
      "Database Systems",
      "Database Management System",
    ],
    availability: availability({
      monday: [{ start: "09:00", end: "17:30" }],
      thursday: [{ start: "10:00", end: "17:30" }],
    }),
    maxHoursPerWeek: 20,
    preferences: {
      preferredTimeSlots: ["15:15-16:15"],
      avoidTimeSlots: [],
    },
  },
];

const rooms = [
  {
    name: "C101",
    building: "Main Block",
    floor: 1,
    capacity: 60,
    type: "lecture_hall",
    equipment: ["Projector", "Smart Board"],
    availability: FULL_DAY,
  },
  {
    name: "C102",
    building: "Main Block",
    floor: 1,
    capacity: 60,
    type: "lecture_hall",
    equipment: ["Projector"],
    availability: FULL_DAY,
  },
  {
    name: "C103",
    building: "Main Block",
    floor: 1,
    capacity: 60,
    type: "lecture_hall",
    equipment: ["Projector", "Audio System"],
    availability: FULL_DAY,
  },
  {
    name: "C104",
    building: "Main Block",
    floor: 1,
    capacity: 50,
    type: "lecture_hall",
    equipment: ["Projector"],
    availability: FULL_DAY,
  },
  {
    name: "Lab-1",
    building: "Computer Science Block",
    floor: 2,
    capacity: 40,
    type: "lab",
    equipment: ["Computers", "Projector", "Internet"],
    availability: FULL_DAY,
  },
  {
    name: "Lab-2",
    building: "Computer Science Block",
    floor: 2,
    capacity: 40,
    type: "lab",
    equipment: ["Computers", "Projector", "Internet"],
    availability: FULL_DAY,
  },
];

async function seedData() {
  try {
    await dbConnect();

    console.log("\n=== SEEDING REALISTIC COLLEGE DATA ===\n");

    // Upsert courses
    for (const course of courses) {
      await Course.findOneAndUpdate(
        { code: course.code },
        course,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log(`✅ Courses processed: ${courses.length}`);

    // Upsert faculty
    for (const member of faculty) {
      await Faculty.findOneAndUpdate(
        { email: member.email },
        member,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log(`✅ Faculty processed: ${faculty.length}`);

    // Upsert rooms
    for (const room of rooms) {
      await Room.findOneAndUpdate(
        { name: room.name },
        room,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log(`✅ Rooms processed: ${rooms.length}`);

    console.log("\n=== SEEDING COMPLETED SUCCESSFULLY ===");
    console.log("Courses:", courses.length);
    console.log("Faculty:", faculty.length);
    console.log("Rooms:", rooms.length);

    process.exit(0);

  } catch (error) {
    console.error("\n❌ SEEDING FAILED:");
    console.error(error);
    process.exit(1);
  }
}

seedData();