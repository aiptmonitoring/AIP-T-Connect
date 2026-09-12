import { createClient } from 'npm:@supabase/supabase-js@2';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from 'https://esm.sh/@aws-sdk/client-s3@3.637.0?target=deno&bundle';
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.637.0?target=deno&bundle';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const ticketSelect = 'id,client_id,subject,category,priority,status,created_at,updated_at,client:clients(id,assigned_id,company_name,email,phone,address,country:countries(id,name,abbreviation))';
const messageSelect = 'id,ticket_id,sender_id,sender_role,message,reply_to_id,created_at,reply_to:customer_service_messages!reply_to_id(id,message,sender_role),attachments:customer_service_attachments(id,file_name,file_size,file_type,is_image,created_at)';
const maxFileSize = 10 * 1024 * 1024;
const maxFileCount = 5;
const fileTypes: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', rtf: 'application/rtf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  html: 'application/octet-stream', htm: 'application/octet-stream', msg: 'application/vnd.ms-outlook', eml: 'message/rfc822',
};
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const region = Deno.env.get('AWS_REGION') || 'eu-north-1';
const bucket = Deno.env.get('CUSTOMER_SUPPORT_S3_BUCKET') || 'aiptuploaddocument';
const s3 = new S3Client({ region, credentials: { accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!, secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')! } });
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'attachment';

function validateFiles(files: File[]) {
  if (files.length > maxFileCount) throw Error(`Attach up to ${maxFileCount} files per message.`);
  return files.map((file) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const fileType = fileTypes[extension];
    if (!fileType || file.size < 1 || file.size > maxFileSize) throw Error('Each attachment must be an image, PDF, Office document, text, RTF, HTML, EML, or Outlook MSG file up to 10MB.');
    return { file, fileType, isImage: imageTypes.has(fileType) };
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const auth = token ? await db.auth.getUser(token) : null;
  const user = auth?.data.user;
  if (!user) return json({ error: 'Authentication is required.' }, 401);
  const profile = await db.from('profiles').select('role,client_id').eq('id', user.id).single();
  const isAdmin = profile.data?.role === 'administrator';
  const isClient = profile.data?.role === 'client' && Boolean(profile.data.client_id);
  if (!isAdmin && !isClient) return json({ error: 'Client access is required. Please log in again using a client account.' }, 403);
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const root = parts.lastIndexOf('customer-service');
  const route = root < 0 ? [] : parts.slice(root + 1);
  const ticketId = route[0] || null;
  try {
    let ticketQuery = db.from('customer_service_tickets').select(ticketSelect).is('deleted_at', null).order('updated_at', { ascending: false });
    if (!isAdmin) ticketQuery = ticketQuery.eq('client_id', profile.data!.client_id);
    const tickets = await ticketQuery;
    if (tickets.error) throw tickets.error;
    const ticketRows = tickets.data ?? [];
    const allowedTicket = ticketId ? ticketRows.find((ticket) => ticket.id === ticketId) : null;

    if (request.method === 'GET' && route.length === 5 && route[1] === 'messages' && route[3] === 'attachments' && route[4] === 'download-url') {
      if (!allowedTicket) return json({ error: 'Conversation not found.' }, 404);
      const messageId = route[2];
      const attachmentId = new URL(request.url).searchParams.get('attachment_id');
      const attachment = attachmentId ? await db.from('customer_service_attachments').select('object_key,file_name,file_type').eq('id', attachmentId).eq('message_id', messageId).maybeSingle() : { data: null };
      if (!attachment.data) return json({ error: 'Attachment not found.' }, 404);
      return json({ url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: attachment.data.object_key, ResponseContentDisposition: `attachment; filename=${safeName(attachment.data.file_name)}`, ResponseContentType: attachment.data.file_type === 'text/html' ? 'application/octet-stream' : attachment.data.file_type }), { expiresIn: 300 }) });
    }

    if (request.method === 'GET') {
      const ticketIds = ticketRows.map((ticket) => ticket.id);
      const unreadRole = isAdmin ? 'client' : 'administrator';
      const unreadMessages = ticketIds.length ? await db.from('customer_service_messages').select('ticket_id,created_at').in('ticket_id', ticketIds).eq('sender_role', unreadRole) : { data: [], error: null };
      if (unreadMessages.error) throw unreadMessages.error;
      const readStates = ticketIds.length ? await db.from('customer_service_read_state').select('ticket_id,last_read_at').eq('user_id', user.id).in('ticket_id', ticketIds) : { data: [], error: null };
      if (readStates.error) throw readStates.error;
      const ticketsWithUnread = ticketRows.map((ticket) => { const lastReadAt = (readStates.data ?? []).find((state) => state.ticket_id === ticket.id)?.last_read_at; return { ...ticket, unread_count: (unreadMessages.data ?? []).filter((message) => message.ticket_id === ticket.id && (!lastReadAt || message.created_at > lastReadAt)).length }; });
      let messages: unknown[] = [];
      if (allowedTicket) {
        const result = await db.from('customer_service_messages').select(messageSelect).eq('ticket_id', ticketId).order('created_at');
        if (result.error) throw result.error;
        messages = result.data ?? [];
        await db.from('customer_service_read_state').upsert({ ticket_id: ticketId, user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: 'ticket_id,user_id' });
      }
      const typingState = allowedTicket ? await db.from('customer_service_read_state').select('user_id').eq('ticket_id', ticketId).neq('user_id', user.id).gt('typing_until', new Date().toISOString()).limit(1) : { data: [] };
      const statusActions = allowedTicket ? await db.from('customer_service_status_actions').select('id,from_status,to_status,note,created_at').eq('ticket_id', ticketId).order('created_at') : { data: [], error: null };
      if (statusActions.error) throw statusActions.error;
      return json({ tickets: allowedTicket ? ticketsWithUnread.filter((ticket) => ticket.id === ticketId).map((ticket) => ({ ...ticket, unread_count: 0 })) : ticketsWithUnread, messages, status_actions: statusActions.data ?? [], other_typing: Boolean(typingState.data?.length) });
    }

    if (request.method === 'POST' && route[1] === 'typing' && ticketId) {
      if (!allowedTicket) return json({ error: 'Conversation not found.' }, 404);
      const body = await request.json();
      const typingUntil = body.typing === false ? new Date().toISOString() : new Date(Date.now() + 5000).toISOString();
      const state = await db.from('customer_service_read_state').upsert({ ticket_id: ticketId, user_id: user.id, typing_until: typingUntil }, { onConflict: 'ticket_id,user_id' });
      if (state.error) throw state.error;
      return json({ typing: body.typing !== false });
    }

    if (request.method === 'POST' && route[1] === 'messages' && ticketId) {
      if (!allowedTicket) return json({ error: 'Conversation not found.' }, 404);
      const contentType = request.headers.get('content-type') ?? '';
      let message = '', replyToId: string | null = null, files: File[] = [];
      if (contentType.includes('multipart/form-data')) {
        const form = await request.formData();
        message = String(form.get('message') ?? '').trim();
        replyToId = String(form.get('reply_to_id') ?? '').trim() || null;
        files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
      } else {
        const body = await request.json();
        message = String(body.message ?? '').trim();
        replyToId = String(body.reply_to_id ?? '').trim() || null;
      }
      const checkedFiles = validateFiles(files);
      if ((!message && !checkedFiles.length) || message.length > 5000) return json({ error: 'Enter a message or attach at least one file. Messages can contain up to 5,000 characters.' }, 400);
      if (replyToId) {
        const replyTarget = await db.from('customer_service_messages').select('id').eq('id', replyToId).eq('ticket_id', ticketId).maybeSingle();
        if (!replyTarget.data) return json({ error: 'The message being replied to is no longer available.' }, 400);
      }
      const messageId = crypto.randomUUID();
      const uploaded: Array<{ object_key: string; file_name: string; file_size: number; file_type: string; is_image: boolean }> = [];
      try {
        for (const item of checkedFiles) {
          const object_key = `customer_support/${ticketId}/${messageId}/${crypto.randomUUID()}-${safeName(item.file.name)}`;
          await s3.send(new PutObjectCommand({ Bucket: bucket, Key: object_key, Body: new Uint8Array(await item.file.arrayBuffer()), ContentType: item.fileType === 'application/octet-stream' ? 'application/octet-stream' : item.fileType, ContentDisposition: `attachment; filename=${safeName(item.file.name)}` }));
          uploaded.push({ object_key, file_name: item.file.name, file_size: item.file.size, file_type: item.fileType, is_image: item.isImage });
        }
        const created = await db.from('customer_service_messages').insert({ id: messageId, ticket_id: ticketId, sender_id: user.id, sender_role: isAdmin ? 'administrator' : 'client', message, reply_to_id: replyToId }).select(messageSelect).single();
        if (created.error) throw created.error;
        if (uploaded.length) { const saved = await db.from('customer_service_attachments').insert(uploaded.map((attachment) => ({ message_id: messageId, ...attachment }))); if (saved.error) throw saved.error; }
        await db.from('customer_service_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);
        const complete = await db.from('customer_service_messages').select(messageSelect).eq('id', messageId).single();
        if (complete.error) throw complete.error;
        return json(complete.data, 201);
      } catch (cause) {
        await Promise.allSettled(uploaded.map((attachment) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: attachment.object_key }))));
        await db.from('customer_service_messages').delete().eq('id', messageId);
        throw cause;
      }
    }

    if (request.method === 'POST' && route.length === 0) {
      const body = await request.json();
      const payload = { client_id: isAdmin ? String(body.client_id ?? '') : String(profile.data!.client_id), subject: String(body.subject ?? '').trim(), category: String(body.category ?? 'General'), priority: String(body.priority ?? 'Normal') };
      const message = String(body.message ?? '').trim();
      if (!payload.client_id || payload.subject.length < 3 || payload.subject.length > 255) return json({ error: 'Enter a subject between 3 and 255 characters.' }, 400);
      if (!['Low','Normal','High','Urgent'].includes(payload.priority)) return json({ error: 'Choose a valid priority.' }, 400);
      if (!message || message.length > 5000) return json({ error: 'Enter an initial message between 1 and 5,000 characters.' }, 400);
      const created = await db.from('customer_service_tickets').insert(payload).select(ticketSelect).single(); if (created.error) throw created.error;
      const firstMessage = await db.from('customer_service_messages').insert({ ticket_id: created.data.id, sender_id: user.id, sender_role: isAdmin ? 'administrator' : 'client', message });
      if (firstMessage.error) { await db.from('customer_service_tickets').delete().eq('id', created.data.id); throw firstMessage.error; }
      return json(created.data, 201);
    }

    if (request.method === 'PUT' && ticketId) {
      if (!isAdmin) return json({ error: 'Administrator access is required.' }, 403);
      const body = await request.json();
      const status = typeof body.status === 'string' ? body.status : '';
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
      if (!['Open', 'Pending', 'Resolved'].includes(status)) return json({ error: 'Choose Open, Pending, or Resolved.' }, 400);
      if (!allowedTicket) return json({ error: 'Conversation not found.' }, 404);
      const saved = await db.rpc('update_customer_service_ticket_status', { p_ticket_id: ticketId, p_status: status, p_actor_id: user.id, p_note: note || null });
      if (saved.error) throw saved.error;
      const refreshed = await db.from('customer_service_tickets').select(ticketSelect).eq('id', ticketId).is('deleted_at', null).single();
      if (refreshed.error) throw refreshed.error;
      return json(refreshed.data);
    }
    return json({ error: 'Method not allowed.' }, 405);
  } catch (cause) {
    const error = cause as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    if (error.name === 'NoSuchBucket' || /specified bucket does not exist/i.test(error.message ?? '')) return json({ error: 'The customer support S3 bucket could not be found.' }, 502);
    if (error.name === 'AccessDenied' || error.$metadata?.httpStatusCode === 403 || /access denied/i.test(error.message ?? '')) return json({ error: 'AWS denied access to customer_support/. Grant s3:PutObject, s3:GetObject, and s3:DeleteObject for that prefix.' }, 502);
    return json({ error: error.message ?? 'Request failed.' }, error.$metadata?.httpStatusCode && error.$metadata.httpStatusCode >= 500 ? 502 : 400);
  }
});
