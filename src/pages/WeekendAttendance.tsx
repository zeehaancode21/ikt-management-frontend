import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  LogIn,
  LogOut,
  Clock3,
  CheckCircle2,
  AlertCircle,
  History,
  Timer,
  CalendarClock,
} from "lucide-react";

import api, { getErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/Spinner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { toast } from "@/hooks/use-toast";

/* =========================================================
   TYPES
========================================================= */

interface WeekendAttendanceRecord {
  id: number | string;
  employeeName: string;
  date: string; // yyyy-MM-dd
  dayOfWeek: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  totalHours: number | null;
  client: string | null;
  project: string | null;
  status: "CHECKED_IN" | "CHECKED_OUT";
}

interface TodayStatusResponse {
  isWeekend: boolean;
  dayOfWeek: string;
  date: string;
  record: WeekendAttendanceRecord | null;
}

interface WeekendAttendanceSummary {
  employeeName: string;
  weekendDaysAttended: number;
  totalHours: number;
  averageHoursPerDay: number;
}

/* =========================================================
   HELPERS
========================================================= */

const fmtDate = (d: string) => {
  try {
    return format(parseISO(d), "EEE, dd MMM yyyy");
  } catch {
    return d;
  }
};

const fmtTime = (t: string | null) => {
  if (!t) return "—";
  try {
    // Backend sends LocalDateTime as "yyyy-MM-ddTHH:mm:ss"
    return format(parseISO(t), "hh:mm a");
  } catch {
    return t;
  }
};

const fmtHours = (h: number | null) => (h === null || h === undefined ? "—" : `${h.toFixed(2)} hrs`);

/* =========================================================
   PAGE
========================================================= */

export default function WeekendAttendance() {
  const { name } = useAuth();

  // ── Today's status ──────────────────────────────────────
  const [today, setToday] = useState<TodayStatusResponse | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState<string | null>(null);

  // Guards against double-clicks / repeated submissions firing more than
  // one in-flight request for the same action.
  const submitLockRef = useRef(false);
  const [submitting, setSubmitting] = useState<"checkin" | "checkout" | null>(null);

  // ── History ──────────────────────────────────────────────
  const [history, setHistory] = useState<WeekendAttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // ── Summary ──────────────────────────────────────────────
  const [summary, setSummary] = useState<WeekendAttendanceSummary | null>(null);

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    setTodayError(null);
    try {
      const { data } = await api.get<TodayStatusResponse>("/weekend-attendance/today");
      setToday(data);
    } catch (err) {
      setTodayError(getErrorMessage(err));
    } finally {
      setTodayLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!name) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { data } = await api.get<WeekendAttendanceRecord[]>("/weekend-attendance/history", {
        params: { employeeName: name },
      });
      setHistory(data);
    } catch (err) {
      setHistoryError(getErrorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }, [name]);

  const loadSummary = useCallback(async () => {
    if (!name) return;
    try {
      const { data } = await api.get<WeekendAttendanceSummary>("/weekend-attendance/summary", {
        params: { employeeName: name },
      });
      setSummary(data);
    } catch {
      // Non-fatal — summary card just stays empty.
    }
  }, [name]);

  useEffect(() => {
    loadToday();
    loadHistory();
    loadSummary();
  }, [loadToday, loadHistory, loadSummary]);

  const refreshAll = () => {
    loadToday();
    loadHistory();
    loadSummary();
  };

  const handleCheckIn = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting("checkin");
    try {
      await api.post("/weekend-attendance/check-in");
      toast({ title: "Checked in", description: "Your weekend attendance check-in was recorded." });
      refreshAll();
    } catch (err) {
      toast({
        title: "Couldn't check in",
        description: getErrorMessage(err) || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(null);
    }
  };

  const handleCheckOut = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting("checkout");
    try {
      await api.post("/weekend-attendance/check-out");
      toast({ title: "Checked out", description: "Your weekend attendance check-out was recorded." });
      refreshAll();
    } catch (err) {
      toast({
        title: "Couldn't check out",
        description: getErrorMessage(err) || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(null);
    }
  };

  const record = today?.record ?? null;
  const isWeekend = today?.isWeekend ?? false;
  const hasCheckedIn = !!record?.checkInTime;
  const hasCheckedOut = !!record?.checkOutTime;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <PageHeader
        title="Weekend Attendance"
        description="Check in and check out on Saturdays and Sundays, and track your weekend working hours."
      />

      {/* ── Today's status card ───────────────────────────── */}
      <Card className="mb-6 overflow-hidden rounded-xl border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg tracking-tight">Today</CardTitle>
          </div>
          {today && (
            <Badge
              variant={isWeekend ? "default" : "outline"}
              className="transition-transform duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
            >
              {today.dayOfWeek.charAt(0) + today.dayOfWeek.slice(1).toLowerCase()}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {todayLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-10 w-40" />
            </div>
          ) : todayError ? (
            <div className="flex items-center gap-2 text-sm text-destructive motion-safe:animate-in motion-safe:fade-in">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {todayError}
            </div>
          ) : !isWeekend ? (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 transition-colors motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Attendance can only be submitted on weekends
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Check-in and check-out are only available on Saturdays and Sundays. Come back on the
                  weekend to record your attendance.
                </p>
              </div>
            </div>
          ) : hasCheckedOut ? (
            <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300">
              <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-4 text-success">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">
                  You've completed your weekend attendance for today.
                </p>
              </div>
              <AttendanceTimesRow record={record!} />
            </div>
          ) : hasCheckedIn ? (
            <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300">
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-4 text-primary">
                <Clock3 className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">
                  Checked in at {fmtTime(record!.checkInTime)}. Don't forget to check out when you're done.
                </p>
              </div>
              <Button
                onClick={handleCheckOut}
                disabled={submitting !== null}
                className="w-full transition-all duration-200 hover:shadow-md active:scale-[0.98] sm:w-auto"
              >
                {submitting === "checkout" ? (
                  <Spinner className="mr-2 h-4 w-4 text-current" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                Check Out
              </Button>
            </div>
          ) : (
            <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300">
              <Button
                onClick={handleCheckIn}
                disabled={submitting !== null}
                className="w-full transition-all duration-200 hover:shadow-md active:scale-[0.98] sm:w-auto"
              >
                {submitting === "checkin" ? (
                  <Spinner className="mr-2 h-4 w-4 text-current" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                Check In
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Summary stat cards ────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={CalendarDays}
          label="Weekend days this year"
          value={summary ? summary.weekendDaysAttended.toString() : "—"}
        />
        <StatCard
          icon={Timer}
          label="Total hours this year"
          value={summary ? `${summary.totalHours.toFixed(2)} hrs` : "—"}
        />
        <StatCard
          icon={Clock3}
          label="Average hours / day"
          value={summary ? `${summary.averageHoursPerDay.toFixed(2)} hrs` : "—"}
        />
      </div>

      {/* ── History ────────────────────────────────────────── */}
      <Card className="rounded-xl border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg tracking-tight">My Weekend Attendance History</CardTitle>
          </div>
          <CardDescription>Every weekend you've checked in and out of, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : historyError ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {historyError}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/60">
                <CalendarDays className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No weekend attendance yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Records will show up here once you check in on a Saturday or Sunday.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Client / Project</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((r) => (
                    <TableRow key={r.id} className="transition-colors duration-150 hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap font-medium">{fmtDate(r.date)}</TableCell>
                      <TableCell className="tabular-nums">{fmtTime(r.checkInTime)}</TableCell>
                      <TableCell className="tabular-nums">{fmtTime(r.checkOutTime)}</TableCell>
                      <TableCell className="tabular-nums">{fmtHours(r.totalHours)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {[r.client, r.project].filter(Boolean).join(" / ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.status === "CHECKED_OUT" ? "default" : "outline"}
                          className="transition-colors"
                        >
                          {r.status === "CHECKED_OUT" ? "Completed" : "In Progress"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* =========================================================
   SUBCOMPONENTS
========================================================= */

function AttendanceTimesRow({ record }: { record: WeekendAttendanceRecord }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-muted/30 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-muted/50 hover:shadow-sm">
        <p className="text-xs text-muted-foreground">Check In</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{fmtTime(record.checkInTime)}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-muted/50 hover:shadow-sm">
        <p className="text-xs text-muted-foreground">Check Out</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{fmtTime(record.checkOutTime)}</p>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-muted/50 hover:shadow-sm">
        <p className="text-xs text-muted-foreground">Total Hours</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{fmtHours(record.totalHours)}</p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <Card className="rounded-xl border-border/80 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-200">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-snug text-muted-foreground">{label}</p>
          <p className="mt-1 text-lg font-semibold leading-tight tabular-nums text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}