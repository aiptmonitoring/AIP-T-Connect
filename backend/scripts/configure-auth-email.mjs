import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const [key, ...parts] = line.split('=');
  if (key && !process.env[key]) process.env[key] = parts.join('=');
}
const sesRegion = 'eu-north-1';
const smtpHost = `email-smtp.${sesRegion}.amazonaws.com`;

for (const key of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'SMTP_ADMIN_EMAIL', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']) if (!process.env[key]) throw new Error(`${key} is required.`);
if (process.env.SMTP_HOST && process.env.SMTP_HOST !== smtpHost) {
  throw new Error(`SMTP_HOST must be ${smtpHost} for the configured SES region.`);
}

const payload = {
  site_url: 'http://localhost:3000',
  additional_redirect_urls: [
    'http://localhost:3000/verify-otp',
    'http://localhost:3000/login/verify-otp',
    'http://localhost:3000/forgot-password/verify-otp',
    'http://localhost:3000/change-password',
  ],
  smtp_admin_email: process.env.SMTP_ADMIN_EMAIL,
  smtp_host: smtpHost,
  smtp_port: process.env.SMTP_PORT,
  smtp_user: process.env.SMTP_USER,
  smtp_pass: process.env.SMTP_PASS,
  smtp_sender_name: process.env.SMTP_SENDER_NAME || 'AIP&T',
  // Temporary bypass while SES cannot deliver authentication messages.
  mailer_autoconfirm: true,
  mailer_otp_length: 6,
  mailer_subjects_confirmation: 'Your AIP&T verification code',
  mailer_templates_confirmation_content: '<h2>Verify your AIP&T account</h2><p>Your verification code is:</p><h1>{{ .Token }}</h1><p>This code expires in one hour.</p>',
  mailer_subjects_magic_link: 'Your AIP&T login verification code',
  mailer_templates_magic_link_content: '<h2>Verify your AIP&T login</h2><p>Your verification code is:</p><h1>{{ .Token }}</h1><p>This code expires in one hour.</p>',
  mailer_subjects_recovery: 'Your AIP&T password reset code',
  mailer_templates_recovery_content: '<h2>Reset your AIP&T password</h2><p>Your verification code is:</p><h1>{{ .Token }}</h1><p>If you did not request this, you can ignore this email.</p>',
};
const response = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/config/auth`, { method: 'PATCH', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
if (!response.ok) throw new Error(`Supabase Auth configuration failed: ${await response.text()}`);
console.log('Custom SMTP and six-digit OTP email templates configured.');
