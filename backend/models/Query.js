import mongoose from "mongoose";

/**
 * A question raised by a faculty member or a student and answered
 * by an admin. The author is always taken from the authenticated
 * caller (see routes/queriesRoute.js): userId / role / name are
 * never accepted from the request body, so a query can only ever
 * belong to the user who created it.
 */
const QuerySchema = new mongoose.Schema(
  {
    // User._id of the author, stored as a string like the other
    // user links in this codebase (User.facultyId / studentId).
    userId: { type: String, required: true },

    role: {
      type: String,
      enum: ["faculty", "student"],
      required: true,
    },

    // Author's display name, copied at creation time so the admin
    // list needs no join.
    name: { type: String, required: true, trim: true },

    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ["open", "answered"],
      default: "open",
    },

    // Admin's answer. Null until the query is replied to.
    reply: { type: String, default: null },
  },
  { timestamps: true }
);

const Query = mongoose.model("Query", QuerySchema);

export default Query;
