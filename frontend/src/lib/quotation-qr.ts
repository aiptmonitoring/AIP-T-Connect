import QRCode from 'qrcode';

/** Keep shared receipts reachable even when generated from localhost or a private preview. */
export function quotationVerificationUrl(token: string) {
  if (!/^(?:[a-f0-9]{48}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(token)) {
    throw Error('This document has no valid verification code. Reload the saved document before printing.');
  }
  const base = new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://aiptconnect.aiptlaw.com');
  if (!['https:', 'http:'].includes(base.protocol)) throw Error('The public site URL must use HTTPS or HTTP.');
  return new URL('/invoice/verify/' + encodeURIComponent(token), base.origin).href;
}

/** SVG keeps modules sharp in PDF exports; four modules form the scanner quiet zone. */
export async function createQuotationQr(url: string) {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
