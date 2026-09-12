import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...cors,
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json',
  },
});

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function todayInRiyadh() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function readDate(value: string | null) {
  const result = value || todayInRiyadh();
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (!datePattern.test(result) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw Error('day must be a valid YYYY-MM-DD date.');
  }
  return result;
}

function readInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw Error('Pagination and month values must be whole numbers.');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw Error(`Value must be between ${minimum} and ${maximum}.`);
  }
  return result;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Dashboard service is not configured.' }, 500);

  const db = createClient(supabaseUrl, serviceRoleKey);
  const { data: { user } } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: 'Authentication is required.' }, 401);

  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError) return json({ error: 'Could not verify your access.' }, 500);
  if (profile?.role === 'client') return json({ error: 'Client access is required.' }, 403);
  if (profile?.role !== 'administrator') return json({ error: 'Administrator access is required.' }, 403);

  try {
    const url = new URL(request.url);
    const asOfDate = readDate(url.searchParams.get('day'));
    const months = readInteger(url.searchParams.get('months'), 12, 3, 24);
    const recentPage = readInteger(url.searchParams.get('recent_page'), 1, 1, 100000);
    const recentPageSize = readInteger(url.searchParams.get('recent_page_size'), 10, 1, 50);
    const recentSearch = (url.searchParams.get('recent_search') ?? '').trim().slice(0, 120);

    const { data, error } = await db.rpc('dashboard_summary', {
      p_as_of_date: asOfDate,
      p_month_count: months,
      p_recent_page: recentPage,
      p_recent_page_size: recentPageSize,
      p_recent_search: recentSearch,
    });
    if (error) throw error;

    return json(data);
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : 'Could not load the dashboard summary.' }, 400);
  }
});
