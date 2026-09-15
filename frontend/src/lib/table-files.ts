import { toPlainText } from './plain-text';
export type TableColumn = { key: string; label: string };
export type TableRow = Record<string, unknown>;
const valueText = (value: unknown) => toPlainText(value == null ? '' : String(value));
const escapeHtml = (value: unknown) => valueText(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export async function exportTable(title: string, columns: TableColumn[], rows: TableRow[], format: 'xlsx' | 'pdf') {
  if (format === 'xlsx') {
    const { Workbook } = await import('exceljs');
    const book = new Workbook();
    const sheet = book.addWorksheet(title.replace(/[\\/?*:[\]]/g, '').slice(0, 31));
    sheet.columns = columns.map((column) => ({ header: column.key, key: column.key, width: /description|name|email|subject/.test(column.key) ? 42 : 24 }));
    rows.forEach((row) => sheet.addRow(columns.map(({ key }) => typeof row[key] === 'number' ? row[key] : valueText(row[key]))));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087F98' } };
    sheet.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });
    const buffer = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a'); link.href = url; link.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.xlsx'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const frame = document.createElement('iframe');
  frame.title = title + ' PDF report';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;height:800px;border:0';
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial,sans-serif;color:#172e43}h1{font-size:23px;margin:0 0 8px}p{color:#526675}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#e8f4f7;text-align:left}th,td{padding:8px;border:1px solid #dce5eb;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}thead{display:table-header-group}tr{break-inside:avoid}h1,p{break-after:avoid}</style></head><body><h1>' + escapeHtml(title) + '</h1><p>' + rows.length + ' matching records · Generated ' + escapeHtml(new Date().toLocaleString()) + '</p><table><thead><tr>' + columns.map((column) => '<th>' + escapeHtml(column.label) + '</th>').join('') + '</tr></thead><tbody>' + (rows.length ? rows.map((row) => '<tr>' + columns.map(({ key }) => '<td>' + escapeHtml(row[key]) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + columns.length + '">No matching records.</td></tr>') + '</tbody></table></body></html>';
  await new Promise<void>((resolve, reject) => {
    frame.onload = async () => {
      try {
        const printWindow = frame.contentWindow;
        if (!printWindow) throw Error('The PDF print window could not be opened.');
        await frame.contentDocument?.fonts.ready;
        printWindow.addEventListener('afterprint', () => window.setTimeout(() => frame.remove(), 1000), { once: true });
        printWindow.focus(); printWindow.print();
        window.setTimeout(() => frame.remove(), 120000);
        resolve();
      } catch (cause) { frame.remove(); reject(cause); }
    };
    frame.srcdoc = html; document.body.appendChild(frame);
  });
}
export async function readExcelRows(file: File): Promise<Record<string, string>[]> {
  if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw Error('Choose an Excel .xlsx file up to 5 MB.');
  const { Workbook } = await import('exceljs');
  const book = new Workbook(); await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount > 501) throw Error('Use a worksheet with 1 to 500 data rows.');
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value ?? '').trim());
  if (!headers.length || headers.some((header) => !header) || new Set(headers).size !== headers.length) throw Error('Column headers must be present and unique.');
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1 || !row.hasValues) return;
    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      const cell = row.getCell(column + 1);
      if (cell.formula || cell.type === 10) throw Error('Row ' + index + ': replace formulas with their values before importing.');
      record[header] = toPlainText(cell.text).trim();
    });
    if (Object.values(record).some(Boolean)) rows.push(record);
  });
  if (!rows.length) throw Error('The worksheet has no data rows.');
  return rows;
}
