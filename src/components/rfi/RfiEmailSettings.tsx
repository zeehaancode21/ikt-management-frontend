import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/Spinner";
import { toast } from "@/hooks/use-toast";
import {
  addRfiEmailContact,
  deleteRfiEmailContact,
  getEmployees,
  getErrorMessage,
  getRfiEmailContacts,
  setRfiEmailContactFavorite,
  type EmployeeOption,
} from "@/lib/rfiApi";
import type { RfiEmailAddressType, RfiEmailContact } from "@/types/rfi";
import { Mail, Send, Plus, Star, Trash2, Settings as SettingsIcon, Users } from "lucide-react";

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

interface ColumnProps {
  type: RfiEmailAddressType;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
}

const AddressColumn = ({ type, title, description, icon, accent }: ColumnProps) => {
  const [contacts, setContacts] = useState<RfiEmailContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getRfiEmailContacts(type)
      .then((list) => setContacts(sortContacts(list)))
      .catch((err) =>
        toast({
          title: `Failed to load ${title.toLowerCase()} addresses`,
          description: getErrorMessage(err),
          variant: "destructive",
        })
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const updated = await addRfiEmailContact(type, trimmed);
      setContacts(sortContacts(updated));
      setNewEmail("");
    } catch (err) {
      toast({
        title: "Couldn't add address",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleToggleFavorite = async (contact: RfiEmailContact) => {
    setBusyEmail(contact.email);
    try {
      const updated = await setRfiEmailContactFavorite(type, contact.email, !contact.favorite);
      setContacts(sortContacts(updated));
    } catch (err) {
      toast({
        title: "Couldn't update favorite",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyEmail(null);
    }
  };

  const handleDelete = async (contact: RfiEmailContact) => {
    setBusyEmail(contact.email);
    try {
      const updated = await deleteRfiEmailContact(type, contact.email);
      setContacts(sortContacts(updated));
    } catch (err) {
      toast({
        title: "Couldn't remove address",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyEmail(null);
    }
  };

  const favoriteCount = contacts.filter((c) => c.favorite).length;

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/70 bg-card/60 shadow-sm">
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
          {favoriteCount} favorite{favoriteCount === 1 ? "" : "s"}
        </span>
      </div>

      <form onSubmit={handleAdd} className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <Input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder={`Add a ${type === "TO" ? "send to" : "cc"} address…`}
          disabled={adding}
          className="h-7 text-[11px] border-border/70 bg-background/60"
        />
        <Button
          type="submit"
          size="icon"
          disabled={adding || !newEmail.trim()}
          className="h-7 w-7 shrink-0"
          title="Add address"
        >
          {adding ? <Spinner className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Spinner className="h-4 w-4 animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            No {type === "TO" ? "send to" : "cc"} addresses yet. Add one above, or send an RFI and it'll show up
            here automatically.
          </div>
        ) : (
          <ul className="space-y-1">
            {contacts.map((contact) => {
              const isBusy = busyEmail === contact.email;
              return (
                <li
                  key={contact.email}
                  className="group flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border/70 hover:bg-accent/30"
                >
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleFavorite(contact)}
                    title={contact.favorite ? "Unstar (hide from Create RFI)" : "Star as favorite (show in Create RFI)"}
                    className="shrink-0 text-muted-foreground/60 transition-colors hover:text-amber-500 disabled:opacity-50"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${contact.favorite ? "fill-amber-400 text-amber-500" : ""}`}
                    />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground" title={contact.email}>
                    {contact.email}
                  </span>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDelete(contact)}
                    title="Remove address"
                    className="shrink-0 text-muted-foreground/40 opacity-0 transition-all hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

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

/**
 * CC column: always the full employee directory, not a usage history.
 * Every employee with an email on file is listed; starring one writes a
 * `favorite = true` RfiEmailContact row of type CC for that email (creating
 * it first if it doesn't exist yet — same setFavorite endpoint the TO
 * column uses), which is exactly what RfiForm's CC "Favorites" tab reads.
 * There's no add/remove here — the directory itself is the source of truth
 * for who *can* be favorited, so the only action is the star toggle.
 */
const EmployeeCcColumn = () => {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [favoriteEmails, setFavoriteEmails] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([getEmployees(), getRfiEmailContacts("CC")])
      .then(([employeeList, ccContacts]) => {
        setEmployees(employeeList);
        setFavoriteEmails(
          new Set(
            ccContacts.filter((c) => c.favorite).map((c) => c.email.toLowerCase())
          )
        );
      })
      .catch((err) =>
        toast({
          title: "Failed to load employees",
          description: getErrorMessage(err),
          variant: "destructive",
        })
      )
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleToggleFavorite = async (email: string, currentlyFavorite: boolean) => {
    setBusyEmail(email);
    try {
      await setRfiEmailContactFavorite("CC", email, !currentlyFavorite);
      setFavoriteEmails((prev) => {
        const next = new Set(prev);
        const key = email.toLowerCase();
        if (currentlyFavorite) next.delete(key);
        else next.add(key);
        return next;
      });
    } catch (err) {
      toast({
        title: "Couldn't update favorite",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyEmail(null);
    }
  };

  const employeesWithEmail = employees.filter(
    (e): e is EmployeeOption & { email: string } => !!e.email
  );
  // Favorites first, then alphabetical by display name — mirrors sortContacts.
  const sorted = [...employeesWithEmail].sort((a, b) => {
    const aFav = favoriteEmails.has(a.email.toLowerCase());
    const bFav = favoriteEmails.has(b.email.toLowerCase());
    if (aFav !== bFav) return aFav ? -1 : 1;
    return formatDisplayName(a.username).localeCompare(formatDisplayName(b.username), undefined, {
      sensitivity: "base",
    });
  });
  const favoriteCount = favoriteEmails.size;
  const accent = "#9333ea";

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/70 bg-card/60 shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ backgroundColor: `${accent}1F`, color: accent }}
          >
            <Users className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">CC Addresses</h3>
            <p className="text-[10px] text-muted-foreground">Every employee — star who you want to CC by default</p>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: `${accent}1F`, color: accent }}
        >
          {favoriteCount} favorite{favoriteCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Spinner className="h-4 w-4 animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            No employees with an email on file yet.
          </div>
        ) : (
          <ul className="space-y-1">
            {sorted.map((emp) => {
              const isFavorite = favoriteEmails.has(emp.email.toLowerCase());
              const isBusy = busyEmail === emp.email;
              return (
                <li
                  key={emp.id}
                  className="flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border/70 hover:bg-accent/30"
                >
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleFavorite(emp.email, isFavorite)}
                    title={isFavorite ? "Unstar (hide from Create RFI)" : "Star as favorite (show in Create RFI)"}
                    className="shrink-0 text-muted-foreground/60 transition-colors hover:text-amber-500 disabled:opacity-50"
                  >
                    <Star className={`h-3.5 w-3.5 ${isFavorite ? "fill-amber-400 text-amber-500" : ""}`} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground" title={emp.email}>
                    {formatDisplayName(emp.username)}
                    <span className="ml-1.5 font-normal text-muted-foreground">{emp.email}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export const RfiEmailSettings = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border/80 bg-card/60 px-3 py-2 shadow-sm">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <SettingsIcon className="h-3.5 w-3.5" />
        </span>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">RFI Settings</h2>
          <p className="text-[10.5px] text-muted-foreground">
            Star an address to make it available in the Create RFI form.
          </p>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden md:grid-cols-2">
        <AddressColumn
          type="TO"
          title="Send To Addresses"
          description="Recipients you've previously sent RFIs to"
          icon={<Send className="h-3.5 w-3.5" />}
          accent="#2563eb"
        />
        <EmployeeCcColumn />
      </div>
    </div>
  );
};

export default RfiEmailSettings;