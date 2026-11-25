import axios from "axios";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(
  /\/+$/,
  ""
);

const HEALTH_URL = `${API_BASE_URL.replace(/\/api$/, "")}/health`;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

export async function scheduleEmail(payload) {
  const { data } = await apiClient.post("/emails/schedule", payload);
  return data;
}

export async function fetchEmails(status) {
  const { data } = await apiClient.get("/emails", {
    params: status ? { status } : {},
  });
  return {
    emails: data.emails || [],
    counts: data.counts || { scheduled: 0, sent: 0, failed: 0, total: 0 },
  };
}

export async function deleteEmail(id) {
  const { data } = await apiClient.delete(`/emails/${id}`);
  return data;
}

export async function retryEmail(id) {
  const { data } = await apiClient.post(`/emails/${id}/retry`);
  return data;
}

export async function fetchHealth() {
  const { data } = await axios.get(HEALTH_URL, { timeout: 8000 });
  return data;
}
