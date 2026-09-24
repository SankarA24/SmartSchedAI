# 📚 Smart Classroom & AI Timetable Scheduler

Smart Classroom & AI Timetable Scheduler is a web-based **MERN stack application** designed to simplify academic timetable and classroom management for higher education institutions.

The system provides separate portals for **Admin, Faculty, and Students** and allows administrators to manage courses, faculty members, classrooms, and timetables through a centralized platform.

The application also includes **AI-assisted timetable generation** and an **AI chatbot** for timetable-related queries.

---

## 📸 Application Screenshots

### Admin Dashboard

![Admin Dashboard](docs/screenshots/admin-dashboard.png)

### Timetable Generation

![Timetable Generation](docs/screenshots/generate-timetable.png)

### Timetable Management

![Timetable Management](docs/screenshots/timetable-management.png)

### Infrastructure & Policy

![Infrastructure and Policy](docs/screenshots/infrastructure.png)

### Course Management

![Course Management](docs/screenshots/course-management.png)

### Faculty Management

![Faculty Management](docs/screenshots/faculty-management.png)

### Room Management

![Room Management](docs/screenshots/room-management.png)

### Faculty Portal

![Faculty Portal](docs/screenshots/faculty-portal.png)

### Student Portal

![Student Portal](docs/screenshots/student-portal.png)

---

## 🚀 Features

### 👨‍💼 Admin Portal

- Admin dashboard
- Course management
- Faculty management
- Classroom/room management
- Timetable management
- AI-assisted timetable generation
- Notification management
- Centralized academic scheduling

### 👨‍🏫 Faculty Portal

- View personal timetable
- View assigned courses
- View notifications
- View profile information
- Access faculty-specific academic information

### 🎓 Student Portal

- View personal timetable
- View courses
- View notifications
- View profile information
- Access student-specific academic information

### 📘 Course Management

- Add courses
- View courses
- Update course information
- Manage course-related academic information

### 👥 Faculty Management

- Add faculty members
- View faculty information
- Update faculty information
- Associate faculty members with courses

### 🏫 Room Management

- Add classrooms
- View available rooms
- Manage classroom information
- Store classroom details for timetable scheduling

### 📅 Timetable Management

- Create and manage timetables
- View timetable schedules
- Display course, faculty, room, day, and time information
- Provide timetable information to Admin, Faculty, and Students

### 🤖 AI-Assisted Timetable Generation

- Generate timetable solutions using AI assistance
- Use course, faculty, room, and scheduling information
- Reduce manual effort involved in timetable preparation

### 🔔 Notifications

- Admin notifications
- Faculty notifications
- Student notifications
- Timetable-related notifications

### 🤖 AI Chatbot

- AI-assisted chatbot interface
- Allows users to ask timetable-related questions
- Provides quick access to timetable information

---

## 🏗️ System Architecture

```text
                 Users
          Admin | Faculty | Student
                     |
                     v
             React.js + Vite
                Frontend
                     |
                REST APIs
                     |
                     v
             Node.js + Express.js
                  Backend
                     |
          +----------+----------+
          |                     |
          v                     v
   Application Logic       AI-Assisted
                           Timetable
                           Generation
          |                     |
          +----------+----------+
                     |
                     v
             MongoDB + Mongoose
```

---

## 🐳 Running the stack with Docker

**There is nothing to configure.** You do not need an API key, you do not need
to create or edit any `.env` file, and you do not need Node or MongoDB
installed. Docker supplies all of it. Four commands and you are looking at the
app.

### Before you start

Install **Docker Desktop** — it includes everything else this needs:

- [Docker Desktop for Mac, Windows or Linux](https://www.docker.com/products/docker-desktop/)

**Then open it and leave it running.** Docker Desktop is an application, not
just a command, and none of the commands below work while it is closed. You will
know it is ready when this prints a version instead of an error:

```bash
docker --version
```

### Bring it up

From the folder containing `docker-compose.yml`:

```bash
docker compose build     # first time only, takes a few minutes
docker compose up -d
```

That starts three services:

| Service    | What it is                     | Address                 |
| ---------- | ------------------------------ | ----------------------- |
| `frontend` | The app, served by nginx       | <http://localhost:8082> |
| `backend`  | The API and live updates       | <http://localhost:8081> |
| `mongo`    | The database, on a named volume| internal only           |

MongoDB is deliberately **not** published to your machine, so it cannot collide
with another MongoDB you may already be running. Its data lives in the
`mongo-data` volume and survives `docker compose down`.

### Seed the database — do not skip this

A fresh database is completely empty: no accounts, no courses, no rooms. Run
these three, in this order:

```bash
docker compose exec backend node createTestUsers.js             # the three logins
docker compose exec backend node seedRealisticData.js           # courses, faculty, rooms
docker compose exec backend node scripts/seedSystemConfig.js    # the timetable grid
```

> **If you skip this, the app will look broken rather than empty.** It loads
> normally, but signing in fails with *"Invalid email or password"* — because
> the account genuinely does not exist yet, not because you mistyped anything.
> If you see that message, run the three commands above and try again.

### Sign in

Open <http://localhost:8082>. All three accounts use the password `123456`:

| Email                        | Role to select |
| ---------------------------- | -------------- |
| `admin@smartscheduler.com`   | Admin          |
| `faculty@smartscheduler.com` | Faculty        |
| `student@smartscheduler.com` | Student        |

> **You must pick the matching role on the sign-in form.** The email and
> password alone are not enough: choosing the wrong role is refused even when
> the credentials are correct. Start with **Admin** — it is the only role that
> can create and generate timetables.

### Optional: fill it with example data

The seeds above give you courses, staff and rooms but no actual schedules, so
the timetable screens start empty. To generate and publish timetables for both
cohorts and add students, notifications and queries:

```bash
docker compose exec backend node scripts/seedDemoData.js
```

Everything it creates goes through the normal API, so it obeys the same rules a
real user would. Re-running it skips what already exists; add
`--reset-generated` to clear the timetables it made and start over.

### Everyday commands

```bash
docker compose logs -f backend     # watch the API logs
docker compose restart backend     # restart one service
docker compose down                # stop everything, keep the data
docker compose down -v             # stop everything and erase the database
```

### If something goes wrong

| What you see | What it means | What to do |
| --- | --- | --- |
| `docker: command not found` | Docker is not installed | Install Docker Desktop from the link above |
| `Cannot connect to the Docker daemon` | Docker is installed but not running | Open the Docker Desktop application and wait for it to finish starting |
| `port is already allocated` | Something else is using 8081 or 8082 | Stop that program, or change the port — see below |
| *"Invalid email or password"* on a correct login | The database was never seeded | Run the three seed commands above |
| *"This account is registered as admin. Please select the admin portal."* | The wrong role is selected on the form | Pick the role it names and sign in again |
| The app loads but every screen is empty | Seeded, but no schedules exist yet | Run the demo data command above, or generate a timetable as Admin |
| A blank page, or data that never arrives | The two ports were changed inconsistently | See *Changing the ports* below |

To see what a service is actually doing, `docker compose logs backend` is almost
always the fastest answer.

### Changing the ports

Only if 8081 or 8082 is already taken. The two are wired together and **cannot
be changed independently**.

The API address is compiled **into** the frontend when the image is built, so it
has to be the address your browser uses, not a name on Docker's internal
network. If you move the API off 8081, change the `VITE_API_URL` build argument
in `docker-compose.yml` and then rebuild:

```bash
docker compose build frontend && docker compose up -d
```

A restart alone will not pick it up.

The backend accepts exactly one browser address. If you move the app off 8082,
change `CLIENT_ORIGIN` to match. Get this wrong and the page loads but never
receives any data, which looks like a broken app rather than a settings
mistake.

### Notes

- On macOS, port **5000 is unusable**: the AirPlay Receiver holds it and replies
  to everything with a 403. That is why this setup uses 8081 and 8082.
- `GOOGLE_API_KEY` is **optional** and empty by default. Without it, timetable
  generation uses the built-in genetic algorithm, which is the normal path and
  needs no external service. A key only adds the AI-assisted generation option
  and the chatbot.
- The `JWT_SECRET` in `docker-compose.yml` is a development placeholder. Set a
  real one before running this anywhere that matters.

### Running without Docker

Only if you would rather not use Docker. This route **does** need setup: Node 22
and a MongoDB instance. Copy `backend/.env.example` to `backend/.env` and
`frontend/.env.example` to `frontend/.env`, adjust the values, then `npm install`
and `npm run dev` in each directory. [`DELIVERABLE.md`](DELIVERABLE.md) has the
longer version, along with the test commands (`npm run verify`, `npm run smoke`)
and the project's known limitations.
