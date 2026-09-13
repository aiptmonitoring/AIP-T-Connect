import { fetchSupabaseFunction } from './supabase/browser';
export const MAX_LOGO_BYTES = 500 * 1024 * 1024;
export function validateLogo(file: File) {
 if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('Choose a PNG, JPG, or WEBP logo.');
 if (!file.size || file.size > MAX_LOGO_BYTES) throw Error('Logo must be between 1 byte and 500 MB.');
}
export async function uploadCompanyLogo(file: File, token: string): Promise<string> {
 validateLogo(file);
 const response = await fetchSupabaseFunction('account', {method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'logo-upload',content_type:file.type,size:file.size})});
 const body = await response.json();
 if (!response.ok) throw Error(body.error || 'Unable to prepare logo upload.');
 const uploaded = await fetch(body.url,{method:'PUT',headers:{'Content-Type':file.type},body:file});
 if (!uploaded.ok) throw Error('Logo upload failed. Please retry from Account settings.');
 return body.key;
}
