const fsm = require('fs');
const ws = process.argv[2];
const html = fsm.readFileSync(ws + '/demo/index.html', 'utf8');
const code = html.match(/<script id="shader"[^>]*>([\s\S]*?)<\/script>/)[1];

// 1) 解析 struct Uniforms 字段顺序
const body = code.match(/struct Uniforms \{([\s\S]*?)\};/)[1];
const fields = [...body.matchAll(/(\w+)\s*:\s*(vec2<f32>|vec3<f32>|vec4<f32>|f32)/g)]
  .map(m => ({ name: m[1], type: m[2] }));
console.log('struct 字段顺序:');
fields.forEach((f, i) => console.log('  ' + i + '  ' + f.name.padEnd(14) + f.type));
const stride = fields.reduce((s, f) => s + (f.type === 'f32' ? 4 : parseInt(f.type[3]) * 4), 0);
console.log('裸大小 = ' + stride + 'B');

// 2) 手工按 WGSL 对齐规则计算偏移
let off = 0;
const layout = [];
for (const f of fields) {
  const align = f.type === 'f32' ? 4 : parseInt(f.type[3]) * 4;
  const size = align;
  if (off % align !== 0) off += align - (off % align);
  layout.push({ ...f, offset: off, align });
  off += size;
}
let total = off;
const structAlign = Math.max(...layout.map(l => l.align));
if (total % structAlign !== 0) total += structAlign - (total % structAlign);
layout.forEach(l => console.log('  @' + String(l.offset).padStart(3) + '  ' + l.name.padEnd(14) + l.type));
console.log('实际 stride = ' + total + 'B  (JS BUF = ' + (html.match(/const BUF = (\d+)/) || [])[1] + ')');

// 3) 检查 JS 打包索引
const jsIdx = {};
for (const m of html.matchAll(/const SIZE_IDX = (\d+), TIME_IDX = (\d+), S0_IDX = (\d+), PAD0 = (\d+), PAD1 = (\d+), C_IDX = (\d+)/g)) {
  jsIdx.size = +m[1]; jsIdx.time = +m[2]; jsIdx.s0 = +m[3]; jsIdx.pad0 = +m[4]; jsIdx.pad1 = +m[5]; jsIdx.color = +m[6];
}
const expectSize = layout.find(l => l.name === 'size').offset / 4;
const expectTime = layout.find(l => l.name === 'time').offset / 4;
const expectS0 = layout.find(l => l.name === 'speed').offset / 4;
const expectColor = layout.find(l => l.type === 'vec4<f32>').offset / 4;
console.log('期望索引: size=' + expectSize + ' time=' + expectTime + ' s0=' + expectS0 + ' color0=' + expectColor);
const ok = jsIdx.size === expectSize && jsIdx.time === expectTime && jsIdx.s0 === expectS0 && jsIdx.color === expectColor
  && jsIdx.color === (layout.filter(l => l.type === 'vec4<f32>')[0].offset / 4);
console.log(ok ? 'PASS  uniform 布局与着色器一致' : 'FAIL  布局不一致');

// 4) 标量顺序核对
const scalars = (html.match(/const SCALARS = \[([^\]]+)\]/) || [])[1];
const scalarNames = scalars.split(',').map(s => s.trim().replace(/['"]/g, ''));
const structScalars = layout.filter(l => l.type === 'f32' && !['size', 'time'].includes(l.name)).map(l => l.name);
console.log('JS 标量顺序: ' + scalarNames.join(', '));
console.log('WGSL 标量顺序: ' + structScalars.join(', '));
console.log(JSON.stringify(scalarNames) === JSON.stringify(structScalars) ? 'PASS  标量顺序一致' : 'FAIL  标量顺序不一致');
const colorNames = (html.match(/const COLORS_ORDER = \[([^\]]+)\]/) || [])[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
const structColors = layout.filter(l => l.type === 'vec4<f32>').map(l => l.name);
console.log('JS 颜色顺序: ' + colorNames.join(', '));
console.log('WGSL 颜色顺序: ' + structColors.join(', '));
console.log(JSON.stringify(colorNames) === JSON.stringify(structColors) ? 'PASS  颜色顺序一致' : 'FAIL  颜色顺序不一致');

