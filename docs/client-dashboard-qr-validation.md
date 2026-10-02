# Client dashboard and receipt QR validation

Validated locally on 2026-10-01.

## Changes

- Client landing page follows the supplied reference: white header, aqua brand and breadcrumb, account controls, welcome banner, seven cards, line icons, arrows, and curved wave backgrounds.
- The account name comes from the authenticated client identity.
- The previous dashboard remains at /client-dashboard/overview, available in the account menu alongside invoices and support.
- All seven cards lead to client routes. Fees reads the existing client-authorized quotation lookup catalog. POA filters existing requirements for POA / power of attorney.
- Existing approval/account checks remain in ClientShell. The three new destinations are registered in AdminAppShell.
- Receipt/quotation PDF and quotation preview share vector QR generation, a four-module white quiet zone, and validated verification tokens. The printed QR is approximately 31 mm wide.
- NEXT_PUBLIC_SITE_URL can pin QR links to the deployed application when a document is generated locally. Without this setting, the current origin is used.

## Passed

- TypeScript check: node node_modules/typescript/bin/tsc --noEmit --incremental false.
- Production build: AIPT_NEXT_DIST_DIR=.next-validation npm run build; 43 routes generated.
- Browser checks at widths 1578, 1280, 1024, 768, 390 and 320.
- Account menu, all seven destinations, published fees fixture, POA filter.
- Anonymous QR verification page and image-ready print action at phone viewport width.
- Seven exported PDF fixtures: reference, compact, long, design, discount-only, vat-only, neither. Standard fixtures fit one A4 page; long fixture has four pages; no overflowing cells.
- QR decoded from the exported reference PDF at 96, 150 and 300 DPI; all other PDF fixtures decoded at 150 DPI.
- Anonymous live verification API rejected a nonexistent test token with HTTP 404, rather than requesting login.
- Desktop/mobile screenshots and the rendered reference PDF inspected visually.

## Limits / remaining configuration

Browser account/data checks use explicitly synthetic fixtures; they do not prove a real client's current permissions or records.
The public deployed application URL has been requested and is awaiting the user's value. A localhost QR cannot open this computer from a phone or tablet.
No production deployment or physical-device camera scan has been performed.

## Repeatable checks

- frontend/scripts/client-dashboard-check.cjs uses PLAYWRIGHT_MODULE (and optionally CHECK_ORIGIN).
- frontend/scripts/quotation-pdf-check.cjs uses PLAYWRIGHT_MODULE.
- frontend/scripts/quotation-qr-check.cjs uses the temporary jsqr package under tmp/qr-validation and Poppler under tmp/pdf-tools.
- Screenshots: tmp/dashboard-check/.
- PDF render and decoding fixtures: tmp/pdfs/.
