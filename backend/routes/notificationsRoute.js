import { Router } from "express";
import Notification from "../models/Notification.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createAndEmit } from "../utils/notify.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
const adminOnly = requireRole("admin");


// Only the notifications this caller is allowed to see.
//
// `recipientUserId` is EXCLUSIVE, not additive: a notification addressed to
// one user is readable by that user and by nobody else. The earlier version
// of this filter ORed a bare `{audience: role}` clause alongside the
// recipient clause, so a private notification carrying, say, an admin's
// answer to one faculty member's query still matched for every other faculty
// member. The two clauses below are therefore mutually exclusive:
//
//   1. addressed to me      -> recipientUserId === my user id
//   2. a broadcast          -> no recipient at all, and an audience of
//                              "all" or of my own role
//
// Clause 2 also matches documents written before `recipientUserId` existed,
// because Mongo's `field: null` matches a missing field as well as a null one.
function audienceFilter(user) {
  const role = String(user?.role || "").toLowerCase();
  const audiences = role ? ["all", role] : ["all"];
  const broadcast = { recipientUserId: null, audience: { $in: audiences } };

  if (!user?.userId) {
    return broadcast;
  }

  return { $or: [{ recipientUserId: String(user.userId) }, broadcast] };
}


// Shared by PUT /:id/read and its PATCH /:id alias.
async function markAsRead(req, res) {
  try {
    // Scoped by audience as well as by id: a notification the
    // caller is not an audience for must 404 here exactly as it
    // is absent from GET /, instead of being flipped and echoed.
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...audienceFilter(req.user) },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
}


notificationsRouter.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find(audienceFilter(req.user));
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});


notificationsRouter.post("/", adminOnly, async (req, res) => {
  try {
    const { title, message, type, audience, recipientUserId, relatedTimetableId } =
      req.body || {};

    const notification = await createAndEmit(req.app, {
      title,
      message,
      type,
      audience,
      recipientUserId,
      relatedTimetableId,
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({ error: "Failed to create notification" });
  }
});


notificationsRouter.put("/:id/read", markAsRead);

// Alias: the faculty portal marks a notification read with PATCH /:id.
notificationsRouter.patch("/:id", markAsRead);


notificationsRouter.delete("/:id", adminOnly, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});
