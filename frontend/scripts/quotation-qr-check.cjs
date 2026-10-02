const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const jsQR=require('../../tmp/qr-validation/node_modules/jsqr');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'../..'),tmp=path.join(root,'tmp/pdfs');
const poppler=path.join(root,'tmp/pdf-tools/poppler/poppler-26.09.0/Library/bin/pdftoppm.exe');
const expected='https://aiptconnect.aiptlaw.com/invoice/verify/0123456789abcdef0123456789abcdef0123456789abcdef';
for(const variant of ['reference','compact','long','design','discount-only','vat-only','neither']){
 for(const dpi of variant==='reference'?[96,150,300]:[150]){
 const pdf=path.join(variant==='design'?path.join(root,'output/pdf'):tmp,'quotation-'+variant+'-preview.pdf'),prefix=path.join(tmp,'qr-'+variant+'-'+dpi);
 execFileSync(poppler,['-f','1','-singlefile','-r',String(dpi),'-png',pdf,prefix]);
 const png=PNG.sync.read(fs.readFileSync(prefix+'.png'));
 const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
 assert.equal(decoded?.data,expected,variant+' QR at '+dpi+' dpi');
 console.log('PASS '+variant+' exported PDF QR at '+dpi+' dpi');
 }
}
