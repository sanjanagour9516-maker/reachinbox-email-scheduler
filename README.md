# ReachInbox Email Scheduler

A production-grade full-stack **Email Scheduler Service & Dashboard** built as a monorepo with **Node.js, Express, TypeScript, MongoDB, BullMQ, Redis, Nodemailer (Ethereal)**, and a **React + Vite + Tailwind CSS** dark-mode dashboard.

---

## Architecture Overview

1. **Zero Cron Polling:** Uses BullMQ delayed jobs (`delay = Math.max(0, scheduledAt - Date.now())`) backed by Redis sorted sets.
2. **Restart Survival & Startup Reconciliation (`recoverPendingJobs`):** Connects to MongoDB first and re-queues any `SCHEDULED` emails missing from BullMQ on startup using their MongoDB `_id` as `jobId`.
3. **Idempotency:** BullMQ `jobId` equals `emailJob._id.toString()`, and the worker skips any document already marked `SENT`.
4. **Ethereal Email Delivery:** Sends via `smtp.ethereal.email` (port `587`) and saves `nodemailer.getTestMessageUrl(info)` as `previewUrl`.

---

## Local Setup

### 1. Backend (`backend/`)

```bash
cd backend
npm install
copy .env.example .env
```

Fill in `backend/.env`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/email-scheduler
REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379
ETHEREAL_USER=your_ethereal_user@ethereal.email
ETHEREAL_PASS=your_ethereal_pass
FRONTEND_URL=http://localhost:5173
```

Run in dev or production mode:

```bash
npm run dev      # tsx watch server.ts
# or
npm run build && npm start
```

### 2. Frontend (`frontend/`)

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`.
