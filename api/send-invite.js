/**
 * POST /api/send-invite
 *
 * Sends an invite email via Resend.
 * Keeps RESEND_API_KEY server-side — never exposed to the browser.
 *
 * Body:
 *   to:        string             — recipient email
 *   orgName:   string             — tenant/org display name
 *   inviteUrl: string             — full invite link
 *   type?:     "admin"|"member"   — controls subject + body copy (default: "admin")
 *   role?:     string             — recipient role for personalized copy
 *
 * Returns: { success: true, emailId: string } | { error: string }
 *
 * Environment variables (set in Vercel dashboard, NOT .env.local):
 *   RESEND_API_KEY  — required.
 *   RESEND_FROM     — optional sender address. Defaults to "Ralli <onboarding@resend.dev>".
 *                     IMPORTANT: onboarding@resend.dev only delivers to the Resend
 *                     account owner's email on the free plan. To send to any address,
 *                     verify a domain at resend.com/domains and set:
 *                     RESEND_FROM=Ralli <invites@runralli.com>
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, orgName, inviteUrl, type = "admin", role = "user" } = req.body ?? {};

  if (!to || !inviteUrl || !orgName) {
    return res.status(400).json({ error: "Missing required fields: to, orgName, inviteUrl" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[send-invite] RESEND_API_KEY is not configured in environment");
    return res.status(500).json({ error: "Email service not configured (RESEND_API_KEY missing)" });
  }

  const from    = process.env.RESEND_FROM ?? "Ralli <onboarding@resend.dev>";
  const subject = type === "member"
    ? `You've been invited to join ${orgName} on Ralli`
    : `You've been invited to set up ${orgName} on Ralli`;
  const html    = buildEmailHtml({ orgName, inviteUrl, to, type, role });

  console.info("[send-invite] Attempting email send", { to, orgName, type, role, from, subject, inviteUrl });

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    const responseBody = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error("[send-invite] Resend rejected request", {
        status: r.status,
        body: responseBody,
        from,
        to,
      });
      return res.status(r.status).json({
        error: responseBody?.message ?? `Resend error (HTTP ${r.status})`,
        resendError: responseBody,
      });
    }

    console.info("[send-invite] Email accepted by Resend", { emailId: responseBody.id, to });
    return res.status(200).json({ success: true, emailId: responseBody.id ?? null });
  } catch (err) {
    console.error("[send-invite] Network or unexpected error", { message: err.message, to });
    return res.status(500).json({ error: err.message ?? "Unknown error" });
  }
}

// ── Email template ─────────────────────────────────────────────────────────────

function buildEmailHtml({ orgName, inviteUrl, to, type = "admin", role = "user" }) {
  const isAdmin  = type !== "member";
  const heading  = isAdmin
    ? `You've been invited to set up ${escHtml(orgName)} on Ralli`
    : `You've been invited to join ${escHtml(orgName)} on Ralli`;
  const body     = isAdmin
    ? `A Ralli admin has created your organization and assigned you as the admin. Click the button below to create your account and complete the setup.`
    : `Your manager has invited you to join <strong>${escHtml(orgName)}</strong> on Ralli — a sales readiness platform for your team. Click the button below to create your account and get started.`;
  const ctaLabel = isAdmin ? "Accept invitation &rarr;" : "Join your team &rarr;";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Ralli Invitation</title>
</head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#F97316;padding:28px 40px;">
              <div style="font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.3px;">ralli</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">
                ${heading}
              </h1>
              <p style="margin:0 0 28px;font-size:14px;color:#6B7280;line-height:1.6;">
                ${body}
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#F97316;">
                    <a href="${inviteUrl}" target="_blank"
                       style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="margin:32px 0;border:none;border-top:1px solid #E5E7EB;" />

              <!-- Copy-paste fallback -->
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9CA3AF;letter-spacing:0.06em;">
                OR COPY THIS LINK
              </p>
              <p style="margin:0;font-size:12px;color:#6B7280;word-break:break-all;background:#F9FAFB;padding:10px 12px;border-radius:6px;border:1px solid #E5E7EB;">
                ${inviteUrl}
              </p>

              <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">
                This invitation expires in 7 days. If you weren't expecting this email, you can ignore it.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;background:#F9FAFB;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-size:11px;color:#9CA3AF;">
                Sent to ${escHtml(to)} &middot; Ralli Sales Readiness Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
