import { Activity, Database, Layers, MailCheck, ServerCrash } from "lucide-react";

export default function Header({ health, healthError }) {
  const isWorkerRunning = Boolean(health?.worker?.running);
  const isRedisHealthy =
    health?.redis === "ready" || health?.redis === "local-fallback";

  const isHealthy =
    !healthError &&
    health?.status === "ok" &&
    health?.mongodb === "connected" &&
    isRedisHealthy &&
    isWorkerRunning;

  const isDegraded = !healthError && health?.status === "ok" && !isHealthy;

  let badgeStyles = "border-rose-500/30 bg-rose-500/10 text-rose-300";
  let dotStyles = "bg-rose-400";
  let statusText = "Worker Offline";

  if (isHealthy) {
    badgeStyles = "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    dotStyles = "bg-emerald-400";
    const modeLabel =
      health.worker?.mode === "local-timers" ? "Local Mode" : "BullMQ + Redis";
    statusText = `Worker Online (${modeLabel}) • ${health.worker.concurrency}x`;
  } else if (isDegraded) {
    badgeStyles = "border-amber-500/30 bg-amber-500/10 text-amber-300";
    dotStyles = "bg-amber-400";
    statusText = `Degraded (DB: ${health.mongodb}, Queue: ${health.redis})`;
  }

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-1 ring-white/10">
            <MailCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
                ReachInbox Email Scheduler
              </h1>
              <span className="hidden sm:inline-flex rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                Live
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Event-driven delayed email delivery • MongoDB persistence • Ethereal SMTP
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {health && !healthError && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                <Database className="h-3 w-3 text-indigo-400" />
                MongoDB: {health.mongodb}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                <Layers className="h-3 w-3 text-violet-400" />
                Queue: {health.redis === "ready" ? "Redis" : "Local Timers"}
              </span>
            </>
          )}

          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${badgeStyles}`}
          >
            <span className="relative flex h-2 w-2">
              {isHealthy && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${dotStyles}`} />
            </span>
            {healthError ? (
              <ServerCrash className="h-3.5 w-3.5" />
            ) : (
              <Activity className="h-3.5 w-3.5" />
            )}
            <span>{statusText}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
