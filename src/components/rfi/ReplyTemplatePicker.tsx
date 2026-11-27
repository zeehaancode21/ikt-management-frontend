import { useCallback, useEffect, useState } from "react";
import { BookmarkPlus, ChevronDown, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Spinner } from "@/components/Spinner";
import {
  createRfiReplyTemplate,
  deleteRfiReplyTemplate,
  getErrorMessage,
  getRfiReplyTemplates,
  type RfiReplyTemplate,
} from "@/lib/rfiApi";

/**
 * "Templates" strip for every RFI message box (Reply / Resubmit / Reopen).
 *
 *   - Click a template  -> its text is put into the box (added under what is already typed).
 *   - "Save this text"  -> keeps what is typed as a new template, under a short name.
 *   - Bin icon          -> deletes a template.
 *
 * Templates are PRIVATE to the logged-in person and stored on the server (one small text row each), so they
 * follow the person to any computer. The list is only loaded when the strip is opened.
 */
interface Props {
  /** What is typed in the box right now (used by "Save this text"). */
  message: string;
  /** Called with the text to put into the box. */
  onUse: (text: string) => void;
  disabled?: boolean;
}

export const ReplyTemplatePicker = ({ message, onUse, disabled = false }: Props) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RfiReplyTemplate[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback((force = false) => {
    setLoadFailed(false);
    getRfiReplyTemplates(force)
      .then(setItems)
      .catch(() => {
        setLoadFailed(true);
        setItems([]);
      });
  }, []);

  // Loaded the first time the strip is opened, not when the reply box appears.
  useEffect(() => {
    if (open && items === null) load();
  }, [open, items, load]);

  const canSave = message.trim().length > 0 && title.trim().length > 0 && !saving && !disabled;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const created = await createRfiReplyTemplate({ title: title.trim(), body: message.trim() });
      setItems((prev) => [...(prev ?? []), created].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" })));
      setTitle("");
      toast({ title: "Template saved", description: `"${created.title}" is now in your templates.` });
    } catch (err) {
      toast({ title: "Could not save the template", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: RfiReplyTemplate) => {
    setDeletingId(t.id);
    try {
      await deleteRfiReplyTemplate(t.id);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== t.id));
    } catch (err) {
      toast({ title: "Could not delete the template", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const use = (t: RfiReplyTemplate) => {
    const current = message.trimEnd();
    onUse(current ? `${current}\n\n${t.body}` : t.body);
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        className="inline-flex h-6 items-center gap-1 rounded-md border border-input bg-background px-2 text-[10px] font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        <FileText className="h-3 w-3" aria-hidden />
        Templates
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 space-y-1.5 rounded-md border border-border/70 bg-background/70 p-2 duration-150 dark:border-slate-600 dark:bg-slate-900/60">
          {items === null ? (
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <Spinner className="h-3 w-3 animate-spin" /> Loading your templates...
            </div>
          ) : loadFailed ? (
            <p className="text-[10.5px] text-destructive">
              Could not load your templates.{" "}
              <button type="button" className="underline" onClick={() => { setItems(null); load(true); }}>
                Try again
              </button>
            </p>
          ) : items.length === 0 ? (
            <p className="text-[10.5px] text-muted-foreground">
              No templates yet. Type a message below, give it a name here and press Save this text.
            </p>
          ) : (
            <ul className="max-h-36 space-y-1 overflow-y-auto pr-0.5">
              {items.map((t) => (
                <li key={t.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => use(t)}
                    disabled={disabled}
                    title={t.body}
                    className="min-w-0 flex-1 rounded border border-border/70 bg-background px-2 py-1 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <span className="block truncate text-[11px] font-semibold text-foreground dark:text-white">{t.title}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{t.body.replace(/\s+/g, " ")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(t)}
                    disabled={disabled || deletingId === t.id}
                    aria-label={`Delete template ${t.title}`}
                    title="Delete this template"
                    className="flex w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {deletingId === t.id ? <Spinner className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-1.5 border-t border-border/60 pt-1.5 dark:border-slate-700">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
              maxLength={80}
              placeholder="Name for the text typed below"
              aria-label="Template name"
              disabled={disabled || saving}
              className="h-6 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[10.5px] text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 shrink-0 gap-1 px-2 text-[10px]"
              onClick={() => void save()}
              disabled={!canSave}
              title={message.trim() ? "Keep the typed text as a template" : "Type a message in the box first"}
            >
              {saving ? <Spinner className="h-3 w-3 animate-spin" /> : <BookmarkPlus className="h-3 w-3" />}
              Save this text
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};