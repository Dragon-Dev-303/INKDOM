/** Username rules shared by the sign-up form and the server (INKDOM_v2_Plan.md §5). */
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'inkdom', 'support', 'moderator', 'mod', 'system', 'root', 'cpu', 'player', 'null', 'undefined']);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** null when valid, otherwise a human-readable reason. */
export function usernameProblem(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 3) return 'At least 3 characters';
  if (u.length > 20) return 'At most 20 characters';
  if (!USERNAME_RE.test(u)) return 'Only letters, numbers and _';
  if (RESERVED.has(u)) return 'That name is reserved';
  return null;
}

/** 0–4 password strength score with a label. */
export function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 8) score = Math.min(score, 1);
  return { score, label: ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}
