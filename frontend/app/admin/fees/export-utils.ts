/**
 * Fees Export & Print Utilities
 * Handles CSV export, JSON export, and print functionality
 */

export interface FeeRecord {
  country: string;
  region?: string;
  category: string;
  service: string;
  official_fee?: number;
  attorney_fee?: number;
  total_fee?: number;
  currency?: string;
}

export interface ExportOptions {
  filename?: string;
  format: 'csv' | 'json' | 'print';
  categories?: string[];
  includeMetadata?: boolean;
}

/**
 * Convert fee records to CSV format
 */
export function generateCSV(records: FeeRecord[], options?: Partial<ExportOptions>): string {
  const headers = ['Country', 'Region', 'Category', 'Service', 'Official Fee', 'Attorney Fee', 'Total Fee', 'Currency'];
  const rows = records.map((record) => [
    escapeCSV(record.country),
    escapeCSV(record.region || ''),
    escapeCSV(record.category),
    escapeCSV(record.service),
    record.official_fee?.toString() || '',
    record.attorney_fee?.toString() || '',
    record.total_fee?.toString() || '',
    record.currency || 'USD',
  ]);

  return [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n');
}

/**
 * Escape CSV special characters
 */
function escapeCSV(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Download CSV file
 */
export function downloadCSV(records: FeeRecord[], filename: string = 'fees-export.csv'): void {
  const csv = generateCSV(records);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download JSON file
 */
export function downloadJSON(records: FeeRecord[], filename: string = 'fees-export.json'): void {
  const data = {
    exported_at: new Date().toISOString(),
    record_count: records.length,
    records,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export records based on format
 */
export function exportRecords(records: FeeRecord[], options: ExportOptions): void {
  const timestamp = new Date().toISOString().split('T')[0];
  const defaultFilename = `fees-${options.format}-${timestamp}`;

  switch (options.format) {
    case 'csv':
      downloadCSV(records, options.filename || `${defaultFilename}.csv`);
      break;
    case 'json':
      downloadJSON(records, options.filename || `${defaultFilename}.json`);
      break;
    case 'print':
      printRecords(records);
      break;
  }
}

/**
 * Print fee records
 */
export function printRecords(records: FeeRecord[]): void {
  const printWindow = window.open('', '', 'width=1000,height=600');
  if (!printWindow) {
    alert('Please disable popup blockers to print');
    return;
  }

  const html = generatePrintHTML(records);
  printWindow.document.write(html);
  printWindow.document.close();

  setTimeout(() => {
    printWindow.print();
  }, 250);
}

/**
 * Generate HTML for printing
 */
function generatePrintHTML(records: FeeRecord[]): string {
  const styles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
      h1 { margin-bottom: 30px; font-size: 28px; color: #1f2937; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th { background-color: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #d1d5db; }
      td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) { background-color: #f9fafb; }
      .currency { text-align: right; }
      .summary { margin-top: 30px; padding: 20px; background-color: #f0fdf4; border-radius: 6px; }
      .summary h3 { margin-bottom: 10px; }
      .footer { margin-top: 30px; text-align: center; color: #6b7280; font-size: 12px; }
      @media print {
        body { padding: 0; }
        page-break-inside: avoid;
      }
    </style>
  `;

  const tableRows = records
    .map(
      (record) => `
      <tr>
        <td>${record.country}</td>
        <td>${record.region || '-'}</td>
        <td>${record.category}</td>
        <td>${record.service}</td>
        <td class="currency">${record.official_fee?.toFixed(2) || '-'}</td>
        <td class="currency">${record.attorney_fee?.toFixed(2) || '-'}</td>
        <td class="currency">${record.total_fee?.toFixed(2) || '-'}</td>
        <td>${record.currency || 'USD'}</td>
      </tr>
    `
    )
    .join('');

  const totalFees = records.reduce((sum, r) => sum + (r.total_fee || 0), 0);
  const totalRecords = records.length;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Fees Report</title>
      ${styles}
    </head>
    <body>
      <h1>📊 Fees Report</h1>
      <p>Generated on: ${new Date().toLocaleString()}</p>

      <table>
        <thead>
          <tr>
            <th>Country</th>
            <th>Region</th>
            <th>Category</th>
            <th>Service</th>
            <th class="currency">Official Fee</th>
            <th class="currency">Attorney Fee</th>
            <th class="currency">Total Fee</th>
            <th>Currency</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="summary">
        <h3>Summary</h3>
        <p><strong>Total Records:</strong> ${totalRecords.toLocaleString()}</p>
        <p><strong>Total Fees:</strong> ${totalFees.toLocaleString('en-US', { 
          style: 'currency', 
          currency: 'USD' 
        })}</p>
      </div>

      <div class="footer">
        <p>AIP&T IP Management System - Fees Report</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Copy table to clipboard
 */
export function copyToClipboard(records: FeeRecord[]): void {
  const csv = generateCSV(records);
  navigator.clipboard.writeText(csv).then(() => {
    alert('Fees data copied to clipboard');
  }).catch(() => {
    alert('Failed to copy to clipboard');
  });
}
