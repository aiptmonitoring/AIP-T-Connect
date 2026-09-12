const fs = require('fs');
const crypto = require('crypto');
const sa = JSON.parse(fs.readFileSync('d:\\aipt ip monitoring\\importtant\\newaipt-506908-62986831bdff.json', 'utf8'));
const spreadsheetId = '1Q5iVUCqE7-EqLzNj5iCySt4kITGijk3V37kpWugGNFw';
const now = Math.floor(Date.now() / 1000);
const b64 = (value) => Buffer.from(value).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
const signer = crypto.createSign('RSA-SHA256');
signer.update(`${header}.${claim}`);
const signature = signer.sign(sa.private_key);
const assertion = `${header}.${claim}.${b64(signature.toString('binary'))}`;
const params = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
(async () => {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  const tokenBody = await tokenRes.json();
  console.log(JSON.stringify({ tokenStatus: tokenRes.status, hasAccessToken: !!tokenBody.access_token }, null, 2));
  if (!tokenBody.access_token) {
    console.log(JSON.stringify(tokenBody, null, 2));
    return;
  }
  const token = tokenBody.access_token;
  const tabsRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`, { headers: { Authorization: `Bearer ${token}` } });
  const tabsBody = await tabsRes.json();
  const titles = (tabsBody.sheets || []).map(s => s.properties.title);
  console.log(JSON.stringify({ tabsStatus: tabsRes.status, titles }, null, 2));
  for (const title of titles) {
    const range = `${title}!A1:Z30`;
    const rowRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
    const rowBody = await rowRes.json();
    const rows = Array.isArray(rowBody.values) ? rowBody.values.slice(0, 5) : [];
    console.log(JSON.stringify({ title, rowStatus: rowRes.status, rowCount: rows.length, rows }, null, 2));
  }
})();
