'use client';
import { useRef, useState } from 'react';
import ActionIcon from './ActionIcon';
import { exportTable, readExcelRows, type TableColumn, type TableRow } from '../lib/table-files';
type Props = { title: string; columns: TableColumn[]; getRows: () => Promise<TableRow[]>; onImport?: (rows: Record<string, string>[]) => Promise<void>; validateImport?: (rows: Record<string, string>[]) => Promise<void>; disabled?: boolean };
export default function DataTransfer({ title, columns, getRows, onImport, validateImport, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const exportRows = async (format: 'xlsx' | 'pdf') => {
    setBusy(true); setError(''); setMessage('');
    try { const rows = await getRows(); await exportTable(title, columns, rows, format); setMessage(format === 'xlsx' ? rows.length + ' records exported to Excel.' : 'Report opened. Choose Save as PDF in the print dialog.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed.'); }
    finally { setBusy(false); }
  };
  const inspectImport = async (file: File) => {
    setBusy(true); setError(''); setMessage('');
    try { const rows = await readExcelRows(file); await validateImport?.(rows); setPreview(rows); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to read workbook.'); }
    finally { setBusy(false); }
  };
  const applyImport = async () => {
    if (!preview || !onImport || busy) return;
    setBusy(true); setError('');
    try { await validateImport?.(preview); await onImport(preview); setMessage(preview.length + ' rows imported successfully.'); setPreview(null); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Import failed.'); }
    finally { setBusy(false); }
  };
  return <div className="data-transfer">
    <div className="data-actions">
      {onImport && <><input ref={input} hidden type="file" accept=".xlsx" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void inspectImport(file); }} /><button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}><ActionIcon name="import" />Import Excel</button></>}
      <button type="button" disabled={disabled || busy} onClick={() => void exportRows('xlsx')}><ActionIcon name="export" />Excel</button>
      <button type="button" disabled={disabled || busy} onClick={() => void exportRows('pdf')}><ActionIcon name="pdf" />PDF / Print</button>
    </div>
    {message && <p className="data-message" role="status">{message}</p>}{error && <p className="data-error" role="alert">{error}</p>}
    {preview && <div className="country-modal-backdrop"><section className="country-modal import-preview" role="dialog" aria-modal="true" aria-labelledby="import-preview-title"><h2 id="import-preview-title">Review {title} import</h2><p>{preview.length} validated rows. Showing the first 8. No changes have been saved.</p><div className="country-table-wrap"><table><thead><tr>{Object.keys(preview[0]).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{preview.slice(0, 8).map((row, index) => <tr key={index}>{Object.entries(row).map(([key, value]) => <td key={key}>{value}</td>)}</tr>)}</tbody></table></div><div className="data-actions"><button type="button" disabled={busy} onClick={() => setPreview(null)}>Cancel</button><button type="button" disabled={busy} onClick={() => void applyImport()}>{busy ? 'Importing…' : 'Confirm import'}</button></div></section></div>}
  </div>;
}
