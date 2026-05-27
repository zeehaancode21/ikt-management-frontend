import { useEffect, useState, FormEvent } from "react";
import { format } from "date-fns";
import api, { getErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Spinner, FullSpinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";

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

interface ProgressEntry {
  id: string | number;
  employeeName?: string;
  date: string;
  taskTitle: string;
  description?: string;
  completion: number;
  status: string;
}

const fmt = (d: string) => {
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return d;
  }
};

const EmployeeView = () => {
  const [date, setDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );

  const [taskTitle, setTaskTitle] = useState("");
  const [description, setDescription] = useState("");
  const [completion, setCompletion] = useState(0);

  const [status, setStatus] = useState("IN_PROGRESS");

  const [submitting, setSubmitting] = useState(false);

  const [entries, setEntries] = useState<ProgressEntry[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } =
        await api.get<ProgressEntry[]>(
          "/api/progress/my"
        );

      setEntries(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    setSubmitting(true);

    try {
      await api.post("/api/progress/log", {
        date,
        taskTitle,
        description,
        completion,
        status,
      });

      toast({
        title: "Progress logged",
      });

      setTaskTitle("");
      setDescription("");
      setCompletion(0);
      setStatus("IN_PROGRESS");

      load();
    } catch (err) {
      toast({
        title: "Failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">
          Log Work Progress
        </h2>

        <form
          onSubmit={handleSubmit}
          className="grid gap-4 md:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>

            <Input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) =>
                setDate(e.target.value)
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>

            <Select
              value={status}
              onValueChange={setStatus}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="IN_PROGRESS">
                  In Progress
                </SelectItem>

                <SelectItem value="COMPLETED">
                  Completed
                </SelectItem>

                <SelectItem value="BLOCKED">
                  Blocked
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">
              Task Title
            </Label>

            <Input
              id="title"
              required
              value={taskTitle}
              onChange={(e) =>
                setTaskTitle(e.target.value)
              }
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="desc">
              Description
            </Label>

            <Textarea
              id="desc"
              rows={3}
              value={description}
              onChange={(e) =>
                setDescription(e.target.value)
              }
            />
          </div>

          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Completion</Label>

              <span className="text-sm font-medium text-primary">
                {completion}%
              </span>
            </div>

            <Slider
              value={[completion]}
              max={100}
              step={5}
              onValueChange={(v) =>
                setCompletion(v[0])
              }
            />
          </div>

          <div className="md:col-span-2">
            <Button
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <Spinner className="text-primary-foreground" />
              ) : (
                "Log Progress"
              )}
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold">
          My Progress
        </h2>

        {loading ? (
          <FullSpinner />
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No entries yet.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {entries.map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {e.taskTitle}
                    </h3>

                    <p className="text-xs text-muted-foreground">
                      {fmt(e.date)}
                    </p>
                  </div>

                  <StatusBadge
                    status={e.status}
                  />
                </div>

                {e.description && (
                  <p className="mb-3 text-sm text-muted-foreground">
                    {e.description}
                  </p>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Completion
                    </span>

                    <span className="font-medium">
                      {e.completion}%
                    </span>
                  </div>

                  <Progress
                    value={e.completion}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const OwnerView = () => {
  const [entries, setEntries] = useState<
    ProgressEntry[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState<
    string | null
  >(null);

  const [nameFilter, setNameFilter] =
    useState("");

  // FILTER TYPE
  const [filterType, setFilterType] =
    useState("single");

  // DATE FILTERS
  const [singleDate, setSingleDate] =
    useState("");

  const [from, setFrom] = useState("");

  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);

      try {
        const { data } =
          await api.get<ProgressEntry[]>(
            "/api/progress/all"
          );

        setEntries(data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = entries.filter((e) => {
    // EMPLOYEE FILTER
    if (
      nameFilter &&
      !(e.employeeName || "")
        .toLowerCase()
        .includes(
          nameFilter.toLowerCase()
        )
    ) {
      return false;
    }

    const entryDate = format(
      new Date(e.date),
      "yyyy-MM-dd"
    );

    // SINGLE DATE FILTER
    if (
      filterType === "single" &&
      singleDate
    ) {
      return entryDate === singleDate;
    }

    // RANGE FILTER
    if (filterType === "range") {
      if (from && entryDate < from) {
        return false;
      }

      if (to && entryDate > to) {
        return false;
      }
    }

    return true;
  });

  const clearFilters = () => {
    setNameFilter("");
    setSingleDate("");
    setFrom("");
    setTo("");
    setFilterType("single");
  };

  return (
    <div className="space-y-6">
      {/* FILTER SECTION */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          {/* EMPLOYEE */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Employee Name
            </Label>

            <Input
              placeholder="Search..."
              value={nameFilter}
              onChange={(e) =>
                setNameFilter(
                  e.target.value
                )
              }
            />
          </div>

          {/* FILTER TYPE */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Filter Type
            </Label>

            <Select
              value={filterType}
              onValueChange={(value) => {
                setFilterType(value);

                // RESET DATES
                setSingleDate("");
                setFrom("");
                setTo("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="single">
                  Single Date
                </SelectItem>

                <SelectItem value="range">
                  Date Range
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* SINGLE DATE */}
          {filterType === "single" && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Select Date
              </Label>

              <Input
                type="date"
                value={singleDate}
                onChange={(e) =>
                  setSingleDate(
                    e.target.value
                  )
                }
              />
            </div>
          )}

          {/* DATE RANGE */}
          {filterType === "range" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  From Date
                </Label>

                <Input
                  type="date"
                  value={from}
                  onChange={(e) =>
                    setFrom(
                      e.target.value
                    )
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  To Date
                </Label>

                <Input
                  type="date"
                  value={to}
                  onChange={(e) =>
                    setTo(
                      e.target.value
                    )
                  }
                />
              </div>
            </>
          )}
        </div>

        {/* CLEAR FILTER */}
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            onClick={clearFilters}
          >
            Clear Filters
          </Button>
        </div>
      </section>

      {/* TABLE SECTION */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {loading ? (
          <FullSpinner />
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No matching entries.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    Employee
                  </TableHead>

                  <TableHead>
                    Date
                  </TableHead>

                  <TableHead>
                    Task
                  </TableHead>

                  <TableHead className="w-[200px]">
                    Completion
                  </TableHead>

                  <TableHead>
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {e.employeeName ||
                        "—"}
                    </TableCell>

                    <TableCell>
                      {fmt(e.date)}
                    </TableCell>

                    <TableCell>
                      {e.taskTitle}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={
                            e.completion
                          }
                          className="flex-1"
                        />

                        <span className="w-10 text-right text-xs font-medium">
                          {e.completion}%
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <StatusBadge
                        status={e.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
};

const WorkProgress = () => {
  const { role } = useAuth();

  return (
    <>
      <PageHeader
        title="Work Progress"
        description={
          role === "OWNER"
            ? "Monitor work progress across the team."
            : "Log and review your daily progress."
        }
      />

      {role === "OWNER" ? (
        <OwnerView />
      ) : (
        <EmployeeView />
      )}
    </>
  );
};

export default WorkProgress;