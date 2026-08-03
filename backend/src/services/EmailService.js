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

  async sendInvitationEmail({ to, firstName, inviterName, workspaceName, role, inviteLink, expiresAt }) {
    if (!this.apiKey) {
      throw new ConfigurationError('RESEND_API_KEY is not configured. Set it via: npx wrangler secret put RESEND_API_KEY');
    }

    const expiryText = expiresAt
      ? (() => {
          const days = Math.round((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
          return days > 1 ? `${days} days` : '1 day';
        })()
      : '7 days';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to ${workspaceName} on Lumio</title>
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

              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">You've been invited</p>
              <p style="margin:0 0 24px;font-size:15px;color:#5a5a7a;line-height:1.5;">Hello ${firstName},</p>

              <p style="margin:0 0 24px;font-size:15px;color:#3a3a5c;line-height:1.6;">
                <strong>${inviterName}</strong> has invited you to join
                <strong>${workspaceName}</strong> on Lumio as a
                <strong>${role}</strong>.
              </p>

              <!-- CTA button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:8px;background:#5b5ef4;">
                    <a href="${inviteLink}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:13px;color:#7a7a9a;line-height:1.5;">
                This invitation expires in <strong>${expiryText}</strong>.
                If you were not expecting this invitation, you can safely ignore this email.
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
                <a href="${inviteLink}" style="color:#5b5ef4;word-break:break-all;">${inviteLink}</a>
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
        subject: `You've been invited to join ${workspaceName} on Lumio`,
        html,
      }),
    });

    if (!response.ok) {
      let detail;
      try { detail = await response.json(); } catch (_) { detail = null; }
      throw new NetworkError('Failed to send invitation email.', { status: response.status, detail });
    }
  }

  async sendWelcomeMemberEmail({ to, firstName, workspaceName, role }) {
    if (!this.apiKey) {
      throw new ConfigurationError('RESEND_API_KEY is not configured. Set it via: npx wrangler secret put RESEND_API_KEY');
    }

    const loginUrl = this.appBaseUrl ? `${this.appBaseUrl}/#/login` : null;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${workspaceName}</title>
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

              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Welcome to ${workspaceName}</p>
              <p style="margin:0 0 24px;font-size:15px;color:#5a5a7a;line-height:1.5;">Hello ${firstName},</p>

              <p style="margin:0 0 24px;font-size:15px;color:#3a3a5c;line-height:1.6;">
                Your account has been created on <strong>${workspaceName}</strong>.
                Your Workspace Owner will provide your temporary password directly.
              </p>

              <!-- Account details block -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="margin:0 0 24px;background:#f8f8fc;border-radius:8px;border:1px solid #eeeef4;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#5a5a7a;text-transform:uppercase;letter-spacing:0.05em;">Your account details</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#3a3a5c;">
                      <strong>Email:</strong> ${to}
                    </p>
                    <p style="margin:0;font-size:14px;color:#3a3a5c;">
                      <strong>Role:</strong> ${role}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:13px;color:#7a7a9a;line-height:1.5;">
                Once you have your temporary password, sign in and change it via
                <strong>My Profile → Change Password</strong>.
              </p>

              ${loginUrl ? `
              <!-- CTA button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td style="border-radius:8px;background:#5b5ef4;">
                    <a href="${loginUrl}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Sign In to ${workspaceName}
                    </a>
                  </td>
                </tr>
              </table>` : ''}

              <hr style="border:none;border-top:1px solid #eeeef4;margin:0 0 24px;" />

              <p style="margin:0;font-size:13px;color:#9a9ab0;line-height:1.5;">
                Thank you,<br/>
                <strong style="color:#5a5a7a;">The Lumio Team</strong>
              </p>

            </td>
          </tr>

          ${loginUrl ? `
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#a0a0b8;line-height:1.5;">
                If the button above doesn't work, copy and paste this link into your browser:<br/>
                <a href="${loginUrl}" style="color:#5b5ef4;word-break:break-all;">${loginUrl}</a>
              </p>
            </td>
          </tr>` : ''}

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
        subject: `Welcome to ${workspaceName}`,
        html,
      }),
    });

    if (!response.ok) {
      let detail;
      try { detail = await response.json(); } catch (_) { detail = null; }
      throw new NetworkError('Failed to send welcome email.', { status: response.status, detail });
    }
  }
}
