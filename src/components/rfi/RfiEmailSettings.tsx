import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/Spinner";
import { toast } from "@/hooks/use-toast";
import {
  deleteRfiEmailContact,
  getEmployees,
  getErrorMessage,
  getProjects,
  createRfiCcGroup,
  deleteRfiCcGroup,
  getRfiCcGroupsAll,
  getRfiGmailSettings,
  getRfiEmailContacts,
  getRfiProjectContactsAll,
  saveRfiProjectContacts,
  updateRfiCcGroup,
  setRfiEmailContactFavorite,
  type EmployeeOption,
  type ProjectOption,
} from "@/lib/rfiApi";
import {
  RFI_CC_GROUP_COLOR_KEYS,
  rfiCcGroupHex,
  type RfiCcGroup,
  type RfiCcGroupColor,
  type RfiEmailAddressType,
  type RfiEmailContact,
} from "@/types/rfi";
import { hasCcDrag, readCcDrag, writeCcDrag } from "@/components/rfi/RfiCcGroupBubbles";
import {
  Send,
  Plus,
  Star,
  Trash2,
  Users,
  FolderKanban,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  History,
  Check,
  Layers,
  Zap,
  Pencil,
  GripVertical,
  MousePointerClick,
} from "lucide-react";
import { confirmAsync } from "@/lib/confirm";
import { useAuth } from "@/context/AuthContext";
import { getOwnProfile } from "@/lib/profileApi";
import { useUnsavedWarning } from "@/hooks/useUnsavedWarning";

// ── RFI Settings ────────────────────────────────────────────────────────
// Sits before the "Create RFI" / "RFI's" toggle on the RFI page.
//
// The two columns are intentionally sourced differently:
//
//   • Send To  — a running history of addresses actually typed into the
//     "To" field on a sent RFI (recorded automatically by the backend —
//     see RfiServiceImpl#createAndSendRfi). You can star a favorite or
//     remove an address here entirely.
//
//   • CC       — NOT a usage history. This is always the full company
//     employee directory (GET /employees), so anyone in the company is
//     one star away from being a default CC option — you don't have to
//     have already CC'd them once for them to show up here. There's
//     nothing to "add" (the directory already has everyone) or delete
//     (you can't remove a coworker from the company) — starring is the
//     only action.
//
// Either way, starring here writes to the same per-user
// /api/rfi-email-contacts favorite flag, keyed by (type, email) — see
// RfiEmailContactService's javadoc — so the Create RFI form's "Favorites"
// picker (RfiForm.tsx) keeps working unchanged for both types: only what's
// starred on this screen.
//
// This component owns no cross-page state — it just talks to
// /api/rfi-email-contacts (and /employees for the CC directory) directly,
// the same way RfiForm re-fetches favorites whenever it mounts, so
// starring/unstarring here is picked up the next time the Create RFI tab
// is opened.

function sortContacts(contacts: RfiEmailContact[]): RfiEmailContact[] {
  return [...contacts].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
  });
}

function formatDisplayName(username: string): string {
  if (!username) return "";
  return username
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ── Favorites columns (Send To / CC) ────────────────────────────────────
// One simple layout for both columns:
//   ★ Starred      — always visible: the addresses offered in Create RFI → Favorites.
//   Employees      — collapsed by default; everyone in the company, star to add.
//   Sent history   — collapsed by default; addresses you've actually sent / CC'd (stored automatically).
// A search box on top filters all three (and opens the sections that have matches).
// Starring is instant (optimistic) and rolls back with a message if the server says no.

interface CollapsibleProps {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  accent: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const CollapsibleSection = ({ title, count, open, onToggle, accent, icon, children }: CollapsibleProps) => {
  // Render the (possibly long) list only after it was opened once; keep it mounted so it can animate shut.
  const [seen, setSeen] = useState(open);
  useEffect(() => {
    if (open) setSeen(true);
  }, [open]);

  return (
    <div className="rounded-md border border-border/60 bg-background/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/40"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <span style={{ color: accent }}>{icon}</span>
          {title}
          <span
            className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
            style={{ backgroundColor: `${accent}1F`, color: accent }}
          >
            {count}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          {seen && <div className="max-h-[50vh] overflow-y-auto border-t border-border/60 px-1.5 py-1.5">{children}</div>}
        </div>
      </div>
    </div>
  );
};

interface RowProps {
  email: string;
  name?: string;
  starred: boolean;
  busy?: boolean;
  onStar: () => void;
  onDelete?: () => void;
}

const AddressRow = ({ email, name, starred, busy, onStar, onDelete }: RowProps) => (
  <li className="group flex animate-in fade-in slide-in-from-top-1 items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-200 hover:bg-accent/40">
    <button
      type="button"
      disabled={busy}
      onClick={onStar}
      title={starred ? "Unstar (remove from Create RFI favorites)" : "Star (show in Create RFI favorites)"}
      className="shrink-0 transition-transform duration-150 hover:scale-125 active:scale-90 disabled:opacity-50"
    >
      <Star
        className={`h-3.5 w-3.5 transition-colors ${
          starred ? "fill-amber-400 text-amber-500" : "text-muted-foreground/50 hover:text-amber-500"
        }`}
      />
    </button>
    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground" title={email}>
      {name ? (
        <>
          {name}
          <span className="ml-1.5 font-normal text-muted-foreground">{email}</span>
        </>
      ) : (
        email
      )}
    </span>
    {onDelete && (
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        title="Remove from history"
        className="shrink-0 text-muted-foreground/40 opacity-0 transition-all hover:text-destructive group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    )}
  </li>
);

interface FavoritesColumnProps {
  type: RfiEmailAddressType;
  title: string;
  description: string;
  historyTitle: string;
  icon: React.ReactNode;
  accent: string;
}

const FavoritesColumn = ({ type, title, description, historyTitle, icon, accent }: FavoritesColumnProps) => {
  const [contacts, setContacts] = useState<RfiEmailContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeesOpen, setEmployeesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  useEffect(() => {
    let cancelled = false;
    getRfiEmailContacts(type)
      .then((list) => !cancelled && setContacts(list))
      .catch((err) =>
        toast({
          title: `Failed to load ${title.toLowerCase()}`,
          description: getErrorMessage(err),
          variant: "destructive",
        })
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Employees are fetched lazily — only once the section is opened or a search is typed.
  useEffect(() => {
    if (!(employeesOpen || searching) || employees !== null || loadingEmployees) return;
    setLoadingEmployees(true);
    getEmployees()
      .then(setEmployees)
      .catch((err) => {
        setEmployees([]);
        toast({ title: "Failed to load employees", description: getErrorMessage(err), variant: "destructive" });
      })
      .finally(() => setLoadingEmployees(false));
  }, [employeesOpen, searching, employees, loadingEmployees]);

  const people = useMemo(
    () =>
      (employees ?? [])
        .filter((e): e is EmployeeOption & { email: string } => !!e.email)
        .map((e) => ({ email: e.email.trim().toLowerCase(), name: formatDisplayName(e.username) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [employees]
  );
  const nameByEmail = useMemo(() => new Map(people.map((p) => [p.email, p.name])), [people]);

  const matches = (email: string, name?: string) =>
    !searching || email.toLowerCase().includes(q) || (name ?? "").toLowerCase().includes(q);

  const starredKeys = useMemo(
    () => new Set(contacts.filter((c) => c.favorite).map((c) => c.email.toLowerCase())),
    [contacts]
  );
  const starred = useMemo(
    () =>
      contacts
        .filter((c) => c.favorite)
        .sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: "base" })),
    [contacts]
  );
  const history = useMemo(
    () =>
      contacts
        .filter((c) => !c.favorite)
        .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "")), // most recent first
    [contacts]
  );
  const directory = useMemo(() => people.filter((p) => !starredKeys.has(p.email)), [people, starredKeys]);

  const starredShown = starred.filter((c) => matches(c.email, nameByEmail.get(c.email.toLowerCase())));
  const historyShown = history.filter((c) => matches(c.email, nameByEmail.get(c.email.toLowerCase())));
  const directoryShown = directory.filter((p) => matches(p.email, p.name));

  const setFavorite = async (email: string, favorite: boolean) => {
    const key = email.toLowerCase();
    const before = contacts;
    // Instant UI: flip (or insert) locally, then confirm with the server.
    setContacts((cur) =>
      cur.some((c) => c.email.toLowerCase() === key)
        ? cur.map((c) => (c.email.toLowerCase() === key ? { ...c, favorite } : c))
        : [...cur, { type, email: key, favorite }]
    );
    setBusyEmail(key);
    try {
      setContacts(await setRfiEmailContactFavorite(type, email, favorite));
    } catch (err) {
      setContacts(before);
      toast({ title: "Couldn't update favorite", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setBusyEmail(null);
    }
  };

  const removeFromHistory = async (email: string) => {
    const key = email.toLowerCase();
    const before = contacts;
    setContacts((cur) => cur.filter((c) => c.email.toLowerCase() !== key));
    setBusyEmail(key);
    try {
      setContacts(await deleteRfiEmailContact(type, email));
    } catch (err) {
      setContacts(before);
      toast({ title: "Couldn't remove address", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setBusyEmail(null);
    }
  };

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      toast({ title: "Not a valid email", description: email, variant: "destructive" });
      return;
    }
    setNewEmail("");
    void setFavorite(email, true);
  };

  const word = type === "TO" ? "send to" : "cc";

  return (
    <section
      style={{ borderTopColor: accent }}
      className="flex flex-col rounded-xl border border-t-2 border-border/70 bg-card/60 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ backgroundColor: `${accent}1F`, color: accent }}
          >
            {icon}
          </span>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">{title}</h3>
            <p className="text-[10px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: `${accent}1F`, color: accent }}
        >
          {starred.length} starred
        </span>
      </div>

      <div className="shrink-0 space-y-1.5 border-b border-border/60 px-3 py-2">
        <form onSubmit={handleAdd} className="flex items-center gap-1.5">
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder={`Add a ${word} address & star it…`}
            className="h-7 text-[11px] border-border/70 bg-background/60"
          />
          <Button type="submit" size="icon" disabled={!newEmail.trim()} className="h-7 w-7 shrink-0" title="Add & star">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="h-7 border-border/70 bg-background/60 pl-6 pr-6 text-[11px]"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 px-3 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Spinner className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <>
            {/* ★ Starred — always visible */}
            <div>
              <h4 className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> Starred
              </h4>
              {starredShown.length === 0 ? (
                <p className="rounded-md border border-dashed border-border/70 px-2 py-3 text-center text-[11px] text-muted-foreground">
                  {searching
                    ? "No starred address matches."
                    : `Nothing starred yet. Star an address below, or add one above.`}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {starredShown.map((c) => (
                    <AddressRow
                      key={c.email}
                      email={c.email}
                      name={nameByEmail.get(c.email.toLowerCase())}
                      starred
                      busy={busyEmail === c.email.toLowerCase()}
                      onStar={() => setFavorite(c.email, false)}
                    />
                  ))}
                </ul>
              )}
            </div>

            {/* Employees — collapsed */}
            <CollapsibleSection
              title="Employees"
              count={searching ? directoryShown.length : employees ? directory.length : 0}
              open={employeesOpen || (searching && directoryShown.length > 0)}
              onToggle={() => setEmployeesOpen((v) => !v)}
              accent="#9333ea"
              icon={<Users className="h-3.5 w-3.5" />}
            >
              {loadingEmployees || employees === null ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Spinner className="h-4 w-4 animate-spin" />
                </div>
              ) : directoryShown.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  {searching ? "No employee matches." : "Every employee with an email is already starred."}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {directoryShown.map((p) => (
                    <AddressRow
                      key={p.email}
                      email={p.email}
                      name={p.name}
                      starred={false}
                      busy={busyEmail === p.email}
                      onStar={() => setFavorite(p.email, true)}
                    />
                  ))}
                </ul>
              )}
            </CollapsibleSection>

            {/* Sent history — collapsed */}
            <CollapsibleSection
              title={historyTitle}
              count={searching ? historyShown.length : history.length}
              open={historyOpen || (searching && historyShown.length > 0)}
              onToggle={() => setHistoryOpen((v) => !v)}
              accent={accent}
              icon={<History className="h-3.5 w-3.5" />}
            >
              {historyShown.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  {searching ? "No saved address matches." : "Nothing here yet — addresses are saved when you send an RFI."}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {historyShown.map((c) => (
                    <AddressRow
                      key={c.email}
                      email={c.email}
                      name={nameByEmail.get(c.email.toLowerCase())}
                      starred={false}
                      busy={busyEmail === c.email.toLowerCase()}
                      onStar={() => setFavorite(c.email, true)}
                      onDelete={() => removeFromHistory(c.email)}
                    />
                  ))}
                </ul>
              )}
            </CollapsibleSection>
          </>
        )}
      </div>
    </section>
  );
};

// ── Project Addresses ───────────────────────────────────────────────────
// Pick a project (grouped by client), then keep ONE list of that client's email addresses for it —
// no To / CC split here. With no project picked, every project that already has saved emails is listed
// so you can see (and click to edit) what you saved.
//
// Anybody who creates an RFI for that project (you or any other employee) gets the same list as a
// "Project" tab, right next to "Favorites", in BOTH the Send To picker and the CC picker. Which field an
// address goes into is decided when the RFI is written, not here.
//
// Back-end contract: GET returns { projectName, emails[] }, PUT takes { projectName, emails[] }. Older entries
// that still had separate To / CC lists are merged into one list by the server (and again here, to be safe).
//
// Storage (Railway-friendly): the backend keeps ALL of a user's project addresses in one small JSON
// column on the existing rfi_settings row — no new table. One request loads them all (a few KB at most);
// Save replaces both lists of one project in a single request.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PersonOption {
  email: string;
  name: string;
}

interface ProjectListProps {
  label: string;
  placeholder: string;
  items: string[];
  otherItems: string[];
  accent: string;
  disabled: boolean;
  onChange: (next: string[]) => void;
  /** When given, an "Employees" button shows / hides a tick-list of everyone (hidden by default). */
  employees?: PersonOption[];
}

const ProjectAddressList = ({
  label,
  placeholder,
  items,
  otherItems,
  accent,
  disabled,
  onChange,
  employees,
}: ProjectListProps) => {
  const [value, setValue] = useState("");
  const [showEmployees, setShowEmployees] = useState(false);

  const clashToast = (email: string) =>
    toast({
      title: "Already in the other list",
      description: `${email} can't be in both Send To and CC for the same project.`,
      variant: "destructive",
    });

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    const bad = parts.find((p) => !EMAIL_RE.test(p));
    if (bad) {
      toast({ title: "Not a valid email", description: bad, variant: "destructive" });
      return;
    }
    const clash = parts.find((p) => otherItems.includes(p));
    if (clash) {
      clashToast(clash);
      return;
    }
    onChange(Array.from(new Set([...items, ...parts])).sort());
    setValue("");
  };

  const toggleEmployee = (email: string) => {
    if (items.includes(email)) {
      onChange(items.filter((e) => e !== email));
    } else if (otherItems.includes(email)) {
      clashToast(email);
    } else {
      onChange([...items, email].sort());
    }
  };

  return (
    <div className="rounded-md border border-border/60 bg-background/40">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
          {label} <span className="font-normal text-muted-foreground">({items.length})</span>
        </span>
        {employees && (
          <button
            type="button"
            onClick={() => setShowEmployees((v) => !v)}
            aria-expanded={showEmployees}
            className="flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-foreground transition-colors hover:bg-accent/40"
          >
            <Users className="h-3 w-3" style={{ color: accent }} />
            {showEmployees ? "Hide employees" : "Employees"}
            {showEmployees ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {employees && showEmployees && (
        <ul className="max-h-[40vh] space-y-0.5 overflow-y-auto border-t border-border/60 px-1.5 py-1.5">
          {employees.length === 0 ? (
            <li className="px-2 py-2 text-center text-[11px] text-muted-foreground">No employees found.</li>
          ) : (
            employees.map((emp) => (
              <li key={emp.email}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-accent/30">
                  <input
                    type="checkbox"
                    checked={items.includes(emp.email)}
                    disabled={disabled}
                    onChange={() => toggleEmployee(emp.email)}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={emp.email}>
                    {emp.name}
                    <span className="ml-1.5 font-normal text-muted-foreground">{emp.email}</span>
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
      )}

      <div className="flex items-center gap-1.5 border-y border-border/60 px-2.5 py-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(value);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,;\s]/.test(text.trim())) {
              e.preventDefault();
              commit(text);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="h-7 text-[11px] border-border/70 bg-background/60"
        />
        <Button
          type="button"
          size="icon"
          disabled={disabled || !value.trim()}
          onClick={() => commit(value)}
          className="h-7 w-7 shrink-0"
          title="Add address"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">None yet.</p>
      ) : (
        <ul className="max-h-[40vh] space-y-0.5 overflow-y-auto px-1.5 py-1.5">
          {items.map((email) => (
            <li
              key={email}
              className="group flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent/30"
            >
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground" title={email}>
                {email}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(items.filter((e) => e !== email))}
                title="Remove address"
                className="shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

type SavedMap = Record<string, { emails: string[]; updatedBy?: string | null }>;

/** One list out of the stored To + CC (older entries had both). Lower-case, no duplicates, A-Z. */
const mergeEmails = (to?: string[] | null, cc?: string[] | null): string[] =>
  Array.from(new Set([...(to ?? []), ...(cc ?? [])].map((e) => e.trim().toLowerCase()).filter(Boolean))).sort();

// ── Searchable, grouped project picker ──────────────────────────────────
// Replaces the native <select>, which rendered ~150 projects as one unreadable wall of text.
// Click to open → type to filter → projects are grouped under their client, with a small
// "To / CC" badge on the ones that already have saved addresses.

interface ProjectPickerProps {
  value: string;
  groups: ReadonlyArray<readonly [string, ProjectOption[]]>;
  saved: SavedMap;
  disabled: boolean;
  loading: boolean;
  accent: string;
  onSelect: (name: string) => void;
  /** Optional: text for the small badge of a project (default: "n emails" from `saved`). */
  badge?: (projectName: string) => string | null;
}

const ProjectPicker = ({ value, groups, saved, disabled, loading, accent, onSelect, badge }: ProjectPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      groups
        .map(([client, list]) => {
          const clientHit = client.toLowerCase().includes(q);
          return [client, q ? list.filter((p) => clientHit || p.projectName.toLowerCase().includes(q)) : list] as const;
        })
        .filter(([, list]) => list.length > 0),
    [groups, q]
  );
  const total = filtered.reduce((n, [, l]) => n + l.length, 0);

  const pick = (name: string) => {
    setOpen(false);
    setQuery("");
    onSelect(name);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Project"
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border/70 bg-background/60 px-2.5 text-left text-[11px] text-foreground transition-colors hover:bg-accent/30 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-60"
      >
        <span className={`min-w-0 flex-1 truncate ${value ? "font-semibold" : "text-muted-foreground"}`}>
          {loading ? "Loading projects…" : value || "Select a project…"}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border/80 bg-popover shadow-lg animate-in fade-in slide-in-from-top-1">
          <div className="relative border-b border-border/60 p-1.5">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search project or client…"
              className="h-7 border-border/70 bg-background/60 pl-6 text-[11px]"
            />
          </div>
          <div role="listbox" className="max-h-72 overflow-y-auto py-1">
            {total === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">No project matches.</p>
            ) : (
              filtered.map(([client, list]) => (
                <div key={client} className="mb-0.5">
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-muted/90 px-3 py-1 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    <span className="truncate">{client}</span>
                    <span className="ml-2 shrink-0 font-semibold normal-case">{list.length}</span>
                  </div>
                  {list.map((p) => {
                    const c = saved[p.projectName];
                    const badgeText = badge ? badge(p.projectName) : c ? `${c.emails.length} email${c.emails.length === 1 ? "" : "s"}` : null;
                    const isSel = p.projectName === value;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onClick={() => pick(p.projectName)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/50 ${
                          isSel ? "bg-accent/40 font-semibold" : ""
                        }`}
                      >
                        <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                          {isSel && <Check className="h-3 w-3" style={{ color: accent }} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-foreground" title={p.projectName}>
                          {p.projectName}
                        </span>
                        {badgeText && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
                            style={{ backgroundColor: `${accent}1F`, color: accent }}
                          >
                            {badgeText}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ProjectAddressColumn = () => {
  const accent = "#0d9488";
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [all, setAll] = useState<SavedMap>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [clientFilter, setClientFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProjects(), getRfiProjectContactsAll()])
      .then(([list, everything]) => {
        if (cancelled) return;
        setProjects(list);
        const map: SavedMap = {};
        everything.forEach((p) => {
          const list = mergeEmails(p.emails ?? p.to, p.cc);
          if (list.length > 0) map[p.projectName] = { emails: list, updatedBy: p.updatedBy };
        });
        setAll(map);
      })
      .catch((err) =>
        toast({ title: "Failed to load projects", description: getErrorMessage(err), variant: "destructive" })
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = !sameList(emails, saved);
  useUnsavedWarning(dirty);

  const choose = async (name: string) => {
    if (name === selected) return;
    if (dirty && !(await confirmAsync({ title: "Discard unsaved changes?", description: "You have unsaved changes for this project.", confirmLabel: "Discard", destructive: true }))) return;
    const entry = all[name];
    setSelected(name);
    setEmails(entry?.emails ?? []);
    setSaved(entry?.emails ?? []);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      // one list (the Create RFI form offers it in both the Send To and the CC picker)
      const res = await saveRfiProjectContacts({ projectName: selected, emails });
      const list = mergeEmails(res.emails ?? res.to, res.cc);
      setEmails(list);
      setSaved(list);
      setAll((prev) => {
        const next = { ...prev };
        if (list.length === 0) delete next[selected];
        else next[selected] = { emails: list, updatedBy: res.updatedBy };
        return next;
      });
      toast({ title: "Client emails saved", description: `${selected} — available to everyone as "Project" in To and CC` });
    } catch (err) {
      toast({ title: "Couldn't save", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const projectsWithAddresses = Object.keys(all).length;

  // Dropdown categories: one group per client (A-Z), projects A-Z inside each group.
  const projectsByClient = useMemo(() => {
    const groups = new Map<string, ProjectOption[]>();
    projects.forEach((p) => {
      const client = p.client?.trim() || "No client";
      if (!groups.has(client)) groups.set(client, []);
      groups.get(client)!.push(p);
    });
    const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
    return Array.from(groups.entries())
      .sort(([a], [b]) => (a === "No client" ? 1 : b === "No client" ? -1 : cmp(a, b)))
      .map(([client, list]) => [client, [...list].sort((a, b) => cmp(a.projectName, b.projectName))] as const);
  }, [projects]);

  // Overview: only the projects that have saved addresses, still grouped by client.
  const savedByClient = useMemo(
    () =>
      projectsByClient
        .map(([client, list]) => [client, list.filter((p) => all[p.projectName])] as const)
        .filter(([, list]) => list.length > 0),
    [projectsByClient, all]
  );

  return (
    <section
      style={{ borderTopColor: accent }}
      className="flex flex-col rounded-xl border border-t-2 border-border/70 bg-card/60 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ backgroundColor: `${accent}1F`, color: accent }}
          >
            <FolderKanban className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">Project Addresses</h3>
            <p className="text-[10px] text-muted-foreground">Client emails · shared with everyone · saved per project</p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: `${accent}1F`, color: accent }}
        >
          {projectsWithAddresses} project{projectsWithAddresses === 1 ? "" : "s"}
        </span>
      </div>

      <div className="shrink-0 border-b border-border/60 px-3 py-2">
        <ProjectPicker
          value={selected}
          groups={projectsByClient}
          saved={all}
          disabled={loading || saving}
          loading={loading}
          accent={accent}
          onSelect={choose}
        />
      </div>

      <div className="space-y-2 px-3 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Spinner className="h-4 w-4 animate-spin" />
          </div>
        ) : !selected ? (
          savedByClient.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
              Nothing saved yet. Pick a project above and add that client's email addresses —
              everyone will find them under "Project" (next to Favorites) when adding a To or CC address in Create RFI.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {["", ...savedByClient.map(([c]) => c)].map((c) => (
                  <button
                    key={c || "all"}
                    type="button"
                    onClick={() => setClientFilter(c)}
                    className={[
                      "rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold transition-all duration-150 active:scale-95",
                      clientFilter === c
                        ? "border-transparent text-white shadow-sm"
                        : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    ].join(" ")}
                    style={clientFilter === c ? { backgroundColor: accent } : undefined}
                  >
                    {c || "All clients"}
                  </button>
                ))}
              </div>
            {savedByClient
              .filter(([client]) => !clientFilter || client === clientFilter)
              .map(([client, list]) => (
              <div key={client}>
                <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{client}</h4>
                <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((p) => {
                    const entry = all[p.projectName];
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => choose(p.projectName)}
                          title="Click to edit"
                          className="h-full w-full rounded-lg border border-border/60 bg-background/40 px-2.5 py-2 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/30 hover:shadow-sm"
                        >
                          <span className="block truncate text-[11px] font-semibold text-foreground">
                            {p.projectName}
                          </span>
                          <span className="mt-0.5 block break-words text-[10.5px] text-muted-foreground">
                            {entry.emails.join(", ")}
                          </span>
                          {entry.updatedBy && (
                            <span className="mt-1 block text-[9.5px] text-muted-foreground/70">
                              Saved by {entry.updatedBy}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            </>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={() => choose("")}
              className="text-[10.5px] font-semibold text-primary hover:underline"
            >
              ← All saved projects
            </button>
            <ProjectAddressList
              label="Client emails"
              placeholder="client@company.com — press Enter to add"
              items={emails}
              otherItems={[]}
              accent={accent}
              disabled={saving}
              onChange={setEmails}
            />
            <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">
              Just the client's addresses — no To / CC here. When anyone creates an RFI for this project, these appear
              under <b>Project</b> next to <b>Favorites</b> in both the Send To and the CC picker.
            </p>
          </>
        )}
      </div>

      {selected && (
        <div className="sticky bottom-0 flex items-center justify-end gap-2 rounded-b-xl border-t border-border/60 bg-card/95 px-3 py-2 backdrop-blur">
          {dirty && <span className="mr-auto text-[10px] text-amber-600">Unsaved changes</span>}
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={handleSave} className="h-7 text-[11px]">
            {saving ? <Spinner className="mr-1 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        </div>
      )}
    </section>
  );
};

// ── CC Groups ───────────────────────────────────────────────────────────
// Your OWN named groups of people, per project - private to you (nobody else sees them, and a group never
// shows on another project). In Create RFI → CC they appear as bubbles for that project: click a bubble (or
// drag it onto the CC box) and every member is put in CC. Mark a group "Auto" and it's already in CC when
// you start an RFI on that project.
//
// Building a group is hands-on:
//   • DRAG an employee from the list on the right onto a group card, or
//   • open a group (click it) and CLICK employees to add / remove them, or
//   • type an outside address (a client, a consultant) straight into the group.
// Everything saves by itself the moment you change it (optimistic, latest change wins, rolls back with a
// message if the server says no).
//
// Back-end: RfiCcGroupController - GET /all, POST, PUT /{id}, DELETE /{id}.

const MAX_GROUP_MEMBERS = 100;
const MAX_GROUPS_PER_PROJECT = 30;

type GroupPatch = Partial<Pick<RfiCcGroup, "name" | "emails" | "autoSelect" | "color">>;

const sortByName = (list: RfiCcGroup[]) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

interface GroupCardProps {
  group: RfiCcGroup;
  active: boolean;
  saving: boolean;
  deleting: boolean;
  /** an employee / address is being dragged somewhere on the screen */
  dragging: boolean;
  nameByEmail: Map<string, string>;
  onToggleOpen: () => void;
  onPatch: (patch: GroupPatch) => void;
  onAddEmails: (emails: string[]) => void;
  onDelete: () => void;
}

const GroupCard = ({
  group,
  active,
  saving,
  deleting,
  dragging,
  nameByEmail,
  onToggleOpen,
  onPatch,
  onAddEmails,
  onDelete,
}: GroupCardProps) => {
  const hex = rfiCcGroupHex(group.color);
  const [over, setOver] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [extra, setExtra] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const wasSaving = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // brief "Saved ✓" after the spinner stops
  useEffect(() => {
    if (wasSaving.current && !saving) {
      setJustSaved(true);
      const t = window.setTimeout(() => setJustSaved(false), 1400);
      wasSaving.current = saving;
      return () => window.clearTimeout(t);
    }
    wasSaving.current = saving;
  }, [saving]);

  useEffect(() => {
    if (renaming) nameRef.current?.select();
  }, [renaming]);

  const commitName = () => {
    const next = draft.trim().replace(/\s+/g, " ");
    setRenaming(false);
    if (!next) {
      setDraft(group.name);
      return;
    }
    if (next !== group.name) onPatch({ name: next });
  };

  const commitExtra = (raw: string) => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    const bad = parts.find((p) => !EMAIL_RE.test(p));
    if (bad) {
      toast({ title: "Not a valid email", description: bad, variant: "destructive" });
      return;
    }
    onAddEmails(parts);
    setExtra("");
  };

  const preview = group.emails
    .slice(0, 3)
    .map((e) => (nameByEmail.get(e) ?? e.split("@")[0]).split(" ")[0])
    .join(", ");

  return (
    <li
      onDragOver={(e) => {
        if (!hasCcDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        if (!hasCcDrag(e)) return;
        e.preventDefault();
        const emails = readCcDrag(e);
        if (emails.length) onAddEmails(emails);
      }}
      style={{
        borderColor: over ? hex : active ? `${hex}99` : dragging ? `${hex}77` : undefined,
        backgroundColor: over ? `${hex}1A` : active ? `${hex}0D` : undefined,
        boxShadow: over ? `0 0 0 3px ${hex}33, 0 8px 20px -10px ${hex}` : active ? `0 6px 18px -12px ${hex}` : undefined,
      }}
      className={[
        "relative animate-in fade-in slide-in-from-top-1 overflow-hidden rounded-lg border bg-background/50 transition-all duration-200",
        dragging && !over ? "border-dashed" : "border-border/60",
        over ? "scale-[1.015]" : "",
        deleting ? "pointer-events-none scale-95 opacity-40" : "",
      ].join(" ")}
    >
      {/* colour edge */}
      <span className="absolute inset-y-0 left-0 w-1 transition-all duration-200" style={{ backgroundColor: hex, width: active ? 5 : 4 }} />

      {over && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex animate-in fade-in items-center justify-center text-[11px] font-bold backdrop-blur-[1px]"
          style={{ color: hex, backgroundColor: `${hex}14` }}
        >
          Drop to add to “{group.name}”
        </div>
      )}

      {/* header */}
      <div className="flex items-center gap-1.5 py-1.5 pl-3.5 pr-2">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={active}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={active ? "Close" : "Open — then click employees to add them"}
        >
          <span
            className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white transition-transform duration-200"
            style={{ backgroundColor: hex, transform: over ? "scale(1.25)" : undefined }}
          >
            {group.emails.length}
          </span>
          {renaming ? (
            <input
              ref={nameRef}
              value={draft}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setDraft(group.name);
                  setRenaming(false);
                }
              }}
              className="h-6 min-w-0 flex-1 rounded border border-border/70 bg-background px-1.5 text-[11.5px] font-semibold outline-none focus:ring-1 focus:ring-primary/40"
            />
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-semibold text-foreground">{group.name}</span>
              {!active && (
                <span className="block truncate text-[10px] text-muted-foreground">
                  {group.emails.length === 0 ? "Empty — drag employees here" : `${preview}${group.emails.length > 3 ? ` +${group.emails.length - 3}` : ""}`}
                </span>
              )}
            </span>
          )}
        </button>

        {/* save state */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-live="polite">
          {saving ? (
            <Spinner className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : justSaved ? (
            <Check className="h-3.5 w-3.5 animate-in zoom-in-50 text-emerald-500" />
          ) : null}
        </span>

        {/* auto toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={group.autoSelect}
          onClick={() => onPatch({ autoSelect: !group.autoSelect })}
          title={
            group.autoSelect
              ? "Auto: put in CC whenever you start an RFI on this project (click to turn off)"
              : "Turn on to put this group in CC automatically on this project"
          }
          className="flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide transition-all duration-200 active:scale-90"
          style={
            group.autoSelect
              ? { backgroundColor: hex, borderColor: hex, color: "#fff", boxShadow: `0 3px 10px -3px ${hex}` }
              : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
          }
        >
          <Zap className={`h-3 w-3 transition-transform duration-200 ${group.autoSelect ? "scale-110" : ""}`} style={group.autoSelect ? { fill: "#fff" } : undefined} />
          Auto
        </button>

        <button
          type="button"
          onClick={() => {
            setDraft(group.name);
            setRenaming(true);
          }}
          title="Rename"
          className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete group"
          className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <ChevronDown
          onClick={onToggleOpen}
          className={`h-3.5 w-3.5 shrink-0 cursor-pointer text-muted-foreground transition-transform duration-200 ${active ? "rotate-180" : ""}`}
        />
      </div>

      {/* body - slides open */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="space-y-2 border-t border-border/50 py-2 pl-3.5 pr-2.5">
            {/* colour */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">Colour</span>
              {RFI_CC_GROUP_COLOR_KEYS.map((c) => {
                const h = rfiCcGroupHex(c);
                const on = c === group.color;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => !on && onPatch({ color: c })}
                    title={c}
                    aria-label={`Colour ${c}`}
                    aria-pressed={on}
                    className="flex h-4 w-4 items-center justify-center rounded-full transition-transform duration-150 hover:scale-125 active:scale-90"
                    style={{ backgroundColor: h, boxShadow: on ? `0 0 0 2px hsl(var(--background)), 0 0 0 3.5px ${h}` : undefined }}
                  >
                    {on && <Check className="h-2.5 w-2.5 text-white" />}
                  </button>
                );
              })}
            </div>

            {/* members */}
            {group.emails.length === 0 ? (
              <p
                className="rounded-md border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground"
                style={{ borderColor: `${hex}66` }}
              >
                <MousePointerClick className="mx-auto mb-1 h-4 w-4" style={{ color: hex }} />
                No members yet — drag employees onto this card, or click them in the list.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {group.emails.map((email) => (
                  <li
                    key={email}
                    draggable
                    onDragStart={(e) => writeCcDrag(e, [email])}
                    title={`${email}\nDrag onto another group to copy`}
                    className="group/chip animate-in zoom-in-75 fade-in flex cursor-grab items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-[10.5px] font-medium text-foreground transition-all duration-150 hover:-translate-y-px hover:shadow-sm active:cursor-grabbing"
                    style={{ borderColor: `${hex}55`, backgroundColor: `${hex}12` }}
                  >
                    <span className="max-w-[11rem] truncate">{nameByEmail.get(email) ?? email}</span>
                    <button
                      type="button"
                      onClick={() => onPatch({ emails: group.emails.filter((e) => e !== email) })}
                      aria-label={`Remove ${email}`}
                      className="rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* outside address */}
            <div className="flex items-center gap-1.5">
              <Input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitExtra(extra);
                  }
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (/[,;\s]/.test(text.trim())) {
                    e.preventDefault();
                    commitExtra(text);
                  }
                }}
                placeholder="Add an outside address — press Enter"
                className="h-7 border-border/70 bg-background/60 text-[11px]"
              />
              <Button type="button" size="icon" disabled={!extra.trim()} onClick={() => commitExtra(extra)} className="h-7 w-7 shrink-0" title="Add address">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
};

const CcGroupsColumn = () => {
  const accent = "#7c3aed";
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [groups, setGroups] = useState<RfiCcGroup[]>([]);
  const groupsRef = useRef<RfiCcGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);

  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [dragging, setDragging] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<RfiCcGroupColor>("teal");
  const [createBusy, setCreateBusy] = useState(false);

  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const inflight = useRef<Set<number>>(new Set());
  const queued = useRef<Set<number>>(new Set());
  const [clientFilter, setClientFilter] = useState("");
  const { name: authName } = useAuth();
  const [gmailFrom, setGmailFrom] = useState("");
  // Who I am, straight from /profile/me (exact username + email) - no guessing from the display name.
  const [me, setMe] = useState<{ username: string; email: string }>({ username: "", email: "" });

  const commit = (next: RfiCcGroup[]) => {
    groupsRef.current = next;
    setGroups(next);
  };

  const markSaving = (id: number, on: boolean) =>
    setSavingIds((cur) => {
      const n = new Set(cur);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  // First load: projects + ALL my groups (one small request each).
  useEffect(() => {
    let cancelled = false;
    Promise.all([getProjects(), getRfiCcGroupsAll(true)])
      .then(([list, all]) => {
        if (cancelled) return;
        setProjects(list);
        commit(all);
      })
      .catch((err) => toast({ title: "Failed to load CC groups", description: getErrorMessage(err), variant: "destructive" }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Employees are only needed once a project is open.
  useEffect(() => {
    if (!selected || employees !== null) return;
    getEmployees()
      .then(setEmployees)
      .catch((err) => {
        setEmployees([]);
        toast({ title: "Failed to load employees", description: getErrorMessage(err), variant: "destructive" });
      });
  }, [selected, employees]);

  // My own profile (username + email) - silent on failure.
  useEffect(() => {
    getOwnProfile()
      .then((p) => setMe({ username: (p.username ?? "").trim().toLowerCase(), email: (p.email ?? "").trim().toLowerCase() }))
      .catch(() => undefined);
  }, []);

  // My own From address (Gmail the RFIs go out from) - silent on failure.
  useEffect(() => {
    getRfiGmailSettings()
      .then((st) => setGmailFrom(st?.gmailEmail?.trim().toLowerCase() ?? ""))
      .catch(() => undefined);
  }, []);

  // A drag that ends anywhere must always switch the "drop here" highlights off.
  useEffect(() => {
    const off = () => setDragging(false);
    window.addEventListener("dragend", off);
    window.addEventListener("drop", off);
    return () => {
      window.removeEventListener("dragend", off);
      window.removeEventListener("drop", off);
    };
  }, []);

  const resync = async () => {
    try {
      commit(await getRfiCcGroupsAll(true));
    } catch {
      /* the toast of the failed call is enough */
    }
  };

  // ── Me: my own address never belongs in my CC groups (it's the From address of every RFI I send) ──
  const mine = useMemo(() => {
    const set = new Set<string>();
    if (gmailFrom) set.add(gmailFrom);
    if (me.email) set.add(me.email);
    const n = authName?.trim().toLowerCase();
    const myRows = (employees ?? []).filter((e) => {
      const u = e.username.trim().toLowerCase();
      return (
        (me.username && u === me.username) ||
        (n && (u === n || formatDisplayName(e.username).trim().toLowerCase() === n))
      );
    });
    myRows.forEach((e) => {
      const email = e.email?.trim().toLowerCase();
      if (email) set.add(email);
    });
    return set;
  }, [authName, employees, gmailFrom, me]);

  // My own row in the employee list (by username), even if its email differs from my profile email.
  const isMyRow = (e: { username: string }) => {
    const u = e.username.trim().toLowerCase();
    const n = authName?.trim().toLowerCase();
    return (!!me.username && u === me.username) || (!!n && u === n);
  };

  // ── Saving: optimistic, one request at a time per group, newest state wins ──
  const persist = async (id: number) => {
    if (inflight.current.has(id)) {
      queued.current.add(id);
      return;
    }
    inflight.current.add(id);
    markSaving(id, true);
    try {
      do {
        queued.current.delete(id);
        const g = groupsRef.current.find((x) => x.id === id);
        if (!g) break;
        const saved = await updateRfiCcGroup(id, {
          name: g.name,
          emails: g.emails,
          autoSelect: g.autoSelect,
          color: String(g.color),
        });
        // Only take the server's tidy version when nothing newer is waiting.
        if (!queued.current.has(id)) {
          commit(groupsRef.current.map((x) => (x.id === id ? { ...x, ...saved } : x)));
        }
      } while (queued.current.has(id));
    } catch (err) {
      queued.current.delete(id);
      toast({ title: "Couldn't save the group", description: getErrorMessage(err), variant: "destructive" });
      await resync();
    } finally {
      inflight.current.delete(id);
      markSaving(id, false);
    }
  };

  const patchGroup = (id: number, patch: GroupPatch) => {
    commit(groupsRef.current.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    void persist(id);
  };

  const addEmails = (id: number, emails: string[]) => {
    const g = groupsRef.current.find((x) => x.id === id);
    if (!g) return;
    const have = new Set(g.emails);
    const wanted = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()))).filter(Boolean);
    const others = wanted.filter((e) => !mine.has(e));
    if (wanted.length > 0 && others.length === 0) {
      toast({ title: "That's you", description: "Your own address isn't needed in a CC group — it's the From address." });
      return;
    }
    const fresh = others.filter((e) => !have.has(e));
    if (fresh.length === 0) {
      toast({ title: "Already in the group", description: g.name });
      return;
    }
    if (g.emails.length + fresh.length > MAX_GROUP_MEMBERS) {
      toast({
        title: "Group is full",
        description: `A CC group can have at most ${MAX_GROUP_MEMBERS} addresses.`,
        variant: "destructive",
      });
      return;
    }
    patchGroup(id, { emails: [...g.emails, ...fresh].sort() });
    setActiveId(id);
  };

  const removeGroup = async (g: RfiCcGroup) => {
    const ok = await confirmAsync({
      title: `Delete “${g.name}”?`,
      description: "This CC group is removed for you on this project. The people in it are not affected.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingIds((cur) => new Set(cur).add(g.id));
    try {
      await deleteRfiCcGroup(g.id);
      commit(groupsRef.current.filter((x) => x.id !== g.id));
      setActiveId((cur) => (cur === g.id ? null : cur));
      toast({ title: "Group deleted", description: g.name });
    } catch (err) {
      toast({ title: "Couldn't delete the group", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setDeletingIds((cur) => {
        const n = new Set(cur);
        n.delete(g.id);
        return n;
      });
    }
  };

  // ── Derived ──
  const projectGroups = useMemo(
    () => sortByName(groups.filter((g) => g.projectName === selected)),
    [groups, selected]
  );
  const countByProject = useMemo(() => {
    const m = new Map<string, number>();
    groups.forEach((g) => m.set(g.projectName, (m.get(g.projectName) ?? 0) + 1));
    return m;
  }, [groups]);

  const people = useMemo(
    () =>
      (employees ?? [])
        .filter((e): e is EmployeeOption & { email: string } => !!e.email && !isMyRow(e))
        .map((e) => ({ email: e.email.trim().toLowerCase(), name: formatDisplayName(e.username) }))
        .filter((p) => !mine.has(p.email))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, mine, me, authName]
  );
  const nameByEmail = useMemo(() => new Map(people.map((p) => [p.email, p.name])), [people]);

  // Groups saved earlier that still contain me: take me out once (the form skips me anyway).
  useEffect(() => {
    if (mine.size === 0 || loading) return;
    groupsRef.current
      .filter((g) => g.emails.some((e) => mine.has(e)))
      .forEach((g) => patchGroup(g.id, { emails: g.emails.filter((e) => !mine.has(e)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, loading]);
  const pq = peopleQuery.trim().toLowerCase();
  const peopleShown = useMemo(
    () => (pq ? people.filter((p) => p.email.includes(pq) || p.name.toLowerCase().includes(pq)) : people),
    [people, pq]
  );

  const activeGroup = projectGroups.find((g) => g.id === activeId) ?? null;
  const activeHex = activeGroup ? rfiCcGroupHex(activeGroup.color) : accent;
  const activeMembers = useMemo(() => new Set(activeGroup?.emails ?? []), [activeGroup]);

  const projectsByClient = useMemo(() => {
    const byClient = new Map<string, ProjectOption[]>();
    projects.forEach((p) => {
      const client = p.client?.trim() || "No client";
      if (!byClient.has(client)) byClient.set(client, []);
      byClient.get(client)!.push(p);
    });
    const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
    return Array.from(byClient.entries())
      .sort(([a], [b]) => (a === "No client" ? 1 : b === "No client" ? -1 : cmp(a, b)))
      .map(([client, list]) => [client, [...list].sort((a, b) => cmp(a.projectName, b.projectName))] as const);
  }, [projects]);

  const withGroupsByClient = useMemo(
    () =>
      projectsByClient
        .map(([client, list]) => [client, list.filter((p) => countByProject.has(p.projectName))] as const)
        .filter(([, list]) => list.length > 0),
    [projectsByClient, countByProject]
  );

  // ── Actions ──
  const choose = (name: string) => {
    setSelected(name);
    setActiveId(null);
    setCreating(false);
    setNewName("");
    setPeopleQuery("");
  };

  const startCreate = () => {
    const used = new Set(projectGroups.map((g) => g.color));
    setNewColor(RFI_CC_GROUP_COLOR_KEYS.find((c) => !used.has(c)) ?? RFI_CC_GROUP_COLOR_KEYS[projectGroups.length % RFI_CC_GROUP_COLOR_KEYS.length]);
    setNewName("");
    setCreating(true);
  };

  const handleCreate = async () => {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name || !selected) return;
    setCreateBusy(true);
    try {
      const created = await createRfiCcGroup({ projectName: selected, name, emails: [], autoSelect: false, color: newColor });
      commit([...groupsRef.current, created]);
      setActiveId(created.id);
      setCreating(false);
      setNewName("");
      toast({ title: "Group created", description: `${created.name} — now drag employees into it.` });
    } catch (err) {
      toast({ title: "Couldn't create the group", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setCreateBusy(false);
    }
  };

  const clickPerson = (email: string) => {
    let target = activeGroup;
    if (!target && projectGroups.length === 1) target = projectGroups[0];
    if (!target) {
      toast({
        title: projectGroups.length === 0 ? "Create a group first" : "Open a group first",
        description:
          projectGroups.length === 0
            ? "Use “New group”, then add people."
            : "Click a group to open it, or drag the person onto a group.",
      });
      return;
    }
    if (target.emails.includes(email)) patchGroup(target.id, { emails: target.emails.filter((e) => e !== email) });
    else addEmails(target.id, [email]);
  };

  const totalGroups = groups.length;

  return (
    <section
      style={{ borderTopColor: accent }}
      className="flex flex-col rounded-xl border border-t-2 border-border/70 bg-card/60 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: `${accent}1F`, color: accent }}>
            <Layers className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">CC Groups</h3>
            <p className="text-[10px] text-muted-foreground">Your own groups · private to you · saved per project · shown as bubbles in CC</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${accent}1F`, color: accent }}>
          {totalGroups} group{totalGroups === 1 ? "" : "s"}
        </span>
      </div>

      <div className="shrink-0 border-b border-border/60 px-3 py-2">
        <ProjectPicker
          value={selected}
          groups={projectsByClient}
          saved={{}}
          disabled={loading}
          loading={loading}
          accent={accent}
          onSelect={choose}
          badge={(name) => {
            const n = countByProject.get(name);
            return n ? `${n} group${n === 1 ? "" : "s"}` : null;
          }}
        />
      </div>

      <div className="space-y-2 px-3 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Spinner className="h-4 w-4 animate-spin" />
          </div>
        ) : !selected ? (
          withGroupsByClient.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <Layers className="mx-auto mb-1.5 h-6 w-6" style={{ color: accent }} />
              <p className="text-[11px] text-muted-foreground">
                No CC groups yet. Pick a project above, create a group (say “Structural team”) and drag employees into it.
                <br />
                In Create RFI it shows up as a bubble in CC — one click and everyone in it is CC’d.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {["", ...withGroupsByClient.map(([c]) => c)].map((c) => (
                  <button
                    key={c || "all"}
                    type="button"
                    onClick={() => setClientFilter(c)}
                    className={[
                      "rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold transition-all duration-150 active:scale-95",
                      clientFilter === c
                        ? "border-transparent text-white shadow-sm"
                        : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    ].join(" ")}
                    style={clientFilter === c ? { backgroundColor: accent } : undefined}
                  >
                    {c || "All clients"}
                  </button>
                ))}
              </div>
              {withGroupsByClient
                .filter(([client]) => !clientFilter || client === clientFilter)
                .map(([client, list]) => (
                  <div key={client}>
                    <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{client}</h4>
                    <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                      {list.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => choose(p.projectName)}
                            title="Click to edit"
                            className="animate-in fade-in h-full w-full rounded-lg border border-border/60 bg-background/40 px-2.5 py-2 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/30 hover:shadow-sm"
                          >
                            <span className="block truncate text-[11px] font-semibold text-foreground">{p.projectName}</span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              {sortByName(groups.filter((g) => g.projectName === p.projectName)).map((g) => {
                                const h = rfiCcGroupHex(g.color);
                                return (
                                  <span
                                    key={g.id}
                                    className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
                                    style={{ borderColor: `${h}55`, backgroundColor: `${h}14`, color: h }}
                                  >
                                    {g.name}
                                    <span className="rounded-full px-1 text-[9px] tabular-nums" style={{ backgroundColor: `${h}22` }}>
                                      {g.emails.length}
                                    </span>
                                    {g.autoSelect && <Zap className="h-2.5 w-2.5" style={{ fill: h }} />}
                                  </span>
                                );
                              })}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </>
          )
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => choose("")} className="text-[10.5px] font-semibold text-primary hover:underline">
                ← All projects
              </button>
              <Button
                type="button"
                size="sm"
                onClick={startCreate}
                disabled={creating || projectGroups.length >= MAX_GROUPS_PER_PROJECT}
                className="h-7 gap-1 text-[11px]"
                style={{ backgroundColor: accent }}
              >
                <Plus className="h-3.5 w-3.5" /> New group
              </Button>
            </div>

            {/* new-group form */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${creating ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div
                  className="space-y-2 rounded-lg border border-dashed p-2.5"
                  style={{ borderColor: `${rfiCcGroupHex(newColor)}88`, backgroundColor: `${rfiCcGroupHex(newColor)}0D` }}
                >
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus={creating}
                      value={newName}
                      maxLength={60}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreate();
                        }
                        if (e.key === "Escape") setCreating(false);
                      }}
                      placeholder="Group name — e.g. Structural team"
                      className="h-7 border-border/70 bg-background/80 text-[11px]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newName.trim() || createBusy}
                      onClick={handleCreate}
                      className="h-7 shrink-0 text-[11px]"
                      style={{ backgroundColor: rfiCcGroupHex(newColor) }}
                    >
                      {createBusy ? <Spinner className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Create
                    </Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setCreating(false)} className="h-7 w-7 shrink-0" title="Cancel">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">Bubble colour</span>
                    {RFI_CC_GROUP_COLOR_KEYS.map((c) => {
                      const h = rfiCcGroupHex(c);
                      const on = c === newColor;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewColor(c)}
                          title={c}
                          aria-label={`Colour ${c}`}
                          aria-pressed={on}
                          className="flex h-4 w-4 items-center justify-center rounded-full transition-transform duration-150 hover:scale-125 active:scale-90"
                          style={{ backgroundColor: h, boxShadow: on ? `0 0 0 2px hsl(var(--background)), 0 0 0 3.5px ${h}` : undefined }}
                        >
                          {on && <Check className="h-2.5 w-2.5 text-white" />}
                        </button>
                      );
                    })}
                    {newName.trim() && (
                      <span
                        className="ml-auto animate-in fade-in zoom-in-75 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
                        style={{
                          borderColor: `${rfiCcGroupHex(newColor)}66`,
                          backgroundColor: `${rfiCcGroupHex(newColor)}1A`,
                          color: rfiCcGroupHex(newColor),
                        }}
                      >
                        {newName.trim()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
              {/* groups */}
              <div className="min-w-0">
                {projectGroups.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center">
                    <Layers className="mx-auto mb-1.5 h-6 w-6 animate-pulse" style={{ color: accent }} />
                    <p className="text-[11px] text-muted-foreground">
                      No groups on this project yet.
                      <br />
                      Press <b>New group</b>, name it, then drag employees into it.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {projectGroups.map((g) => (
                      <GroupCard
                        key={g.id}
                        group={g}
                        active={g.id === activeId}
                        saving={savingIds.has(g.id)}
                        deleting={deletingIds.has(g.id)}
                        dragging={dragging}
                        nameByEmail={nameByEmail}
                        onToggleOpen={() => setActiveId((cur) => (cur === g.id ? null : g.id))}
                        onPatch={(patch) => patchGroup(g.id, patch)}
                        onAddEmails={(emails) => addEmails(g.id, emails)}
                        onDelete={() => removeGroup(g)}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {/* employees to drag */}
              <div className="min-w-0 rounded-lg border border-border/60 bg-background/40">
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: activeHex }}>
                    <Users className="h-3.5 w-3.5" /> Employees
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {activeGroup ? (
                      <>
                        adding to <b style={{ color: activeHex }}>{activeGroup.name}</b>
                      </>
                    ) : (
                      "drag onto a group"
                    )}
                  </span>
                </div>
                <div className="relative border-y border-border/60 px-2 py-1.5">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={peopleQuery}
                    onChange={(e) => setPeopleQuery(e.target.value)}
                    placeholder="Search name or email…"
                    className="h-7 border-border/70 bg-background/60 pl-6 pr-6 text-[11px]"
                  />
                  {pq && (
                    <button
                      type="button"
                      onClick={() => setPeopleQuery("")}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title="Clear search"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {employees === null ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground">
                    <Spinner className="h-4 w-4 animate-spin" />
                  </div>
                ) : peopleShown.length === 0 ? (
                  <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">{pq ? "No employee matches." : "No employees found."}</p>
                ) : (
                  <ul className="max-h-[46vh] space-y-0.5 overflow-y-auto p-1">
                    {peopleShown.map((p) => {
                      const inGroup = activeMembers.has(p.email);
                      return (
                        <li
                          key={p.email}
                          draggable
                          onDragStart={(e) => {
                            writeCcDrag(e, [p.email]);
                            setDragging(true);
                          }}
                          onDragEnd={() => setDragging(false)}
                          onClick={() => clickPerson(p.email)}
                          title={`${p.email}\nDrag onto a group — or click to ${inGroup ? "remove from" : "add to"} the open group`}
                          className="group flex cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1 transition-all duration-150 hover:translate-x-0.5 hover:bg-accent/50 active:cursor-grabbing active:scale-[0.98]"
                          style={inGroup ? { backgroundColor: `${activeHex}14` } : undefined}
                        >
                          <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                            style={{ backgroundColor: inGroup ? activeHex : "hsl(var(--muted-foreground) / 0.45)" }}
                          >
                            {(p.name[0] ?? "?").toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                            {p.name}
                            <span className="ml-1.5 font-normal text-muted-foreground">{p.email}</span>
                          </span>
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                            {inGroup ? (
                              <Check className="h-3.5 w-3.5 animate-in zoom-in-50" style={{ color: activeHex }} />
                            ) : (
                              <Plus className="h-3 w-3 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">
              In <b>Create RFI → CC</b> these show as bubbles for this project only. Click a bubble (or drag it onto the CC box) to CC
              everyone in the group. Turn <b>Auto</b> on and the group is in CC every time you start an RFI here. Only you can see them.
            </p>
          </>
        )}
      </div>
    </section>
  );
};

export const RfiEmailSettings = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
      {/* 1 — Project addresses (full width, grows with its content) */}
      <ProjectAddressColumn />

      {/* 1b — My CC groups (private to me, per project) */}
      <CcGroupsColumn />

      {/* 2 — Favorites, below it: Send To and CC side by side, each as tall as it needs to be */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        <FavoritesColumn
          type="TO"
          title="Send To Addresses"
          description="Star who you send RFIs to"
          historyTitle="Sent to before"
          icon={<Send className="h-3.5 w-3.5" />}
          accent="#2563eb"
        />
        <FavoritesColumn
          type="CC"
          title="CC Addresses"
          description="Star who you CC by default"
          historyTitle="CC'd before"
          icon={<Users className="h-3.5 w-3.5" />}
          accent="#9333ea"
        />
      </div>
    </div>
  );
};