const fs = require('fs');
const path = require('path');
const ts = require('../frontend/node_modules/typescript');
const root = path.resolve(__dirname, '../frontend');
const iconFile = path.join(root, 'src/components/ActionIcon');
const excluded = /(?:login|register|forgot-password|change-password|verify-otp|join|invoice[\\/]|ActionIcon|OtpVerification|DashboardPreview)/i;
function list(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? list(path.join(dir,e.name)) : e.name.endsWith('.tsx') ? [path.join(dir,e.name)] : []); }
const map = {add:'add',create:'add',new:'add',edit:'edit',update:'update',save:'update',delete:'delete',remove:'delete',clear:'delete',view:'view',pdf:'pdf',import:'import',export:'export',excel:'export',word:'export',download:'download',cancel:'cancel',close:'cancel',print:'print',refresh:'refresh',approve:'approve'};
let count = 0;
for (const file of [...list(path.join(root,'app')), ...list(path.join(root,'src/components'))]) {
  if (excluded.test(file)) continue;
  let source = fs.readFileSync(file,'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    if (ts.isJsxElement(node) && ['button','a'].includes(node.openingElement.tagName.getText(tree))) {
      const opening = node.openingElement;
      if (opening.attributes.properties.some(p => p.name?.getText(tree) === 'data-action')) return;
      const start = opening.end, end = node.closingElement.getStart(tree);
      const content = source.slice(start,end);
      if (/ActionIcon/.test(content)) return;
      const labels = [];
      function getLabels(n) {
        if (ts.isJsxText(n)) labels.push(n.text.trim());
        else if(ts.isStringLiteral(n)) labels.push(n.text);
        else if(!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) ts.forEachChild(n,getLabels);
      }
      node.children.forEach(getLabels);
      const matched = labels.map(l=>l.replace(/^[^a-zA-Z]+/,'').trim()).find(l=>/^(Add|Create|New|Edit|Update|Save|Delete|Remove|Clear|View|PDF|Import|Export|Excel|Word|Download|Cancel|Close|Print|Refresh|Approve)(?:\b)/.test(l));
      const attrs = opening.attributes.getText(tree);
      let name = matched ? map[matched.split(/\s/)[0].toLowerCase()] : null;
      if(!name && /(?:aria-label|title)=["'][^"']*\b(Edit|Delete|View|PDF|Import|Export|Download)\b/i.test(attrs)) name=map[attrs.match(/(?:aria-label|title)=["'][^"']*\b(Edit|Delete|View|PDF|Import|Export|Download)\b/i)[1].toLowerCase()];
      if(!name && /^\s*✎\s*$/.test(content)) name='edit';
      if(!name && /^\s*♲\s*$/.test(content)) name='delete';
      if(!name) { ts.forEachChild(node,visit); return; }
      // Keep existing vector icon systems; their labels and handlers remain intact.
      if (/<(?:svg|\w*Icon)\b/.test(content)) { ts.forEachChild(node,visit); return; }
      let inTable=false, p=node.parent;
      while(p){ if(ts.isJsxElement(p) && p.openingElement.tagName.getText(tree)==='td') inTable=true; p=p.parent; }
      const inMenu = /popover|menu/.test(node.parent?.getText(tree).slice(0,160) ?? '');
      const iconOnly = inTable && !inMenu;
      let inner=content;
      if(node.children.length===1 && ts.isJsxText(node.children[0])) inner=matched ?? (name[0].toUpperCase()+name.slice(1));
      const title = matched || name[0].toUpperCase()+name.slice(1);
      let attributes=` data-action="${name}"${iconOnly?' data-icon-only="true"':''}`;
      if(!/\btitle=/.test(attrs)) attributes+=` title=${JSON.stringify(title)}`;
      edits.push({start:opening.end-1,end:opening.end-1,text:attributes});
      edits.push({start,end,text:`<ActionIcon name="${name}" /><span className="aipt-action-label">${inner}</span>`});
      count++;
      return;
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  if(!edits.length) continue;
  for(const e of edits.sort((a,b)=>b.start-a.start)) source=source.slice(0,e.start)+e.text+source.slice(e.end);
  let relative=path.relative(path.dirname(file),iconFile).replaceAll('\\','/');
  if(!relative.startsWith('.')) relative='./'+relative;
  const importText=`\nimport ActionIcon from '${relative}';\n`;
  const directive=source.match(/^['"]use client['"];?/);
  source=directive ? source.slice(0,directive[0].length)+importText+source.slice(directive[0].length) : importText+source;
  fs.writeFileSync(file,source);
  console.log(path.relative(root,file)+': '+edits.length/2+' actions');
}
console.log('Actions updated: '+count);
