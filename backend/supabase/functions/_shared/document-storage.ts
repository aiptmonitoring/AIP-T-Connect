import { S3Client } from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle";
// Never silently upload to a fallback bucket.
export const bucket = Deno.env.get("AWS_S3_BUCKET")?.trim() ?? "";
const region = Deno.env.get("AWS_REGION")?.trim() ?? "";
let storage: S3Client | undefined;
export function getS3() {
 const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
 const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
 if (!bucket || !region || !accessKeyId || !secretAccessKey) throw Error("Document storage is not configured. Set AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY in the Edge Function secrets.");
 return storage ??= new S3Client({ region, credentials: { accessKeyId, secretAccessKey, ...(Deno.env.get("AWS_SESSION_TOKEN") ? { sessionToken: Deno.env.get("AWS_SESSION_TOKEN") } : {}) } });
}
export const extension = (key: string) => key.split("/").at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
export function validateDocumentKey(key: string | null, prefix: string, allowed: Set<string>) {
 if (!key || !key.startsWith(prefix) || key.includes("..") || !allowed.has(extension(key))) throw Error("Select a valid document storage key.");
 return key;
}
export function verifyDocumentFile(value: FormDataEntryValue | null, types: Record<string, string>, maxSize: number) {
 if (!(value instanceof File)) throw Error("Choose a document to upload.");
 const ext = extension(value.name);
 if (!types[ext] || value.size < 1 || value.size > maxSize) throw Error('Upload ' + Object.keys(types).map(type => type.toUpperCase()).join(', ') + ' files up to ' + maxSize / (1024 * 1024) + ' MB.');
 return { file: value, ext, contentType: types[ext] };
}
export function documentStorageError(cause: unknown, prefix: string) {
 const error = cause as { name?: string; message?: string; code?: string; $metadata?: { httpStatusCode?: number } };
 if (error.name === "AccessDenied" || error.$metadata?.httpStatusCode === 403) return { status: 502, message: 'AWS denied this operation. Grant s3:ListBucket on the configured bucket and s3:GetObject, s3:PutObject, and s3:DeleteObject on ' + prefix + '*.' };
 if (["NoSuchBucket", "PermanentRedirect", "AuthorizationHeaderMalformed"].includes(error.name ?? '')) return { status: 502, message: "Check AWS_S3_BUCKET and AWS_REGION. The bucket must exist in that region." };
 if (["NoSuchKey", "NotFound"].includes(error.name ?? '') || error.$metadata?.httpStatusCode === 404) return { status: 404, message: "Document not found in storage." };
 if (["42P01", "PGRST205", "PGRST202"].includes(error.code ?? '')) return { status: 503, message: "The POA database schema is not deployed. Apply the POA documents migration and refresh the schema cache." };
 if (error.message?.startsWith("Document storage is not configured")) return { status: 503, message: error.message };
 return { status: 400, message: error.message || "Unable to complete the document request." };
}
