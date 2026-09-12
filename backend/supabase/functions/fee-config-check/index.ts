// System configuration check endpoint
// Verifies that all required database tables and seed data exist

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: cors,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Server configuration missing (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)',
        checks: {},
      }),
      { status: 500, headers: cors }
    );
  }

  const db = createClient(supabaseUrl, serviceRoleKey);
  const checks: Record<string, any> = {};

  try {
    // Check if fee_categories table exists and has data
    const { data: categories, error: catError, count: catCount } = await db
      .from('fee_categories')
      .select('id, name', { count: 'exact' })
      .limit(1);

    checks.fee_categories = {
      exists: !catError,
      has_data: (catCount || 0) > 0,
      error: catError?.message,
      count: catCount || 0,
    };

    // Check if fee_dataset_versions table exists
    const { data: versions, error: verError, count: verCount } = await db
      .from('fee_dataset_versions')
      .select('id, status', { count: 'exact' })
      .limit(1);

    checks.fee_dataset_versions = {
      exists: !verError,
      error: verError?.message,
      count: verCount || 0,
    };

    // Check if published version exists
    const { data: published, error: pubError } = await db
      .from('fee_dataset_versions')
      .select('id, version_number')
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    checks.published_version = {
      exists: !!published,
      version_number: published?.version_number,
      error: pubError?.message,
    };

    // Check if fee_values table exists and has data
    if (published) {
      const { data: values, error: valError, count: valCount } = await db
        .from('fee_values')
        .select('id', { count: 'exact' })
        .eq('dataset_version_id', published.id)
        .limit(1);

      checks.fee_values = {
        exists: !valError,
        has_data: (valCount || 0) > 0,
        error: valError?.message,
        count: valCount || 0,
      };
    }

    // Check if fee_services table exists
    const { data: services, error: svcError, count: svcCount } = await db
      .from('fee_services')
      .select('id', { count: 'exact' })
      .limit(1);

    checks.fee_services = {
      exists: !svcError,
      has_data: (svcCount || 0) > 0,
      error: svcError?.message,
      count: svcCount || 0,
    };

    // Overall status
    const allTablesExist = 
      checks.fee_categories.exists &&
      checks.fee_dataset_versions.exists &&
      checks.fee_services.exists;

    const isReady = allTablesExist && checks.published_version.exists && checks.fee_values?.has_data;

    return new Response(
      JSON.stringify({
        status: isReady ? 'ready' : allTablesExist ? 'waiting_sync' : 'migration_needed',
        message: isReady
          ? 'System is fully configured and has published fee data'
          : allTablesExist
          ? 'Database tables exist but no published dataset. Run a sync to populate fees.'
          : 'Database tables not found. Run migrations: npx supabase db push',
        checks,
        recommended_action: isReady
          ? 'none'
          : allTablesExist
          ? 'admin_sync'
          : 'deploy_migrations',
      }),
      { status: 200, headers: cors }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        checks,
      }),
      { status: 500, headers: cors }
    );
  }
});
