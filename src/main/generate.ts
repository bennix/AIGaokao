import type { BrowserWindow } from 'electron'
import { getDb } from './db'
import { log } from './log'
import { hardDeleteGenerated, questionsGet, toQuestionRow } from './questions'
import {
  GenSchema,
  SolveSchema,
  VerifySchema,
  runPipeline,
  type PipelineDeps
} from './pure/gen-core'
import { markdownPreviewFromLlm } from './pure/llm-preview'
import { chatJSON, makeDeps, type ChatDeps } from './zenmux'
import type { ProgressPayload, QuestionRow } from '../shared/types'

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function roles(): { generator: string; solver: string; verifier: string } {
  return {
    generator: getSetting('role_generator') ?? 'openai/gpt-5.4',
    solver: getSetting('role_solver') ?? 'anthropic/claude-sonnet-4.6',
    verifier: getSetting('role_verifier') ?? 'z-ai/glm-5v-turbo'
  }
}

function makePipelineDeps(win: BrowserWindow, questionId?: number): PipelineDeps {
  let last = 0
  let preview = ''
  const flush = (message: string, done: number): void => {
    send(win, { task: 'gen', done, total: 2, message, preview, questionId, state: 'running' })
  }
  const base = makeDeps({
    onWait: (ms) => flush(`ZenMux 限速，等待 ${Math.ceil(ms / 1000)} 秒`, 0)
  })
  return {
    roles: roles(),
    chatJSON: async (model, system, user, schema, tag) => {
      const temp = tag === 'gen' ? 0.7 : 0.2
      const message = tag === 'gen' ? '生成中' : tag === 'solve' ? '求解中' : '验证中'
      const done = tag === 'verify' ? 1 : 0
      preview = ''
      flush(message, done)
      const d: ChatDeps = {
        ...base,
        onDelta: (text) => {
          preview = markdownPreviewFromLlm(text)
          const now = Date.now()
          if (now - last >= 80) {
            last = now
            flush(message, done)
          }
        }
      }
      const out =
        schema === GenSchema || tag === 'gen'
          ? await chatJSON(d, model, system, user, GenSchema, temp)
          : schema === SolveSchema || tag === 'solve'
            ? await chatJSON(d, model, system, user, SolveSchema, temp)
            : await chatJSON(d, model, system, user, VerifySchema, temp)
      flush(message, done)
      return out
    }
  }
}

function send(win: BrowserWindow | null, p: ProgressPayload): void {
  win?.webContents.send('progress', p)
}

function persistGenerated(
  result: Awaited<ReturnType<typeof runPipeline>>,
  kpIds: number[],
  qtype: string
): number {
  const db = getDb()
  const r = roles()
  let id = 0
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO questions (source, qtype, stem, options_json, answer, verify_status)
         VALUES ('generated', @qtype, @stem, @options_json, @answer, @verify_status)`
      )
      .run({
        qtype,
        stem: result.question.stem,
        options_json: result.question.options ? JSON.stringify(result.question.options) : null,
        answer: result.question.answer,
        verify_status: result.verifyStatus
      })
    id = Number(info.lastInsertRowid)
    const link = db.prepare('INSERT OR IGNORE INTO question_kp(question_id, kp_id) VALUES (?, ?)')
    for (const kp of kpIds) link.run(id, kp)
    db.prepare(
      `INSERT INTO solutions (question_id, method_a, method_b, faster, final_answer, verifier_verdict, verifier_note, solver_model, verifier_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      result.solution.method_a,
      result.solution.method_b,
      result.solution.faster ?? null,
      result.solution.final_answer,
      result.solution.verdict,
      result.solution.note,
      r.solver,
      r.verifier
    )
  })
  tx()
  return id
}

export async function genCreate(
  win: BrowserWindow,
  p: { kpIds: number[]; qtype: 'choice' | 'answer' | 'comprehensive'; count: number }
): Promise<void> {
  const count = Math.min(5, Math.max(1, p.count))
  const kpNames = (
    getDb()
      .prepare(`SELECT name FROM knowledge_points WHERE id IN (${p.kpIds.map(() => '?').join(',') || 'NULL'})`)
      .all(...p.kpIds) as { name: string }[]
  ).map((r) => r.name)
  const deps = makePipelineDeps(win)
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    log(`genCreate ${i + 1}/${count}`)
    const result = await runPipeline(deps, { kpNames, qtype: p.qtype })
    const id = persistGenerated(result, p.kpIds, p.qtype)
    ids.push(id)
    log(`genCreate saved id=${id} status=${result.verifyStatus}`)
  }
  send(win, { task: 'gen', done: count, total: count, message: '完成', state: 'ok' })
  win.webContents.send('gen:done', { questionId: ids[ids.length - 1] })
}

export function genPending(): QuestionRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, source, year, province, qtype, stem, options_json, answer, analysis, verify_status, created_at
       FROM questions WHERE verify_status = 'pending' AND deleted = 0 ORDER BY id DESC`
    )
    .all() as Parameters<typeof toQuestionRow>[0][]
  return rows.map(toQuestionRow)
}

export function genResolve(id: number, action: 'accept' | 'discard'): void {
  if (action === 'accept') {
    getDb().prepare("UPDATE questions SET verify_status = 'verified' WHERE id = ?").run(id)
    log(`genResolve accept ${id}`)
    return
  }
  hardDeleteGenerated([id])
  log(`genResolve discard ${id}`)
}

export async function solveRun(win: BrowserWindow, questionId: number): Promise<void> {
  const { question } = questionsGet(questionId)
  const r = roles()
  if (r.solver === r.verifier) throw new Error('解题与验证不能使用同一模型,请到设置页修改')
  const deps = makePipelineDeps(win, questionId)
  const optionsBlock = question.options?.length ? `选项:\n${question.options.join('\n')}` : ''
  const solve = SolveSchema.parse(
    await deps.chatJSON(
      r.solver,
      '你是高考数学解题专家。你只输出 JSON,数学公式一律使用 LaTeX。',
      `用两种思路本质不同的方法分步求解下题,两种方法必须各自独立得出答案并在末尾互相印证;
若存在比两种方法都更快捷的解法,一并给出,否则该字段为 null。
输出 JSON:
{"method_a":"方法A分步解答(Markdown)","method_b":"方法B分步解答(Markdown)",
 "faster":"更快捷解法(Markdown)或 null","final_answer":"最终答案"}
题目:${question.stem}
${optionsBlock}`,
      SolveSchema,
      'solve'
    )
  )
  const verify = VerifySchema.parse(
    await deps.chatJSON(
      r.verifier,
      '你是严格的高考数学阅卷专家。你只输出 JSON。',
      `独立完成下题,再判断给出的解答是否正确:命题人参考答案与解题人最终答案是否与你的一致、
两种解法过程是否严谨。一致且严谨输出 agree,否则 disagree 并说明分歧。
输出 JSON:{"verdict":"agree"或"disagree","note":"简要说明(disagree 时必填分歧点)"}
题目:${question.stem}
${optionsBlock}
命题人参考答案:${question.answer ?? ''}
解题人最终答案:${solve.final_answer}
解法过程:
${solve.method_a}

${solve.method_b}`,
      VerifySchema,
      'verify'
    )
  )
  getDb()
    .prepare(
      `INSERT INTO solutions (question_id, method_a, method_b, faster, final_answer, verifier_verdict, verifier_note, solver_model, verifier_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      questionId,
      solve.method_a,
      solve.method_b,
      solve.faster ?? null,
      solve.final_answer,
      verify.verdict,
      verify.note ?? null,
      r.solver,
      r.verifier
    )
  log(`solveRun ${questionId} ${verify.verdict}`)
  win.webContents.send('solve:done', { questionId })
}
