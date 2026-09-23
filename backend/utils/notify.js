// backend/utils/notify.js
//
// Single place where a Notification is created and pushed out live.
// Everything that used to do `new Notification({...}).save()` should
// call createAndEmit instead, so the audience scoping and the socket
// broadcast stay in sync.

import Notification from "../models/Notification.js";

/**
 * The role rooms every authenticated socket joins (see server.js).
 * An audience of "all" fans out to each of them.
 */
const ROLE_ROOMS = ["admin", "faculty", "student"];


/**
 * Saves a notification and, when a socket.io instance is available on the
 * Express app (`app.set("io", io)`), emits it as a "notification" event to:
 *   - `user:<recipientUserId>` ALONE when the notification targets one user;
 *   - otherwise `role:<audience>`, or every role room when audience is "all".
 *
 * The live push mirrors the read filter in routes/notificationsRoute.js: a
 * notification with a recipient is private to that recipient, so it must not
 * also be fanned out to the whole role room (which used to hand every faculty
 * member the admin's private answer to one colleague's query).
 *
 * `app` may be null/undefined and `io` may be missing, so scripts and the
 * local schedulers can use this without an HTTP server running.
 *
 * @param {import("express").Application|null} app
 * @param {{title: string, message: string, type: string, audience?: string,
 *          recipientUserId?: string|null, relatedTimetableId?: string|null}} payload
 * @returns {Promise<object>} the saved Notification document
 */
export async function createAndEmit(
  app,
  {
    title,
    message,
    type,
    audience = "all",
    recipientUserId = null,
    relatedTimetableId = null,
  } = {}
) {
  const notification = await new Notification({
    title,
    message,
    type,
    audience,
    recipientUserId,
    relatedTimetableId,
  }).save();

  const io = typeof app?.get === "function" ? app.get("io") : null;
  if (!io) {
    return notification;
  }

  // A recipient makes the notification private: emit to that one user's room
  // and to no role room at all.
  const rooms = notification.recipientUserId
    ? [`user:${notification.recipientUserId}`]
    : notification.audience === "all"
      ? ROLE_ROOMS.map((role) => `role:${role}`)
      : [`role:${notification.audience}`];

  const event = notification.toObject ? notification.toObject() : notification;

  try {
    for (const room of rooms) {
      io.to(room).emit("notification", event);
    }
  } catch (error) {
    // A broadcast failure must never lose a notification that is already saved.
    console.error("Error emitting notification:", error);
  }

  return notification;
}

export default createAndEmit;
