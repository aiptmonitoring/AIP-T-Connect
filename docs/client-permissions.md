# Client roles and permissions

The administrator sidebar includes **Roles & Permissions** at `/roles`.
Select a client login, choose the allowed actions per page, and save. Grants are per login, not company-wide. Accounts must still be approved, active, and linked.

The matrix covers all 12 client routes. Dashboard and Portfolio Overview are summaries, so they have View only. Approved Invoices are managed through the existing quotation approval flow and have View only. Account Settings supports Edit and Update; account creation and deletion remain administrator/authentication operations.

CRUD grants are available for Quotations, Projects, Statements, POA, Requirements, Schedule of Fees documents, Notifications, and Customer Service tickets. Shared catalog writes affect other clients. Project, quotation, statement, and ticket records stay client-scoped. Client project/statement changes return to pending approval. Quotation edits and deletes are restricted to pending quotations. Approval/payment controls remain administrator-only.

Client pages retain their normal view and expose **Manage records** when a write permission is granted. Management forms are loaded on demand. Backend checks run on each request and fail closed if permissions cannot be verified. Client permission refreshes run on navigation, focus, and every 30 seconds. Edit is required to save Update, and View is required for every action.

Permission changes are saved atomically with a revision check and an audit entry. Clients can read their own matrix but cannot change it. An unsaved change prompt protects client selection changes. Accounts without a saved matrix retain their existing defaults (read access, quotation creation/editing, support requests, account updates).

## Activation order

1. Apply `backend/supabase/migrations/202610030003_client_permissions.sql` to the intended Supabase project. This adds permission storage, audit history, the atomic save RPC, and restrictive direct-read policies.
2. Deploy `client-permissions`, `account`, `customer-service`, `notifications`, `poa`, `projects`, `quotations`, `requirements`, `schedule-of-fees`, and `timelines`. Include the shared permission modules. Deploy functions after the migration: a missing permission table causes client requests to return 503.
3. Deploy the frontend. Then verify `/roles` with a real administrator and permission grants/revocations with a real client login. Local fixture checks are not production authorization proof.

No client permissions have been changed in production by the local implementation/tests.

## Local checks

- `node frontend/scripts/client-permissions-regression.cjs`: grants/revocations, fail-closed errors, inactive accounts, client self-escalation denial, action dependencies, stale saves, own-record deletes, foreign-record rejection, shared requirements writes.
- `node frontend/scripts/admin-documents-regression.cjs`: existing document CRUD, default client restrictions, invalid uploads, rollback and storage deletion failures.
- From `frontend`, `node scripts/client-permissions-browser-check.cjs`: administrator matrix/save, desktop/mobile layout, client add-only and denied page behavior, management page loading. Uses synthetic users and API responses.
- From `frontend`, `node node_modules/typescript/bin/tsc --noEmit --incremental false`.

On 2026-10-03, migration 202610030003 was applied transactionally to davupzevvsngppcrynoj and all ten functions above were deployed. Live checks confirmed migration history, permission storage, the save RPC, and five restrictive read policies. No client permission assignments were created. Authenticated production grant/revoke testing remains outstanding. Frontend changes remain local; frontend hosting deployment was not performed. The dashboard Schedule of Fees card now opens /client-dashboard/schedule-of-fees, which shares the existing Schedule of Fees document page and supports view-only client access. Browser fixture checks passed for this link and read-only behavior.