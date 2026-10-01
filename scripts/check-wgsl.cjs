const fsm = require('fs'); const pathm = require('path');
const dir = process.argv[2];

function stripComments(s) {
  let out = '', i = 0, inStr = null;
  while (i < s.length) {
    const c = s[i], d = s[i+1];
    if (inStr) { if (c === '\\') { out += c + (s[i+1]||''); i += 2; continue; } if (c === inStr) inStr = null; out += c; i++; continue; }
    if (c === '"' || c === "'") { inStr = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < s.length && !(s[i]==='*' && s[i+1]==='/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

const rows = [];
for (const f of fsm.readdirSync(dir).filter(x => x.endsWith('.wgsl')).sort()) {
  const raw = fsm.readFileSync(pathm.join(dir, f), 'utf8');
  const code = stripComments(raw);
  const cnt = (re) => (code.match(re) || []).length;
  const brace = cnt(/\{/g) - cnt(/\}/g);
  const paren = cnt(/\(/g) - cnt(/\)/g);
  const brack = cnt(/\[/g) - cnt(/\]/g);
  const fns = cnt(/\bfn\s+[A-Za-z_]\w*\s*\(/g);
  const structs = cnt(/\bstruct\s+[A-Za-z_]\w*\s*\{/g);
  const interp = /\$\{/.test(code);
  const endsOk = /\}\s*$/.test(code.trimEnd());
  rows.push({ f, kb: +(raw.length/1024).toFixed(1), fns, structs, brace, paren, brack, interp, endsOk });
}

const bad = rows.filter(r => r.brace !== 0 || r.paren !== 0 || r.brack !== 0 || r.interp || !r.endsOk || r.fns === 0);
console.log('检查文件数 = ' + rows.length);
console.log('括号/花括号配平且结尾完整 = ' + (rows.length - bad.length) + ' 份');
console.log('有问题 = ' + bad.length + ' 份');
if (bad.length) {
  console.log('');
  bad.forEach(r => console.log('  ' + r.f.padEnd(24) + ' fn=' + r.fns + ' struct=' + r.structs +
    ' 花括号差=' + r.brace + ' 圆括号差=' + r.paren + ' 方括号差=' + r.brack +
    (r.interp ? ' [含未求值插值]' : '') + (r.endsOk ? '' : ' [结尾不完整]')));
}
console.log('');
console.log('总函数定义数 = ' + rows.reduce((s,r)=>s+r.fns,0));
console.log('总字节 = ' + (rows.reduce((s,r)=>s+r.kb,0)).toFixed(0) + ' KB');
