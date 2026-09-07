import Database from 'better-sqlite3'

const DDL = `
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
`

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
