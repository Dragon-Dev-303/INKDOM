/** Small hand-written validators so the API accepts only well-formed, bounded payloads. */

export class ValidationError extends Error {}

export function str(v: unknown, name: string, max: number, { required = false, min = 0 } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (required) throw new ValidationError(`${name} is required`);
    return '';
  }
  if (typeof v !== 'string') throw new ValidationError(`${name} must be a string`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new ValidationError(`${name} must be ${min}–${max} characters`);
  return s;
}

export function num(v: unknown, name: string, min: number, max: number, { integer = false, nullable = false } = {}): number | null {
  if (v === null || v === undefined) {
    if (nullable) return null;
    throw new ValidationError(`${name} is required`);
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ValidationError(`${name} must be a number`);
  if (integer && !Number.isInteger(v)) throw new ValidationError(`${name} must be an integer`);
  if (v < min || v > max) throw new ValidationError(`${name} out of range`);
  return v;
}

export function oneOf<T extends string>(v: unknown, name: string, options: readonly T[], { nullable = false } = {}): T | null {
  if (v === null || v === undefined) {
    if (nullable) return null;
    throw new ValidationError(`${name} is required`);
  }
  if (typeof v !== 'string' || !options.includes(v as T)) throw new ValidationError(`${name} must be one of ${options.join(', ')}`);
  return v as T;
}

/** Very small in-memory rate limiter (per server instance). Good enough for a playtest. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'local').trim();
}

export async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new ValidationError('Payload too large');
  const text = await req.text();
  if (text.length > maxBytes) throw new ValidationError('Payload too large');
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new ValidationError('Invalid JSON');
  }
}
