const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const req = createRequire(path.join(root,'frontend/package.json'));
const ts = req('typescript');
const captured = { blobs: [], printed: [] };
const document = {
 createElement(kind) {
  if(kind==='a')return { click() {} };
  return {style:{},contentDocument:{fonts:{ready:Promise.resolve()}},contentWindow:{addEventListener(){},focus(){},print(){captured.printed.push(true)}},remove(){}};
 }, body:{appendChild(frame){frame.onload();}}
};
function moduleFrom(relative) {
 const filename=path.join(root,relative);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};
 const context={module,exports:module.exports,require:(name)=>name.startsWith('.')?moduleFrom(path.relative(root,path.resolve(path.dirname(filename),name+'.ts'))):req(name),Blob,Uint8Array,console,document,window:{setTimeout(){}},URL:{createObjectURL(blob){captured.blobs.push(blob);return 'blob:test'},revokeObjectURL(){}}};
 vm.runInNewContext(code,context,{filename});return module.exports;
}
(async()=>{
 const {toPlainText}=moduleFrom('frontend/src/lib/plain-text.ts');
 assert.equal(toPlainText('<p>Power &amp; authority</p><ul><li>Original POA</li><li>Copy &lt;5 pages</li></ul>'),'Power & authority\n\n• Original POA\n\n• Copy <5 pages');
 assert.equal(toPlainText('<script>alert(1)</script><style>x</style><p>Safe<br>text &#65; &#x42;</p>'),'Safe\ntext A B');
 assert.equal(toPlainText('5 < 10 and plain text'),'5 < 10 and plain text');
 const backendText=fs.readFileSync(path.join(root,'backend/supabase/functions/_shared/plain-text.ts'),'utf8');
 assert.equal(backendText,fs.readFileSync(path.join(root,'frontend/src/lib/plain-text.ts'),'utf8'));
 const {exportTable,readExcelRows}=moduleFrom('frontend/src/lib/table-files.ts');
 await exportTable('Requirements',[{key:'id',label:'ID'},{key:'description',label:'Description'}],[{id:'0001',description:'<p>Original POA</p><p>Copy</p>'}],'xlsx');
 const buffer=await captured.blobs[0].arrayBuffer();
 const rows=await readExcelRows({name:'requirements.xlsx',size:buffer.byteLength,arrayBuffer:async()=>buffer});
 assert.equal(rows[0].id,'0001');assert.equal(rows[0].description,'Original POA\nCopy');
 const {Workbook}=req('exceljs');const book=new Workbook();const sheet=book.addWorksheet('Users');sheet.addRow(['id','email']);sheet.addRow(['1',{formula:'1+1',result:2}]);const formulaBuffer=await book.xlsx.writeBuffer();
 await assert.rejects(()=>readExcelRows({name:'users.xlsx',size:formulaBuffer.length,arrayBuffer:async()=>formulaBuffer}),/formulas/);
 await exportTable('Requirements',[{key:'description',label:'Description'}],[{description:'Arabic العربية and text'}],'pdf');assert.equal(captured.printed.length,1);
 let source=fs.readFileSync(path.join(root,'backend/supabase/functions/quotations/index.ts'),'utf8').replace(/^import .*;$/gm,'');
 source += '\nexports.feePricing=feePricing;exports.allRows=allRows;';
 const context={exports:{},Deno:{serve(){},env:{get(){return ''}}},console};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 const pricing=context.exports.feePricing;
 assert.equal(pricing({official_fee:10,attorney_fee:20,total_fee:35,currency:'USD'}).total_fee,35);
 assert.equal(pricing({official_fee:10,attorney_fee:20,total_fee:null,currency:'USD'}).total_fee,30);
 for(const row of [{official_fee:null,attorney_fee:20,total_fee:20,currency:'USD'},{official_fee:10,attorney_fee:20,total_fee:29,currency:'USD'},{official_fee:10,attorney_fee:20,total_fee:30,currency:'EUR'}])assert.throws(()=>pricing(row));
 const data=Array.from({length:1205},(_,id)=>({id}));let pages=0;const paged=await context.exports.allRows(()=>({range:async(start,end)=>{pages++;return {data:data.slice(start,end+1),error:null}}}));assert.equal(paged.data.length,1205);assert.equal(pages,3);
 console.log('Management regression checks passed: plain text, Excel round trip, formula rejection, PDF report invocation, fee validation and 1,205-row pagination.');
})().catch(error=>{console.error(error);process.exitCode=1});
