# WebGPU / WGSL 前端逆向工具包

一套用来**分析网站上的 WebGPU 着色器**的方法 + 可直接复用的脚本。
适用场景：你在浏览器里看到一个很酷的 GPU 特效（流体、玻璃、粒子、raymarch 球体……），
想知道它是怎么算出来的，并且想在自己的项目里重现同样的数学。

> 本仓库**只包含方法论和自研脚本**，不含任何目标站点的原始代码、着色器源码或资源文件。
> 文末的案例分析只讲「怎么找到的」，不提供被分析对象的可复制产物。

---

## 0. 一句话原理

现代前端（Next.js / Vite / Turbopack 之类）会把 JS 拆成很多 `chunk`。
WebGPU 的着色器通常是**以长字符串的形式内联在 JS 里**的（因为它要 `createShaderModule`）。

所以逆向路径其实很直白：

```
下载 chunk → 找到"长得像代码"的长字符串 → 反转义 → 得到 WGSL/MSL/SkSL 原文
```

难的只有两件事：**找到 chunk 的真实地址**，以及**判断哪份实现才是真正生效的那份**。

---

## 1. 目录

| 路径 | 作用 |
| --- | --- |
| `scripts/dumpall.cjs` | 把 Turbopack 打包的 chunk 还原成一个个独立的模块文件 |
| `scripts/extract-shaders.cjs` | 从模块里扫出「着色器样」的长字符串，按类型（WGSL/MSL/SkSL）分桶导出 |
| `scripts/extract2.cjs` | 更宽松的着色器字符串提取器（适合非 Turbopack 的打包器） |
| `scripts/spec-params.cjs` | 从模块里提取效果参数定义（key / label / type / min / max / default） |
| `scripts/check-wgsl.cjs` | 静态检查一份 WGSL 的绑定与结构体（不依赖 GPU） |
| `demo/index.html` | 单文件 WebGPU 运行器：把任意 WGSL 贴进去就能跑，带实时滑杆 |
| `demo/serve.ps1` | 本地静态服务器（WebGPU 需要 http/https，不能 `file://`） |
| `demo/verify.cjs` | 校验「JS 传给 GPU 的 uniform 打包顺序」与「WGSL struct 布局」是否一致 |
| `CASE-MetalForge.md` | 一次完整的实战分析记录（只保留方法论与结论） |

---

## 2. 怎么用（按顺序）

### 第 1 步：拿到 chunk

打开开发者工具 → Network → 筛选 JS，刷新页面，把加载的 `.js` 全部存到一个目录 `chunks/` 下。
（也可以用 `demo/serve.ps1` 里的思路写个抓取脚本，或者用浏览器自带的 "Save all as HAR"。）

### 第 2 步：解包模块

```powershell
node .\scripts\dumpall.cjs "C:\path\to\your\workdir"
```

它会在 `workdir/modules/` 下生成 `m<id>.js`，以及一份 `all_index.json` 列出每个模块的大小排名。
**先看最大的那几个** —— 渲染和数学代码基本都在里面。

### 第 3 步：扫出着色器

```powershell
node .\scripts\extract-shaders.cjs "C:\path\to\your\workdir"
```

输出到 `workdir/shaders/`，文件名带类型后缀。同时会生成 `_index.json`。

> 提示：如果你的站点不是 Turbopack 打包，直接用 `extract2.cjs` 扫原始 chunk 就行。

### 第 4 步：跑起来看看

```powershell
cd demo
pwsh -File .\serve.ps1
# 浏览器打开 http://localhost:8123/index.html
```

把第 3 步拿到的 WGSL 数学段落贴进 `index.html` 里的 `<script id="shader">`，
保留 `struct Uniforms` / `@group(0) @binding(0) var<uniform>` 和效果函数本体，再调滑杆。

### 第 5 步：校验 uniform 布局（最容易踩的坑）

WGSL 有严格的对齐规则（vec3 按 16 字节对齐等），如果 JS 侧的打包索引和 struct 对不上，
画面会「能跑但颜色全错」或者效果很怪。

```powershell
node .\demo\verify.cjs "C:\path\to\your\workdir"
```

---

## 3. 判断「哪份才是真正生效的实现」

一个站点里常常同时存在多份着色器产物（比如 WGSL / MSL / SkSL / GLSL）。
**不要只凭它长得完整就下结论**，按下面的顺序排除：

1. **看是不是桩函数**：真正付费/服务端生成的那份，前端里往往只有一个空壳
   （例如 `return color;` 这种原样返回的 `lockedPreview`）。
2. **看调用点**：搜 `createShaderModule`、`ShaderLibrary.default.xxx(`、
   `content.colorEffect(`，确认哪个函数真的被渲染管线调用。
3. **做行为验证**：改一个数值，看画面变化是否与你的预测一致。
4. **交叉印证**：多份产物如果注释里互相点名（"change one, change all three"），
   基本可以确认它们是同一套数学的不同语言实现。

只有第 1、2 步都通过，才能说「这份是活的」。

---

## 4. 法律与边界（请先读）

- 本项目**只用于学习、研究和互操作性分析**。
- 不要把你分析到的第三方着色器原文、付费内容、美术资源**原样发布或商用**；
  读算法、理解思路、自己重写是安全的，直接搬运是有风险的。
- 不要尝试绕过付费墙、伪造 session、攻击导出接口。
  「技术上能不能」和「该不该做」是两件事，后者更重要。
- 如果目标站点的服务条款明确禁止逆向，请遵守它。

## 5. 环境要求

- Node.js ≥ 18（脚本只用了标准库，无第三方依赖）
- 想跑 `demo/index.html` 需要支持 WebGPU 的浏览器（Chrome 113+ / Edge 113+）

## 许可证

MIT（仅覆盖本仓库中的自研脚本与文档）