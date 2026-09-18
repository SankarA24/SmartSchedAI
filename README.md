# 📚 Smart Classroom & AI Timetable Scheduler

Smart Classroom & AI Timetable Scheduler is a web-based **MERN stack application** designed to simplify academic timetable and classroom management for higher education institutions.

The system provides separate portals for **Admin, Faculty, and Students** and allows administrators to manage courses, faculty members, classrooms, and timetables through a centralized platform.

The application also includes **AI-assisted timetable generation** and an **AI chatbot** for timetable-related queries.

---

## 📸 Application Screenshots

### Admin Dashboard

<img width="1878" height="922" alt="Admin Dashboard" src="https://github.com/user-attachments/assets/6e84e2ac-f10f-4896-a203-c8b110168886" />

### Course Management

<img width="1888" height="902" alt="Course Management" src="https://github.com/user-attachments/assets/564d1596-83ea-49f7-ac3a-ccbe5bb9c3be" />

### Faculty Management

<img width="1897" height="910" alt="Faculty Management" src="https://github.com/user-attachments/assets/afe3955a-f8c3-4843-bcb4-d7c34f7a4165" />

### Room Management

<img width="1918" height="908" alt="Room Management" src="https://github.com/user-attachments/assets/1e5d818d-4bcf-44af-b254-ca0fd8330e75" />

### Timetable Management

<img width="1907" height="916" alt="Timetable Management" src="https://github.com/user-attachments/assets/be5e4200-8d7f-4d45-96b2-a14073f32989" />

### Faculty Portal

<img width="1917" height="906" alt="Faculty Portal" src="https://github.com/user-attachments/assets/2baee206-6a8f-4a5c-8051-0eba748eb138" />

### Student Portal

<img width="1905" height="897" alt="Student Portal" src="https://github.com/user-attachments/assets/2f71c22a-ff22-474b-a858-22c57de01878" />

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
