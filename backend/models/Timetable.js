import mongoose from "mongoose";

const ScheduleEntrySchema = new mongoose.Schema(
  {
    courseId: { type: String, required: true },
    facultyId: { type: String, required: true },
    roomId: { type: String, required: true },
    day: {
      type: String,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      required: true,
    },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { _id: false }
);

const FitnessHistoryEntrySchema = new mongoose.Schema(
  {
    generation: { type: Number },
    best: { type: Number },
    average: { type: Number },
  },
  { _id: false }
);

const TimetableSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    semester: { type: String, required: true },
    year: { type: Number, required: true },
    academicYear: { type: Number },
    department: { type: String, required: true },
    schedule: [ScheduleEntrySchema],
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
    publishedAt: { type: Date },
    conflicts: [
      {
        type: { type: String, required: true },
        message: { type: String, required: true },
        entries: [{ type: String }],
        severity: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
        resolved: { type: Boolean, default: false },
        resolvedBy: { type: String },
        resolvedAt: { type: Date },
        resolutionNote: { type: String },
      },
    ],
    comments: [
      {
        userId: { type: String },
        name: { type: String },
        role: { type: String },
        text: { type: String },
        createdAt: { type: Date },
      },
    ],
    metadata: {
      totalHours: { type: Number, default: 0 },
      utilizationRate: { type: Number, default: 0 },
      conflictCount: { type: Number, default: 0 },
      generationMethod: { type: String },
      seed: { type: Number },
      generations: { type: Number },
      populationSize: { type: Number },
      bestFitness: { type: Number },
      hardViolations: { type: Number },
      softPenalty: { type: Number },
      fitnessHistory: [FitnessHistoryEntrySchema],
      qualityScore: { type: Number },
      qualityBreakdown: {
        constraintCompliance: { type: Number },
        roomUtilization: { type: Number },
        facultyBalance: { type: Number },
        studentConvenience: { type: Number },
      },
      jobId: { type: String },
    },
  },
  { timestamps: true }
);

TimetableSchema.index({ department: 1, semester: 1, year: 1, academicYear: 1, status: 1 });

const Timetable = mongoose.model("Timetable", TimetableSchema);
export default Timetable;
