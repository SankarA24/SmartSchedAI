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

    // Who is allowed to see this BROADCAST notification.
    // "all" is visible to every role; the other values scope it to a
    // single portal. It is only consulted when recipientUserId is null.
    audience: {
      type: String,
      enum: ["all", "admin", "faculty", "student"],
      default: "all",
    },

    // When set, the notification is private to this single user
    // (User._id as a string) and `audience` is ignored: the read filter
    // in routes/notificationsRoute.js treats a recipient as EXCLUSIVE,
    // and utils/notify.js emits it to `user:<id>` only — never to a role
    // room. There is no per-user read state, so `isRead` above stays a
    // single shared flag; only per-user notifications can be marked read
    // without affecting somebody else.
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
