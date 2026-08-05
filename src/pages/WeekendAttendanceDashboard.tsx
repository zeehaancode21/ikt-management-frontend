import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Users,
  CalendarDays,
  Timer,
  CheckCircle2,
  Search,
  Filter,
  RotateCcw,
  Download,
  AlertCircle,
} from "lucide-react";

import api, { getErrorMessage } from "@/lib/api";

import { PageHeader } from "@/components/PageHeader";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  date: string;
  dayOfWeek: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  totalHours: number | null;
  status: "CHECKED_IN" | "CHECKED_OUT";
}

interface WeekendAttendanceStats {
  month: string;
  totalRecords: number;
  totalEmployees: number;
  completedRecords: number;
  inProgressRecords: number;
  totalHours: number;
  averageHoursPerRecord: number;
}

const ALL_VALUE = "__ALL__";

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
    return format(parseISO(t), "hh:mm a");
  } catch {
    return t;
  }
};

const fmtHours = (h: number | null) => (h === null || h === undefined ? "—" : `${h.toFixed(2)} hrs`);

// Turns filtered records into a CSV file and triggers a browser download —
// no export functionality exists elsewhere in this app to plug into, so
// this builds the CSV client-side from data already fetched for the table.
function downloadCsv(records: WeekendAttendanceRecord[], month: string) {
  const header = ["Employee", "Date", "Day", "Check In", "Check Out", "Total Hours", "Status"];
  const rows = records.map((r) => [
    r.employeeName,
    r.date,
    r.dayOfWeek,
    r.checkInTime ?? "",
    r.checkOutTime ?? "",
    r.totalHours !== null ? r.totalHours.toFixed(2) : "",
    r.status,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `weekend-attendance-${month || "all"}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* =========================================================
   PAGE
========================================================= */

export default function WeekendAttendanceDashboard() {
  const [records, setRecords] = useState<WeekendAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<WeekendAttendanceStats | null>(null);

  const [employeeNames, setEmployeeNames] = useState<string[]>([]);

  // ── Filters ──────────────────────────────────────────────
  const [month, setMonth] = useState<string>(() => format(new Date(), "yyyy-MM"));
  const [employeeFilter, setEmployeeFilter] = useState<string>(ALL_VALUE);
  const [search, setSearch] = useState("");

  const loadEmployeeNames = useCallback(async () => {
    try {
      const { data } = await api.get<string[]>("/employees/name");
      setEmployeeNames(data);
    } catch {
      setEmployeeNames([]);
    }
  }, []);

  const loadStats = useCallback(async (m: string) => {
    try {
      const { data } = await api.get<WeekendAttendanceStats>("/weekend-attendance/stats", {
        params: { month: m || undefined },
      });
      setStats(data);
    } catch {
      setStats(null);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<WeekendAttendanceRecord[]>("/weekend-attendance/all", {
        params: {
          month: month || undefined,
          employeeName: employeeFilter !== ALL_VALUE ? employeeFilter : undefined,
          search: search.trim() || undefined,
        },
      });
      setRecords(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [month, employeeFilter, search]);

  useEffect(() => {
    loadEmployeeNames();
  }, [loadEmployeeNames]);

  useEffect(() => {
    loadStats(month);
  }, [month, loadStats]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const resetFilters = () => {
    setMonth(format(new Date(), "yyyy-MM"));
    setEmployeeFilter(ALL_VALUE);
    setSearch("");
  };

  const handleExport = () => {
    if (records.length === 0) {
      toast({ title: "Nothing to export", description: "There are no records matching the current filters." });
      return;
    }
    downloadCsv(records, month);
  };

  const totalRecordsShown = records.length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <PageHeader
        title="Weekend Attendance Dashboard"
        description="Monitor weekend check-ins, check-outs, and working hours across the team."
      />

      {/* ── Stat cards ─────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Employees attended" value={stats ? stats.totalEmployees.toString() : "—"} />
        <StatCard icon={CalendarDays} label="Total check-ins" value={stats ? stats.totalRecords.toString() : "—"} />
        <StatCard icon={Timer} label="Total hours logged" value={stats ? `${stats.totalHours.toFixed(2)} hrs` : "—"} />
        <StatCard
          icon={CheckCircle2}
          label="Completed / In progress"
          value={stats ? `${stats.completedRecords} / ${stats.inProgressRecords}` : "—"}
        />
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <Card className="mb-6 rounded-xl border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <CardTitle className="text-base tracking-tight">Filters</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="wa-month">Month</Label>
              <Input
                id="wa-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="transition-shadow duration-200 focus-visible:shadow-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger className="transition-shadow duration-200">
                  <SelectValue placeholder="All employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All employees</SelectItem>
                  {employeeNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wa-search">Search employee</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground transition-colors" />
                <Input
                  id="wa-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name"
                  className="pl-8 transition-shadow duration-200 focus-visible:shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="transition-all duration-200 hover:shadow-sm active:scale-[0.97]"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset filters
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="transition-all duration-200 hover:shadow-sm active:scale-[0.97]"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {totalRecordsShown} record{totalRecordsShown === 1 ? "" : "s"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Records table ──────────────────────────────────── */}
      <Card className="rounded-xl border-border/80 shadow-sm transition-shadow duration-300 hover:shadow-md">
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">Attendance Records</CardTitle>
          <CardDescription>Weekend check-ins and check-outs matching the filters above.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/60">
                <CalendarDays className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No weekend attendance found</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Try widening your filters or picking a different month.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id} className="transition-colors duration-150 hover:bg-muted/50">
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                      <TableCell className="tabular-nums">{fmtTime(r.checkInTime)}</TableCell>
                      <TableCell className="tabular-nums">{fmtTime(r.checkOutTime)}</TableCell>
                      <TableCell className="tabular-nums">{fmtHours(r.totalHours)}</TableCell>
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

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
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