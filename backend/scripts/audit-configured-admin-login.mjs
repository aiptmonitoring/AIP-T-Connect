import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const index = line.indexOf('=');
  if (index > 0) {
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
const email = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.DEMO_ADMIN_PASSWORD;
if (!baseUrl || !email || !password) throw new Error('Configured administrator login values are incomplete.');

const response = await fetch(`${baseUrl}/functions/v1/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const body = await response.json().catch(() => ({}));

console.log(JSON.stringify({
  status: response.status,
  code: typeof body.code === 'string' ? body.code : null,
  error: typeof body.error === 'string' ? body.error : null,
  otp_required: body.otp_required === true,
  challenge_created: typeof body.challenge_id === 'string' && body.challenge_id.length > 0,
}, null, 2));
