# AIGaokao — 高考数学题库 + AI 知识图谱 + 智能出题 Electron 应用 SPEC

> **本文档的读者是负责实现的 AI(下称"实现方")。**
> 本 SPEC 已做完所有设计决策。实现方的工作是**照抄接线,不是重新设计**。
> 遇到本文档未覆盖的情况:选择最简单、最不破坏现有验收项的做法,并在代码注释中标注 `// SPEC-GAP: <说明>`。

---

## 0. 实现方必读:总规则(防呆总纲)

1. **严格按里程碑 M0→M6 顺序开发。** 未通过当前里程碑的全部验收项之前,禁止编写下一里程碑的代码。
2. **每个里程碑完成后**:运行 `npm run typecheck` 必须零错误;逐条执行该里程碑"验收清单";并重新执行之前所有里程碑的验收清单(回归检查)。
3. 本文档中所有**代码块(DDL、TS 接口、提示词、配置)必须原样使用**,只允许修正明显的语法笔误。
4. 不确定时,实现"最小可用版本",禁止自行加功能、加依赖、加配置项。

### 0.1 禁止事项(违反任何一条即为实现错误)

- ❌ 禁止使用任何 CDN 资源。KaTeX、字体、JS 库全部经 npm 安装并打包,应用必须离线可启动。
- ❌ 禁止开启 `nodeIntegration`,禁止关闭 `contextIsolation`,禁止关闭 `webSecurity`。
- ❌ 禁止让 renderer 进程接触 API-KEY 明文、直接访问文件系统、直接访问 SQLite、直接请求 ZenMux。以上全部只能在 main 进程发生,renderer 只走 preload 暴露的 IPC。
- ❌ 禁止替换本文档指定的依赖库,禁止引入本文档未列出的运行时依赖(devDependencies 中的构建工具除外)。
- ❌ 禁止未经 zod 校验直接信任 LLM 返回的内容并写入数据库。
- ❌ 禁止吞掉错误(空 catch)。所有错误必须:记入日志文件 + 在 UI 上给出可理解的中文提示。
- ❌ 禁止把 API-KEY 明文写入日志、settings 表、导出文件或任何磁盘明文位置。

### 0.2 统一容错规范(所有网络/AI/下载操作必须遵守)

- UI 三态:每个异步操作必有 **加载中(可见指示器)/ 失败(中文错误 + 重试按钮)/ 成功** 三种界面状态。
- LLM 返回 JSON 解析或 zod 校验失败:自动重试,最多 2 次(重试时在提示词后追加"你上次的输出不是合法 JSON,请只输出 JSON");仍失败则该条目标记失败并继续处理后续条目,不中断整批任务。
- 网络请求统一超时:普通请求 30s,LLM 请求 300s,失败自动重试见各模块规定。
- KaTeX 渲染抛异常:捕获后以等宽字体显示原始 LaTeX 文本,禁止白屏或崩溃。
- 长任务(下载、建图、批量出题)必须:显示进度、可取消、中断后可从断点继续。

---

## 1. 产品概述

面向高考数学学习者的 macOS 桌面应用(Electron,架构不排斥 Win/Linux):

1. 应用内一键下载两套开源高考数据:
   - `rainewhk/gaokao` — 多学科结构化题库(题目/答案/解析 JSON)。**首版只导入数学**。
   - `deekur/gaokaomath` — 1952–2026 高考数学真题 PDF,按年份/卷种整理。**仅用于浏览原卷,不做解析入库**。
2. 用 ZenMux 平台的 AI 模型对结构化题库批量提炼**考点/知识点**,构建**知识图谱**(可视化图 + 树形勾选列表)。
3. 用户勾选若干知识点 → AI 生成新题(选择题/简答题/综合题)→ 自动走"双解法求解 + 交叉验证"流水线 → 通过后入库。
4. 存量真题详情页可按需触发同一条"AI 详解"流水线。
5. 题库支持筛选、搜索、批量删除、导出(JSON / Markdown)。
6. 全应用 Markdown + LaTeX 正确渲染。
7. 设置页管理 API-KEY(本地加密永久保存、UI 掩码显示)、模型列表增删、三种角色(出题/解题/验证)模型指派。

**首版非目标(禁止实现)**:物理及其他学科、PDF 解析入库、用户账号/云同步、错题本、做题计时、自动更新、多语言。

---

## 2. 技术栈(锁定,禁止替换)

| 用途 | 库 | 版本约束 |
|---|---|---|
| 桌面框架 | electron | ^33 |
| 构建 | vite + electron-vite | ^6 / ^2 |
| UI | react + react-dom | ^18 |
| 语言 | typescript | ^5.6,`strict: true` |
| 数据库 | better-sqlite3 | ^11(仅 main 进程) |
| Markdown | markdown-it | ^14 |
| LaTeX | katex(含其 CSS/字体,本地打包) | ^0.16 |
| 图谱可视化 | cytoscape | ^3.30 |
| 校验 | zod | ^3.23 |
| 解压 | extract-zip | ^2 |

- API-KEY 加密:Electron 内置 `safeStorage`(不新增依赖)。
- HTTP:main 进程使用 Node 18+ 全局 `fetch`(不引入 axios)。
- CSS:普通 CSS 文件或 CSS Modules,禁止引入 UI 组件库与 CSS 框架。

---

## 3. 目录结构(顶层结构禁止增删,文件可在既定目录内细分)

```
AIGaokao/
├─ package.json
├─ electron.vite.config.ts
├─ tsconfig.json
├─ docs/plans/                  # 本 SPEC 所在
├─ src/
│  ├─ main/                     # Electron main 进程
│  │  ├─ index.ts               # 入口:创建窗口、注册 IPC、注册 app-pdf 协议
│  │  ├─ db.ts                  # SQLite 初始化 + 建表(执行 §4 DDL)
│  │  ├─ secure.ts              # safeStorage 封装:API-KEY 存取
│  │  ├─ zenmux.ts              # ZenMux 客户端(§6)
│  │  ├─ downloader.ts          # 数据下载(§7.1)
│  │  ├─ importer.ts            # 结构化数据入库(§7.2)
│  │  ├─ kg.ts                  # 知识图谱构建流水线(§7.4)
│  │  ├─ generate.ts            # 出题 + 双解法验证流水线(§7.5)
│  │  └─ ipc.ts                 # 全部 ipcMain.handle 注册,类型对齐 §5
│  ├─ preload/index.ts          # contextBridge 暴露 window.api,类型对齐 §5
│  ├─ renderer/
│  │  ├─ index.html
│  │  └─ src/
│  │     ├─ App.tsx             # 左侧导航(七模块)+ 路由
│  │     ├─ components/         # MarkdownLatex.tsx 等共享组件
│  │     └─ pages/              # Data / Bank / Pdf / Graph / Generate / Pending / Settings
│  └─ shared/types.ts           # §5 的接口定义,main/preload/renderer 三端共用
└─ userData(运行时,由应用创建于 app.getPath('userData')):
   ├─ aigaokao.db               # SQLite
   ├─ data/structured/          # rainewhk/gaokao 解压后内容
   ├─ data/pdfs/<年份>/<文件名>.pdf
   └─ logs/app.log              # 追加式文本日志
```

---

## 4. 数据库 DDL(原样执行,启动时 `CREATE TABLE IF NOT EXISTS`)

```sql
CREATE TABLE IF NOT EXISTS questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL CHECK(source IN ('imported','generated')),
  subject       TEXT NOT NULL DEFAULT 'math',
  year          INTEGER,              -- 可空:生成题无年份
  province      TEXT,                 -- 省份/卷种,如 "全国甲卷"
  qtype         TEXT NOT NULL CHECK(qtype IN ('choice','fill','answer','comprehensive')),
  stem          TEXT NOT NULL,        -- 题干,Markdown+LaTeX
  options_json  TEXT,                 -- 选择题选项 JSON 数组,如 ["A. ...","B. ..."]
  answer        TEXT,                 -- 参考答案
  analysis      TEXT,                 -- 仓库自带解析(imported)
  raw_json      TEXT,                 -- 导入时的原始 JSON 全文,便于排查
  verify_status TEXT NOT NULL DEFAULT 'none'
                CHECK(verify_status IN ('none','verified','pending','rejected')),
  deleted       INTEGER NOT NULL DEFAULT 0,   -- 软删除标记(仅 imported 使用)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_points (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL UNIQUE,       -- 归并键:同名即同一节点
  level   TEXT NOT NULL CHECK(level IN ('chapter','topic','point')),
  parent_id INTEGER REFERENCES knowledge_points(id)
);

CREATE TABLE IF NOT EXISTS kp_edges (
  a_id INTEGER NOT NULL REFERENCES knowledge_points(id),
  b_id INTEGER NOT NULL REFERENCES knowledge_points(id),
  relation TEXT NOT NULL DEFAULT 'related',
  PRIMARY KEY (a_id, b_id)
);

CREATE TABLE IF NOT EXISTS question_kp (
  question_id INTEGER NOT NULL REFERENCES questions(id),
  kp_id       INTEGER NOT NULL REFERENCES knowledge_points(id),
  PRIMARY KEY (question_id, kp_id)
);

CREATE TABLE IF NOT EXISTS solutions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  INTEGER NOT NULL REFERENCES questions(id),
  method_a     TEXT NOT NULL,        -- 方法A 分步解答,Markdown+LaTeX
  method_b     TEXT NOT NULL,        -- 方法B 分步解答
  faster       TEXT,                 -- 更快捷解法(可空)
  final_answer TEXT NOT NULL,
  verifier_verdict TEXT NOT NULL CHECK(verifier_verdict IN ('agree','disagree')),
  verifier_note    TEXT,
  solver_model   TEXT NOT NULL,
  verifier_model TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS models (
  name TEXT PRIMARY KEY               -- 如 'anthropic/claude-sonnet-4.6'
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- settings 固定键:
--   'apikey_encrypted' : safeStorage 加密后的 base64(禁止存明文)
--   'role_generator' / 'role_solver' / 'role_verifier' : 模型名
--   'kg_build_cursor'  : 图谱构建断点(最后处理完成的 question_id)

-- 首次启动写入默认模型:
INSERT OR IGNORE INTO models(name) VALUES
 ('anthropic/claude-sonnet-4.6'),('z-ai/glm-5v-turbo'),('openai/gpt-5.4');
```

---

## 5. IPC 接口(`src/shared/types.ts`,原样使用;通道名 = 方法名)

preload 用 `contextBridge.exposeInMainWorld('api', ...)` 把下列方法逐一映射到 `ipcRenderer.invoke('<方法名>', args)`。进度类事件由 main 用 `webContents.send` 推送,renderer 用 `window.api.on(channel, cb)` 订阅。

```ts
export interface Api {
  // ---- 设置 ----
  settingsGetMasked(): Promise<{ apiKeyMasked: string | null;      // 如 'zm-****abcd',null=未设置
    roles: { generator: string; solver: string; verifier: string };
    models: string[] }>;
  settingsSetApiKey(plainKey: string): Promise<void>;              // main 加密后落库,绝不回传明文
  settingsClearApiKey(): Promise<void>;
  settingsSetRole(role: 'generator'|'solver'|'verifier', model: string): Promise<void>;
  modelsAdd(name: string): Promise<void>;
  modelsRemove(name: string): Promise<void>;                       // 被角色占用时抛错
  zenmuxTest(): Promise<{ ok: boolean; message: string }>;         // 用 solver 模型发一条 "1+1=?" 验证连通

  // ---- 数据中心 ----
  dataStatus(): Promise<{ structuredImported: boolean; questionCount: number;
    pdfYears: { year: string; fileCount: number }[] }>;
  dataDownloadStructured(): Promise<void>;                         // 下载+解压+导入,进度走 'progress' 事件
  dataListPdfDirs(): Promise<{ path: string; name: string }[]>;    // GitHub API 列 deekur/gaokaomath 顶层目录
  dataDownloadPdfDir(dirPath: string): Promise<void>;              // 下载该目录全部 PDF
  dataCancel(): Promise<void>;

  // ---- 题库 ----
  questionsQuery(q: { keyword?: string; year?: number; province?: string;
    qtype?: string; source?: 'imported'|'generated'; kpIds?: number[];
    page: number; pageSize: number }): Promise<{ total: number; items: QuestionRow[] }>;
  questionsGet(id: number): Promise<{ question: QuestionRow; solutions: SolutionRow[];
    kps: { id: number; name: string }[] }>;
  questionsDelete(ids: number[]): Promise<void>;   // imported→软删,generated→物理删+级联删 solutions/question_kp
  questionsExport(ids: number[], format: 'json'|'markdown'):
    Promise<{ savedPath: string }>;                // dialog.showSaveDialog 让用户选路径

  // ---- 知识图谱 ----
  kgBuild(): Promise<void>;                        // 从断点继续;进度走 'progress' 事件
  kgCancel(): Promise<void>;
  kgGet(): Promise<{ nodes: { id: number; name: string; level: string;
    parentId: number|null; questionCount: number }[];
    edges: { a: number; b: number }[] }>;

  // ---- 出题与详解 ----
  genCreate(p: { kpIds: number[]; qtype: 'choice'|'answer'|'comprehensive';
    count: number /*1-5*/ }): Promise<void>;       // 结果走 'progress'/'gen:done' 事件
  genPending(): Promise<QuestionRow[]>;            // verify_status='pending' 的生成题
  genResolve(id: number, action: 'accept'|'discard'): Promise<void>;
  solveRun(questionId: number): Promise<void>;     // 存量题 AI 详解,完成后 'solve:done' 事件

  // ---- PDF ----
  pdfList(): Promise<{ year: string; files: { name: string; url: string }[] }[]>;
    // url 形如 'app-pdf://<年份>/<文件名>.pdf'(main 注册的自定义只读协议,映射到 userData/data/pdfs)

  // ---- 事件订阅 ----
  on(channel: 'progress'|'gen:done'|'solve:done',
     cb: (payload: ProgressPayload | { questionId: number }) => void): () => void;
}

export interface QuestionRow { id: number; source: string; year: number|null;
  province: string|null; qtype: string; stem: string; options: string[]|null;
  answer: string|null; analysis: string|null; verifyStatus: string; createdAt: string; }

export interface SolutionRow { id: number; methodA: string; methodB: string;
  faster: string|null; finalAnswer: string; verdict: string; note: string|null;
  solverModel: string; verifierModel: string; }

export interface ProgressPayload { task: 'download'|'import'|'kg'|'gen';
  done: number; total: number; message: string;
  state: 'running'|'ok'|'error'|'cancelled'; }
```

---

## 6. ZenMux 客户端(`src/main/zenmux.ts`)

- Base URL:`https://zenmux.ai/api/v1`,OpenAI Chat Completions 兼容。
- 请求:`POST {base}/chat/completions`,头 `Authorization: Bearer <解密后的KEY>`、`Content-Type: application/json`。
- 体:`{ model, messages: [{role:'system',content},{role:'user',content}], temperature }`。出题 temperature 0.7,解题/验证/提炼 0.2。
- 取 `choices[0].message.content` 为结果文本。非 2xx:401/403 → 提示"API-KEY 无效,请到设置页检查";429 → 等 5s 重试 1 次;其余 → 显示状态码与响应体前 200 字。
- 暴露唯一函数:`chatJSON<T>(model, system, user, schema: ZodSchema<T>): Promise<T>` — 调用后剥离 ```json 围栏、`JSON.parse`、zod 校验;失败按 §0.2 重试 2 次;最终失败抛带上下文的 Error。
- 设置页无 KEY 时,页面显示提示文案与可点击邀请链接:`https://zenmux.ai/invite/GBQMC5`(用 `shell.openExternal` 打开)。

---

## 7. 模块功能规格

### 7.1 数据中心(下载)

- **结构化题库**:下载 `https://codeload.github.com/rainewhk/gaokao/zip/refs/heads/main` 到临时文件(30 分钟超时,失败重试 3 次,每次间隔 5s)→ `extract-zip` 解压到 `userData/data/structured/` → 调用导入(§7.2)。
- **PDF 真题**:`GET https://api.github.com/repos/deekur/gaokaomath/contents/`(头 `User-Agent: AIGaokao`)列出顶层目录;用户勾选目录(通常按年份)后,逐目录再调 contents API 列文件,逐个从返回的 `download_url` 下载到 `userData/data/pdfs/<目录名>/`。**逐文件**:已存在且大小一致则跳过(断点续跑);失败重试 3 次;单文件最终失败记日志并继续,最后汇总"N 个文件失败"。
- GitHub API 返回 403(限流)时:提示"GitHub 接口限流,请约 1 小时后重试",不做认证方案。
- 进度事件:每完成一个文件推一次 `progress`。

### 7.2 结构化数据导入(`importer.ts`)

`rainewhk/gaokao` 内部格式需在实现时实际查看解压产物确定,因此导入器必须**宽容**:

1. 递归扫描 `userData/data/structured/` 下所有 `.json`/`.jsonl` 文件;只处理路径或文件内容中学科可判定为数学(路径含 `math`/`数学`)的文件。
2. 每条记录尽力映射到 `questions` 表:题干→`stem`(必需,取不到则跳过该条并计数)、选项→`options_json`、答案→`answer`、解析→`analysis`、年份/省份/题型→对应列(题型映射不了就按"有选项=choice,否则=answer")。**原始记录整条存入 `raw_json`**。
3. 用 `stem` 前 80 字符做重复检测,重复即跳过。
4. 导入结束在 UI 汇报:成功 N 条、跳过 M 条、失败文件列表。
5. 全过程放在一个 SQLite 事务批次中(每 500 条一批)。

### 7.3 题库浏览 + PDF 阅卷 + 渲染

- **题库页**:顶部筛选(年份/省份/题型/来源/关键词搜索 LIKE stem)、分页列表(每页 20)、复选框多选 →"批量删除"(弹确认框,注明真题为可恢复的隐藏、生成题为永久删除)与"导出"(JSON 为 `QuestionRow[]` 原样;Markdown 为每题一节:题干/选项/答案/解析/已有 AI 解法,LaTeX 保留原文)。列表默认不显示 `deleted=1` 的题。
- **详情页**:渲染题干/选项/答案/解析;`source='imported'` 显示"AI 详解"按钮(→ `solveRun`,完成后展示 solutions);已有解法直接展示方法A/方法B/更快解法/验证结论。
- **PDF 页**:左侧年份/目录列表,右侧文件列表;点击文件用 `<iframe src="app-pdf://...">` 内嵌 Chromium 自带 PDF 查看器;iframe 加载失败时显示"在系统中打开"按钮(`shell.openPath`)。`app-pdf` 协议在 main 用 `protocol.handle` 注册,只允许映射到 `userData/data/pdfs/` 内的文件(路径穿越检查:解析后必须以该目录为前缀)。
- **渲染组件 `MarkdownLatex.tsx`**(全应用唯一渲染入口):markdown-it 渲染 Markdown;渲染前先用正则提取 `$...$` 与 `$$...$$` 片段交给 KaTeX(`throwOnError: false`),再回填。KaTeX CSS 在入口 import。

### 7.4 知识图谱构建(`kg.ts`)

1. 取全部 `source='imported' AND deleted=0 AND id > <kg_build_cursor 默认0>` 的题,按 id 升序,每 10 题一批。
2. 每批调用 `chatJSON(role_generator 模型, KG_SYSTEM, KG_USER(题目列表), KgSchema)`,提示词见 §8.1。
3. 落库(单批一个事务):知识点按 `name` 归并(`INSERT OR IGNORE` 后查 id);写 `question_kp`;`kp_edges` 写入时保证 `a_id < b_id` 防重复;层级关系:point 的 `parent_id` 指向其 topic,topic 指向 chapter。
4. 每批完成后把批内最大 question_id 写入 `settings.kg_build_cursor`(**断点**),推进度事件。
5. 取消:置标志位,当前批处理完即停;下次从断点续跑。
6. **图谱页**:上方 Cytoscape 画布(节点=知识点,大小按关联题数,layout 用内置 `cose`;点击节点=选中/取消,选中节点高亮);右侧树形勾选列表(chapter→topic→point,复选框),**与画布选中状态双向同步**——画布若有任何交互问题,树是全功能降级入口。底部常驻:已选节点 chips + "生成题目"按钮(跳出题面板)。

### 7.5 AI 出题 + 双解法验证流水线(`generate.ts`)

对 `genCreate` 的每道题依次执行(串行,防止并发烧钱):

1. **生成**:`chatJSON(role_generator, GEN_SYSTEM, GEN_USER(知识点名列表, qtype), GenSchema)` → 得题干/选项/参考答案。
2. **双解法求解**:`chatJSON(role_solver, SOLVE_SYSTEM, SOLVE_USER(题目), SolveSchema)` → 方法A、方法B、更快解法(可空)、最终答案。要求两法相互独立并在结尾互相印证。
3. **交叉验证**:验证模型必须 ≠ 解题模型(若设置页两角色配了同一模型,流水线开始前直接报错提示用户改设置)。`chatJSON(role_verifier, VERIFY_SYSTEM, VERIFY_USER(题目+参考答案+双解法答案), VerifySchema)` → `agree/disagree` + 理由。
4. **裁决**:生成答案 == 求解答案 且 verdict=agree → `verify_status='verified'` 入库;任何不一致 → `'pending'` 入库,进"待人工确认"页。
5. 入库内容:`questions`(source='generated', 关联所选 kpIds 写 `question_kp`)+ `solutions` 一条。
6. 存量题详解 `solveRun` = 只执行步骤 2、3,verdict 随 solutions 保存,不改动题目本身。
7. **待确认页**:列出 pending 题,展示三方分歧(生成答案 / 求解答案 / 验证意见);"采纳"→ verified,"丢弃"→ 物理删除。

### 7.6 设置页

- API-KEY:密码型输入框保存(`settingsSetApiKey`);已保存时显示掩码(前 3 后 4,中间 `****`)+ "清除"按钮;**任何接口都不返回明文**。无 KEY 时显示引导文案 + 邀请链接按钮(§6)。
- 模型管理:列表 + 添加(文本输入模型名)+ 删除(被角色占用时报错提示)。
- 角色指派:三个下拉框(出题/解题/验证),选项来自 models 表。默认:generator=`openai/gpt-5.4`,solver=`anthropic/claude-sonnet-4.6`,verifier=`z-ai/glm-5v-turbo`。
- "测试连接"按钮:`zenmuxTest`,成功显示"✓ 连接正常(模型回复:…)",失败显示具体原因。

---

## 8. 提示词模板(原样使用,`{{...}}` 为程序插值)

### 8.1 知识图谱提炼(KG_SYSTEM / KG_USER)

```
[system]
你是高考数学教研专家。你只输出 JSON,不输出任何其他文字、解释或 Markdown 围栏。

[user]
对下面每道题,给出其所属章节(chapter)、考点(topic)、知识点(point,可多个),
并列出这些知识点之间的关联对。命名使用高中数学课标通用术语,同一概念必须使用完全相同的名称。
输出 JSON,结构:
{"items":[{"question_id":123,"chapter":"...","topic":"...","points":["...","..."]}],
 "edges":[["知识点甲","知识点乙"]]}
题目列表:
{{questions_json}}   // [{question_id, stem}] 数组
```

### 8.2 出题(GEN_SYSTEM / GEN_USER)

```
[system]
你是高考数学命题专家。你只输出 JSON,数学公式一律使用 LaTeX(行内 $...$,独立 $$...$$)。

[user]
围绕以下知识点命制一道原创{{qtype_cn}}(choice=单项选择题含4个选项/answer=简答题/comprehensive=综合题,
须同时考查多个所给知识点):{{kp_names}}
难度对标高考真题。输出 JSON:
{"stem":"题干","options":["A. ...","B. ...","C. ...","D. ..."]或null,"answer":"参考答案(选择题只写字母)"}
```

### 8.3 双解法求解(SOLVE_SYSTEM / SOLVE_USER)

```
[system]
你是高考数学解题专家。你只输出 JSON,数学公式一律使用 LaTeX。

[user]
用两种思路本质不同的方法分步求解下题,两种方法必须各自独立得出答案并在末尾互相印证;
若存在比两种方法都更快捷的解法,一并给出,否则该字段为 null。
输出 JSON:
{"method_a":"方法A分步解答(Markdown)","method_b":"方法B分步解答(Markdown)",
 "faster":"更快捷解法(Markdown)或 null","final_answer":"最终答案"}
题目:{{stem}}
{{options_block}}   // 选择题附选项
```

### 8.4 交叉验证(VERIFY_SYSTEM / VERIFY_USER)

```
[system]
你是严格的高考数学阅卷专家。你只输出 JSON。

[user]
独立完成下题,再判断给出的解答是否正确:命题人参考答案与解题人最终答案是否与你的一致、
两种解法过程是否严谨。一致且严谨输出 agree,否则 disagree 并说明分歧。
输出 JSON:{"verdict":"agree"或"disagree","note":"简要说明(disagree 时必填分歧点)"}
题目:{{stem}}
{{options_block}}
命题人参考答案:{{gen_answer}}
解题人最终答案:{{solver_answer}}
解法过程:
{{methods}}
```

---

## 9. 里程碑与验收清单

每条验收项都是"操作 → 预期"格式,人工逐条执行。

### M0 脚手架
- [ ] `npm install && npm run dev` → 出现空窗口,标题 AIGaokao,左侧七个导航项可点击切换空页面。
- [ ] `npm run typecheck` 零错误。开发者工具 Console 无红色报错。

### M1 设置页
- [ ] 未设 KEY:设置页显示引导文案,点邀请链接在浏览器打开 `https://zenmux.ai/invite/GBQMC5`。
- [ ] 输入任意字符串保存 → 显示掩码;**重启应用**掩码仍在;`aigaokao.db` 内用文本编辑器搜不到该明文。
- [ ] 填入真实 KEY 点"测试连接" → 显示 ✓ 与模型回复;填错误 KEY → 显示"API-KEY 无效…"。
- [ ] 添加模型 `test/model-x` 出现在列表与三个下拉框;把某角色指到它后尝试删除 → 报"被占用";改回后可删除。

### M2 数据下载与导入
- [ ] 点"下载结构化题库" → 进度条走完 → 显示导入汇总;题库页能看到数学题,总数 > 1000。
- [ ] 再次点击下载 → 不产生重复题(总数不翻倍)。
- [ ] PDF 页点"获取目录列表" → 出现 deekur/gaokaomath 目录;勾选一个小目录下载 → 文件落在 `userData/data/pdfs/`;下载中途点取消 → 停止;再次下载 → 跳过已完成文件(日志可见 skip)。
- [ ] 断网状态下操作 → 出现中文错误提示与重试按钮,应用不崩溃。

### M3 题库/PDF/渲染
- [ ] 题库筛选:选年份/题型/关键词,列表与总数正确变化;翻页正常。
- [ ] 详情页:含 `$...$` 的题公式正常渲染;人为构造非法 LaTeX 的题 → 显示原文不崩溃。
- [ ] 勾选 2 题批量删除 → 确认框 → 列表消失;直接查库确认 imported 题是 `deleted=1` 而非物理删除。
- [ ] 导出选中题为 Markdown → 文件可用编辑器打开,含题干与 LaTeX 原文;JSON 导出可被 `JSON.parse`。
- [ ] PDF 页点开一份 PDF → 应用内可翻页查看;"在系统中打开"按钮可用。

### M4 知识图谱
- [ ] 点"构建图谱" → 进度条推进;中途取消后重新点击 → 从断点继续(日志显示起始 id 不为 0)。
- [ ] 构建完成:画布显示节点,点击节点可选中/取消;右侧树勾选与画布高亮双向同步。
- [ ] 点某知识点 → 题库页可按该知识点筛出关联题。

### M5 出题与验证流水线
- [ ] 勾选 2 个知识点,选"选择题",数量 1 → 依次看到 生成/求解/验证 进度 → 出现新题,`verified` 状态,详情含方法A/方法B/最终答案/验证结论。
- [ ] 解题与验证角色设为同一模型再出题 → 流水线拒绝启动并提示修改设置。
- [ ] 待确认页:能看到 pending 题(若无,临时把某生成题 verify_status 改为 pending 验证 UI)→ "采纳"变 verified,"丢弃"后从库中消失。
- [ ] 存量真题详情点"AI 详解" → 生成双解法并展示,LaTeX 渲染正常。

### M6 收尾
- [ ] 生成题批量删除 → 物理删除,`solutions`/`question_kp` 无孤儿行(查库确认)。
- [ ] 混选真题+生成题导出 JSON/Markdown 均正常。
- [ ] 回归:M0–M5 全部验收项重新执行一遍通过。
- [ ] `userData/logs/app.log` 存在且记录了本次会话的关键操作与错误。

---

## 10. 未来扩展(仅预留,禁止在首版实现)

- 学科字段 `subject` 已建,后续接入 `deekur/gaokaophysics`(物理 PDF)与 rainewhk 其他学科。
- PDF"手动摘题":阅卷器选中文字/截图 → 视觉模型(z-ai/glm-5v-turbo)转结构化题目入库。
- rainewhk/gaokao-chinese 语文默写专题。
