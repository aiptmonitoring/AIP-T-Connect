import { toPlainText } from './plain-text';
import { exportTable } from './table-files';

type Row = Record<string, unknown>;
export type ProjectLookupSheet = { name: string; columns: string[]; rows: Row[] };
export const projectColumns = ['matter_date', 'aipt_ref_no', 'client_ref_no', 'project_name', 'applicant', 'matter_type', 'client_id', 'country_id', 'service_id', 'procedure_id', 'procedure_ids', 'filing_number', 'filing_date', 'register_number', 'registered_date', 'class_number', 'deadline_date', 'renewal_date', 'acceptance_number', 'acceptance_date', 'opposition_date', 'annuity_years', 'annuity_date'];
const displayColumns = ['client_name', 'country_name', 'service_name', 'procedure_names', 'status', 'approval_status'];
const requiredColumns = ['matter_date', 'aipt_ref_no', 'client_ref_no', 'project_name', 'applicant', 'matter_type', 'client_id', 'country_id', 'service_id', 'procedure_id'];
const text = (value: unknown) => toPlainText(Array.isArray(value) ? value.join('; ') : String(value ?? ''));
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportProjects(rows: Row[], format: 'csv' | 'xlsx' | 'docx' | 'pdf', lookups: ProjectLookupSheet[] = []) {
  const enriched = rows.map((row) => {
    const related = (key: string) => row[key] as Row | undefined;
    const procedures = row.procedures as { sort_order: number; procedure?: { id: string; description?: string } | null }[] | undefined;
    const ordered = [...(procedures ?? [])].sort((a, b) => a.sort_order - b.sort_order).filter((item) => item.procedure);
    return { ...row, procedure_ids: ordered.length ? ordered.map((item) => item.procedure!.id).join('; ') : row.procedure_id,
      client_name: related('client')?.company_name ?? '', country_name: related('country')?.name ?? '', service_name: related('service')?.service ?? '',
      procedure_names: ordered.length ? ordered.map((item) => item.procedure!.description).join('; ') : related('procedure')?.description ?? '' } as Row;
  });
  const columns = [...projectColumns, ...displayColumns];
  if (format === 'csv') {
    const quote = (value: string) => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
    download(new Blob(['\ufeff' + [columns, ...enriched.map((row) => columns.map((key) => text(row[key])))].map((row) => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'projects.csv');
  } else if (format === 'xlsx') {
    const { Workbook } = await import('exceljs');
    const book = new Workbook();
    const addSheet = (name: string, keys: string[], data: Row[]) => {
      const sheet = book.addWorksheet(name);
      sheet.addRow(keys); data.forEach((row) => sheet.addRow(keys.map((key) => text(row[key]))));
      sheet.columns.forEach((column) => { column.width = 26; });
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, data.length + 1), column: keys.length } };
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087F98' } };
      sheet.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });
    };
    addSheet('Projects', columns, enriched);
    lookups.forEach((lookup) => addSheet(lookup.name, lookup.columns, lookup.rows));
    const guide = book.addWorksheet('Instructions');
    [
      'Import creates new projects pending administrator approval.',
      'Use the Projects worksheet. Delete existing rows before adding new projects to a template.',
      'Required columns: ' + requiredColumns.join(', '),
      'Use IDs from the Clients, Countries, Services and Procedures sheets. Every procedure must belong to the service.',
      'Dates use YYYY-MM-DD or Excel date cells. Multiple procedure IDs are separated by semicolons.',
      'Trademark projects require class_number (1 to 50). Annuity fields apply only to patents.',
      'Name, status and approval columns are for reference only. No login accounts are created.',
      'Import supports 1 to 500 new projects in a workbook up to 5 MB. Replace formulas with values.'
    ].forEach((line) => guide.addRow([line]));
    guide.getColumn(1).width = 115; guide.eachRow((row) => { row.alignment = { wrapText: true }; row.height = 32; });
    const buffer = await book.xlsx.writeBuffer();
    download(new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'projects.xlsx');
  } else if (format === 'pdf') {
    await exportTable('Projects', [
      { key: 'aipt_ref_no', label: 'AIP&T reference' }, { key: 'project_name', label: 'Project' },
      { key: 'client_name', label: 'Client' }, { key: 'country_name', label: 'Country' },
      { key: 'service_name', label: 'Service' }, { key: 'procedure_names', label: 'Procedures' },
      { key: 'status', label: 'Status' }, { key: 'approval_status', label: 'Approval' },
      { key: 'deadline_date', label: 'Deadline' }, { key: 'renewal_date', label: 'Renewal' }
    ], enriched, 'pdf');
  } else {
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, PageOrientation } = await import('docx');
    const keys = ['aipt_ref_no', 'project_name', 'client_name', 'country_name', 'status', 'approval_status'];
    const labels = ['AIP&T reference', 'Project', 'Client', 'Country', 'Status', 'Approval'];
    const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } }, children: [
      new Paragraph({ text: 'Projects', heading: 'Heading1' }),
      new Table({ rows: [labels, ...enriched.map((row) => keys.map((key) => text(row[key])))].map((values) => new TableRow({ children: values.map((value) => new TableCell({ children: [new Paragraph(value)] })) })) })
    ] }] });
    download(await Packer.toBlob(doc), 'projects.docx');
  }
}
export async function readProjects(file: File): Promise<Row[]> {
  if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw Error('Choose an Excel .xlsx workbook up to 5 MB.');
  const { Workbook } = await import('exceljs'); const book = new Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.getWorksheet('Projects') ?? book.worksheets[0];
  if (!sheet) throw Error('The workbook has no worksheet.');
  if (sheet.rowCount > 501) throw Error('Import up to 500 projects at a time.');
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(value ?? '').trim());
  if (!headers.length || headers.some((header) => !header) || new Set(headers).size !== headers.length) throw Error('Column headers must be present and unique.');
  if (requiredColumns.some((key) => !headers.includes(key))) throw Error('Use the exported Excel workbook columns, including client, country, service and procedure IDs.');
  const rows: Row[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1 || !row.hasValues) return;
    const value: Row = {};
    headers.forEach((key, i) => {
      if (!projectColumns.includes(key)) return;
      const cell = row.getCell(i + 1);
      if (cell.formula || cell.type === 10) throw Error('Row ' + index + ': replace formulas with values.');
      value[key] = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : text(cell.text).trim();
    });
    if (!Object.values(value).some(Boolean)) return;
    if (requiredColumns.some((key) => !value[key])) throw Error('Row ' + index + ': required fields are missing.');
    if (String(value.project_name).length < 2 || String(value.project_name).length > 255) throw Error('Row ' + index + ': project name must contain 2 to 255 characters.');
    for (const key of ['aipt_ref_no', 'client_ref_no', 'filing_number', 'register_number', 'acceptance_number']) {
      if (String(value[key] ?? '').length > 120) throw Error('Row ' + index + ': ' + key + ' must contain at most 120 characters.');
    }
    if (String(value.applicant).length > 255) throw Error('Row ' + index + ': applicant must contain at most 255 characters.');
    for (const key of projectColumns.filter((column) => column.endsWith('_date'))) {
      const date = String(value[key] ?? '');
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw Error('Row ' + index + ': ' + key + ' must be a valid YYYY-MM-DD date.');
      if (!date) value[key] = null;
    }
    value.matter_type = String(value.matter_type).toLowerCase();
    if (!['trademark', 'patent', 'design', 'copyright', 'other'].includes(String(value.matter_type))) throw Error('Row ' + index + ': select a valid matter_type.');
    for (const key of ['class_number', 'annuity_years']) {
      const number = value[key] === '' || value[key] == null ? null : Number(value[key]);
      if (number !== null && (!Number.isInteger(number) || number < 1 || number > 50)) throw Error('Row ' + index + ': ' + key + ' must be a whole number from 1 to 50.');
      value[key] = number;
    }
    if (value.matter_type === 'trademark' && value.class_number === null) throw Error('Row ' + index + ': class_number is required for trademarks.');
    if (!['trademark', 'copyright'].includes(String(value.matter_type)) && value.class_number !== null) throw Error('Row ' + index + ': class_number applies only to Trademark and Copyright.');
    if (value.matter_type !== 'patent' && (value.annuity_years !== null || value.annuity_date !== null)) throw Error('Row ' + index + ': annuity fields apply only to patents.');
    value.procedure_ids = [...new Set(String(value.procedure_ids || value.procedure_id).split(/[;,]/).map((id) => id.trim()).filter(Boolean))];
    value.procedure_id = (value.procedure_ids as string[])[0];
    rows.push(value);
  });
  if (!rows.length) throw Error('The worksheet contains no projects.');
  return rows;
}
