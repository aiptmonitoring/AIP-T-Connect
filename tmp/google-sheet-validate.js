const fs = require('fs');
const crypto = require('crypto');
const sa = JSON.parse(fs.readFileSync('d:\\aipt ip monitoring\\importtant\\aipt-506908-8ea8f947158e.json', 'utf8'));
const spreadsheetId = '18NnLMFTdfL50khE3vB-zmFuOMeKEpfAB7nx0u9SRanY';
const b64url = (value) => Buffer.from(value).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
const privateKey = crypto.createPrivateKey(sa.private_key);
const signer = crypto.createSign('RSA-SHA256');
signer.update(`${header}.${claim}`);
const signature = signer.sign(privateKey);
const assertion = `${header}.${claim}.${b64url(signature)}`;

(async () => {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const tokenBody = await tokenRes.json();
  console.log('TOKEN_RESPONSE', tokenRes.status, JSON.stringify(tokenBody, null, 2));

  if (!tokenBody.access_token) return;

  const token = tokenBody.access_token;
  const tabsRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const tabsBody = await tabsRes.json();
  console.log('TABS_RESPONSE', tabsRes.status, JSON.stringify({ titles: (tabsBody.sheets || []).map((sheet) => sheet.properties.title) }, null, 2));

  for (const sheet of tabsBody.sheets || []) {
    const title = sheet.properties.title;
    const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${title}!A1:Z30`)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const valuesBody = await valuesRes.json();
    console.log('SHEET_DATA', JSON.stringify({ title, status: valuesRes.status, rowCount: Array.isArray(valuesBody.values) ? valuesBody.values.length : 0, firstRows: Array.isArray(valuesBody.values) ? valuesBody.values.slice(0, 4) : [] }, null, 2));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
