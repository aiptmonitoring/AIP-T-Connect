type Row = Record<string, unknown>;
export const projectColumns = ['matter_date','aipt_ref_no','client_ref_no','project_name','applicant','matter_type','client_id','country_id','service_id','procedure_id','filing_number','register_number','class_number','deadline_date','renewal_date'];
function download(blob: Blob, name: string) {
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a'); link.href=url; link.download=name; link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function exportProjects(rows: Row[], format: 'csv'|'xlsx'|'docx') {
  const text=(row:Row,key:string)=>String(row[key] ?? '');
  if(format==='csv'){
    const quote=(value:string)=>'"'+(/^[=+@-]/.test(value)?"'"+value:value).replaceAll('"','""')+'"';
    download(new Blob(['\ufeff'+[projectColumns,...rows.map(row=>projectColumns.map(key=>text(row,key)))].map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'projects.csv');
  } else if(format==='xlsx'){
    const {Workbook}=await import('exceljs');
    const book=new Workbook();const sheet=book.addWorksheet('Projects');
    sheet.addRow(projectColumns);rows.forEach(row=>sheet.addRow(projectColumns.map(key=>text(row,key))));
    sheet.getRow(1).font={bold:true};sheet.columns.forEach(column=>column.width=24);
    const buffer=await book.xlsx.writeBuffer();
    download(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'projects.xlsx');
  } else {
    const {Document,Packer,Paragraph,Table,TableRow,TableCell,PageOrientation}=await import('docx');
    const columns=['aipt_ref_no','project_name','applicant','matter_date','status','approval_status'];
    const doc=new Document({sections:[{properties:{page:{size:{orientation:PageOrientation.LANDSCAPE}}},children:[
      new Paragraph({text:'Projects',heading:'Heading1'}),
      new Table({rows:[columns,...rows.map(row=>columns.map(key=>text(row,key)))].map(values=>new TableRow({children:values.map(value=>new TableCell({children:[new Paragraph(value)]}))}))})
    ]}]});
    download(await Packer.toBlob(doc),'projects.docx');
  }
}
export async function readProjects(file: File): Promise<Row[]> {
  if(file.size>5*1024*1024)throw Error('Choose an XLSX workbook smaller than 5 MB.');
  const {Workbook}=await import('exceljs');const book=new Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet=book.worksheets[0];if(!sheet)throw Error('The workbook has no worksheet.');
  const headers=(sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const required=projectColumns.slice(0,10);
  if(required.some(key=>!headers.includes(key)))throw Error('Use the exported Excel workbook columns, including date, references, applicant and client/country/service/procedure IDs.');
  const rows:Row[]=[];
  sheet.eachRow((row,index)=>{if(index===1)return;const value:Row={};headers.forEach((key,i)=>{if(projectColumns.includes(key))value[key]=row.getCell(i+1).text.trim()});rows.push(value)});
  if(!rows.length||rows.length>500)throw Error('Import between 1 and 500 projects at a time.');
  rows.forEach((row,index)=>{if(required.some(key=>!row[key]))throw Error('Row '+(index+2)+': required fields are missing.');});
  return rows;
}
