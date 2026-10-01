const fsm = require('fs'); const pathm = require('path');
const ws = process.argv[2];
const dir = pathm.join(ws, 'chunks');
globalThis.TURBOPACK = [];
for (const f of fsm.readdirSync(dir)) { if (!f.endsWith('.js')) continue; try { eval(fsm.readFileSync(pathm.join(dir, f), 'utf8')); } catch (e) {} }

const mods = new Map();
for (const entry of globalThis.TURBOPACK) {
  if (!Array.isArray(entry)) continue;
  let pending = [];
  for (let i = 1; i < entry.length; i++) {
    const item = entry[i];
    if (typeof item === 'function') { for (const pid of pending) if (!mods.has(pid)) mods.set(pid, item); pending = []; }
    else if (typeof item === 'number') { pending.push(item); }
    else { pending = []; }
  }
}
console.log('module count = ' + mods.size);
const outDir = pathm.join(ws, 'modules');
fsm.rmSync(outDir, { recursive: true, force: true });
fsm.mkdirSync(outDir, { recursive: true });
const index = [];
for (const [id, fn] of mods) {
  const src = fn.toString();
  fsm.writeFileSync(pathm.join(outDir, 'm' + id + '.js'), src);
  index.push({ id: String(id), bytes: src.length });
}
index.sort((a,b)=>b.bytes-a.bytes);
fsm.writeFileSync(pathm.join(outDir, 'all_index.json'), JSON.stringify(index, null, 1));
console.log('modules: ' + index.slice(0,16).map(r=>r.id+':'+r.bytes).join(' '));
