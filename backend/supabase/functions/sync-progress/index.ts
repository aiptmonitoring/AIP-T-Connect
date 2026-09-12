// Real-Time Sync Progress API
// Returns actual server-side sync state - NOT fake progress
// Used to monitor sync jobs that persist across browser closures

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: cors });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration missing' }),
      { status: 500, headers: cors }
    );
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Authenticate
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: cors,
      });
    }

    const { data: { user }, error: userError } = await db.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: cors,
      });
    }

    // Check admin role
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'administrator') {
      return new Response(JSON.stringify({ error: 'Administrator access required' }), {
        status: 403,
        headers: cors,
      });
    }

    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: staleRuns } = await db
      .from('fee_sync_runs')
      .select('id')
      .in('status', ['queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'recovering'])
      .lt('heartbeat_at', staleBefore);

    for (const staleRun of staleRuns || []) {
      await db.from('fee_sync_runs').update({
        status: 'interrupted',
        current_stage: 'interrupted',
        current_operation: 'Heartbeat timeout; synchronization interrupted',
        error_message: 'Synchronization heartbeat stopped; safe recovery is required.',
        updated_at: new Date().toISOString(),
      }).eq('id', staleRun.id);
      await db.from('fee_sync_locks').update({
        released_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('sync_run_id', staleRun.id).is('released_at', null);
      await db.from('fee_sync_logs').insert({
        sync_run_id: staleRun.id,
        event_type: 'SYNC_INTERRUPTED',
        severity: 'error',
        message: 'Synchronization interrupted after heartbeat timeout',
        metadata: { stale_before: staleBefore },
      });
    }

    // GET: Retrieve sync status
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const syncRunId = url.searchParams.get('sync_run_id');
      const getHistory = url.searchParams.get('history') === 'true';

      if (getHistory) {
        // Return recent sync history
        const { data: history, error } = await db
          .from('fee_sync_runs')
          .select('id, status, started_at, completed_at, processed_rows, total_rows, error_count, inserted_count, updated_count, dataset_version_id, sheet_progress')
          .order('started_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        return new Response(JSON.stringify({ history }), { status: 200, headers: cors });
      }

      if (!syncRunId) {
        // Return current active sync
        const { data: active, error } = await db
          .from('fee_sync_runs')
          .select(
            `
            id,
            status,
            current_stage,
            current_sheet,
            current_batch,
            total_batches,
            processed_rows,
            total_rows,
            inserted_count,
            updated_count,
            unchanged_count,
            skipped_count,
            error_count,
            started_at,
            completed_at,
            last_activity_at,
            heartbeat_at,
            recovery_attempts,
            percentage,
            sheet_progress,
            error_message,
            fee_sync_checkpoints(sheet_name, current_batch, total_batches, processed_rows, error_count),
            fee_sync_logs(event_type, message, severity)
          `
          )
          .in('status', ['queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'recovering'])
          .limit(1)
          .maybeSingle();

        if (!active) {
          const { data: interrupted } = await db
            .from('fee_sync_runs')
            .select('id, status, current_stage, current_operation, processed_rows, total_rows, percentage, sheet_progress, recovery_attempts, error_message')
            .eq('status', 'interrupted')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (interrupted) {
            return new Response(JSON.stringify({
              sync_run_id: interrupted.id,
              status: interrupted.status,
              progress: {
                overall_percent: interrupted.percentage || 0,
                processed_rows: interrupted.processed_rows || 0,
                total_rows: interrupted.total_rows || 0,
              },
              statistics: { inserted: 0, updated: 0, unchanged: 0, skipped: 0, errors: 1 },
              sheet_progress: interrupted.sheet_progress || {},
              current_operation: interrupted.current_operation,
              recovery_attempts: interrupted.recovery_attempts || 0,
              error_message: interrupted.error_message,
              recovery_required: true,
            }), { status: 200, headers: cors });
          }

          return new Response(
            JSON.stringify({
              status: 'idle',
              message: 'No active sync job',
            }),
            { status: 200, headers: cors }
          );
        }

        return new Response(
          JSON.stringify({
            sync_run_id: active.id,
            status: active.status,
            current_stage: active.current_stage,
            progress: {
              overall_percent: active.percentage || 0,
              current_sheet: active.current_sheet,
              current_batch: active.current_batch,
              total_batches: active.total_batches,
              processed_rows: active.processed_rows,
              total_rows: active.total_rows,
            },
            statistics: {
              inserted: active.inserted_count || 0,
              updated: active.updated_count || 0,
              unchanged: active.unchanged_count || 0,
              skipped: active.skipped_count || 0,
              errors: active.error_count || 0,
            },
            timing: {
              started_at: active.started_at,
              last_activity_at: active.last_activity_at,
              heartbeat_at: active.heartbeat_at,
            },
            error_message: active.error_message,
            recovery_attempts: active.recovery_attempts,
            sheet_progress: active.sheet_progress || {},
            recent_checkpoints: active.fee_sync_checkpoints || [],
            recent_logs: (active.fee_sync_logs || []).slice(-10).reverse(),
          }),
          { status: 200, headers: cors }
        );
      }

      // Get specific sync run status
      const { data: syncRun, error } = await db
        .from('fee_sync_runs')
        .select(
          `
          id,
          status,
          current_stage,
          current_sheet,
          current_batch,
          total_batches,
          processed_rows,
          total_rows,
          inserted_count,
          updated_count,
          unchanged_count,
          skipped_count,
          error_count,
          started_at,
          completed_at,
          last_activity_at,
          error_message,
          recovery_attempts,
          percentage,
          sheet_progress
        `
        )
        .eq('id', syncRunId)
        .single();

      if (error || !syncRun) {
        return new Response(JSON.stringify({ error: 'Sync run not found' }), {
          status: 404,
          headers: cors,
        });
      }

      return new Response(JSON.stringify({ sync_run: syncRun }), {
        status: 200,
        headers: cors,
      });
    }

    // POST: Start new sync
    if (request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { action?: string; version_id?: string };

      if (body.action === 'rollback') {
        if (!body.version_id) {
          return new Response(JSON.stringify({ error: 'version_id is required for rollback' }), {
            status: 400,
            headers: cors,
          });
        }

        const { error } = await db.rpc('rollback_fee_dataset', {
          p_version_id: body.version_id,
          p_actor_id: user.id,
        });
        if (error) throw error;

        return new Response(JSON.stringify({ message: 'Fee dataset rolled back', version_id: body.version_id }), {
          status: 200,
          headers: cors,
        });
      }

      if (body.action === 'start-sync') {
        const { data: active } = await db
          .from('fee_sync_runs')
          .select('id, status')
          .in('status', ['queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'recovering'])
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (active) {
          return new Response(
            JSON.stringify({
              status: active.status,
              sync_run_id: active.id,
              message: 'A sync is already in progress on the server.',
            }),
            { status: 409, headers: cors }
          );
        }

        return new Response(
          JSON.stringify({
            message: 'Use the sync-fees endpoint to start a server-side sync run.',
            note: 'The browser should not create a synthetic sync job.',
          }),
          { status: 202, headers: cors }
        );
      }

      if (body.action === 'cancel-sync') {
        const { data: active } = await db
          .from('fee_sync_runs')
          .select('id')
          .in('status', ['queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'recovering'])
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active) {
          return new Response(JSON.stringify({ message: 'No active sync to cancel' }), {
            status: 200,
            headers: cors,
          });
        }

        const { error } = await db
          .from('fee_sync_runs')
          .update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
          })
          .eq('id', active.id);

        if (error) throw error;

        await db.from('fee_sync_logs').insert({
          sync_run_id: active.id,
          event_type: 'SYNC_CANCELLED',
          severity: 'warning',
          message: 'Synchronization cancelled by administrator',
          metadata: {},
        });

        return new Response(
          JSON.stringify({ message: 'Sync cancelled', sync_run_id: active.id }),
          { status: 200, headers: cors }
        );
      }

      return new Response(JSON.stringify({ error: 'Unknown action' }), {
        status: 400,
        headers: cors,
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: cors,
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      { status: 500, headers: cors }
    );
  }
});
