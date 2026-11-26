import { NextResponse } from 'next/server';
import { getSessionUser, type SessionUser } from './auth';
import { ValidationError } from './validate';

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Base URL for redirects and callbacks. Never taken from request input other than the request URL itself. */
export function siteUrl(req: Request): string {
  const env = process.env.SITE_URL;
  return (env ? env : new URL(req.url).origin).replace(/\/+$/, '');
}

/** JSON-only POSTs: a cross-site HTML form cannot send application/json without a CORS preflight. */
export function requireJson(req: Request): Response | null {
  const type = req.headers.get('content-type') ?? '';
  return type.includes('application/json') ? null : json({ error: 'Content-Type must be application/json' }, 415);
}

export async function requireUser(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  return user ?? json({ error: 'Sign in required' }, 401);
}

export function errorResponse(e: unknown, context: string): Response {
  if (e instanceof ValidationError) return json({ error: e.message }, 400);
  console.error(`${context}:`, e instanceof Error ? e.message : e);
  return json({ error: 'Server error' }, 500);
}
