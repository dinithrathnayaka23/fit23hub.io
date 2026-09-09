import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpSecure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
const mailFrom = process.env.MAIL_FROM || "FIT23Hub <no-reply@fit23hub.local>";

let transporterPromise;

export function isSmtpConfigured() {
  return Boolean(smtpHost && smtpUser && smtpPass);
}

/**
 * Real SMTP when SMTP_* is configured. Otherwise, outside production, fall back
 * to an Ethereal test inbox so the whole flow stays testable: nothing reaches the
 * real recipient, but nodemailer returns a preview URL for the rendered message.
 */
async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (isSmtpConfigured()) {
      return nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure || smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.");
    }

    const testAccount = await nodemailer.createTestAccount();
    // eslint-disable-next-line no-console
    console.warn("[mailer] SMTP not configured - using Ethereal test inbox (no real delivery).");
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

function resetEmailTemplate({ fullName, resetUrl, expiryMinutes }) {
  const safeName = String(fullName || "there").split(/\s+/)[0];

  const text = [
    `Hi ${safeName},`,
    "",
    "We received a request to reset your FIT23Hub password.",
    "Open the link below to choose a new one:",
    "",
    resetUrl,
    "",
    `This link expires in ${expiryMinutes} minutes and can only be used once.`,
    "If you did not request this, you can safely ignore this email - your password stays unchanged.",
    "",
    "- FIT23Hub",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0b1220;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#111827;border:1px solid rgba(56,189,248,0.22);border-radius:16px;">
      <tr>
        <td style="padding:28px;">
          <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#38bdf8;">FIT23Hub</p>
          <h1 style="margin:10px 0 0;font-size:22px;color:#ffffff;">Reset your password</h1>
          <p style="margin:16px 0 0;font-size:14px;line-height:22px;color:#9ca3af;">
            Hi ${safeName}, we received a request to reset your FIT23Hub password.
            Choose a new one using the button below.
          </p>
          <p style="margin:26px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;">
              Choose a new password
            </a>
          </p>
          <p style="margin:0;font-size:12px;line-height:20px;color:#9ca3af;">
            This link expires in ${expiryMinutes} minutes and can only be used once.
            If you did not request a reset, ignore this email - your password stays unchanged.
          </p>
          <p style="margin:20px 0 0;font-size:11px;line-height:18px;color:#6b7280;word-break:break-all;">
            Button not working? Paste this into your browser:<br />${resetUrl}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl, expiryMinutes }) {
  const transporter = await getTransporter();
  const { text, html } = resetEmailTemplate({ fullName, resetUrl, expiryMinutes });

  const info = await transporter.sendMail({
    from: mailFrom,
    to,
    subject: "Reset your FIT23Hub password",
    text,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;

  if (previewUrl) {
    // eslint-disable-next-line no-console
    console.log(`[mailer] Password reset preview for ${to}: ${previewUrl}`);
  }

  return { messageId: info.messageId, previewUrl };
}
