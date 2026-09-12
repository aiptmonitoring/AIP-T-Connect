'use client';
import ActionIcon from '../../../src/components/ActionIcon';


import { useCallback, useState } from 'react';

type SyncStatus = 'idle' | 'queued' | 'starting' | 'running' | 'validating' | 'reconciling' | 'publishing' | 'completed' | 'failed' | 'interrupted' | 'recovering' | 'cancelled';

interface SyncProgress {
  status: SyncStatus;
  progress: {
    overall_percent: number;
    current_sheet?: string;
    current_batch?: number;
    total_batches?: number;
    processed_rows: number;
    total_rows: number;
  };
  statistics: {
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  sheet_progress: Record<string, 'complete' | 'processing' | 'pending'>;
  current_operation?: string;
  last_activity_at?: string;
  error_message?: string;
  recent_checkpoints?: Array<{ sheet_name: string; current_batch: number; total_batches: number }>;
}

interface SyncControlsProps {
  status: SyncStatus;
  progress: SyncProgress | null;
  syncing: boolean;
  onSync: () => Promise<void>;
  onCancel: () => Promise<void>;
  onResume: () => Promise<void>;
}

const SHEET_NAMES = ['Trademark', 'Patent', 'Design', 'Copyright', 'Others', 'Classes'];

export default function SyncControls({ status, progress, syncing, onSync, onCancel, onResume }: SyncControlsProps) {
  const [loading, setLoading] = useState(false);

  const handleSync = useCallback(async () => {
    setLoading(true);
    try {
      await onSync();
    } finally {
      setLoading(false);
    }
  }, [onSync]);

  const handleCancel = useCallback(async () => {
    setLoading(true);
    try {
      await onCancel();
    } finally {
      setLoading(false);
    }
  }, [onCancel]);

  const getStatusColor = (s: SyncStatus): string => {
    const colors: Record<SyncStatus, string> = {
      idle: '#6b7280',
      queued: '#f59e0b',
      starting: '#f59e0b',
      running: '#3b82f6',
      validating: '#3b82f6',
      reconciling: '#3b82f6',
      publishing: '#3b82f6',
      completed: '#10b981',
      failed: '#ef4444',
      interrupted: '#f59e0b',
      recovering: '#f59e0b',
      cancelled: '#6b7280',
    };
    return colors[s];
  };

  const getStatusLabel = (s: SyncStatus): string => {
    const labels: Record<SyncStatus, string> = {
      idle: 'Ready',
      queued: 'Queued',
      starting: 'Starting',
      running: 'Running',
      validating: 'Validating Data',
      reconciling: 'Reconciling',
      publishing: 'Publishing',
      completed: '✓ Completed',
      failed: '✗ Failed',
      interrupted: '⚠ Interrupted',
      recovering: '↻ Recovering',
      cancelled: '⊘ Cancelled',
    };
    return labels[s];
  };

  const getStageMessage = (s: SyncStatus): string => {
    const messages: Record<SyncStatus, string> = {
      idle: 'Ready to synchronize fee data',
      queued: 'Synchronization queued on the server',
      starting: 'Starting synchronization',
      running: 'Processing imported fee records',
      validating: 'Validating imported data',
      reconciling: 'Comparing staged data with source',
      publishing: 'Publishing validated dataset',
      completed: 'Synchronization completed successfully',
      failed: 'Synchronization failed; previous published data remains active',
      interrupted: 'Synchronization interrupted; resume from the last checkpoint',
      recovering: 'Recovering synchronization from checkpoint',
      cancelled: 'Synchronization cancelled',
    };
    return messages[s];
  };

  return (
    <div className="sync-controls-container">
      {/* Header */}
      <div className="sync-header">
        <h2>🔄 Synchronization Control</h2>
        <p className="sync-subtitle">Manage Google Sheets synchronization with real-time progress tracking</p>
      </div>

      {/* Status Card */}
      <div className="status-card" style={{ borderLeftColor: getStatusColor(status) }}>
        <div className="status-content">
          <div className="status-indicator" style={{ backgroundColor: getStatusColor(status) }}></div>
          <div className="status-details">
            <span className="status-label">Current Status</span>
            <h3>{getStatusLabel(status)}</h3>
            <p className="status-operation">{progress?.current_operation || getStageMessage(status)}</p>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="sync-buttons">
          {!syncing && status === 'interrupted' ? (
            <button className="btn btn-primary sync-btn" onClick={onResume} disabled={loading}>
              {loading ? 'Starting...' : 'Resume sync'}
            </button>
          ) : !syncing ? (
            <button 
              className="btn btn-primary sync-btn"
              onClick={handleSync}
              disabled={loading}
            >
              {loading ? '⏳ Starting...' : '▶ Sync Now'}
            </button>
          ) : (
            <button 
              className="btn btn-danger sync-btn"
              onClick={handleCancel}
              disabled={loading}
             data-action="cancel" title="Cancel Sync"><ActionIcon name="cancel" /><span className="aipt-action-label">
              {loading ? '⏳ Canceling...' : '⊗ Cancel Sync'}
            </span></button>
          )}
        </div>
      </div>

      {/* Progress Section */}
      {syncing && progress && (
        <div className="progress-section">
          {/* Overall Progress */}
          <div className="progress-container">
            <div className="progress-header">
              <span>Overall Progress</span>
              <span className="progress-percent">{progress.progress.overall_percent}%</span>
            </div>
            <div className="progress-bar-wrapper">
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ 
                    width: `${progress.progress.overall_percent}%`,
                    transition: 'width 0.3s ease'
                  }}
                >
                  <span className="progress-text">
                    {progress.progress.overall_percent}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Current Operation */}
          <div className="operation-info">
            <div className="info-item">
              <label>Current Sheet</label>
              <span>{progress.progress.current_sheet || 'Initializing...'}</span>
            </div>
            {progress.progress.total_rows > 0 && (
              <div className="info-item">
                <label>Records Processed</label>
                <span>{progress.progress.processed_rows.toLocaleString()} / {progress.progress.total_rows.toLocaleString()}</span>
              </div>
            )}
            {progress.last_activity_at && (
              <div className="info-item">
                <label>Last Activity</label>
                <span>{new Date(progress.last_activity_at).toLocaleTimeString()}</span>
              </div>
            )}
            {progress.progress.current_batch && progress.progress.total_batches && (
              <div className="info-item">
                <label>Current Batch</label>
                <span>{progress.progress.current_batch} / {progress.progress.total_batches}</span>
              </div>
            )}
          </div>

          {/* Statistics Grid */}
          <div className="statistics-grid">
            <div className="stat-box primary">
              <div className="stat-icon">📊</div>
              <div className="stat-data">
                <div className="stat-value">{progress.progress.processed_rows}</div>
                <div className="stat-label">Processed</div>
                <div className="stat-total">of {progress.progress.total_rows}</div>
              </div>
            </div>

            <div className="stat-box success">
              <div className="stat-icon">✓</div>
              <div className="stat-data">
                <div className="stat-value">{progress.statistics.inserted}</div>
                <div className="stat-label">Inserted</div>
              </div>
            </div>

            <div className="stat-box info">
              <div className="stat-icon">↻</div>
              <div className="stat-data">
                <div className="stat-value">{progress.statistics.updated}</div>
                <div className="stat-label">Updated</div>
              </div>
            </div>

            <div className="stat-box warning">
              <div className="stat-icon">⊘</div>
              <div className="stat-data">
                <div className="stat-value">{progress.statistics.skipped}</div>
                <div className="stat-label">Skipped</div>
              </div>
            </div>

            <div className="stat-box danger">
              <div className="stat-icon">✕</div>
              <div className="stat-data">
                <div className="stat-value">{progress.statistics.errors}</div>
                <div className="stat-label">Errors</div>
              </div>
            </div>
          </div>

          {/* Sheet Progress */}
          <div className="sheets-progress">
            <h4>Sheet Progress</h4>
            <div className="sheets-list">
              {SHEET_NAMES.map((sheet) => {
                const sheetStatus = progress.sheet_progress[sheet] || 'pending';
                return (
                  <div 
                    key={sheet} 
                    className={`sheet-item ${sheetStatus}`}
                  >
                    <div className={`sheet-indicator ${sheetStatus}`}>
                      {sheetStatus === 'complete' && '✓'}
                      {sheetStatus === 'processing' && '●'}
                      {sheetStatus === 'pending' && '○'}
                    </div>
                    <span className="sheet-name">{sheet}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {progress.recent_checkpoints && progress.recent_checkpoints.length > 0 && (
            <div className="checkpoints-progress">
              <h4>Confirmed Checkpoints</h4>
              <div className="sheets-list">
                {progress.recent_checkpoints.slice(-6).map((checkpoint) => (
                  <div className="sheet-item complete" key={`${checkpoint.sheet_name}-${checkpoint.current_batch}`}>
                    <div className="sheet-indicator complete">✓</div>
                    <span className="sheet-name">{checkpoint.sheet_name} batch {checkpoint.current_batch}/{checkpoint.total_batches}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Display */}
          {progress.error_message && (
            <div className="error-alert">
              <span className="error-icon">⚠</span>
              <div className="error-content">
                <strong>Synchronization Error</strong>
                <p>{progress.error_message}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Idle/Complete State */}
      {!syncing && status === 'completed' && progress && (
        <div className="completion-banner">
          <div className="banner-icon">✓</div>
          <div className="banner-content">
            <h4>Synchronization Completed Successfully</h4>
            <p>
              {progress.statistics.inserted + progress.statistics.updated} records processed 
              ({progress.statistics.inserted} new, {progress.statistics.updated} updated)
            </p>
          </div>
        </div>
      )}

      {!syncing && status === 'failed' && (
        <div className="completion-banner error">
          <div className="banner-icon">✗</div>
          <div className="banner-content">
            <h4>Synchronization Failed</h4>
            <p>The previous published dataset remains active. Review the error and try again.</p>
          </div>
        </div>
      )}
    </div>
  );
}
