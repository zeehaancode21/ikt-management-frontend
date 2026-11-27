import { useId, useState } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * Shared "End with Regards, {username}" option used by every RFI message box
 * (Reply / Resubmit / Reopen, and the Owner's Send back panels).
 * The choice is remembered in the browser and is ON by default.
 */
const SIGN_OFF_PREF_KEY = "rfiReplySignOff";

const readPref = (): boolean => {
  try {
    return localStorage.getItem(SIGN_OFF_PREF_KEY) !== "off";
  } catch {
    return true;
  }
};

const writePref = (on: boolean) => {
  try {
    localStorage.setItem(SIGN_OFF_PREF_KEY, on ? "on" : "off");
  } catch {
    /* the choice just isn't remembered */
  }
};

/**
 * Adds "Regards,\n{username}" at the end of the message. If the person already typed that same
 * sign-off as the last two lines, nothing is added, so it never appears twice.
 */
export const withSignOff = (body: string, username: string | null | undefined): string => {
  const text = body.trim();
  const name = (username ?? "").trim();
  if (!name) return text;
  const tail = text.split(/\r?\n/).slice(-2).map((l) => l.trim().toLowerCase());
  const alreadySigned = tail.length === 2 && /^regards,?$/.test(tail[0]) && tail[1] === name.toLowerCase();
  return alreadySigned ? text : `${text}\n\nRegards,\n${name}`;
};

/**
 * State for the sign-off option.
 *   const sign = useSignOff();
 *   <SignOffOption sign={sign} disabled={busy} />
 *   sign.apply(message)   // the text to send
 */
export const useSignOff = () => {
  const { name } = useAuth();
  const [on, setOn] = useState<boolean>(readPref);
  return {
    on,
    name,
    set: (next: boolean) => {
      setOn(next);
      writePref(next);
    },
    /** The message with the sign-off added (when the option is on). */
    apply: (message: string): string => (on ? withSignOff(message, name) : message.trim()),
  };
};

export type SignOffState = ReturnType<typeof useSignOff>;

export const SignOffOption = ({ sign, disabled }: { sign: SignOffState; disabled?: boolean }) => {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5">
      <input
        id={id}
        type="checkbox"
        className="h-3 w-3 cursor-pointer accent-primary"
        checked={sign.on}
        onChange={(e) => sign.set(e.target.checked)}
        disabled={disabled}
      />
      <label htmlFor={id} className="cursor-pointer text-[10.5px] text-muted-foreground">
        End with &ldquo;Regards, {sign.name ?? "your name"}&rdquo;
      </label>
    </div>
  );
};