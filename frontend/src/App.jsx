import { useCallback, useEffect, useState } from "react";
import Header from "./components/Header";
import StatsGrid from "./components/StatsGrid";
import ScheduleEmailForm from "./components/ScheduleEmailForm";
import EmailList from "./components/EmailList";
import {
  deleteEmail,
  fetchEmails,
  fetchHealth,
  retryEmail,
} from "./api/emailApi";

const POLL_INTERVAL_MS = 5000;

export default function App() {
  const [activeTab, setActiveTab] = useState("SCHEDULED");
  const [emails, setEmails] = useState([]);
  const [counts, setCounts] = useState({
    scheduled: 0,
    sent: 0,
    failed: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(false);

  const loadEmails = useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setLoading(true);
      }
      try {
        const result = await fetchEmails(activeTab);
        setEmails(result.emails);
        setCounts(result.counts);
        setError("");
        setLastUpdated(new Date());
      } catch (err) {
        const msg =
          err.response?.data?.error ||
          err.message ||
          "Unable to reach backend API.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [activeTab]
  );

  const loadHealth = useCallback(async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
      setHealthError(false);
    } catch {
      setHealthError(true);
    }
  }, []);

  useEffect(() => {
    loadEmails(true);
    const intervalId = setInterval(() => {
      loadEmails(false);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [loadEmails]);

  useEffect(() => {
    loadHealth();
    const healthIntervalId = setInterval(loadHealth, 10000);
    return () => clearInterval(healthIntervalId);
  }, [loadHealth]);

  const handleScheduled = () => {
    if (activeTab !== "SCHEDULED") {
      setActiveTab("SCHEDULED");
    } else {
      loadEmails(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteEmail(id);
      await loadEmails(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to delete email.");
    }
  };

  const handleRetry = async (id) => {
    try {
      await retryEmail(id);
      setActiveTab("SCHEDULED");
      await loadEmails(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to retry email.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header health={health} healthError={healthError} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-7">
        <StatsGrid
          counts={counts}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <ScheduleEmailForm onScheduled={handleScheduled} />
          </div>
          <div className="lg:col-span-7">
            <EmailList
              activeTab={activeTab}
              onTabChange={setActiveTab}
              emails={emails}
              counts={counts}
              loading={loading}
              error={error}
              lastUpdated={lastUpdated}
              onManualRefresh={() => loadEmails(true)}
              onDelete={handleDelete}
              onRetry={handleRetry}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
