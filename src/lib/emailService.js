/**
 * Ralli Email Service
 *
 * Thin client wrapper around /api/send-invite (Vercel serverless function).
 * Keeps the Resend API key server-side — this module only hits the internal API route.
 *
 * @module emailService
 */

/**
 * Send an organization invite email.
 * Falls back gracefully — callers should catch errors and surface them without
 * blocking the provisioning flow (the invite URL always remains available as a
 * copy-paste fallback).
 *
 * @param {{ to: string, orgName: string, inviteUrl: string }} params
 * @returns {Promise<{ success: true }>}
 * @throws {Error} if the API route returns an error
 */
export async function sendInviteEmail({ to, orgName, inviteUrl }) {
  const r = await fetch("/api/send-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, orgName, inviteUrl }),
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `Email send failed (HTTP ${r.status})`);
  }

  return r.json();
}
