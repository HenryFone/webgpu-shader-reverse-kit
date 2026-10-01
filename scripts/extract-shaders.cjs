const fsm = require('fs'); const pathm = require('path');
const ws = process.argv[2];
const dir = pathm.join(ws, 'modules');
const outDir = pathm.join(ws, 'shaders');
fsm.mkdirSync(outDir, { recursive: true });

function unescape(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[++i];
      if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === 'r') out += '\r';
      else if (n === 'u') { out += String.fromCharCode(parseInt(s.substr(i + 1, 4), 16)); i += 4; }
      else if (n === 'x') { out += String.fromCharCode(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else out += n;
    } else out += c;
  }
  return out;
}

const buckets = new Map(); // name -> {code, kinds:Set, module}
const re = /(["'])((?:[^"'\\\n]|\\.){300,}?)\1/g;
let scanned = 0;
for (const f of fsm.readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const t = fsm.readFileSync(pathm.join(dir, f), 'utf8');
  scanned++;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(t))) {
    const raw = m[2];
    if (!/fn\s+\w+|void\s+main/.test(raw)) continue;
    const code = unescape(raw);
    const kinds = [];
    if (/@fragment|@vertex|@compute/.test(code)) kinds.push('wgsl');
    if (/\[\[stitchable\]\]|half4\s+\w+\(/.test(code)) kinds.push('msl');
    if (/sk_FragColor|half4 main\(/.test(code)) kinds.push('sksl');
    if (/@group\(0\)/.test(code)) kinds.push('wgsl-binding');
    // 命名: 取首行注释里的标识
    const first = code.split('\n').find(l => l.trim().startsWith('//') && l.trim().length > 6) || '';
    let name = (first.replace(/^\/\/\s*/, '').split(/[—\-–:.]/)[0] || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!name) name = 'unnamed';
    const key = name + '|' + code.length;
    if (!buckets.has(key)) buckets.set(key, { name, code, kinds, from: f, len: code.length });
  }
}
const list = [...buckets.values()];
list.sort((a, b) => b.len - a.len);
let i = 0;
const index = [];
for (const b of list) {
  const ext = b.kinds.includes('wgsl') ? 'wgsl' : (b.kinds.includes('msl') ? 'metal' : 'txt');
  const fn = String(i++).padStart(3, '0') + '-' + b.name.slice(0, 40) + '.' + ext;
  fsm.writeFileSync(pathm.join(outDir, fn), b.code);
  index.push({ file: fn, bytes: b.len, kinds: b.kinds.join('+'), from: b.from, firstLine: b.code.split('\n')[0].slice(0, 100) });
}
fsm.writeFileSync(pathm.join(outDir, '_index.json'), JSON.stringify(index, null, 1));
console.log('scanned modules = ' + scanned);
console.log('shader-like strings = ' + list.length + ', total bytes = ' + list.reduce((s, b) => s + b.len, 0));
console.log('top 5: ');
index.slice(0, 5).forEach(r => console.log('  ' + r.file + '  ' + r.bytes + 'B  ' + r.firstLine));
