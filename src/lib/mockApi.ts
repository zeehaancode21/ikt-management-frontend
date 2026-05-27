// Mock backend adapter for axios.
// Intercepts requests when USE_MOCK is true and returns seed data.
// Persists creates/updates in memory for the session.

import type { AxiosInstance, AxiosRequestConfig } from "axios";
import { format, subDays } from "date-fns";

type Role = "OWNER" | "EMPLOYEE";

interface Leave {
  id: number;
  employeeName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface ProgressEntry {
  id: number;
  employeeName: string;
  date: string;
  taskTitle: string;
  description?: string;
  completion: number;
  status: "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
}

interface Report {
  id: number;
  employeeName: string;
  reportTitle: string;
  date: string;
  workDone: string;
  challenges: string;
  planForTomorrow: string;
}

const today = new Date();
const d = (n: number) => format(subDays(today, n), "yyyy-MM-dd");
const days = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1;

let leaveSeq = 100;
let progressSeq = 100;
let reportSeq = 100;

const leaves: Leave[] = [
  { id: ++leaveSeq, employeeName: "Sunil", leaveType: "SICK", fromDate: d(10), toDate: d(8), days: 3, reason: "Fever and rest advised by doctor.", status: "APPROVED" },
  { id: ++leaveSeq, employeeName: "Afridi", leaveType: "CASUAL", fromDate: d(4), toDate: d(4), days: 1, reason: "Personal errand.", status: "PENDING" },
  { id: ++leaveSeq, employeeName: "Naveen", leaveType: "EARNED", fromDate: d(2), toDate: d(0), days: 3, reason: "Family function out of town.", status: "PENDING" },
  { id: ++leaveSeq, employeeName: "Darshan", leaveType: "SICK", fromDate: d(20), toDate: d(19), days: 2, reason: "Migraine.", status: "REJECTED" },
];

const progress: ProgressEntry[] = [
  { id: ++progressSeq, employeeName: "Sunil", date: d(1), taskTitle: "Onboarding flow redesign", description: "Refined wireframes and aligned with PM.", completion: 70, status: "IN_PROGRESS" },
  { id: ++progressSeq, employeeName: "Afridi", date: d(1), taskTitle: "Payments API integration", description: "Webhook handlers wired up.", completion: 100, status: "COMPLETED" },
  { id: ++progressSeq, employeeName: "Naveen", date: d(2), taskTitle: "Bug triage Q2", description: "Reviewed 22 issues, closed 9.", completion: 45, status: "IN_PROGRESS" },
  { id: ++progressSeq, employeeName: "Darshan", date: d(0), taskTitle: "Performance audit", description: "Blocked on staging access.", completion: 20, status: "BLOCKED" },
  { id: ++progressSeq, employeeName: "Sunil", date: d(0), taskTitle: "Component library cleanup", completion: 30, status: "IN_PROGRESS" },
];

const reports: Report[] = [
  {
    id: ++reportSeq,
    employeeName: "Sunil",
    reportTitle: "Onboarding redesign – Day 3",
    date: d(1),
    workDone: "Completed responsive layouts for the welcome and profile setup screens. Synced with design on iconography.",
    challenges: "Edge cases for users joining via invite link still unclear.",
    planForTomorrow: "Finalize invite-link flow and start handoff to engineering.",
  },
  {
    id: ++reportSeq,
    employeeName: "Afridi",
    reportTitle: "Payments – webhook hardening",
    date: d(1),
    workDone: "Idempotency keys added on Stripe webhook. Wrote 6 unit tests covering retries.",
    challenges: "Sandbox events occasionally drop; needs investigation.",
    planForTomorrow: "Add monitoring and alerting for failed webhook deliveries.",
  },
  {
    id: ++reportSeq,
    employeeName: "Naveen",
    reportTitle: "Bug triage summary",
    date: d(2),
    workDone: "Closed 9 bugs, reproduced 5, escalated 3 to platform team.",
    challenges: "Two crashes reported only on Android 11.",
    planForTomorrow: "Pair with QA on Android 11 repro.",
  },
];

const myLeaves: Leave[] = [
  { id: ++leaveSeq, employeeName: "You", leaveType: "CASUAL", fromDate: d(15), toDate: d(14), days: 2, reason: "Wedding in family.", status: "APPROVED" },
  { id: ++leaveSeq, employeeName: "You", leaveType: "SICK", fromDate: d(5), toDate: d(5), days: 1, reason: "Stomach bug.", status: "PENDING" },
];

const myProgress: ProgressEntry[] = [
  { id: ++progressSeq, employeeName: "You", date: d(2), taskTitle: "Dashboard polish", description: "Improved spacing and empty states.", completion: 80, status: "IN_PROGRESS" },
  { id: ++progressSeq, employeeName: "You", date: d(1), taskTitle: "Analytics widget", completion: 100, status: "COMPLETED" },
];

const myReports: Report[] = [
  {
    id: ++reportSeq,
    employeeName: "You",
    reportTitle: "Daily standup notes",
    date: d(1),
    workDone: "Shipped two UI fixes and reviewed three PRs.",
    challenges: "None today.",
    planForTomorrow: "Pick up the analytics widget refactor.",
  },
];

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

const ok = <T>(data: T) => ({
  data,
  status: 200,
  statusText: "OK",
  headers: {},
  config: {} as AxiosRequestConfig,
});

const getRole = (): Role =>
  ((localStorage.getItem("role") as Role) || "EMPLOYEE");

const getName = () => localStorage.getItem("name") || "You";

async function handle(config: AxiosRequestConfig) {
  const url = (config.url || "").replace(/^\/+/, "/");
  const method = (config.method || "get").toLowerCase();
  const body = config.data ? (typeof config.data === "string" ? JSON.parse(config.data) : config.data) : {};
  await delay();

  if (url === "/api/auth/login" && method === "post") {
    return ok({
      token: `mock-token-${Date.now()}`,
      role: "EMPLOYEE",
      name: (body.email || "user").split("@")[0],
    });
  }

  if (url === "/api/leaves/my" && method === "get") return ok(myLeaves);
  if (url === "/api/leaves/all" && method === "get") return ok(leaves);
  if (url === "/api/leaves/apply" && method === "post") {
    const item: Leave = {
      id: ++leaveSeq,
      employeeName: getName(),
      leaveType: body.leaveType,
      fromDate: body.fromDate,
      toDate: body.toDate,
      days: days(body.fromDate, body.toDate),
      reason: body.reason,
      status: "PENDING",
    };
    myLeaves.unshift(item);
    if (getRole() === "EMPLOYEE") leaves.unshift({ ...item, employeeName: getName() });
    return ok(item);
  }
  const leaveAction = url.match(/^\/api\/leaves\/(\d+)\/(approve|reject)$/);
  if (leaveAction && method === "put") {
    const id = Number(leaveAction[1]);
    const status = leaveAction[2] === "approve" ? "APPROVED" : "REJECTED";
    [leaves, myLeaves].forEach((arr) => {
      const it = arr.find((l) => l.id === id);
      if (it) it.status = status as Leave["status"];
    });
    return ok({ id, status });
  }

  if (url === "/api/progress/my" && method === "get") return ok(myProgress);
  if (url === "/api/progress/all" && method === "get") return ok(progress);
  if (url === "/api/progress/log" && method === "post") {
    const item: ProgressEntry = {
      id: ++progressSeq,
      employeeName: getName(),
      date: body.date,
      taskTitle: body.taskTitle,
      description: body.description,
      completion: body.completion ?? 0,
      status: body.status || "IN_PROGRESS",
    };
    myProgress.unshift(item);
    if (getRole() === "EMPLOYEE") progress.unshift(item);
    return ok(item);
  }

  if (url === "/api/reports/my" && method === "get") return ok(myReports);
  if (url === "/api/reports/all" && method === "get") return ok(reports);
  if (url === "/api/reports/submit" && method === "post") {
    const item: Report = {
      id: ++reportSeq,
      employeeName: getName(),
      reportTitle: body.reportTitle,
      date: body.date,
      workDone: body.workDone,
      challenges: body.challenges || "",
      planForTomorrow: body.planForTomorrow || "",
    };
    myReports.unshift(item);
    if (getRole() === "EMPLOYEE") reports.unshift(item);
    return ok(item);
  }

  const err: any = new Error(`Mock: no handler for ${method.toUpperCase()} ${url}`);
  err.response = { status: 404, data: { message: err.message } };
  throw err;
}

export function installMockAdapter(instance: AxiosInstance) {
  instance.defaults.adapter = (async (config: AxiosRequestConfig) =>
    handle(config)) as unknown as AxiosInstance["defaults"]["adapter"];
}
