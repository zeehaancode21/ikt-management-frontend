import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useRfiAccess } from "@/hooks/useRfiAccess";
import { useProjectsAccess } from "@/hooks/useModuleAccess";
import { SHORTCUT_EVENT } from "@/lib/shortcuts";

type Cmd = { id: string; label: string; hint?: string; run: () => void };

/** The list + search. Only mounted while open, so it costs nothing the rest of the time. */
function PaletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { role, name } = useAuth();
  const { toggleTheme } = useTheme();
  const { allowed: hasRfi } = useRfiAccess();
  const { allowed: hasProjects } = useProjectsAccess();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => navigate(to);
    const isOwner = role === "OWNER";
    const isLead = role === "LEAD";
    const isZeeshan = (name || "").trim().toLowerCase() === "zeeshan";

    // Mirrors AppSidebar + the route guards in App.tsx, so each person only
    // sees pages that are really part of their own menu.
    const list: Cmd[] = [];

    if (isOwner) {
      // Owner sidebar: Admin & Media, RFI, Employee Portal, Projects
      list.push(
        { id: "admin", label: "Admin Console", hint: "Page", run: go("/admin") },
        { id: "media", label: "Media Hub", hint: "Page", run: go("/social-hub") },
        { id: "rfi", label: "RFI", hint: "Page", run: go("/rfi") },
        { id: "hub", label: "Employee Hub", hint: "Page", run: go("/employee-hub") },
        { id: "hours", label: "Hours Dashboard", hint: "Page", run: go("/hours-dashboard") },
        { id: "projects", label: "Projects", hint: "Page", run: go("/dashboard") },
        { id: "wkdash", label: "Weekend Attendance Dashboard", hint: "Page", run: go("/weekend-attendance/dashboard") },
        { id: "mail", label: "Owner Mail", hint: "Page", run: go("/owner-mail") },
        { id: "vault", label: "Vault", hint: "Page", run: go("/vault") },
        { id: "mydocs", label: "My Documents", hint: "Page", run: go("/my-documents") },
        { id: "reports", label: "Work Report", hint: "Page", run: go("/reports") },
        { id: "leave", label: "Leave Portal", hint: "Page", run: go("/leave") },
        { id: "perm", label: "Permission Portal", hint: "Page", run: go("/permission") },
      );
    } else {
      // Lead / Admin / Employee sidebar: [Media Hub for Zeeshan], [RFI], [Projects], Work Record, Leave & Permission
      if (isZeeshan) list.push({ id: "media", label: "Media Hub", hint: "Page", run: go("/social-hub") });
      if (hasRfi) list.push({ id: "rfi", label: "RFI", hint: "Page", run: go("/rfi") });
      if (hasProjects) list.push({ id: "projects", label: "Projects", hint: "Page", run: go("/dashboard") });
      list.push(
        { id: "reports", label: "Work Report", hint: "Page", run: go("/reports") },
        { id: "weekend", label: "Weekend Entry", hint: "Page", run: go("/weekend-attendance") },
        { id: "leave", label: "Leave Portal", hint: "Page", run: go("/leave") },
        { id: "perm", label: "Permission Portal", hint: "Page", run: go("/permission") },
      );
      if (isLead) {
        list.push({ id: "mydocs", label: "My Documents", hint: "Page", run: go("/my-documents") });
      }
    }

    // Header items every signed-in person has
    list.push(
      { id: "messages", label: "Messages", hint: "Ctrl+M", run: go("/messages") },
      { id: "docs", label: "Documents", hint: "Ctrl+D", run: go("/documents") },
      { id: "profile", label: "My Profile", hint: "Page", run: go("/my-profile") },
      { id: "notepad", label: "Toggle Notepad", hint: "Ctrl+N", run: () => window.dispatchEvent(new Event(SHORTCUT_EVENT.notepad)) },
      { id: "theme", label: "Switch light / dark theme", hint: "Ctrl+T", run: toggleTheme },
    );
    return list;
  }, [navigate, role, name, hasRfi, hasProjects, toggleTheme]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? cmds.filter((c) => c.label.toLowerCase().includes(t)) : cmds;
  }, [cmds, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (c?: Cmd) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[active]); }
  };

  return (
    <>
      <DialogTitle className="sr-only">Quick search</DialogTitle>
      <DialogDescription className="sr-only">Type to find a page or action, then press Enter.</DialogDescription>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Go to a page or run an action…"
        aria-label="Search pages and actions"
        role="combobox"
        aria-expanded="true"
        aria-controls="cmdk-list"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <ul id="cmdk-list" ref={listRef} role="listbox" className="max-h-72 overflow-y-auto">
        {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches "{q}".</li>}
        {results.map((c, i) => (
          <li
            key={c.id}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(c)}
            className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm ${i === active ? "bg-accent text-accent-foreground" : ""}`}
          >
            <span>{c.label}</span>
            {c.hint && <span className="text-xs text-muted-foreground">{c.hint}</span>}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">↑↓ to move · Enter to open · Esc to close</p>
    </>
  );
}

/** Ctrl+K (or ⌘K) quick-jump. One keydown listener; nothing runs until it is opened. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[25%] max-w-lg gap-3 p-3">
        {open && <PaletteBody onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}