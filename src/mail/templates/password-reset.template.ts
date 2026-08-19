export interface PasswordResetTemplateData {
  otp: string;
  expiresInMinutes: number;
  recipientName?: string;
}

/**
 * Inline-styled HTML so the layout survives every major email client. Mirrors
 * the structure of the email-verification template.
 */
export const buildPasswordResetHtml = ({
  otp,
  expiresInMinutes,
  recipientName,
}: PasswordResetTemplateData): string => {
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi,';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset your EMS password</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,0.1);">
            <tr>
              <td style="background-color:#1f2937;padding:24px 32px;">
                <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.2px;">
                  Employee Management System
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;color:#111827;font-size:16px;line-height:24px;">
                  ${greeting}
                </p>
                <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:24px;">
                  Use the code below to reset your EMS account password. If you did not request this, you can safely ignore the email.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="padding:8px 0 24px;">
                      <div style="display:inline-block;background-color:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:18px 32px;">
                        <span style="color:#111827;font-size:32px;font-weight:700;letter-spacing:10px;font-family:'Courier New',Courier,monospace;">
                          ${escapeHtml(otp)}
                        </span>
                      </div>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:22px;">
                  This code expires in <strong style="color:#111827;">${expiresInMinutes} minutes</strong>.
                </p>
                <p style="margin:0;color:#6b7280;font-size:13px;line-height:20px;">
                  Never share this code with anyone. Our staff will never ask for it.
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e5e7eb;padding:20px 32px;">
                <p style="margin:0;color:#9ca3af;font-size:12px;line-height:18px;">
                  This is an automated message from the Employee Management System. Please do not reply.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const buildPasswordResetText = ({
  otp,
  expiresInMinutes,
  recipientName,
}: PasswordResetTemplateData): string => {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';

  return [
    'Employee Management System',
    '',
    greeting,
    '',
    'Use the code below to reset your EMS account password.',
    '',
    `Your password reset code is: ${otp}`,
    '',
    `This code expires in ${expiresInMinutes} minutes.`,
    '',
    'If you did not request this, you can safely ignore the email.',
    'Never share this code with anyone.',
    '',
    'This is an automated message. Please do not reply.',
  ].join('\n');
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
