# AIGaokao 实现计划(Implementation Plan)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按 SPEC 实现 AIGaokao — 高考数学题库 + AI 知识图谱 + 智能出题的 Electron 桌面应用。

**Architecture:** Electron main 进程独占 SQLite/文件系统/ZenMux 访问,renderer(React)只经 preload IPC 通信;AI 流水线(图谱提炼、出题、双解法验证)全部在 main,LLM 输出一律 zod 校验。所有可测逻辑写成不依赖 electron/better-sqlite3 的纯函数或依赖注入模块。

**Tech Stack:** Electron ^33 + electron-vite ^2 + Vite ^5 + React 18 + TypeScript strict + better-sqlite3 + markdown-it + KaTeX + cytoscape + zod + vitest。

**权威规格:** `docs/plans/2026-09-07-aigaokao-electron-spec.md`(下称 SPEC)。本计划与 SPEC 冲突时以本计划为准(本计划已包含对 SPEC 的两处修正,见任务 1)。

---

## 执行者必读规则

1. **严格按任务顺序执行,一次一个任务。** 每个任务结束时:`npm run typecheck` 零错误、`npm run test` 全绿、按步骤 commit。任一失败,禁止进入下一任务。
2. **SPEC §0.1 禁止事项全程有效。** 开工前先完整读一遍 SPEC。
3. **测试文件禁止 import `electron` 或 `better-sqlite3`**(前者在 node 下不可用,后者 ABI 已 rebuild 为 electron 版)。所有需要测试的逻辑都已设计成纯函数或注入依赖,照计划放置即可。
4. 同一任务连续 3 次尝试仍无法让测试/typecheck 通过:停止,写下卡住的现象与已尝试的方案,报告用户,禁止自行绕过(如删测试、any 断言、注释掉代码)。
5. 计划中给出完整代码的文件:**原样使用**。给出骨架/描述的文件:按 SPEC 对应章节实现,不加计划外功能。
6. 手动验收步骤(标 🖐)需启动 `npm run dev` 逐条核对;无法自动化,不可跳过。

---

## Milestone M0 — 脚手架

### Task 1: 项目骨架与配置

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `.gitignore`
- Create: `src/main/index.ts`, `src/preload/index.ts`
- Create: `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/app.css`

**对 SPEC 的两处修正(已裁定,照此执行):**
1. SPEC §2 "vite ^6" 修正为 **vite ^5**(electron-vite ^2 只兼容 vite 4/5)。
2. SPEC §3 顶层结构追加允许:`*.test.ts` 测试文件放在被测文件同目录;新增 devDependencies `vitest`、`@electron/rebuild` 与各 `@types/*`(SPEC §0.1 只锁运行时依赖)。

**Step 1: 写入 `package.json`(原样)**

```json
{
  "name": "aigaokao",
  "version": "0.1.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "cytoscape": "^3.30.0",
    "extract-zip": "^2.0.1",
    "katex": "^0.16.11",
    "markdown-it": "^14.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "@types/better-sqlite3": "^7.6.11",
    "@types/cytoscape": "^3.21.0",
    "@types/katex": "^0.16.7",
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.1"
  }
}
```

**Step 2: 写入 `electron.vite.config.ts`(原样)**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()] }
})
```

**Step 3: 写入 `tsconfig.json`(原样)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

`.gitignore` 内容:`node_modules/`、`out/`、`dist/`。

**Step 4: 写入最小 main/preload/renderer**

`src/main/index.ts`(原样):

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'AIGaokao',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts` 暂时只写 `export {}`。
`src/renderer/index.html`:标准 HTML,`<div id="root">`,`<script type="module" src="/src/main.tsx">`。
`src/renderer/src/main.tsx`:ReactDOM.createRoot 挂载 `<App/>`,import `./app.css`。
`src/renderer/src/App.tsx`:左侧固定宽 200px 导航栏,7 个按钮(数据中心/题库/PDF 阅卷/知识图谱/AI 出题/待确认/设置),`useState` 切换右侧显示对应占位 `<div>页面名</div>`。样式写在 `app.css`,不引入任何 UI 库。

**Step 5: 安装并验证**

Run: `npm install`
Expected: 成功;postinstall 对 better-sqlite3 完成 electron ABI rebuild(输出含 "Rebuild Complete" 或无报错)。若 rebuild 失败,先确认已安装 Xcode Command Line Tools(`xcode-select --install`)。

Run: `npm run typecheck` → 零错误。

🖐 Run: `npm run dev` → 出现标题 AIGaokao 的窗口,7 个导航可切换,Console 无红色报错(M0 验收)。

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: M0 脚手架 — electron-vite + React + TS 严格模式,七模块导航壳"
```

---

## Milestone M1 — 设置页

### Task 2: 共享类型 + 数据库层

**Files:**
- Create: `src/shared/types.ts` — **SPEC §5 代码块原样复制**(`Api`、`QuestionRow`、`SolutionRow`、`ProgressPayload`)。
- Create: `src/main/db.ts`
- Create: `src/main/db.test.ts` 不建 —— db.ts 依赖 better-sqlite3,禁止单测(规则 3),由 M1 手动验收覆盖。

**Step 1: 写入 `src/main/db.ts`(原样;`DDL` 字符串为 SPEC §4 全部 SQL 原文,含默认模型 INSERT)**

```ts
import Database from 'better-sqlite3'

const DDL = `/* ← 此处粘贴 SPEC §4 代码块的全部 SQL,一字不改 */`

let db: Database.Database | null = null

export function openDb(dbPath: string): Database.Database {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(DDL)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('db 未初始化')
  return db
}
```

**Step 2: 在 `src/main/index.ts` 的 `app.whenReady()` 里,createWindow 之前调用:**

```ts
openDb(join(app.getPath('userData'), 'aigaokao.db'))
```

**Step 3:** `npm run typecheck` 零错误。🖐 `npm run dev` 启动后,终端执行 `sqlite3 ~/Library/Application\ Support/aigaokao/aigaokao.db ".tables"` 应列出 SPEC §4 的 8 张表,`SELECT * FROM models;` 有 3 个默认模型。

**Step 4: Commit** — `git add -A && git commit -m "feat: 共享类型 + SQLite 建库建表与默认模型"`

### Task 3: API-KEY 掩码纯函数(TDD 示范)

**Files:**
- Create: `src/shared/mask.ts`
- Create: `src/shared/mask.test.ts`

**Step 1: 写失败测试 `src/shared/mask.test.ts`(原样)**

```ts
import { describe, it, expect } from 'vitest'
import { maskKey } from './mask'

describe('maskKey', () => {
  it('长 key 显示前3后4', () => {
    expect(maskKey('zm-1234567890abcd')).toBe('zm-****abcd')
  })
  it('短 key(≤7)只留首字符', () => {
    expect(maskKey('abc')).toBe('a****')
  })
})
```

**Step 2:** Run: `npm run test` → Expected: FAIL(模块不存在)。

**Step 3: 写实现 `src/shared/mask.ts`(原样)**

```ts
export function maskKey(key: string): string {
  if (key.length <= 7) return key.slice(0, 1) + '****'
  return key.slice(0, 3) + '****' + key.slice(-4)
}
```

**Step 4:** Run: `npm run test` → Expected: PASS。

**Step 5: Commit** — `git commit -am "feat: API-KEY 掩码函数(TDD)"`

### Task 4: safeStorage 封装 + 设置类 IPC + preload 桥

**Files:**
- Create: `src/main/secure.ts` — `encryptKey/decryptKey` 用 electron `safeStorage`(encryptString→base64 / base64→decryptString);`safeStorage.isEncryptionAvailable()` 为 false 时抛中文错误。
- Create: `src/main/ipc.ts` — 注册 SPEC §5 设置类通道:`settingsGetMasked`、`settingsSetApiKey`、`settingsClearApiKey`、`settingsSetRole`、`modelsAdd`、`modelsRemove`。读写 `settings`/`models` 表;`settingsGetMasked` 返回掩码用 `maskKey`,**绝不返回明文**;`modelsRemove` 前查三个 role 设置,被占用抛 `Error('该模型正被角色占用,请先改指派')`;role 默认值按 SPEC §7.6。
- Modify: `src/preload/index.ts` — `contextBridge.exposeInMainWorld('api', {...})`,把上述方法逐一映射 `ipcRenderer.invoke('<方法名>', ...args)`;并实现 `on(channel, cb)`:`ipcRenderer.on` 包装,返回取消订阅函数。同时声明:

```ts
declare global { interface Window { api: import('../shared/types').Api } }
```

(preload 可先只实现设置类方法,其余方法随后续任务逐个补齐;`Api` 接口用 `Partial` 不允许 —— 未实现的方法先写 `async () => { throw new Error('未实现') }` 占位,保持类型完整。)
- Modify: `src/main/index.ts` — whenReady 中调用 `registerIpc()`。

**Step 1** 实现上述文件。**Step 2** `npm run typecheck` + `npm run test` 通过。**Step 3: Commit** — `"feat: 设置 IPC(KEY 加密存取/角色/模型管理)+ preload 桥"`

### Task 5: ZenMux 客户端(TDD)

**Files:**
- Create: `src/main/zenmux.ts`
- Create: `src/main/zenmux.test.ts`

**Step 1: 写失败测试(原样)**

```ts
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { stripFence, chatJSON, type ChatDeps } from './zenmux'

const okResponse = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

const deps = (fetchFn: typeof fetch): ChatDeps => ({ fetchFn, getApiKey: () => 'k' })

describe('stripFence', () => {
  it('剥离 ```json 围栏', () => {
    expect(stripFence('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('无围栏原样返回', () => {
    expect(stripFence(' {"a":1} ')).toBe('{"a":1}')
  })
})

describe('chatJSON', () => {
  const schema = z.object({ a: z.number() })

  it('合法 JSON 一次通过', async () => {
    const f = vi.fn(async () => okResponse('{"a":1}'))
    const r = await chatJSON(deps(f as never), 'm', 'sys', 'usr', schema)
    expect(r).toEqual({ a: 1 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('非法 JSON 重试 2 次,重试时追加提醒', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(okResponse('oops'))
      .mockResolvedValueOnce(okResponse('still bad'))
      .mockResolvedValueOnce(okResponse('{"a":2}'))
    const r = await chatJSON(deps(f as never), 'm', 'sys', 'usr', schema)
    expect(r).toEqual({ a: 2 })
    expect(f).toHaveBeenCalledTimes(3)
    const lastBody = JSON.parse((f.mock.calls[2] as never[])[1]!['body'])
    expect(lastBody.messages[1].content).toContain('不是合法 JSON')
  })

  it('3 次全失败抛错', async () => {
    const f = vi.fn(async () => okResponse('bad'))
    await expect(chatJSON(deps(f as never), 'm', 's', 'u', schema)).rejects.toThrow()
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('401 抛出 KEY 无效提示', async () => {
    const f = vi.fn(async () => new Response('x', { status: 401 }))
    await expect(chatJSON(deps(f as never), 'm', 's', 'u', schema)).rejects.toThrow('API-KEY 无效')
  })
})
```

**Step 2:** `npm run test` → FAIL。

**Step 3: 实现 `src/main/zenmux.ts`**(按 SPEC §6:BASE 常量、构造 messages、`temperature` 参数默认 0.2、`AbortSignal.timeout(300_000)`、401/403 → `API-KEY 无效,请到设置页检查`、429 → 等 5s 重试 1 次、其余非 2xx → 状态码+响应体前 200 字;`chatJSON` 循环最多 3 轮:stripFence → JSON.parse → schema.parse,失败在 user 内容后追加 `\n\n你上次的输出不是合法 JSON,请只输出 JSON`。导出 `stripFence`、`ChatDeps`、`chatJSON`,以及给生产用的 `makeDeps()`:内部从 secure.ts 解密 KEY、fetchFn = 全局 fetch)。

**Step 4:** `npm run test` → PASS。`npm run typecheck` 零错误。

**Step 5: Commit** — `"feat: ZenMux chatJSON 客户端(围栏剥离/重试/错误映射,TDD)"`

### Task 6: 设置页 UI + 连接测试

**Files:**
- Modify: `src/main/ipc.ts` — 增加 `zenmuxTest`:用 `role_solver` 模型发 user 内容 `1+1=?`(不走 chatJSON,直接取文本),成功返回 `{ok:true, message:回复前50字}`,失败 `{ok:false, message:err.message}`。
- Create: `src/renderer/src/pages/Settings.tsx` — 按 SPEC §7.6 实现:KEY 密码输入+保存/掩码显示+清除;无 KEY 时引导文案与邀请链接按钮(新增 IPC?否 —— 链接用 `<a>` 不行,SPEC 要求 shell.openExternal:在 ipc.ts 加通道 `openInvite(): Promise<void>`,同时把它补进 `src/shared/types.ts` 的 `Api` 与 preload);模型增删列表;三个角色下拉;"测试连接"按钮三态(加载中/成功✓/失败原因)。
- Modify: `src/renderer/src/App.tsx` — 设置导航接入真实页面。

**Step 1** 实现。**Step 2** typecheck+test 通过。

**Step 3: 🖐 M1 手动验收(SPEC §9 M1 全部 4 条)**:无 KEY 引导+邀请链接、保存后掩码+重启仍在+db 文件搜不到明文、真实 KEY 测试连接 ✓ / 错误 KEY 提示、模型增删与占用报错。

**Step 4: Commit** — `"feat: M1 设置页(KEY/模型/角色/连接测试)"`

---

## Milestone M2 — 数据下载与导入

### Task 7: 下载工具纯函数(TDD)

**Files:**
- Create: `src/main/pure/download-helpers.ts` + `download-helpers.test.ts`

**Step 1: 失败测试(原样)**

```ts
import { describe, it, expect } from 'vitest'
import { shouldSkipFile, safeJoin } from './download-helpers'

describe('shouldSkipFile', () => {
  it('已存在且大小一致 → 跳过', () => {
    expect(shouldSkipFile({ exists: true, localSize: 100, remoteSize: 100 })).toBe(true)
  })
  it('大小不一致 → 不跳过', () => {
    expect(shouldSkipFile({ exists: true, localSize: 50, remoteSize: 100 })).toBe(false)
  })
  it('不存在 → 不跳过', () => {
    expect(shouldSkipFile({ exists: false, localSize: 0, remoteSize: 100 })).toBe(false)
  })
})

describe('safeJoin(路径穿越防护)', () => {
  it('正常子路径', () => {
    expect(safeJoin('/root/pdfs', '2023/a.pdf')).toBe('/root/pdfs/2023/a.pdf')
  })
  it('../ 穿越 → 抛错', () => {
    expect(() => safeJoin('/root/pdfs', '../secret')).toThrow()
  })
})
```

**Step 2:** test → FAIL。**Step 3: 实现**:`safeJoin` 用 `path.resolve(root, rel)`,结果必须 `startsWith(path.resolve(root) + path.sep)`,否则 throw。**Step 4:** test → PASS。**Step 5: Commit** — `"feat: 下载跳过判定与路径穿越防护(TDD)"`

### Task 8: 下载器 + 数据中心页

**Files:**
- Create: `src/main/downloader.ts` — 按 SPEC §7.1 实现:
  - `downloadStructured(win)`:fetch codeload zip(30min 超时、失败重试 3 次间隔 5s)→ 存临时文件 → extract-zip 到 `userData/data/structured/` → 调 importer(Task 9,本任务先留 `TODO` 调用点)→ 全程 `win.webContents.send('progress', ...)`。
  - `listPdfDirs()` / `downloadPdfDir(win, dirPath)`:GitHub contents API(`User-Agent: AIGaokao` 头),逐文件 `shouldSkipFile`+`safeJoin`,失败重试 3 次,单文件最终失败记日志继续,末尾汇总;403 → 抛 `GitHub 接口限流,请约 1 小时后重试`。
  - 模块级 `cancelled` 标志供 `dataCancel` 置位,循环中检查。
- Modify: `src/main/ipc.ts` + `src/preload/index.ts` — 接入 `dataStatus/dataDownloadStructured/dataListPdfDirs/dataDownloadPdfDir/dataCancel`。
- Create: `src/renderer/src/pages/Data.tsx` — 结构化题库卡片(状态/下载按钮/进度条)、PDF 目录列表(获取/勾选/下载/取消/进度)、错误三态。

**Step 1** 实现。**Step 2** typecheck+test。**Step 3: Commit** — `"feat: 数据下载器与数据中心页"`(手动验收合并到 Task 9 之后)。

### Task 9: 结构化导入(TDD 核心映射)

**Files:**
- Create: `src/main/pure/map-record.ts` + `map-record.test.ts`
- Create: `src/main/importer.ts`

**Step 1: 失败测试(原样)**

```ts
import { describe, it, expect } from 'vitest'
import { mapRecord, dedupKey } from './map-record'

describe('mapRecord', () => {
  it('常见英文字段', () => {
    const r = mapRecord({ question: '求 $x^2=4$ 的解', answer: 'x=±2', analysis: '开方', year: 2023 })
    expect(r).toMatchObject({ stem: '求 $x^2=4$ 的解', answer: 'x=±2', qtype: 'answer', year: 2023 })
  })
  it('中文字段 + 选项数组 → choice', () => {
    const r = mapRecord({ 题目: '下列正确的是', 选项: ['A. 甲', 'B. 乙'], 答案: 'A' })
    expect(r).toMatchObject({ qtype: 'choice', options: ['A. 甲', 'B. 乙'], answer: 'A' })
  })
  it('取不到题干 → null', () => {
    expect(mapRecord({ foo: 1 })).toBeNull()
  })
})

describe('dedupKey', () => {
  it('去空白取前80字符', () => {
    expect(dedupKey('a b\nc')).toBe('abc')
    expect(dedupKey('x'.repeat(200))).toHaveLength(80)
  })
})
```

**Step 2:** FAIL。

**Step 3: 实现 `map-record.ts`**:字段候选名逐个尝试 —— stem: `question/stem/题目/content/text`;answer: `answer/答案/ans`;analysis: `analysis/解析/explanation`;options: `options/choices/选项`(须为数组);year: `year/年份`(Number 转换,失败为 null);province: `province/地区/省份/卷种/category`。qtype:有 options 数组且长度≥2 → `choice`,否则 `answer`。返回 `QuestionInsert | null`(结构见 SPEC §7.2),`raw` 字段存 `JSON.stringify(原记录)`。

**Step 4:** PASS。

**Step 5: 实现 `importer.ts`**(按 SPEC §7.2):递归扫描 structured 目录、路径含 `math`/`数学` 的 `.json/.jsonl`;jsonl 按行 parse,json 兼容 顶层数组/顶层对象含数组字段;每条 `mapRecord`,null 计跳过;`dedupKey` 与库内既有(启动时把库内全部 imported 题的 dedupKey 载入 Set)比对去重;每 500 条一个事务;结束返回 `{ok, skipped, failedFiles}` 给 UI。把 Task 8 的 TODO 调用点接上。

**Step 6:** typecheck+test 全绿。

**Step 7: 🖐 M2 手动验收(SPEC §9 M2 全部 4 条)**:下载→导入汇总→题库计数(题库页未建,可临时用 `sqlite3` 查 count>1000);重复下载不翻倍;PDF 目录下载/取消/续传 skip;断网报错不崩溃。

**Step 8: Commit** — `"feat: M2 结构化导入(宽容映射+去重,TDD)与下载验收"`

---

## Milestone M3 — 题库 / 渲染 / PDF

### Task 10: Markdown+LaTeX 渲染(TDD)

**Files:**
- Create: `src/renderer/src/lib/md.ts` + `md.test.ts`
- Create: `src/renderer/src/components/MarkdownLatex.tsx`

**Step 1: 失败测试(原样)**

```ts
import { describe, it, expect } from 'vitest'
import { renderMarkdownLatex } from './md'

describe('renderMarkdownLatex', () => {
  it('行内公式渲染为 katex span', () => {
    expect(renderMarkdownLatex('设 $x^2$ 为')).toContain('katex')
  })
  it('块级公式 $$...$$', () => {
    expect(renderMarkdownLatex('$$\\frac{1}{2}$$')).toContain('katex')
  })
  it('非法 LaTeX 不抛异常且保留原文', () => {
    const html = renderMarkdownLatex('bad $\\frac{$ end')
    expect(html).toContain('\\frac')
  })
  it('普通 Markdown 正常', () => {
    expect(renderMarkdownLatex('**粗体**')).toContain('<strong>')
  })
})
```

**Step 2:** FAIL。

**Step 3: 实现 `md.ts`**:先按正则 `/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g` 把公式片段替换为占位符并用 `katex.renderToString(tex, { throwOnError: false, displayMode })` 预渲染(renderToString 自身抛异常时 catch,占位为 `<code>原文</code>`);再交 markdown-it(`html:false`)渲染;最后回填占位符。导出纯函数 `renderMarkdownLatex(src: string): string`。

**Step 4:** PASS。

**Step 5:** `MarkdownLatex.tsx`:`<div className="md" dangerouslySetInnerHTML={{__html: renderMarkdownLatex(props.text)}}/>`;在 `main.tsx` 顶部 `import 'katex/dist/katex.min.css'`。

**Step 6: Commit** — `"feat: Markdown+KaTeX 渲染组件(非法 LaTeX 降级,TDD)"`

### Task 11: 题库查询 SQL 构造(TDD)+ 题库 IPC

**Files:**
- Create: `src/main/pure/query-builder.ts` + `query-builder.test.ts`
- Modify: `src/main/ipc.ts` — `questionsQuery/questionsGet/questionsDelete/questionsExport`

**Step 1: 失败测试(原样)**

```ts
import { describe, it, expect } from 'vitest'
import { buildQuestionsQuery } from './query-builder'

describe('buildQuestionsQuery', () => {
  it('无条件:只排除已删,带分页', () => {
    const { where, params } = buildQuestionsQuery({ page: 1, pageSize: 20 })
    expect(where).toBe('deleted = 0')
    expect(params).toEqual([])
  })
  it('组合条件', () => {
    const { where, params } = buildQuestionsQuery({
      keyword: '函数', year: 2023, qtype: 'choice', source: 'imported', page: 2, pageSize: 20
    })
    expect(where).toBe("deleted = 0 AND stem LIKE ? AND year = ? AND qtype = ? AND source = ?")
    expect(params).toEqual(['%函数%', 2023, 'choice', 'imported'])
  })
  it('知识点过滤生成子查询', () => {
    const { where, params } = buildQuestionsQuery({ kpIds: [3, 5], page: 1, pageSize: 20 })
    expect(where).toContain('IN (SELECT question_id FROM question_kp WHERE kp_id IN (?,?))')
    expect(params).toEqual([3, 5])
  })
})
```

**Step 2:** FAIL。**Step 3:** 实现 `buildQuestionsQuery(q): { where: string; params: unknown[]; offset: number }`(province 同 year 方式追加)。**Step 4:** PASS。

**Step 5: ipc.ts 接入**(SPEC §5/§7.3):query 用 `SELECT COUNT(*)` + 分页 SELECT,行转 `QuestionRow`(options_json parse);get 联查 solutions 与 kps;delete:imported → `UPDATE deleted=1`,generated → 事务内先删 `solutions`、`question_kp` 再删 `questions`;export 用 `dialog.showSaveDialog`,JSON = `QuestionRow[]`,Markdown = 每题 `## 题 N` + 题干/选项/答案/解析/已有解法,LaTeX 原文。preload 补齐。

**Step 6:** typecheck+test。**Step 7: Commit** — `"feat: 题库查询/删除/导出 IPC(查询构造 TDD)"`

### Task 12: 题库页 UI

**Files:**
- Create: `src/renderer/src/pages/Bank.tsx`(筛选栏+分页列表+多选+批量删除确认框+导出按钮)
- Create: `src/renderer/src/pages/QuestionDetail.tsx`(渲染题干/选项/答案/解析,均走 `MarkdownLatex`;imported 显示 "AI 详解" 按钮 —— 本任务先禁用置灰,Task 17 启用;已有 solutions 展示方法A/B/更快解法/验证结论)

按 SPEC §7.3 行为实现;删除确认文案区分软删/永久。

**Step 1** 实现。**Step 2** typecheck+test。**Step 3: Commit** — `"feat: 题库浏览与详情页"`

### Task 13: PDF 阅卷器

**Files:**
- Modify: `src/main/index.ts` — `app.whenReady` 前 `protocol.registerSchemesAsPrivileged([{ scheme: 'app-pdf', privileges: { standard: true, stream: true } }])`;ready 后 `protocol.handle('app-pdf', ...)`:URL 路径经 `safeJoin(pdfsRoot, rel)` 解析,返回 `net.fetch(pathToFileURL(abs).toString())`;任何越界/不存在返回 404 Response。
- Modify: `src/main/ipc.ts` — `pdfList`:扫描 `userData/data/pdfs/` 两层目录。
- Create: `src/renderer/src/pages/Pdf.tsx` — 左目录右文件;点击文件 `<iframe src={url}>`;iframe `onError` 或 5s 未加载出内容时显示"在系统中打开"按钮(新增 IPC `pdfOpenExternal(rel: string)` → `shell.openPath`,补进 types.ts 与 preload)。

**Step 1** 实现。**Step 2** typecheck+test。

**Step 3: 🖐 M3 手动验收(SPEC §9 M3 全部 5 条)**:筛选/翻页、公式渲染与非法 LaTeX 降级、批量删除+查库确认软删、导出 MD/JSON 可用、PDF 内嵌查看与系统打开。

**Step 4: Commit** — `"feat: M3 PDF 阅卷器(app-pdf 只读协议+降级打开)"`

---

## Milestone M4 — 知识图谱

### Task 14: 图谱构建流水线(TDD,依赖注入)

**Files:**
- Create: `src/main/pure/kg-core.ts` + `kg-core.test.ts`
- Create: `src/main/kg.ts`

**Step 1: 失败测试(原样)**

```ts
import { describe, it, expect } from 'vitest'
import { KgSchema, applyKgResult, normalizeEdge, type KgRepo } from './kg-core'

function fakeRepo(): KgRepo & { kps: Map<string, number>; links: string[]; edges: string[] } {
  const kps = new Map<string, number>()
  const links: string[] = []
  const edges: string[] = []
  let nextId = 1
  return {
    kps, links, edges,
    upsertKp(name, level, parentId) {
      if (!kps.has(name)) kps.set(name, nextId++)
      return kps.get(name)!
    },
    linkQuestionKp(qid, kpId) { links.push(`${qid}-${kpId}`) },
    addEdge(a, b) { edges.push(`${a}-${b}`) }
  }
}

describe('KgSchema', () => {
  it('拒绝缺字段的输出', () => {
    expect(KgSchema.safeParse({ items: [{}] }).success).toBe(false)
  })
})

describe('normalizeEdge', () => {
  it('保证 a<b', () => { expect(normalizeEdge(5, 3)).toEqual([3, 5]) })
  it('自环返回 null', () => { expect(normalizeEdge(4, 4)).toBeNull() })
})

describe('applyKgResult', () => {
  it('同名知识点归并、层级父子、题目关联、边规范化', () => {
    const repo = fakeRepo()
    applyKgResult(repo, {
      items: [
        { question_id: 1, chapter: '函数', topic: '二次函数', points: ['判别式', '顶点式'] },
        { question_id: 2, chapter: '函数', topic: '二次函数', points: ['判别式'] }
      ],
      edges: [['判别式', '顶点式'], ['顶点式', '判别式']]
    })
    expect(repo.kps.size).toBe(4) // 函数/二次函数/判别式/顶点式,无重复
    expect(repo.links).toContain('2-' + repo.kps.get('判别式'))
    expect(repo.edges).toHaveLength(1) // 双向去重
  })
})
```

**Step 2:** FAIL。

**Step 3: 实现 `kg-core.ts`**:
- `KgSchema` = zod 对应 SPEC §8.1 输出结构(items: question_id number / chapter string / topic string / points string[] 非空;edges: [string,string][],可为空数组)。
- `normalizeEdge(a,b)`:a===b → null,否则 `[min,max]`。
- `KgRepo` 接口 `{ upsertKp(name, level, parentId): number; linkQuestionKp(qid, kpId): void; addEdge(a, b): void }`。
- `applyKgResult(repo, data)`:每 item 依次 upsert chapter(parent null)→topic(parent=chapter)→各 point(parent=topic),link 题目到全部 points;edges 内已 addEdge 的对本批内去重(用 Set)。

**Step 4:** PASS。

**Step 5: 实现 `src/main/kg.ts`**(SPEC §7.4):`buildKg(win, deps)` —— 读 cursor、按 id 升序取批(每批 10)、拼 `KG_USER`(SPEC §8.1 提示词原文,`{{questions_json}}` = `[{question_id, stem}]`)、`deps.chatJSON(generator模型, ..., KgSchema)`、单批事务内经 SQLite 版 KgRepo 落库(`INSERT OR IGNORE` + 查 id;addEdge 写 kp_edges 用 `INSERT OR IGNORE`)、更新 cursor、发 progress;批失败(3 次后)记日志跳过;`cancelled` 标志同下载器。ipc.ts 接 `kgBuild/kgCancel/kgGet`(kgGet 联查每节点关联题数),preload 补齐。

**Step 6:** typecheck+test。**Step 7: Commit** — `"feat: 知识图谱构建流水线(归并/断点/注入测试,TDD)"`

### Task 15: 图谱页 UI

**Files:**
- Create: `src/renderer/src/pages/Graph.tsx`

按 SPEC §7.4 图谱页:顶部"构建图谱"按钮+进度条+取消;Cytoscape 画布(`layout: { name: 'cose' }`,节点 label=name,`width/height` 随 questionCount 线性缩放 20–60px,点击 toggle 选中,选中节点加 `selected` 样式类);右侧树(chapter→topic→point 复选框,由 nodes 的 parentId 组装);**选中状态用同一个 `Set<number>` React state,画布与树都读写它**;底部已选 chips + "生成题目"按钮(暂 alert 占位,Task 17 接入)。

**Step 1** 实现。**Step 2** typecheck+test。

**Step 3: 🖐 M4 手动验收(SPEC §9 M4 全部 3 条)**:建图进度/取消后续跑(日志确认断点)、画布与树双向同步、按知识点筛题(Bank 页筛选栏加知识点下拉,读 kgGet)。

**Step 4: Commit** — `"feat: M4 图谱页(Cytoscape+树双向同步)"`

---

## Milestone M5 — 出题与验证流水线

### Task 16: 出题流水线核心(TDD,依赖注入)

**Files:**
- Create: `src/main/pure/gen-core.ts` + `gen-core.test.ts`
- Create: `src/main/generate.ts`

**Step 1: 失败测试(原样)**

```ts
import { describe, it, expect, vi } from 'vitest'
import { answersMatch, runPipeline, type PipelineDeps } from './gen-core'

describe('answersMatch', () => {
  it('选择题按字母比较,忽略大小写与空白', () => {
    expect(answersMatch(' a ', 'A', 'choice')).toBe(true)
    expect(answersMatch('A', 'B', 'choice')).toBe(false)
  })
  it('非选择题去空白比较', () => {
    expect(answersMatch('x = ±2', 'x=±2', 'answer')).toBe(true)
  })
})

const gen = { stem: 'S', options: null, answer: 'x=1' }
const solveOk = { method_a: 'A', method_b: 'B', faster: null, final_answer: 'x=1' }

function deps(over: Partial<Record<'gen' | 'solve' | 'verify', unknown>>): PipelineDeps {
  return {
    roles: { generator: 'g', solver: 's', verifier: 'v' },
    chatJSON: vi.fn(async (_m: string, _sys: string, _usr: string, schema: { description?: string }, tag?: string) => {
      if (tag === 'gen') return over.gen ?? gen
      if (tag === 'solve') return over.solve ?? solveOk
      return over.verify ?? { verdict: 'agree', note: '' }
    }) as never
  }
}

describe('runPipeline', () => {
  it('答案一致且 agree → verified', async () => {
    const r = await runPipeline(deps({}), { kpNames: ['集合'], qtype: 'answer' })
    expect(r.verifyStatus).toBe('verified')
  })
  it('求解答案不一致 → pending', async () => {
    const r = await runPipeline(deps({ solve: { ...solveOk, final_answer: 'x=2' } }), { kpNames: ['集合'], qtype: 'answer' })
    expect(r.verifyStatus).toBe('pending')
  })
  it('验证 disagree → pending', async () => {
    const r = await runPipeline(deps({ verify: { verdict: 'disagree', note: '步骤3错' } }), { kpNames: ['集合'], qtype: 'answer' })
    expect(r.verifyStatus).toBe('pending')
  })
  it('解题与验证同模型 → 启动即抛错', async () => {
    const d = deps({})
    d.roles = { generator: 'g', solver: 'same', verifier: 'same' }
    await expect(runPipeline(d, { kpNames: ['集合'], qtype: 'answer' })).rejects.toThrow('模型')
  })
})
```

**Step 2:** FAIL。

**Step 3: 实现 `gen-core.ts`**:
- `GenSchema/SolveSchema/VerifySchema` = zod 对应 SPEC §8.2–8.4 输出结构(faster/note 允许 null 或缺省)。
- `answersMatch(a, b, qtype)`:choice → 各取第一个 A-D 字母(大写)比较;其他 → 去除全部空白后全等。
- `PipelineDeps = { roles; chatJSON(model, system, user, schema, tag) }`(tag 仅供测试路由,生产实现忽略)。
- `runPipeline(deps, {kpNames, qtype})`:先检查 `roles.solver !== roles.verifier`,违者抛 `解题与验证不能使用同一模型,请到设置页修改`;依次 gen(SPEC §8.2 提示词,temperature 0.7)→ solve(§8.3,附 options_block)→ verify(§8.4);裁决:`answersMatch(gen.answer, solve.final_answer)` 且 `verdict==='agree'` → `'verified'`,否则 `'pending'`;返回 `{question, solution, verifyStatus}` 数据对象(不落库 —— 落库在 generate.ts)。

**Step 4:** PASS。

**Step 5: 实现 `src/main/generate.ts`**(SPEC §7.5):`genCreate` 串行循环 count 次 runPipeline,每题落库(questions + question_kp + solutions,事务),推 progress,完毕发 `gen:done`;`genPending/genResolve`(accept → verified;discard → 物理删+级联);`solveRun(questionId)` 只执行 solve+verify(同模型检查同样生效),存 solutions,发 `solve:done`。ipc.ts + preload 补齐。

**Step 6:** typecheck+test。**Step 7: Commit** — `"feat: 出题双解法验证流水线核心(裁决/同模型防护,TDD)"`

### Task 17: 出题 UI + 待确认页 + 存量详解

**Files:**
- Create: `src/renderer/src/pages/Generate.tsx` — 从 Graph 页"生成题目"进入(或导航直达):显示已选知识点 chips、题型三选一、数量 1–5、"开始生成"→ 进度(生成中/求解中/验证中文案随 progress.message)→ 完成后展示结果卡片(verified 绿 / pending 黄,链接到详情)。
- Create: `src/renderer/src/pages/Pending.tsx` — pending 列表,每项展开显示:题目、命题人答案、解题人答案、验证意见(SPEC §7.5 第 7 点);"采纳"/"丢弃"按钮。
- Modify: `src/renderer/src/pages/QuestionDetail.tsx` — 启用 "AI 详解" 按钮 → `solveRun`,三态,完成后刷新 solutions。
- Modify: `src/renderer/src/pages/Graph.tsx` — "生成题目"跳转 Generate 并携带选中 kpIds。

**Step 1** 实现。**Step 2** typecheck+test。

**Step 3: 🖐 M5 手动验收(SPEC §9 M5 全部 4 条)**:生成 verified 题全流程、同模型拒绝启动、pending 采纳/丢弃、存量题 AI 详解渲染。

**Step 4: Commit** — `"feat: M5 出题/待确认/存量详解 UI"`

---

## Milestone M6 — 收尾

### Task 18: 日志 + 级联清理确认 + 回归

**Files:**
- Create: `src/main/log.ts` — `log(msg: string)`:追加写 `userData/logs/app.log`(不存在则建目录),行格式 `[ISO时间] msg`。回补调用点:下载 skip/失败、导入汇总、建图批次、流水线各步、所有 catch。
- Modify: 确认 `questionsDelete` 与 `genResolve('discard')` 的级联删除共用同一函数(DRY:提取 `hardDeleteGenerated(ids)` 到 ipc.ts 或独立模块)。

**Step 1** 实现日志与 DRY 重构。**Step 2** typecheck+test 全绿。

**Step 3: 🖐 M6 手动验收(SPEC §9 M6 全部 4 条)**:生成题批删后查库无孤儿行(`SELECT COUNT(*) FROM solutions WHERE question_id NOT IN (SELECT id FROM questions);` 应为 0,question_kp 同理)、混合导出、**M0–M5 全部验收项重新过一遍**、app.log 有本次会话记录。

**Step 4: Commit** — `"feat: M6 日志与级联清理收尾"`

**Step 5: 最终检查** — `npm run typecheck && npm run test` 全绿后:

```bash
git log --oneline   # 应有 ≥18 个符合上述信息的提交
```

---

## 完成定义(Definition of Done)

- [ ] 18 个任务全部提交,commit 信息与计划一致。
- [ ] `npm run typecheck`、`npm run test` 零失败。
- [ ] SPEC §9 M0–M6 验收清单逐条通过(M6 含全量回归)。
- [ ] SPEC §0.1 禁止事项逐条自查通过(特别是:无 CDN、renderer 无 KEY/DB/网络访问、无未校验的 LLM 落库、无空 catch)。
