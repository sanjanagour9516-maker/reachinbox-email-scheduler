import "dotenv/config";

import http from "http";
import express, { Request, Response } from "express";
import mongoose from "mongoose";
import cors from "cors";

import EmailJob from "./src/models/EmailJob";
import { getRedisConnection, isRedisConfigured } from "./src/config/redis";
import {
  scheduleEmailJob,
  cancelScheduledJob,
  recoverPendingJobs,
  getWorkerStatus,
  closeQueueResources,
} from "./src/queue/emailQueue";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_STATUSES = ["SCHEDULED", "SENT", "FAILED"] as const;

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((origin) => origin.trim())
  : [];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
        callback(null, true);
        return;
      }
      if (
        allowedOrigins.includes(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req: Request, res: Response) => {
  const mongoStates: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  let redisStatus = "local-fallback";
  const redisConn = getRedisConnection();

  if (redisConn) {
    redisStatus = redisConn.status || "unknown";
    try {
      const pong = await redisConn.ping();
      if (pong === "PONG") {
        redisStatus = "ready";
      }
    } catch {
      redisStatus = "error";
    }
  }

  const worker = getWorkerStatus();
  const mongoStatus = mongoStates[mongoose.connection.readyState] || "unknown";

  res.status(200).json({
    status: "ok",
    mongodb: mongoStatus,
    redis: redisStatus,
    worker,
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/emails/schedule", async (req: Request, res: Response) => {
  try {
    const { to, subject, body, scheduledAt } = req.body || {};

    if (!to || typeof to !== "string" || !EMAIL_REGEX.test(to.trim())) {
      res.status(400).json({
        error: "A valid recipient email address ('to') is required.",
      });
      return;
    }

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      res.status(400).json({
        error: "Email subject ('subject') is required.",
      });
      return;
    }

    if (!body || typeof body !== "string" || !body.trim()) {
      res.status(400).json({
        error: "Email body ('body') is required.",
      });
      return;
    }

    if (!scheduledAt) {
      res.status(400).json({
        error: "Scheduled date/time ('scheduledAt') is required.",
      });
      return;
    }

    const parsedDate = new Date(scheduledAt);
    if (Number.isNaN(parsedDate.getTime())) {
      res.status(400).json({
        error: "Invalid 'scheduledAt' timestamp. Provide a valid ISO-8601 date string.",
      });
      return;
    }

    const emailJob = new EmailJob({
      to: to.trim(),
      subject: subject.trim(),
      body: body.trim(),
      scheduledAt: parsedDate,
      status: "SCHEDULED",
    });

    emailJob.jobId = emailJob._id.toString();
    await emailJob.save();

    try {
      await scheduleEmailJob(emailJob);
    } catch (queueErr) {
      const message = queueErr instanceof Error ? queueErr.message : String(queueErr);
      await EmailJob.findByIdAndUpdate(emailJob._id, {
        $set: {
          status: "FAILED",
          error: `Failed to enqueue job: ${message}`,
        },
      });
      res.status(500).json({
        error: "Email saved to database, but failed to schedule delivery.",
        details: message,
      });
      return;
    }

    res.status(201).json(emailJob);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API] Error scheduling email:", err);
    res.status(500).json({
      error: "Failed to schedule email.",
      details: message,
    });
  }
});

app.get("/api/emails", async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const filter: Record<string, unknown> = {};

    if (status !== undefined && status !== "") {
      const normalizedStatus = String(status).toUpperCase();
      if (!ALLOWED_STATUSES.includes(normalizedStatus as (typeof ALLOWED_STATUSES)[number])) {
        res.status(400).json({
          error: `Invalid status filter. Allowed values: ${ALLOWED_STATUSES.join(", ")}`,
        });
        return;
      }
      filter.status = normalizedStatus;
    }

    const [emails, scheduled, sent, failed] = await Promise.all([
      EmailJob.find(filter).sort({ scheduledAt: -1 }).lean(),
      EmailJob.countDocuments({ status: "SCHEDULED" }),
      EmailJob.countDocuments({ status: "SENT" }),
      EmailJob.countDocuments({ status: "FAILED" }),
    ]);

    res.status(200).json({
      count: emails.length,
      counts: {
        scheduled,
        sent,
        failed,
        total: scheduled + sent + failed,
      },
      emails,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API] Error fetching emails:", err);
    res.status(500).json({
      error: "Failed to fetch email jobs.",
      details: message,
    });
  }
});

app.delete("/api/emails/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid email job ID." });
      return;
    }

    const emailJob = await EmailJob.findById(id);
    if (!emailJob) {
      res.status(404).json({ error: "Email job not found." });
      return;
    }

    await cancelScheduledJob(id);
    await EmailJob.findByIdAndDelete(id);

    res.status(200).json({ message: "Email job removed.", id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API] Error deleting email:", err);
    res.status(500).json({
      error: "Failed to delete email job.",
      details: message,
    });
  }
});

app.post("/api/emails/:id/retry", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid email job ID." });
      return;
    }

    const emailJob = await EmailJob.findById(id);
    if (!emailJob) {
      res.status(404).json({ error: "Email job not found." });
      return;
    }

    if (emailJob.status === "SENT") {
      res.status(400).json({ error: "Email has already been sent." });
      return;
    }

    await cancelScheduledJob(id);
    emailJob.status = "SCHEDULED";
    emailJob.scheduledAt = new Date();
    emailJob.error = undefined;
    await emailJob.save();

    await scheduleEmailJob(emailJob);

    res.status(200).json(emailJob);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API] Error retrying email:", err);
    res.status(500).json({
      error: "Failed to retry email job.",
      details: message,
    });
  }
});

let server: http.Server | undefined;

async function startServer(): Promise<void> {
  const mongoUri = process.env.MONGO_URI?.trim() || "mongodb://127.0.0.1:27017/email-scheduler";

  await mongoose.connect(mongoUri);
  console.log(`[MongoDB] Connected successfully (${mongoUri})`);

  await recoverPendingJobs();

  server = app.listen(PORT, () => {
    const mode = isRedisConfigured() ? "BullMQ + Redis" : "Local MongoDB Timer Mode";
    console.log(`[Server] Email Scheduler API running on port ${PORT} (${mode})`);
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  try {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await closeQueueResources();
    const redisConn = getRedisConnection();
    if (redisConn) {
      await redisConn.quit();
    }
    await mongoose.connection.close();
    console.log("[Server] Shutdown complete.");
    process.exit(0);
  } catch (err) {
    console.error("[Server] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

startServer().catch((err) => {
  console.error("[Startup] Fatal error starting server:", err);
  process.exit(1);
});
