import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    registerNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    department: {
      type: String,
      required: true,
    },

    semester: {
      type: Number,
      required: true,
    },

    academicYear: {
      type: Number,
      required: true,
    },

    section: {
      type: String,
      default: "A",
    },

    year: {
      type: Number,
      min: 1,
      max: 4,
    },

    phone: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Student = mongoose.model("Student", StudentSchema);

export default Student;