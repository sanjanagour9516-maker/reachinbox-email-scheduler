import { ConnectionOptions, Job, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import nodemailer, { Transporter } from "nodemailer";
import EmailJob, { IEmailJob } from "../models/EmailJob";
import { createRedisConnection, isRedisConfigured } from "../config/redis";

const QUEUE_NAME = "email-scheduler";
const MAX_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 5000;
const MAX_TIMEOUT_MS = 2_147_483_647; // Node.js 32-bit signed int limit (~24.8 days)

interface EmailJobPayload {
  emailJobId: string;
}

const useRedis = isRedisConfigured();

let queueConnection: IORedis | null = null;
let workerConnection: IORedis | null = null;
let emailQueue: Queue<EmailJobPayload> | null = null;
let emailWorker: Worker<EmailJobPayload> | null = null;

// Local persistent timer registry (used only when REDIS_URL is not configured)
const localTimers = new Map<string, NodeJS.Timeout>();
let cachedEtherealUser: string | null = null;
let cachedTransporterPromise: Promise<Transporter> | null = null;

async function getTransporter(): Promise<Transporter> {
  if (cachedTransporterPromise) {
    return cachedTransporterPromise;
  }

  cachedTransporterPromise = (async () => {
    let user = process.env.ETHEREAL_USER?.trim();
    let pass = process.env.ETHEREAL_PASS?.trim();

    if (!user || !pass) {
      console.log(
        "[Mailer] ETHEREAL_USER / ETHEREAL_PASS not set. Creating an Ethereal test account..."
      );
      const testAccount = await nodemailer.createTestAccount();
      user = testAccount.user;
      pass = testAccount.pass;
      console.log(`[Mailer] Ready with Ethereal test account: ${user}`);
    }

    cachedEtherealUser = user;

    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user,
        pass,
      },
    });
  })().catch((err) => {
    cachedTransporterPromise = null;
    throw err;
  });

  return cachedTransporterPromise;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPlainTextAsHtml(text: string): string {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111827;">${escapeHtml(
    text
  ).replace(/\r?\n/g, "<br />")}</div>`;
}

async function processEmailJob(emailJobId: string, jobId?: string) {
  const emailJob = await EmailJob.findById(emailJobId);
  if (!emailJob) {
    console.warn(`[Worker] EmailJob ${emailJobId} not found in MongoDB. Skipping.`);
    return { skipped: true, reason: "not_found" };
  }

  // Idempotency guard: never send the same email twice
  if (emailJob.status === "SENT") {
    console.log(`[Worker] EmailJob ${emailJobId} already SENT. Skipping duplicate execution.`);
    return { skipped: true, reason: "already_sent" };
  }

  const transporter = await getTransporter();
  const senderAddress =
    process.env.ETHEREAL_USER?.trim() || cachedEtherealUser || "scheduler@ethereal.email";

  const info = await transporter.sendMail({
    from: `"ReachInbox Scheduler" <${senderAddress}>`,
    to: emailJob.to,
    subject: emailJob.subject,
    text: emailJob.body,
    html: formatPlainTextAsHtml(emailJob.body),
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
  const sentAt = new Date();

  await EmailJob.findByIdAndUpdate(
    emailJobId,
    {
      $set: {
        status: "SENT",
        sentAt,
        previewUrl,
        jobId: jobId || emailJobId,
      },
      $unset: {
        error: 1,
      },
    },
    { returnDocument: "after" }
  );

  console.log(
    `[Worker] Sent EmailJob ${emailJobId} to ${emailJob.to} (preview: ${previewUrl || "n/a"})`
  );

  return {
    messageId: info.messageId,
    previewUrl,
    sentAt: sentAt.toISOString(),
  };
}

async function recordFailure(
  emailJobId: string,
  err: unknown,
  attemptsMade: number,
  maxAttempts: number
): Promise<void> {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const attemptsExhausted = attemptsMade >= maxAttempts;

  console.error(
    `[Worker] Job ${emailJobId} failed (attempt ${attemptsMade}/${maxAttempts}): ${errorMessage}`
  );

  try {
    const update = attemptsExhausted
      ? { status: "FAILED" as const, error: errorMessage }
      : { error: errorMessage };

    await EmailJob.findByIdAndUpdate(emailJobId, { $set: update });
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    console.error(`[Worker] Failed to persist error state for ${emailJobId}:`, msg);
  }
}

if (useRedis) {
  queueConnection = createRedisConnection("queue");
  workerConnection = createRedisConnection("worker");

  emailQueue = new Queue<EmailJobPayload>(QUEUE_NAME, {
    connection: queueConnection as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: BACKOFF_DELAY_MS,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    },
  });

  emailWorker = new Worker<EmailJobPayload>(
    QUEUE_NAME,
    async (job: Job<EmailJobPayload>) => {
      const emailJobId = job.data?.emailJobId || job.id;
      if (!emailJobId) {
        return { skipped: true, reason: "missing_id" };
      }
      return processEmailJob(emailJobId, job.id?.toString());
    },
    {
      connection: workerConnection as unknown as ConnectionOptions,
      concurrency: 5,
    }
  );

  emailWorker.on("completed", (job: Job<EmailJobPayload>) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  emailWorker.on("failed", async (job: Job<EmailJobPayload> | undefined, err: Error) => {
    if (!job) {
      console.error("[Worker] Job failed without job reference:", err.message);
      return;
    }
    const emailJobId = job.data?.emailJobId || job.id;
    if (!emailJobId) return;
    await recordFailure(emailJobId, err, job.attemptsMade, job.opts?.attempts || MAX_ATTEMPTS);
  });

  emailWorker.on("error", (err: Error) => {
    console.error("[Worker] Worker runtime error:", err.message);
  });
} else {
  console.log(
    "[Queue] REDIS_URL not set — running in local MongoDB-backed timer mode (set REDIS_URL for BullMQ + Redis)."
  );
}

function scheduleLocalTimer(emailJobId: string, targetTimeMs: number, attempt = 1): void {
  const existing = localTimers.get(emailJobId);
  if (existing) {
    clearTimeout(existing);
    localTimers.delete(emailJobId);
  }

  const remainingMs = Math.max(0, targetTimeMs - Date.now());
  const waitMs = Math.min(remainingMs, MAX_TIMEOUT_MS);

  const timer = setTimeout(async () => {
    localTimers.delete(emailJobId);

    if (Date.now() + 50 < targetTimeMs && remainingMs > MAX_TIMEOUT_MS) {
      scheduleLocalTimer(emailJobId, targetTimeMs, attempt);
      return;
    }

    try {
      await processEmailJob(emailJobId, emailJobId);
    } catch (err) {
      await recordFailure(emailJobId, err, attempt, MAX_ATTEMPTS);
      if (attempt < MAX_ATTEMPTS) {
        const retryDelay = BACKOFF_DELAY_MS * Math.pow(2, attempt - 1);
        scheduleLocalTimer(emailJobId, Date.now() + retryDelay, attempt + 1);
      }
    }
  }, waitMs);

  localTimers.set(emailJobId, timer);
}

export async function scheduleEmailJob(emailJob: IEmailJob): Promise<{ id: string }> {
  const jobId = emailJob._id.toString();
  const scheduledTimestamp = new Date(emailJob.scheduledAt).getTime();

  if (useRedis && emailQueue) {
    const delay = Math.max(0, scheduledTimestamp - Date.now());
    const job = await emailQueue.add(
      "send-email",
      { emailJobId: jobId },
      {
        jobId,
        delay,
        attempts: MAX_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: BACKOFF_DELAY_MS,
        },
      }
    );
    return { id: job.id?.toString() || jobId };
  }

  scheduleLocalTimer(jobId, scheduledTimestamp, 1);
  return { id: jobId };
}

export async function cancelScheduledJob(emailJobId: string): Promise<void> {
  if (useRedis && emailQueue) {
    const existingJob = await emailQueue.getJob(emailJobId);
    if (existingJob) {
      await existingJob.remove();
    }
    return;
  }

  const timer = localTimers.get(emailJobId);
  if (timer) {
    clearTimeout(timer);
    localTimers.delete(emailJobId);
  }
}

export async function recoverPendingJobs(): Promise<{
  totalPending: number;
  requeued: number;
  alreadyQueued: number;
}> {
  const pendingJobs = await EmailJob.find({ status: "SCHEDULED" }).sort({ scheduledAt: 1 });

  if (pendingJobs.length === 0) {
    console.log("[Recovery] No pending SCHEDULED emails found in MongoDB.");
    return { totalPending: 0, requeued: 0, alreadyQueued: 0 };
  }

  let requeued = 0;
  let alreadyQueued = 0;

  for (const emailJob of pendingJobs) {
    const jobId = emailJob._id.toString();

    if (useRedis && emailQueue) {
      const existingJob = await emailQueue.getJob(jobId);

      if (!existingJob) {
        await scheduleEmailJob(emailJob);
        if (emailJob.jobId !== jobId) {
          emailJob.jobId = jobId;
          await emailJob.save();
        }
        requeued += 1;
        continue;
      }

      const state = await existingJob.getState();
      if (state === "failed") {
        await existingJob.remove();
        await scheduleEmailJob(emailJob);
        requeued += 1;
      } else {
        alreadyQueued += 1;
      }
    } else {
      if (localTimers.has(jobId)) {
        alreadyQueued += 1;
      } else {
        await scheduleEmailJob(emailJob);
        if (emailJob.jobId !== jobId) {
          emailJob.jobId = jobId;
          await emailJob.save();
        }
        requeued += 1;
      }
    }
  }

  console.log(
    `[Recovery] Checked ${pendingJobs.length} pending jobs: ${requeued} re-queued, ${alreadyQueued} already scheduled.`
  );

  return {
    totalPending: pendingJobs.length,
    requeued,
    alreadyQueued,
  };
}

export function getWorkerStatus() {
  if (useRedis && emailWorker) {
    return {
      name: QUEUE_NAME,
      mode: "bullmq-redis",
      running: emailWorker.isRunning(),
      paused: emailWorker.isPaused(),
      concurrency: 5,
    };
  }

  return {
    name: QUEUE_NAME,
    mode: "local-timers",
    running: true,
    paused: false,
    concurrency: 5,
    pendingTimers: localTimers.size,
  };
}

export async function closeQueueResources(): Promise<void> {
  if (useRedis) {
    if (emailWorker) await emailWorker.close();
    if (emailQueue) await emailQueue.close();
    await Promise.allSettled([
      queueConnection ? queueConnection.quit() : Promise.resolve(),
      workerConnection ? workerConnection.quit() : Promise.resolve(),
    ]);
    return;
  }

  for (const timer of localTimers.values()) {
    clearTimeout(timer);
  }
  localTimers.clear();
}

export { emailQueue, emailWorker };
