const fsm = require('fs'); const pathm = require('path');
const ws = process.argv[2];
const dir = pathm.join(ws, 'modules');

// 正则直接抓参数声明片段：{key:"x",label:"Y",type:"float",default:1,min:0,max:2,step:.01}
const paramRe = /\{\s*key:\s*"([A-Za-z0-9_]+)"\s*,\s*label:\s*"([^"]{1,60})"[\s\S]{0,400}?\}/g;
const effRe = /\{id:"([a-z0-9\-]+)",name:"([^"]{1,60})",category:"([a-z]+)"/g;

const byEffect = new Map();
for (const f of fsm.readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const t = fsm.readFileSync(pathm.join(dir, f), 'utf8');
  // 每个效果对象: 从 {id:"...",name:"...",category:"..." 起, 取其后的 params:[ ... ] 段
  let em;
  effRe.lastIndex = 0;
  while ((em = effRe.exec(t))) {
    const id = em[1];
    const pStart = t.indexOf('params:[', em.index);
    if (pStart < 0 || pStart - em.index > 6000) continue;
    // 取到 "]}" 结束（params 数组结束）
    let depth = 0, i = pStart + 7, end = -1;
    let inStr = null;
    while (i < t.length && i - pStart < 120000) {
      const c = t[i];
      if (inStr) { if (c === '\\') { i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
      if (c === '[' || c === '{' || c === '(') depth++;
      else if (c === ']' || c === '}' || c === ')') { depth--; if (depth < 0) { end = i; break; } }
      i++;
    }
    if (end < 0) continue;
    const seg = t.slice(pStart, end);
    if (!byEffect.has(id)) byEffect.set(id, { id, name: em[2], category: em[3], params: [], from: f });
    const rec = byEffect.get(id);
    // 只在该段内抽参数（用非全局副本避免 lastIndex 串扰）
    const re2 = new RegExp(paramRe.source, 'g');
    let pm;
    while ((pm = re2.exec(seg))) {
      const key = pm[1];
      if (rec.params.some(p => p.key === key)) continue;
      const chunk = pm[0];
      const num = k => { const m = chunk.match(new RegExp(k + ':\\s*(-?[0-9.]+)')); return m ? Number(m[1]) : undefined; };
      const ptype = (chunk.match(/type:\s*"([a-z]+)"/) || [])[1];
      const dv = (chunk.match(/default:\s*(-?[0-9.]+|"[^"]*")/) || [])[1];
      rec.params.push({ key, label: pm[2], type: ptype,
        default: dv !== undefined && /^-?[0-9.]+$/.test(dv) ? Number(dv) : (dv ? dv.replace(/"/g, '') : undefined),
        min: num('min'), max: num('max'), step: num('step') });
    }
  }
}
const list = [...byEffect.values()].filter(e => e.params.length).sort((a, b) => b.params.length - a.params.length || a.id.localeCompare(b.id));
fsm.writeFileSync(pathm.join(ws, 'effects-spec.json'), JSON.stringify(list, null, 1));
console.log('效果数 = ' + list.length + '，参数总数 = ' + list.reduce((s, e) => s + e.params.length, 0));
list.slice(0, 30).forEach(e => console.log('  ' + e.id.padEnd(20) + String(e.params.length).padStart(3) + '  ' + e.params.slice(0, 8).map(p => p.key).join(', ')));
