# AIP&T frontend

This folder will contain the Next.js App Router interface.

## Intended layout

- `app/` — public authentication and protected admin/client route groups.
- `src/components/` — shared auth, dashboard, table, modal, and navigation components.
- `src/lib/` — browser/server Supabase clients and UI-only validation.
- `src/styles/` — shared design tokens and typography.

Copy `.env.local.example` to `.env.local` before connecting to Supabase. Only the public project URL and anon key are permitted here. Never add `SUPABASE_SERVICE_ROLE_KEY`, database passwords, raw migrations, or S3 credentials to this folder.

No route or screen implementation has been added yet. The first planned module is Admin 1.1 Register, following `AIPT_Auth_and_Routing_Flows.md`.
