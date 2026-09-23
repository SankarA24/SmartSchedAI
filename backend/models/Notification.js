import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["info", "warning", "error", "success"],
      required: true,
    },
    isRead: { type: Boolean, default: false },

    // Who is allowed to see this notification.
    // "all" is visible to every role; the other values scope it to
    // a single portal. A per-user notification also sets recipientUserId.
    audience: {
      type: String,
      enum: ["all", "admin", "faculty", "student"],
      default: "all",
    },

    // When set, the notification is addressed to this single user
    // (User._id as a string) in addition to the audience rule.
    recipientUserId: { type: String, default: null },

    // Optional link back to the timetable the notification is about.
    relatedTimetableId: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const Notification = mongoose.model("Notification", NotificationSchema);

export default Notification;
