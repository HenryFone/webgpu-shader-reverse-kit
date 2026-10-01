const fsm = require('fs'); const pathm = require('path');
const ws = process.argv[2];
const dir = pathm.join(ws, 'modules');
const outDir = pathm.join(ws, 'shaders');
fsm.rmSync(outDir, { recursive: true, force: true });
fsm.mkdirSync(outDir, { recursive: true });

function unescape(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const n = s[++i];
    if (n === 'n') out += '\n';
    else if (n === 't') out += '\t';
    else if (n === 'r') out += '\r';
    else if (n === 'b') out += '\b';
    else if (n === 'f') out += '\f';
    else if (n === 'v') out += '\v';
    else if (n === '0') out += '\0';
    else if (n === 'u') { out += String.fromCharCode(parseInt(s.substr(i + 1, 4), 16)); i += 4; }
    else if (n === 'x') { out += String.fromCharCode(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else if (n === '\n') { /* line continuation */ }
    else out += n;
  }
  return out;
}

function extractStrings(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      let buf = '';
      while (i < n) {
        const ch = src[i];
        if (ch === '\\') { buf += ch + (src[i + 1] ?? ''); i += 2; continue; }
        if (ch === quote) { i++; break; }
        if (ch === '\n' || ch === '\r') { break; }
        buf += ch; i++;
      }
      out.push({ raw: buf, quote });
      continue;
    }
    if (c === '/' && /[a-zA-Z(]/.test(src[i-1] || '')) { // regex literal — skip simply
      i++; while (i < n && src[i] !== '\n') { if (src[i] === '\\') i++; if (src[i] === '/') { i++; break; } i++; }
      continue;
    }
    i++;
  }
  return out;
}

const seen = new Set();
const records = [];
let files = 0;
for (const f of fsm.readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  files++;
  const src = fsm.readFileSync(pathm.join(dir, f), 'utf8');
  for (const { raw } of extractStrings(src)) {
    if (raw.length < 400) continue;
    const code = unescape(raw);
    if (!/fn\s+\w+\s*\(/.test(code)) continue;
    const lower = code.toLowerCase();
    const kinds = [];
    if (/@fragment|@vertex|@compute/.test(code)) kinds.push('wgsl');
    if (/\[\[stitchable\]\]|constant\s+half4|metal_stdlib/.test(code)) kinds.push('msl');
    if (/sk_fragcolor|half4 main\(|half4 main \(|\[\[vk::/.test(lower)) kinds.push('sksl');
    if (/^#include|#version/.test(code)) kinds.push('glsl');
    const hash = code.length + ':' + code.slice(0, 60);
    if (seen.has(hash)) continue;
    seen.add(hash);
    records.push({ code, kinds, from: f, len: code.length });
  }
}
records.sort((a, b) => b.len - a.len);
let idx = 0;
const index = [];
for (const r of records) {
  const kind = r.kinds[0] || 'unknown';
  const firstLine = r.code.split('\n')[0].trim().slice(0, 90);
  const fn = String(idx++).padStart(3, '0') + '-' + kind + '-' + r.len + 'B.js';
  fsm.writeFileSync(pathm.join(outDir, fn), r.code);
  index.push({ file: fn, bytes: r.len, kinds: r.kinds.join('+'), from: r.from, firstLine });
}
fsm.writeFileSync(pathm.join(outDir, '_index.json'), JSON.stringify(index, null, 1));
console.log('modules scanned = ' + files + ', unique shader strings = ' + records.length);
console.log('by kind: ' + JSON.stringify(records.reduce((a, r) => { const k = r.kinds.join('+') || 'unknown'; a[k] = (a[k] || 0) + 1; return a; }, {})));
console.log('total bytes = ' + records.reduce((s, r) => s + r.len, 0));
index.slice(0, 25).forEach(r => console.log('  ' + r.file + '  ' + r.kinds + '  ' + r.firstLine));
