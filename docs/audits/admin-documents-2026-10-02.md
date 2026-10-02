# Admin POA and Schedule of Fees audit ? 2 October 2026

## Confirmed causes

- Production had no POA document tables or save RPC.
- Schedule of Fees backend was not deployed.
- The deployed POA gateway JWT setting differed from local function configuration.
- AWS allows listing but denies Schedule of Fees uploads to aiptschedule_of_fees/.
- The configured AWS identity cannot use IAM GetUser or PutUserPolicy (both HTTP 403 AccessDenied); STS caller identity verification succeeded.
- The fees page did not import the shared POA layout stylesheet.
- POA metadata was deleted before S3 deletion; an AWS failure could leave an orphaned file that reappeared in the legacy listing.
- Stored POA download requests by key did not consult stored country associations.
- Invalid file selection could retain an earlier selected file.
- Administrator authorization, document requests, date formatting, downloads, and AWS configuration/file validation were duplicated.

## Changes and deployment

Shared frontend helpers and backend storage helpers now serve both pages. CRUD accepts the validated document formats, rejects empty files, and retains POA metadata after failed S3 deletion so it can be retried. Key-based downloads use stored country permissions. Admins can download unassigned legacy POAs; editing the same legacy key reuses the existing metadata record. Upload requests allow up to 120 seconds instead of 15 seconds.

The missing POA schema was applied to davupzevvsngppcrynoj and both backend functions were deployed with application-level JWT/user checks. The frontend changes are local; no frontend hosting deployment was performed. Existing unrelated workspace edits were preserved.

Storage target: private AWS bucket aiptuploaddocument, region eu-north-1. POA prefix: aiptPOA/. Fees prefix: aiptschedule_of_fees/. No fallback bucket is used.

## Verification

- TypeScript check passed.
- Production build passed, with an existing services.css autoprefixer warning.
- Isolated regression tests passed for both CRUD lifecycles, role checks, empty files, legacy edits, key authorization, rollback, and failed-deletion recovery.
- Synthetic authenticated Chrome tests passed for both pages at widths 1440, 768, 390, and 320; screenshots were visually reviewed. These fixtures do not prove live browser authorization.
- Anonymous requests to both deployed endpoints returned 401.
- Live POA upload, rename, replacement, signed S3 download, deletion, and final listing reconciliation passed using a session for the configured test administrator. The signed download hostname matched aiptuploaddocument.s3.eu-north-1.amazonaws.com. Generated POA test objects and metadata were deleted.
- Live fees listing passed, but upload returned 502 with AWS AccessDenied. No fees test object was created.

## Remaining dependency

An AWS administrator must attach backend/aws/admin-documents-policy.json to the IAM identity used by the Edge Function AWS credentials, or grant equivalent permissions through its existing policy. The provided policy allows listing and GetObject/PutObject/DeleteObject only for these two folders in the configured bucket. Then rerun backend/scripts/check-admin-documents.mjs to prove the fees lifecycle. The configured credentials cannot change their own IAM permissions.

## Latest live verification

Schedule of Fees live upload, rename, file replacement, signed download from aiptuploaddocument in eu-north-1, deletion, and final listing reconciliation now pass. The existing document was preserved and the uniquely named test file was removed. The previously reported S3 permission dependency is resolved. IAM PutUserPolicy still returns HTTP 403 AccessDenied for the configured identity; policy management privileges remain unavailable, but application document operations work. Browser automation remains unavailable in this session. Frontend changes remain locally validated; no frontend hosting deployment was performed.

## POA dashboard and country-save correction

Added the Dashboard header with Home / POA breadcrumbs and the signed-in administrator account menu to localhost:3000/poa. Country selection now includes search, selected-country chips, select-all and clear controls. Edit/Delete labels remain visible in the widened action column; actions stay reachable on mobile. Updates and downloads are guarded against concurrent operations. Deletion uses an explicit in-page confirmation with progress and recoverable errors.

A live country-specific upload exposed an incorrect validation query in save_poa_document: count(distinct country_id) was used against public.countries, whose key is id. Migration 202610030002_fix_poa_country_validation.sql fixes that query and was applied and recorded in migration history.

Verification: TypeScript passed; localhost browser fixture checks passed for two-country uploads, association removal after reload, metadata-only updates, file replacement, invalid files, cancel/confirm deletion, and widths 1440, 768, 390 and 320. Rollback-only database tests passed for country creation, association replacement, shared country clearing, and deletion cascades. Live authenticated POA tests passed for saving two real active countries, changing those associations without replacing the file, replacing the file, signed AWS download, deletion, and listing reconciliation. Generated test files and records were removed.

## POA supplied design reference

The admin POA content now matches the supplied reference: AIP&T wordmark and tagline, Home / Dashboard breadcrumb, signed-in account controls, compact country/search/upload toolbar, four-column teal table, 43px document rows, labeled actions, and compact pagination. The previous standalone POA title banner was replaced with an accessible page heading to match the reference. The existing AdminAppShell and sidebar remain intact. Header account details come from the signed-in user.

TypeScript and localhost authenticated-fixture browser tests passed, including upload, multiple country associations, metadata-only updates, file replacement, invalid files, deletion confirmation, errors, and widths 1440, 768, 390 and 320. A twelve-document synthetic screenshot was visually compared against the user image; the content screenshot is tmp/admin-documents-check/poa-reference-content.png and the full dashboard screenshot is tmp/admin-documents-check/poa-reference-dashboard.png. No business records or AWS permissions were changed for this design task.
