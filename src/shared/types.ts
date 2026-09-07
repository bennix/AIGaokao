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
  openInvite(): Promise<void>;

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
