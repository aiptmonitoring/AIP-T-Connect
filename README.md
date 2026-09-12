# AIP&T IP Management System

This repository is split into independent application boundaries:

- `frontend/` — the Next.js user interface. It may use only the Supabase public URL and anon key.
- `backend/` — Supabase configuration, migrations, Edge Functions, seeds, and server-only secrets.
- `1.admin dashboard/` and `2.client dashboard/` — the supplied visual references. Keep these unchanged; they are the design source of truth.
- `AIPT_Auth_and_Routing_Flows.md` — the authoritative functional and routing specification.

## Getting started

1. Set up the Supabase project from `backend/README.md`.
2. Configure the UI app from `frontend/README.md`.
3. Build screens only after their matching section of `AIPT_Auth_and_Routing_Flows.md` is approved.

No database credentials, migration SQL, service-role key, or Edge Function code belongs in `frontend/`.
