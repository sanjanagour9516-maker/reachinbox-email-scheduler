import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";

const TABS = [
  { id: "SCHEDULED", label: "Scheduled Emails", countKey: "scheduled", icon: Clock },
  { id: "SENT", label: "Sent Emails", countKey: "sent", icon: CheckCircle2 },
  { id: "FAILED", label: "Failed", countKey: "failed", icon: AlertTriangle },
];

function StatusBadge({ status }) {
  if (status === "SENT") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        SENT
      </span>
    );
  }

  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
        <AlertTriangle className="h-3 w-3" />
        FAILED
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
      <Clock className="h-3 w-3" />
      SCHEDULED
    </span>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatCountdown(scheduledAt, nowMs) {
  const diffSec = Math.floor((new Date(scheduledAt).getTime() - nowMs) / 1000);
  if (diffSec <= 0) return "Sending now...";
  if (diffSec < 60) return `in ${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) return `in ${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `in ${hrs}h ${mins % 60}m`;
}

export default function EmailList({
  activeTab,
  onTabChange,
  emails,
  counts,
  loading,
  error,
  lastUpdated,
  onManualRefresh,
  onDelete,
  onRetry,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (activeTab !== "SCHEDULED") return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeTab]);

  const filteredEmails = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter(
      (item) =>
        item.to?.toLowerCase().includes(q) ||
        item.subject?.toLowerCase().includes(q) ||
        item.body?.toLowerCase().includes(q)
    );
  }, [emails, searchQuery]);

  const handleCopyPreview = async (id, url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleDeleteClick = async (id) => {
    setBusyId(id);
    try {
      await onDelete(id);
    } finally {
      setBusyId(null);
    }
  };

  const handleRetryClick = async (id) => {
    setBusyId(id);
    try {
      await onRetry(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/75 shadow-xl shadow-black/25 flex flex-col min-h-[560px]">
      <div className="border-b border-slate-800 px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const badgeCount = counts?.[tab.countKey] ?? 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {badgeCount}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap shrink-0">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Auto 5s
              {lastUpdated ? ` • ${lastUpdated.toLocaleTimeString()}` : ""}
            </span>
            <button
              type="button"
              onClick={onManualRefresh}
              disabled={loading}
              title="Refresh now"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700/70 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by recipient, subject, or message..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950/75 pl-9 pr-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
          />
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {loading && emails.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
            <p className="text-sm">Loading {activeTab.toLowerCase()} emails...</p>
          </div>
        ) : filteredEmails.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 mb-3">
              <Inbox className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-200">
              {searchQuery
                ? "No matching emails found"
                : `No ${activeTab.toLowerCase()} emails`}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {searchQuery
                ? "Try clearing your search query or switching tabs."
                : activeTab === "SCHEDULED"
                ? "Schedule an email on the left (try +15s or Sample) and watch it automatically move to Sent."
                : activeTab === "SENT"
                ? "Delivered emails and their Ethereal preview links will appear here."
                : "No failed email deliveries recorded."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEmails.map((email) => {
              const isExpanded = expandedId === email._id;
              const isBusy = busyId === email._id;
              const initial = (email.to?.[0] || "?").toUpperCase();

              return (
                <article
                  key={email._id}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 hover:border-slate-700 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="h-9 w-9 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-xs font-semibold text-indigo-300 shrink-0 mt-0.5">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="truncate font-medium text-slate-200">
                            {email.to}
                          </span>
                          {email.status === "SCHEDULED" && (
                            <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 shrink-0">
                              {formatCountdown(email.scheduledAt, nowMs)}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-white truncate mt-0.5">
                          {email.subject}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={email.status} />
                    </div>
                  </div>

                  <div className="mt-2.5 pl-12">
                    <p
                      className={`text-xs text-slate-400 whitespace-pre-line ${
                        isExpanded ? "" : "line-clamp-2"
                      }`}
                    >
                      {email.body}
                    </p>
                    {email.body && email.body.length > 110 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : email._id)
                        }
                        className="mt-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
                      >
                        {isExpanded ? "Show less" : "Show full message"}
                      </button>
                    )}

                    {email.status === "FAILED" && email.error && (
                      <div className="mt-2.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
                        Error: {email.error}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        <strong className="font-medium text-slate-300">
                          Scheduled:
                        </strong>{" "}
                        {formatDateTime(email.scheduledAt)}
                      </span>
                      {email.sentAt && (
                        <span>
                          <strong className="font-medium text-slate-300">
                            Sent:
                          </strong>{" "}
                          {formatDateTime(email.sentAt)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {email.status === "SENT" && email.previewUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyPreview(email._id, email.previewUrl)
                            }
                            title="Copy Ethereal URL"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/70 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700/70 transition"
                          >
                            {copiedId === email._id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-300">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          <a
                            href={email.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200 transition"
                          >
                            <span>View Ethereal Preview ↗</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      )}

                      {email.status === "FAILED" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleRetryClick(email._id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Retry Now</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeleteClick(email._id)}
                        title={
                          email.status === "SCHEDULED"
                            ? "Cancel scheduled email"
                            : "Delete record"
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-800/50 px-2 py-1 text-[11px] font-medium text-slate-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50 transition"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>{email.status === "SCHEDULED" ? "Cancel" : "Delete"}</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
