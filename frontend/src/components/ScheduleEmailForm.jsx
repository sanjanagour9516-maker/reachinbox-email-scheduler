import { useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";
import { scheduleEmail } from "../api/emailApi";

function toLocalDateTimeInputValue(date) {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 19);
}

function getDefaultScheduleValue(secondsAhead = 60) {
  return toLocalDateTimeInputValue(new Date(Date.now() + secondsAhead * 1000));
}

export default function ScheduleEmailForm({ onScheduled }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => getDefaultScheduleValue(60));

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const applyQuickOffset = (seconds) => {
    setScheduledAt(getDefaultScheduleValue(seconds));
    setErrorMsg("");
  };

  const fillSampleEmail = () => {
    setTo("alex.rivera@example.com");
    setSubject("Quick intro — scaling outbound with ReachInbox");
    setBody(
      "Hi Alex,\n\nI noticed your team is expanding outbound outreach this quarter. We built an automated email scheduling pipeline that guarantees delivery even across server restarts.\n\nWould love to share a quick demo this week!\n\nBest regards,\nReachInbox Team"
    );
    setScheduledAt(getDefaultScheduleValue(15));
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const parsedDate = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(parsedDate.getTime())) {
      setErrorMsg("Please select a valid date and time.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await scheduleEmail({
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
        scheduledAt: parsedDate.toISOString(),
      });

      setSuccessMsg(
        `Scheduled email to ${created.to} for ${new Date(created.scheduledAt).toLocaleString()}.`
      );
      setTo("");
      setSubject("");
      setBody("");
      setScheduledAt(getDefaultScheduleValue(60));

      if (onScheduled) {
        onScheduled();
      }
    } catch (err) {
      const apiError =
        err.response?.data?.error || err.message || "Failed to schedule email.";
      setErrorMsg(apiError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-6 shadow-xl shadow-black/25">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <CalendarClock className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Schedule New Email</h2>
            <p className="text-xs text-slate-400">
              Persisted in MongoDB • Zero cron polling
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fillSampleEmail}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/20 transition shrink-0"
        >
          <Sparkles className="h-3 w-3" />
          <span>Sample</span>
        </button>
      </div>

      {successMsg && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email-to"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Recipient Email
          </label>
          <input
            id="email-to"
            type="email"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="alex@company.com"
            className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
          />
        </div>

        <div>
          <label
            htmlFor="email-subject"
            className="block text-xs font-medium text-slate-300 mb-1.5"
          >
            Subject
          </label>
          <input
            id="email-subject"
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Quick follow-up on our outreach campaign"
            className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="email-body"
              className="block text-xs font-medium text-slate-300"
            >
              Message Body
            </label>
            <span className="text-[11px] text-slate-500">{body.length} chars</span>
          </div>
          <textarea
            id="email-body"
            required
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi Alex,&#10;&#10;Wanted to share our latest update..."
            className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition resize-y"
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor="email-scheduled-at"
              className="block text-xs font-medium text-slate-300"
            >
              Schedule Date &amp; Time
            </label>
            <div className="flex items-center gap-1">
              {[
                { label: "Now", secs: 0 },
                { label: "+15s", secs: 15 },
                { label: "+1m", secs: 60 },
                { label: "+5m", secs: 300 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyQuickOffset(preset.secs)}
                  className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-indigo-500/50 hover:text-indigo-300 transition"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <input
            id="email-scheduled-at"
            type="datetime-local"
            step="1"
            required
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-600/25 hover:from-indigo-500 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Scheduling...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span>Schedule Email</span>
            </>
          )}
        </button>
      </form>
    </section>
  );
}
