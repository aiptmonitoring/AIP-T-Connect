# Registration and company logo uploads

Local changes align registration with the supplied register.png reference and support PNG, JPEG, and WEBP logos up to 524,288,000 bytes (500 MB in the UI).

The browser requests an authenticated upload URL from POST account, sends the file directly to S3 with PUT, then supplies the returned logo_key to PUT account. The API checks the authenticated user prefix and actual S3 object size/type before saving the profile. Existing small base64 requests remain compatible. Account responses resolve private logo keys into temporary display URLs.

Deployment prerequisites:
- Deploy backend/supabase/functions/account before releasing the updated frontend.
- Verify the configured S3 bucket CORS permits PUT from the actual frontend origins with Content-Type. No public bucket access is needed.
- Verify the function IAM credentials permit PutObject and GetObject (including HeadObject) for logo_company/.
- Test a real approved account updating a logo, fresh registration, email-confirmation registration, and rejection of another user's key.
- Verify a real 500 MB transfer and browser CORS behavior before claiming production support.

No remote function deployment, bucket changes, or live account creation were performed. Local TypeScript and mocked handler checks passed; authenticated uploads and visual browser checks remain unverified. Failed or replaced uploads are retained in S3; configure appropriate cleanup separately if needed.

Rollback: restore the previous frontend and account function together. Do not remove uploaded objects during rollback.
