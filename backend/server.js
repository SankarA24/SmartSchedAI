import "dotenv/config";
import express from "express";
import dbConnect from "./utils/dbConnect.js";
import cors from "cors";

import { coursesRouter } from "./routes/coursesRoute.js";
import { facultyRouter } from "./routes/facultyRoute.js";
import { roomsRouter } from "./routes/roomsRoute.js";
import { timetablesRouter } from "./routes/timetableRoute.js";
import { aiRouter } from "./routes/aiRoute.js";
import { notificationsRouter } from "./routes/notificationsRoute.js";
import { authRouter } from "./routes/authRoute.js";

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});