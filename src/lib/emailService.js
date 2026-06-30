/**
 * Ralli Email Service
 *
 * Thin client wrapper around /api/send-invite (Vercel serverless function).
 * Keeps the Resend API key server-side — this module only hits the internal API route.
 *
 * @module emailService
 */

/**
 * Send an invite email via /api/send-invite (Vercel serverless function).
 *
 * Non-blocking by design — callers should fire-and-forget or catch errors
 * without blocking the invite flow. The invite URL is always the primary
 * delivery mechanism; email is a convenience layer on top.
 *
 * @param {{
 *   to:        string,
 *   orgName:   string,
 *   inviteUrl: string,
 *   type?:     "admin" | "member",   // default: "admin"
 *   role?:     string,               // recipient role, for personalized copy
 * }} params
 * @returns {Promise<{ success: true, emailId: string | null }>}
 * @throws {Error} if the API route returns an error
 */
export async function sendInviteEmail({ to, orgName, inviteUrl, type = "admin", role = "user" }) {
  console.info("[emailService] Sending invite email", { to, orgName, type, role, inviteUrl });

  const r = await fetch("/api/send-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, orgName, inviteUrl, type, role }),
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    console.error("[emailService] API route returned error", { status: r.status, body });
    throw new Error(body.error ?? `Email send failed (HTTP ${r.status})`);
  }

  const result = await r.json();
  console.info("[emailService] Email accepted by Resend", { emailId: result.emailId, to });
  return result;
}
