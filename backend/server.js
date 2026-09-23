import "dotenv/config";
import http from "http";
import express from "express";
import dbConnect from "./utils/dbConnect.js";
import cors from "cors";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";

import { coursesRouter } from "./routes/coursesRoute.js";
import { facultyRouter } from "./routes/facultyRoute.js";
import { roomsRouter } from "./routes/roomsRoute.js";
import { timetablesRouter } from "./routes/timetableRoute.js";
import { aiRouter } from "./routes/aiRoute.js";
import { notificationsRouter } from "./routes/notificationsRoute.js";
import { authRouter } from "./routes/authRoute.js";
import { usersRouter } from "./routes/usersRoute.js";
import { studentsRouter } from "./routes/studentsRoute.js";
import { configRouter } from "./routes/configRoute.js";
import { queriesRouter } from "./routes/queriesRoute.js";

const app = express();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(express.json());

app.use(
  cors({
    origin: CLIENT_ORIGIN,
  })
);

dbConnect();

app.use("/api/courses", coursesRouter);
app.use("/api/faculty", facultyRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/timetables", timetablesRouter);
app.use("/api/ai", aiRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/students", studentsRouter);
app.use("/api/config", configRouter);
app.use("/api/queries", queriesRouter);

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true,
  },
});

// =====================================================
// jwtHandshakeAuth
// Verifies the token sent in the socket handshake with
// JWT_SECRET (same contract as middleware/auth.js) and
// attaches the decoded payload to socket.data.user.
// Rejects the connection when the token is missing or
// invalid.
// =====================================================

function jwtHandshakeAuth(socket, next) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (error) {
    return next(new Error("Invalid or expired token"));
  }
}

io.use(jwtHandshakeAuth);

io.on("connection", (socket) => {
  const user = socket.data.user || {};

  socket.join(`role:${user.role}`);
  socket.join(`user:${user.userId}`);

  socket.on("generation:subscribe", (jobId) => {
    if (socket.data.user.role === "admin") {
      socket.join(`generation:${jobId}`);
    }
  });

  socket.on("generation:unsubscribe", (jobId) => {
    socket.leave(`generation:${jobId}`);
  });
});

app.set("io", io);

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
