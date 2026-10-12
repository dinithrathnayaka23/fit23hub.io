<div align="center">

# FIT23Hub

**A study platform for Batch 23 of the Faculty of Information Technology, University of Moratuwa.**

</div>

---

## Overview

FIT23Hub brings everything a batch needs for the semester into one place, instead of scattering it
across group chats.

**For students**

- **Materials library**: notes, slides, lab sheets and past papers, searchable and filtered by module and semester
- **Recordings**: recorded Kuppi sessions, grouped by semester
- **Kuppi Live**: upcoming and live sessions with one-click join
- **AI study assistant**: upload your PDFs and ask questions; answers come from your own notes, with citations
- **Announcements**: deadlines and exam dates with a live countdown
- **Notifications** and a **profile** page

**For admins**

- Manage students, materials, recordings and live sessions
- Publish announcements and see who has acknowledged them

Sign-in is restricted to `@uom.lk` email addresses and requires email verification. Users have one
of three roles: student, admin or super admin.

## Tech stack

| | |
|---|---|
| **Frontend** | Next.js, React, TypeScript, Tailwind CSS |
| **Backend** | Node.js, Express |
| **Database** | PostgreSQL with Prisma |
| **AI** | Groq and Google Gemini |

## Running the project

### Prerequisites

- Node.js 20 or newer
- PostgreSQL (Docker is the easiest way to run it)

### 1. Clone and install

```bash
git clone https://github.com/dinithrathnayaka23/fit23hub.io.git
cd fit23hub.io

cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Start a database

```bash
docker run --name fit23hub-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fit23hub \
  -p 5432:5432 -d postgres:16
```

### 3. Configure the backend

```bash
cd backend
cp .env.example .env
```

In `backend/.env`, set at least:

- `DATABASE_URL` and `DIRECT_URL`: your PostgreSQL connection string
- `JWT_SECRET`: a long random string
- `SUPER_ADMIN_EMAIL`: your email, to own the admin account
- `GROQ_API_KEY` and `GEMINI_API_KEY`: to enable the AI assistant

### 4. Create the database tables

```bash
npm run prisma:push
```

### 5. Configure the frontend

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

### 6. Start the app

```bash
# terminal 1
cd backend && npm run dev     # http://localhost:4000

# terminal 2
cd frontend && npm run dev    # http://localhost:3000
```

Open http://localhost:3000.

## Project structure

```
fit23hub.io/
├─ backend/     # Express API, Prisma schema, AI logic
└─ frontend/    # Next.js app: student dashboard and admin console
```

---

<div align="center">

**Built for Batch 23, Faculty of Information Technology, University of Moratuwa.**

Maintained by [@dinithrathnayaka23](https://github.com/dinithrathnayaka23)

</div>
