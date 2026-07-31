import { ConfigurationError, NetworkError } from '../errors/index.js';

export class EmailService {
  constructor(apiKey, appBaseUrl, fromAddress) {
    this.apiKey = apiKey;
    this.appBaseUrl = appBaseUrl;
    this.fromAddress = fromAddress || 'Lumio <onboarding@resend.dev>';
  }

  async sendPasswordResetEmail({ to, firstName, resetLink }) {
    if (!this.apiKey) {
      throw new ConfigurationError('RESEND_API_KEY is not configured. Set it via: npx wrangler secret put RESEND_API_KEY');
    }
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your Lumio password</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" style="max-width:560px;" cellspacing="0" cellpadding="0" border="0">

          <!-- Logo header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:22px;font-weight:800;letter-spacing:0.06em;color:#1a1a2e;">LUMIO</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:12px;padding:40px 40px 32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Reset your password</p>
              <p style="margin:0 0 24px;font-size:15px;color:#5a5a7a;line-height:1.5;">Hello ${firstName},</p>

              <p style="margin:0 0 24px;font-size:15px;color:#3a3a5c;line-height:1.6;">
                We received a request to reset your Lumio password.<br/>
                If you requested this change, click the button below.
              </p>

              <!-- CTA button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:8px;background:#5b5ef4;">
                    <a href="${resetLink}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:13px;color:#7a7a9a;line-height:1.5;">
                This link expires in <strong>60 minutes</strong>. If you did not request a password reset,
                you can safely ignore this email — your password will remain unchanged.
              </p>

              <hr style="border:none;border-top:1px solid #eeeef4;margin:0 0 24px;" />

              <p style="margin:0;font-size:13px;color:#9a9ab0;line-height:1.5;">
                Thank you,<br/>
                <strong style="color:#5a5a7a;">The Lumio Team</strong>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#a0a0b8;line-height:1.5;">
                If the button above doesn't work, copy and paste this link into your browser:<br/>
                <a href="${resetLink}" style="color:#5b5ef4;word-break:break-all;">${resetLink}</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [to],
        subject: 'Reset your Lumio password',
        html,
      }),
    });

    if (!response.ok) {
      let detail;
      try { detail = await response.json(); } catch (_) { detail = null; }
      throw new NetworkError('Failed to send password reset email.', { status: response.status, detail });
    }
  }
}
