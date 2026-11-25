import { AlertTriangle, CheckCircle2, Clock, Send } from "lucide-react";

export default function StatsGrid({ counts, activeTab, onSelectTab }) {
  const cards = [
    {
      label: "Total Emails",
      value: counts.total ?? 0,
      icon: Send,
      accent: "text-indigo-400 bg-indigo-500/10 border-indigo-500/25",
      tab: null,
    },
    {
      label: "Scheduled Queue",
      value: counts.scheduled ?? 0,
      icon: Clock,
      accent: "text-amber-400 bg-amber-500/10 border-amber-500/25",
      tab: "SCHEDULED",
    },
    {
      label: "Sent & Delivered",
      value: counts.sent ?? 0,
      icon: CheckCircle2,
      accent: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
      tab: "SENT",
    },
    {
      label: "Failed",
      value: counts.failed ?? 0,
      icon: AlertTriangle,
      accent: "text-rose-400 bg-rose-500/10 border-rose-500/25",
      tab: "FAILED",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = card.tab && activeTab === card.tab;
        return (
          <button
            key={card.label}
            type="button"
            onClick={() => card.tab && onSelectTab(card.tab)}
            className={`text-left rounded-2xl border p-4 transition ${
              isSelected
                ? "border-indigo-500/50 bg-slate-900 shadow-lg shadow-indigo-500/10"
                : "border-slate-800/90 bg-slate-900/60 hover:border-slate-700"
            } ${card.tab ? "cursor-pointer" : "cursor-default"}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{card.label}</span>
              <span
                className={`h-8 w-8 rounded-lg border flex items-center justify-center ${card.accent}`}
              >
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-white">
              {card.value}
            </p>
          </button>
        );
      })}
    </div>
  );
}
