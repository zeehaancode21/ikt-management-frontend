// Razorpay's IFSC lookup is a free, public, no-key-required API used widely
// for this exact purpose. It returns bank + branch details for a valid code,
// or a 404 if the code doesn't exist. There is no equivalent public service
// for verifying account numbers — banks don't expose that without a paid
// penny-drop/fund-verification API tied to a business account, so account
// numbers can only be format-checked here, not verified against a real account.
export interface IfscDetails {
  BANK: string;
  BRANCH: string;
  ADDRESS: string;
  CITY: string;
  STATE: string;
  IFSC: string;
}

export async function lookupIfsc(code: string): Promise<IfscDetails | null> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean)) {
    return null; // fails basic IFSC shape before even calling the API
  }
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${clean}`);
    if (!res.ok) return null; // 404 = not a real IFSC code
    return await res.json();
  } catch {
    return null; // network error — caller should treat as "could not verify"
  }
}

/** Basic shape check only — digits, typical Indian account number length. No external verification exists for this. */
export function isPlausibleAccountNumber(accountNumber: string): boolean {
  const clean = accountNumber.trim();
  return /^\d{9,18}$/.test(clean);
}