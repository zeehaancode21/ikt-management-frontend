import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Spinner } from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const MAX_REJECTION_REASON_LENGTH = 500;

interface RejectReasonModalProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/**
 * Small confirmation dialog shown when an owner clicks "Reject" on a
 * permission / leave request. The reason is OPTIONAL — an empty value is
 * simply not sent to the backend.
 */
export const RejectReasonModal = ({
  title,
  description,
  confirmLabel = "Reject",
  busy = false,
  onCancel,
  onConfirm,
}: RejectReasonModalProps) => {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-reason-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reject-reason-title" className="text-base font-semibold">
          {title}
        </h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="reject-reason-input">
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="reject-reason-input"
            ref={textareaRef}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REJECTION_REASON_LENGTH))}
            placeholder="Add a note for the employee…"
            rows={4}
            maxLength={MAX_REJECTION_REASON_LENGTH}
            disabled={busy}
          />
          <p className="text-right text-[10px] text-muted-foreground">
            {reason.length}/{MAX_REJECTION_REASON_LENGTH}
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => onConfirm(reason.trim())} disabled={busy}>
            {busy ? <Spinner className="mr-1 h-3 w-3 text-white" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};