'use client';
import ActionIcon from '../../../src/components/ActionIcon';


import { useState } from 'react';
import { exportRecords, copyToClipboard, FeeRecord } from './export-utils';

interface ExportControlsProps {
  records: FeeRecord[];
  disabled?: boolean;
}

export default function ExportControls({ records, disabled = false }: ExportControlsProps) {
  const [exporting, setExporting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleExport = async (format: 'csv' | 'json' | 'print') => {
    setExporting(true);
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      await new Promise(resolve => setTimeout(resolve, 300)); // Simulate processing
      
      exportRecords(records, {
        format,
        filename: `fees-${format}-${timestamp}`,
      });

      setShowMenu(false);
    } finally {
      setExporting(false);
    }
  };

  const handleCopy = async () => {
    setExporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      copyToClipboard(records);
      setShowMenu(false);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-controls">
      <div className="export-menu-wrapper">
        <button
          className="btn btn-secondary export-btn"
          onClick={() => setShowMenu(!showMenu)}
          disabled={disabled || records.length === 0}
          title="Export or print fees data"
         data-action="export"><ActionIcon name="export" /><span className="aipt-action-label">
          ⬇ Export ({records.length})
        </span></button>

        {showMenu && (
          <div className="export-dropdown">
            <div className="dropdown-header">
              <h4>Export Options</h4>
              <button className="close-btn" onClick={() => setShowMenu(false)}>×</button>
            </div>

            <div className="dropdown-items">
              <button
                className="export-option"
                onClick={() => handleExport('csv')}
                disabled={exporting}
               data-action="download" title="Download as spreadsheet"><ActionIcon name="download" /><span className="aipt-action-label">
                <span className="option-icon">📄</span>
                <div className="option-content">
                  <span className="option-title">CSV File</span>
                  <span className="option-desc">Download as spreadsheet</span>
                </div>
                <span className="option-arrow">→</span>
              </span></button>

              <button
                className="export-option"
                onClick={() => handleExport('json')}
                disabled={exporting}
               data-action="download" title="Download as JSON"><ActionIcon name="download" /><span className="aipt-action-label">
                <span className="option-icon">🔗</span>
                <div className="option-content">
                  <span className="option-title">JSON File</span>
                  <span className="option-desc">Download as JSON</span>
                </div>
                <span className="option-arrow">→</span>
              </span></button>

              <button
                className="export-option"
                onClick={() => handleExport('print')}
                disabled={exporting}
               data-action="print" title="Print"><ActionIcon name="print" /><span className="aipt-action-label">
                <span className="option-icon">🖨</span>
                <div className="option-content">
                  <span className="option-title">Print</span>
                  <span className="option-desc">Open print dialog</span>
                </div>
                <span className="option-arrow">→</span>
              </span></button>

              <button
                className="export-option"
                onClick={handleCopy}
                disabled={exporting}
              >
                <span className="option-icon">📋</span>
                <div className="option-content">
                  <span className="option-title">Copy to Clipboard</span>
                  <span className="option-desc">Copy as CSV format</span>
                </div>
                <span className="option-arrow">→</span>
              </button>
            </div>

            <div className="dropdown-footer">
              <small>💡 Tip: Use CSV for Excel, JSON for APIs</small>
            </div>
          </div>
        )}
      </div>

      {exporting && (
        <div className="export-status">
          <span className="spinner"></span>
          <span>Processing...</span>
        </div>
      )}
    </div>
  );
}
