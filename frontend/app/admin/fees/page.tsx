'use client';
import ActionIcon from '../../../src/components/ActionIcon';


import { useCallback, useEffect, useState } from 'react';
import { fetchSupabaseFunction, getSupabaseBrowserClient, setFeeSyncActivity } from '../../../src/lib/supabase/browser';
import SyncControls from './sync-controls';
import ExportControls from './export-controls';
import SyncTestPage from './test-page';
import { type FeeRecord } from './export-utils';
import './styles.css';

type Category = 'Trademark' | 'Patent' | 'Design' | 'Copyright' | 'Others' | 'Up to 5 classes' | 'Multi-class' | 'Up to 3 classes' | 'Classes';
type SyncStatus = 'idle' | 'queued' | 'starting' | 'running' | 'validating' | 'reconciling' | 'publishing' | 'completed' | 'failed' | 'interrupted' | 'recovering' | 'cancelled';

type SyncRun = {
  id: string;
  status: SyncStatus;
  current_sheet?: string;
  current_batch?: number;
  total_batches?: number;
  processed_rows: number;
  total_rows: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  started_at: string;
  completed_at?: string;
};

type SyncProgress = {
  sync_run_id?: string;
  status: SyncStatus;
  progress: {
    overall_percent: number;
    current_sheet?: string;
    processed_rows: number;
    total_rows: number;
  };
  statistics: {
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  sheet_progress: Record<Category, 'complete' | 'processing' | 'pending'>;
  current_operation?: string;
  last_activity_at?: string;
  error_message?: string;
};

type SyncHistory = SyncRun & {
  duration?: number;
};

const CATEGORIES: Category[] = ['Trademark', 'Patent', 'Design', 'Copyright', 'Others', 'Up to 5 classes', 'Multi-class', 'Up to 3 classes', 'Classes'];
const SYNC_POLL_INTERVAL = 2000;

export default function AdminFeesPage() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncHistory[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showTestPage, setShowTestPage] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('02:00');
  const [syncMode, setSyncMode] = useState<'manual' | 'automatic'>('manual');
  const [scheduledFrequency, setScheduledFrequency] = useState<'hourly' | 'daily' | 'weekly' | 'monthly'>('daily');
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [exportRecords, setExportRecords] = useState<FeeRecord[]>([]);
  const [systemStatus, setSystemStatus] = useState<'checking' | 'ready' | 'waiting_sync' | 'migration_needed'>('checking');

  const supabase = getSupabaseBrowserClient();

  // Load initial sync progress
  useEffect(() => {
    const loadInitialProgress = async () => {
      try {
        const { data: { session } } = await supabase!.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        // Check system status first
        try {
          const statusResponse = await fetchSupabaseFunction('fee-config-check', { headers: { Authorization: `Bearer ${session.access_token}` } });
          const statusData = await statusResponse.json();
          setSystemStatus(statusData.status || 'checking');
        } catch (e) {
          console.warn('Could not check system status:', e);
        }

        const { data: schedule } = await supabase!
          .from('fee_sync_schedules')
          .select('id, enabled, frequency, execution_time, timezone')
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (schedule) {
          setScheduleId(schedule.id);
          setSyncMode(schedule.enabled ? 'automatic' : 'manual');
          setScheduledFrequency(schedule.frequency === 'hourly' || schedule.frequency === 'weekly' || schedule.frequency === 'monthly' ? schedule.frequency : 'daily');
          if (schedule.execution_time) setScheduledTime(schedule.execution_time.slice(0, 5));
        }

        const response = await fetchSupabaseFunction('sync-progress', { headers: { Authorization: `Bearer ${session.access_token}` } });

        const data = await response.json() as SyncProgress;
        setSyncProgress(data);
        setSyncStatus(data.status);
        const activeSync = data.status !== 'idle' && data.status !== 'completed' && data.status !== 'failed' && data.status !== 'interrupted';
        setSyncing(activeSync);
        setFeeSyncActivity(activeSync);
      } catch (e) {
        console.error('Failed to load progress:', e);
      } finally {
        setLoading(false);
      }
    };

    void loadInitialProgress();
  }, [supabase]);

  // Poll sync progress
  useEffect(() => {
    if (!syncing) return;

    const interval = setInterval(async () => {
      try {
        const { data: { session } } = await supabase!.auth.getSession();
        if (!session) return;

        const response = await fetchSupabaseFunction('sync-progress', { headers: { Authorization: `Bearer ${session.access_token}` } });

        const data = await response.json() as SyncProgress;
        setSyncProgress(data);
        setSyncStatus(data.status);

        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled' || data.status === 'interrupted') {
          setSyncing(false);
          setFeeSyncActivity(false);
        } else {
          setFeeSyncActivity(true);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, SYNC_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [syncing, supabase]);

  const startSync = useCallback(async () => {
    try {
      setError('');

      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      setSyncProgress((current) => ({
        ...(current ?? {
          status: 'queued',
          progress: { overall_percent: 0, processed_rows: 0, total_rows: 0 },
          statistics: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
          sheet_progress: { Trademark: 'pending', Patent: 'pending', Design: 'pending', Copyright: 'pending', Others: 'pending', 'Up to 5 classes': 'pending', 'Multi-class': 'pending', 'Up to 3 classes': 'pending', Classes: 'pending' },
        }),
        status: 'queued',
        current_operation: 'Starting synchronization on the server',
      }));
      setSyncStatus('queued');
      setSyncing(true);
      setFeeSyncActivity(true);

      const response = await fetchSupabaseFunction('sync-fees', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-now' }),
      });

      const data = await response.json().catch(() => ({})) as Partial<SyncProgress> & { error?: string; sync_run_id?: string; message?: string };

      if (!response.ok) {
        setFeeSyncActivity(false);
        setSyncing(false);
        setSyncStatus('failed');
        throw new Error(data.error || data.error_message || 'Failed to start sync');
      }

      setSyncProgress((current) => ({
        ...(current ?? {
          status: 'queued',
          progress: { overall_percent: 0, processed_rows: 0, total_rows: 0 },
          statistics: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
          sheet_progress: { Trademark: 'pending', Patent: 'pending', Design: 'pending', Copyright: 'pending', Others: 'pending', 'Up to 5 classes': 'pending', 'Multi-class': 'pending', 'Up to 3 classes': 'pending', Classes: 'pending' },
        }),
        status: 'queued',
        current_operation: data.message || 'Sync queued on the server',
      }));
      setSyncStatus('queued');
      setSyncing(true);
    } catch (e) {
      setFeeSyncActivity(false);
      setSyncing(false);
      setError(e instanceof Error ? e.message : 'Failed to start sync');
    }
  }, [supabase]);

  const cancelSync = useCallback(async () => {
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetchSupabaseFunction('sync-progress', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-sync' }),
      });

      if (!response.ok) throw new Error('Failed to cancel sync');

      setSyncing(false);
      setSyncStatus('cancelled');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel sync');
    }
  }, [supabase]);

  const resumeSync = useCallback(async () => {
    if (!syncProgress?.sync_run_id) {
      setError('No interrupted sync run is available to resume.');
      return;
    }
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      setError('');
      setSyncing(true);
      setSyncStatus('recovering');
      const response = await fetchSupabaseFunction('sync-fees', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume-sync', sync_run_id: syncProgress.sync_run_id }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to resume sync');
    } catch (e) {
      setSyncing(false);
      setError(e instanceof Error ? e.message : 'Failed to resume sync');
    }
  }, [supabase, syncProgress]);

  const loadSyncHistory = useCallback(async () => {
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetchSupabaseFunction('sync-progress?history=true', { headers: { Authorization: `Bearer ${session.access_token}` } });

      const data = await response.json() as { history?: SyncHistory[]; data?: SyncHistory[] };
      setSyncHistory(data.history || data.data || []);
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }, [supabase]);

  const loadExportRecords = useCallback(async () => {
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) return;

      const response = await fetchSupabaseFunction('fees-api?category=Trademark&limit=200', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const body = await response.json().catch(() => ({ data: [] })) as { data?: FeeRecord[] };
      setExportRecords(Array.isArray(body.data) ? body.data : []);
    } catch (e) {
      console.error('Failed to load export records:', e);
      setExportRecords([]);
    }
  }, [supabase]);

  const saveSchedule = useCallback(async () => {
    try {
      setError('');
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const nextRun = new Date();
      const [hours, minutes] = scheduledTime.split(':').map(Number);
      nextRun.setUTCHours(hours, minutes, 0, 0);
      if (nextRun <= new Date()) nextRun.setUTCDate(nextRun.getUTCDate() + 1);

      const payload = {
        enabled: syncMode === 'automatic',
        frequency: scheduledFrequency,
        execution_time: scheduledTime,
        timezone: 'UTC',
        next_scheduled_run_at: nextRun.toISOString(),
        created_by: session.user.id,
        updated_at: new Date().toISOString(),
      };
      const query = scheduleId
        ? supabase!.from('fee_sync_schedules').update(payload).eq('id', scheduleId)
        : supabase!.from('fee_sync_schedules').insert(payload).select('id').single();
      const { data, error: scheduleError } = await query;
      if (scheduleError) throw scheduleError;
      if (!scheduleId && data && !Array.isArray(data) && 'id' in data) setScheduleId(data.id);
      setError(syncMode === 'automatic' ? `Automatic ${scheduledFrequency} sync saved at ${scheduledTime} UTC.` : 'Manual sync mode saved. Automatic syncing is disabled.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save server schedule.');
    }
  }, [scheduledFrequency, scheduledTime, scheduleId, supabase, syncMode]);

  useEffect(() => {
    void loadExportRecords();
  }, [loadExportRecords]);

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
        <p style={{ color: '#666' }}>Loading admin dashboard...</p>
      </div>
    );
  }

  if (showTestPage) {
    return (
      <>
        <div style={{ padding: '20px', background: '#f9fafb' }}>
          <button 
            onClick={() => setShowTestPage(false)}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginBottom: '20px',
            }}
          >
            ← Back to Dashboard
          </button>
        </div>
        <SyncTestPage />
      </>
    );
  }

  // System status banner
  const statusBanners: Record<string, { bg: string; text: string; message: string }> = {
    ready: { bg: '#d1fae5', text: '#065f46', message: '✓ System ready. Database configured and fee data available.' },
    waiting_sync: { bg: '#fef3c7', text: '#92400e', message: '⚠ Database configured but no fee data yet. Click "Sync Now" to load fees from Google Sheets.' },
    migration_needed: { bg: '#fee2e2', text: '#991b1b', message: '🔴 Database not initialized. Run: npx supabase db push' },
    checking: { bg: '#e0e7ff', text: '#3730a3', message: '⏳ Checking system status...' },
  };

  const banner = statusBanners[systemStatus];

  return (
    <main style={{ padding: '20px' }}>
      {banner && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '20px',
          background: banner.bg,
          color: banner.text,
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '500',
        }}>
          {banner.message}
        </div>
      )}

      <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1f2937', margin: '0 0 8px 0' }}>
          📊 Admin Fees Dashboard
        </h1>
        <p style={{ color: '#6b7280', margin: '0' }}>
          Synchronize, manage, and export fee data from Google Sheets
        </p>
      </div>

      {/* Sync Controls */}
      <SyncControls
        status={syncStatus}
        progress={syncProgress}
        syncing={syncing}
        onSync={startSync}
        onCancel={cancelSync}
        onResume={resumeSync}
      />

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <ExportControls records={exportRecords} disabled={syncing || exportRecords.length === 0} />
        <button
          onClick={() => {
            setShowHistory(!showHistory);
            if (!showHistory) void loadSyncHistory();
          }}
          style={{
            padding: '10px 16px',
            background: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
          }}
        >
          📜 History
        </button>
        <button
          onClick={() => setShowTestPage(true)}
          style={{
            padding: '10px 16px',
            background: '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
          }}
        >
          🧪 Test API
        </button>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        padding: '20px',
        marginBottom: '24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
      }}>
        <div style={{ borderLeft: '4px solid #3b82f6', paddingLeft: '12px' }}>
          <div style={{ color: '#6b7280', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', marginTop: '6px' }}>{syncStatus}</div>
        </div>
        <div style={{ borderLeft: '4px solid #10b981', paddingLeft: '12px' }}>
          <div style={{ color: '#6b7280', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Records loaded</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', marginTop: '6px' }}>{exportRecords.length.toLocaleString()}</div>
        </div>
        <div style={{ borderLeft: '4px solid #f59e0b', paddingLeft: '12px' }}>
          <div style={{ color: '#6b7280', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Next schedule</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', marginTop: '6px' }}>{scheduledFrequency} @ {scheduledTime}</div>
        </div>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>⏰ Schedule sync</h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#374151', fontWeight: '600' }}>
            Sync mode
            <select value={syncMode} onChange={(e) => setSyncMode(e.target.value as 'manual' | 'automatic')} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', minWidth: '150px' }}>
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </select>
          </label>

          {syncMode === 'automatic' && <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#374151', fontWeight: '600' }}>
            Frequency
            <select
              value={scheduledFrequency}
              onChange={(e) => setScheduledFrequency(e.target.value as 'hourly' | 'daily' | 'weekly' | 'monthly')}
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', minWidth: '150px' }}
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          </>}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#374151', fontWeight: '600' }}>
            Time
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', minWidth: '120px' }}
            />
          </label>

          <button
            type="button"
            onClick={() => void saveSchedule()}
            style={{
              padding: '10px 16px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '700',
            }}
           data-action="update" title="Save server schedule"><ActionIcon name="update" /><span className="aipt-action-label">Save server schedule</span></button>
        </div>
      </div>

      {/* Sync History */}
      {showHistory && (
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: '0 0 16px 0' }}>
            📜 Sync History
          </h3>
          {syncHistory.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', margin: '0' }}>No sync history yet</p>
          ) : (
            <div style={{
              overflowX: 'auto',
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
              }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#4b5563' }}>Time</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#4b5563' }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#4b5563' }}>Records</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#4b5563' }}>Inserted</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#4b5563' }}>Updated</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#4b5563' }}>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {syncHistory.map((sync) => (
                    <tr key={sync.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', color: '#4b5563' }}>{new Date(sync.started_at).toLocaleString()}</td>
                      <td style={{ padding: '12px', color: '#4b5563' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          background: sync.status === 'completed' ? '#d1fae5' : sync.status === 'failed' ? '#fee2e2' : '#fef3c7',
                          color: sync.status === 'completed' ? '#065f46' : sync.status === 'failed' ? '#7f1d1d' : '#92400e',
                        }}>
                          {sync.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#4b5563' }}>{sync.processed_rows}</td>
                      <td style={{ padding: '12px', color: '#10b981', fontWeight: '600' }}>{sync.inserted_count}</td>
                      <td style={{ padding: '12px', color: '#0ea5e9', fontWeight: '600' }}>{sync.updated_count}</td>
                      <td style={{ padding: '12px', color: sync.error_count > 0 ? '#ef4444' : '#999', fontWeight: '600' }}>
                        {sync.error_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <strong style={{ color: '#ef4444' }}>Error: </strong>
            <span style={{ color: '#4b5563' }}>{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Info Box */}
      <div style={{
        background: 'rgba(16, 185, 129, 0.1)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '8px',
        padding: '16px',
      }}>
        <p style={{ margin: '0', color: '#065f46', fontSize: '14px' }}>
          ✓ <strong>Admin Dashboard Ready.</strong> Use "Sync Now" to synchronize fees from Google Sheets. 
          Click "Test API" to verify endpoint connectivity.
        </p>
      </div>
      </div>
    </main>
  );
}
