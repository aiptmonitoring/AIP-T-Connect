# AIP&T Authentication and Role-Based Routing

Last source audit and deployment smoke check: 2026-08-26

Deployment status: migration `202608260001` and Edge Functions `company-registration`, `users`, `login`, and `login-otp` are deployed to the linked Supabase project. Live OPTIONS returned 200; controlled unauthenticated requests returned 401 and an invalid OTP challenge returned 410. `LOGIN_OTP_PEPPER` is configured. `APP_URL` is still missing because no authoritative public frontend URL was found in repository metadata.

## Evidence standard

This document describes the audited repository. Requested behavior is not complete merely because it appears in a prompt, UI, migration name, or local source. **Implemented** means matching local source exists; **partial** means required layers are missing; **runtime unverified** means no real authenticated browser/email round trip was completed.

The application uses Next.js (`frontend/`), Supabase Auth, Supabase Edge Functions and Postgres (`backend/supabase/`), Amazon SES for application-generated email, and S3 for supported files.

## Canonical identity and ownership model

There is no separate `companies` table or canonical `company_id`. The `clients` row is the company/tenant record.

```text
auth.users 1--1 profiles
auth.users *--* clients through client_memberships
profiles.client_id -> clients.id (compatibility ownership pointer)
clients 1--* projects/statements/support records/other client data
```

- `auth.users`: password identity, email, and session source.
- `profiles`: role, approval/account controls, failed-login state, and compatibility `client_id`.
- `clients`: company/client tenant shown at `/clients`; `clients.id` is the effective company key.
- `client_memberships`: multi-user company link. Roles: `company_admin`, `manager`, `member`, `viewer`; states: `pending`, `approved`, `rejected`, `suspended`.
- `client_invitations`: normalized email plus hashed, expiring token tied to `client_id`.
- `client_registration_claims`: short-lived server claim created after invitation verification.

Do not create a duplicate Company model or accept browser ownership IDs to imitate a generic specification. A separate Company entity requires an explicit data-model decision.

## Roles and destinations

`frontend/src/lib/auth/role-routing.ts` reads `profiles.role` after a valid session.

| Role | Destination |
|---|---|
| `administrator` | `/overview` |
| `client` | `/client-dashboard` |
| `associate` | `/user-dashboard` |
| `user` | `/user-dashboard` |

Non-administrators require `approval_status = 'approved'`. An `inactive` account is signed out. Frontend routing is not an authorization boundary; every Edge Function must verify role and ownership.

## Registration and approval

### New Client

1. `/register` collects full name, company, logo, email, phone, country, address, and password.
2. `supabase.auth.signUp()` creates the identity; a trigger creates a pending `client` profile.
3. The temporary session is signed out and `/login` displays the approval-required message.
4. An administrator reviews `/users`.
5. Approval creates/reuses the `clients` row, links `profiles.client_id`, creates an approved `company_admin` membership, activates the profile, and marks it approved.
6. The user can then pass password login and custom login OTP before `/client-dashboard`.

Registration uses direct password signup; registration OTP is not active. Client creation and approval are multiple application writes, not one database transaction. Remote Auth settings and a real signup-to-dashboard pass are runtime unverified.

### Existing Client invitation registration

There is no `/join` route. The current flow is an **Existing Client** modal inside `/register`.

1. The recipient enters invited email and code.
2. `company-registration` hashes the code and matches token hash plus normalized email.
3. Missing, consumed, revoked, expired, deleted-client, or inactive-client invitations are rejected.
4. A 15-minute registration claim returns safe client display fields.
5. Verified email/company become read-only; signup metadata carries only `registration_claim_id`, not ownership IDs.
6. The profile remains pending.
7. The Auth signup trigger atomically validates the claim against the actual Auth email, links the pending membership/profile, and consumes the claim and invitation. A mismatch or reused/expired invitation aborts signup.
8. During approval, `users` revalidates that the consumed invitation belongs to that exact Auth user and atomically promotes the invited membership/profile through a database RPC.

## Administrator invitations

Surface: `/clients` -> `InviteClientUserModal`; backend: `company-registration`.

Implemented locally:

- Caller must be an administrator or approved `company_admin` for that client.
- Client must exist, be active, and not be soft-deleted.
- Email is normalized; role is restricted to manager/member/viewer.
- A random 48-hex-character token is generated; only SHA-256 is stored.
- Expiry is 72 hours. SES sends the raw code; delivery failure removes the inserted invitation.
- Successful delivery creates an audit record without the raw token.

Gaps against the requested production workflow:

| Requirement | Audited result |
|---|---|
| Show only eligible clients | Implemented locally through `list_eligible_clients`. |
| Require `clients.email` | Implemented locally; browser email input was removed. |
| Block existing account/Auth email | Implemented locally before send and verification. |
| Block active duplicate | Implemented locally in function logic and a partial unique index. |
| Display invitation status | Implemented locally in the eligible-client modal. |
| `/join?token=...` | Implemented locally with server-side token verification. |
| Full branded email/button | Implemented locally through existing SES; deployment must configure `APP_URL`. |
| CLIENT + COMPANY + EMAIL | Represented as `client_id + email`; no separate Company record exists. |

Do not report these gaps as completed until implementation and end-to-end evidence exist.

## Administrator review

The administrator-only `users` Edge Function joins Auth users, profiles, and linked clients. `/users` can approve, activate/deactivate, unlock, and delete users.

Implemented locally: pending/approved/rejected/suspended profile states, review modal, registration date, Approve/Reject/Suspend actions, approval metadata and audit entries, transactional invited-client approval, and approval email through existing SES. User deletion still hard-deletes the profile and Auth user; new-client company creation remains application-level rather than one database RPC.

## Password login and custom email OTP

Routes: `/login` and `/login/verify-otp`. Legacy `/verify-otp` redirects to `/register`.

1. `/login` posts normalized email/password to the public controlled `login` function.
2. The function finds the Auth identity server-side and blocks locked, inactive, and unapproved non-admin accounts.
3. Supabase Auth validates the password. Five failed passwords lock the profile.
4. Success invalidates older unused challenges.
5. A six-digit OTP is generated with `crypto.getRandomValues`, hashed with challenge ID and a server-only pepper, stored, and sent by SES only to the Auth email.
6. `login-otp` validates state, expiry, hash, attempts, and resend rules. The database consumer locks and consumes the row.
7. Only successful consumption creates a Supabase session; routing then uses the profile role.

Current limits:

- OTP expires in **5 minutes** for initial and resent challenges.
- Maximum 5 verification attempts and 3 resends per challenge.
- 60-second resend cooldown.
- Maximum 5 challenges per user/hour and 20 per recorded IP/hour.
- Five failed passwords lock the account until admin unlock.

The OTP uses secure randomness, though modulo reduction has a tiny distribution bias. The login page retains a Supabase email-OTP fallback, but the audited function normally returns the custom challenge. Configuration or OPTIONS success does not prove inbox delivery; the real password-OTP-session pass remains runtime unverified.

## Password recovery

Forgot password is separate from login OTP. `/forgot-password` calls Supabase `resetPasswordForEmail`; recovery routes lead to `/change-password`, which uses `supabase.auth.updateUser({ password })`. Recovery/change-password pages remain outside the admin shell.

## Client data isolation

Required backend derivation:

```text
Bearer token -> Auth user -> profiles.role + profiles.client_id
             -> query rows owned by that client_id
```

Client APIs must ignore `clientId`, `companyId`, email, or ownership values from URL parameters, bodies, local storage, and UI state. Audited scoping exists in projects, statements, customer service, notifications/dashboard/timeline-related paths, but every endpoint remains responsible for its own check.

The new local migration removes the original broad authenticated `clients` read policy. Administrators may read active clients; approved client users may read only the row matching `profiles.client_id`. Membership reads remain limited to `user_id = auth.uid()`; invitation and claim tables use service-role operations.

## Security properties and gaps

Implemented locally:

- Password hashes stay in Supabase Auth.
- Invitation tokens and login OTPs are not stored raw.
- OTP expiry, single use, attempt/resend limits, cooldown, and throttles exist.
- Invitation/membership/claim/OTP foreign keys, indexes, and RLS exist.
- Many admin CRUD actions and successful invitations write audit logs.
- Service-role, SES, S3, and OTP-pepper values are backend environment secrets.

Incomplete guarantees:

- The invited-client flow is transactional locally; new-client approval is not yet one database transaction.
- Login audit coverage remains incomplete.
- Audited functions use `Access-Control-Allow-Origin: *`; production origins should be restricted.
- Deployed migration/function parity, SES delivery, CSRF posture, and authenticated cross-tenant tests were not proven.

## Smallest path to the requested result

1. Review and explicitly approve the local migration/function deployment.
2. Configure deployed `APP_URL`, `LOGIN_OTP_PEPPER`, SES sender/region/credentials, and allowed production origins.
3. Move new-client company creation/approval into a transaction-safe RPC.
4. Test the narrowed client RLS and every client-facing function with two real tenants.
5. Add complete login audit events and decide the user-deletion retention policy.

## Completion evidence required

- Frontend typecheck and lint pass, with pre-existing failures separated.
- Migrations apply to a disposable database; remote migration list matches after approved deployment.
- Deployed functions match local source; OPTIONS is 2xx and unauthenticated calls return expected 401/403, not startup 503.
- A real invitation is received, verifies, cannot be duplicated/reused, and cannot change ownership.
- Pending/rejected/suspended-or-inactive/locked behavior matches the final model.
- Approval writes all linked state and sends approval email.
- Correct OTP creates a session; invalid, expired, reused, over-attempt, and over-resend codes fail.
- Altering client/company IDs never exposes another tenant's projects, statements, notifications, documents, support, timelines, or aggregates.
- Authenticated admin/client browser flows and visual states are verified.

## Audit boundary

This revision is based on local source plus the deployment smoke checks above. It does not claim inbox receipt, authenticated browser completion, or a real-account end-to-end pass. Invitation and approval links require `APP_URL` before production email testing.

1. Up to 5 Classes
Sheet Name: Up to 5 classes
Environment Variable: GOOGLE_SHEETS_UP_TO_5_CLASSES_RANGE
Range: Up to 5 classes!A:Z
2. Multi-class
Sheet Name: Multi-class
Environment Variable: GOOGLE_SHEETS_MULTI_CLASS_RANGE
Range: Multi-class!A:Z
3. Up to 3 Classes
Sheet Name: Up to 3 classes
Environment Variable: GOOGLE_SHEETS_UP_TO_3_CLASSES_RANGE
Range: Up to 3 classes!A:Z