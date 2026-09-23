import { Router } from "express";
import mongoose from "mongoose";

import Query from "../models/Query.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createAndEmit } from "../utils/notify.js";

export const queriesRouter = Router();

queriesRouter.use(requireAuth);

const adminOnly = requireRole("admin");
const authorsOnly = requireRole("faculty", "student");


// =====================================================
// HELPERS
// =====================================================

const isValidObjectId = (id) =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

// Which queries this caller may read. An admin sees every query;
// everyone else sees only the ones they raised themselves, so a
// faculty member or student can never read someone else's.
function scopeFilter(user) {
  const role = String(user?.role || "").toLowerCase();

  if (role === "admin") {
    return {};
  }

  return { userId: String(user?.userId || "") };
}

// The author's display name. The JWT carries `name` since Phase 5;
// older tokens fall back to the email before the schema's required
// check would reject the query.
function authorName(user) {
  return user?.name || user?.email || "Unknown user";
}


// =====================================================
// CREATE  (faculty and student raise their own query)
// =====================================================

queriesRouter.post("/", authorsOnly, async (req, res) => {
  try {
    const { subject, message } = req.body || {};

    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ error: "Subject is required" });
    }
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Identity comes from the token only: a caller cannot file a
    // query in another user's name by posting userId / role / name.
    const query = await new Query({
      userId: String(req.user.userId),
      role: String(req.user.role).toLowerCase(),
      name: authorName(req.user),
      subject: String(subject).trim(),
      message: String(message).trim(),
    }).save();

    res.status(201).json(query);
  } catch (error) {
    console.error("Error creating query:", error);
    res.status(500).json({ error: "Failed to create query" });
  }
});


// =====================================================
// LIST  (admin: all; faculty / student: own only)
// =====================================================

queriesRouter.get("/", async (req, res) => {
  try {
    const queries = await Query.find(scopeFilter(req.user)).sort({
      createdAt: -1,
    });
    res.json(queries);
  } catch (error) {
    console.error("Error fetching queries:", error);
    res.status(500).json({ error: "Failed to fetch queries" });
  }
});


// =====================================================
// REPLY  (admin only)
// =====================================================

queriesRouter.put("/:id/reply", adminOnly, async (req, res) => {
  try {
    const { reply } = req.body || {};

    if (!reply || !String(reply).trim()) {
      return res.status(400).json({ error: "Reply is required" });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: "Query not found" });
    }

    const query = await Query.findByIdAndUpdate(
      req.params.id,
      { reply: String(reply).trim(), status: "answered" },
      { new: true }
    );

    if (!query) {
      return res.status(404).json({ error: "Query not found" });
    }

    // Tell the AUTHOR, and only the author, on their portal and live over
    // the socket. The notification is addressed by `recipientUserId` alone —
    // deliberately no `audience: query.role`, which would have matched the
    // role clause of the read filter for every other faculty member or
    // student and handed them this query's subject and the full answer.
    // `audienceFilter` in routes/notificationsRoute.js treats a notification
    // that has a recipient as private to that recipient, and utils/notify.js
    // emits it to `user:<id>` only, never to a role room.
    await createAndEmit(req.app, {
      title: "Your query has been answered",
      message: `Admin replied to "${query.subject}": ${query.reply}`,
      type: "info",
      recipientUserId: String(query.userId),
    });

    res.json(query);
  } catch (error) {
    console.error("Error replying to query:", error);
    res.status(500).json({ error: "Failed to reply to query" });
  }
});

export default queriesRouter;
