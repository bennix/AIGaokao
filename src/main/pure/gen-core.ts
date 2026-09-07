import { z } from 'zod'

export const GenSchema = z.object({
  stem: z.string(),
  options: z.array(z.string()).nullable(),
  answer: z.string()
})

export const SolveSchema = z.object({
  method_a: z.string(),
  method_b: z.string(),
  faster: z.string().nullable().optional(),
  final_answer: z.string()
})

export const VerifySchema = z.object({
  verdict: z.enum(['agree', 'disagree']),
  note: z.string().nullable().optional()
})

export type GenOut = z.infer<typeof GenSchema>
export type SolveOut = z.infer<typeof SolveSchema>
export type VerifyOut = z.infer<typeof VerifySchema>

export function answersMatch(a: string, b: string, qtype: string): boolean {
  if (qtype === 'choice') {
    const letter = (s: string): string => (s.toUpperCase().match(/[A-D]/)?.[0] ?? s.trim().toUpperCase())
    return letter(a) === letter(b)
  }
  return a.replace(/\s+/g, '') === b.replace(/\s+/g, '')
}

export type PipelineDeps = {
  roles: { generator: string; solver: string; verifier: string }
  chatJSON: (
    model: string,
    system: string,
    user: string,
    schema: { description?: string },
    tag?: string
  ) => Promise<unknown>
}

const GEN_SYSTEM =
  '你是高考数学命题专家。你只输出 JSON,数学公式一律使用 LaTeX(行内 $...$,独立 $$...$$)。'
const SOLVE_SYSTEM = '你是高考数学解题专家。你只输出 JSON,数学公式一律使用 LaTeX。'
const VERIFY_SYSTEM = '你是严格的高考数学阅卷专家。你只输出 JSON。'

const QTYPE_CN: Record<string, string> = {
  choice: '单项选择题',
  answer: '简答题',
  comprehensive: '综合题'
}

export async function runPipeline(
  deps: PipelineDeps,
  p: { kpNames: string[]; qtype: 'choice' | 'answer' | 'comprehensive' }
): Promise<{ question: GenOut; solution: SolveOut & { verdict: string; note: string | null }; verifyStatus: 'verified' | 'pending' }> {
  if (deps.roles.solver === deps.roles.verifier) {
    throw new Error('解题与验证不能使用同一模型,请到设置页修改')
  }
  const genUser = `围绕以下知识点命制一道原创${QTYPE_CN[p.qtype] ?? p.qtype}(choice=单项选择题含4个选项/answer=简答题/comprehensive=综合题,
须同时考查多个所给知识点):${p.kpNames.join('、')}
难度对标高考真题。输出 JSON:
{"stem":"题干","options":["A. ...","B. ...","C. ...","D. ..."]或null,"answer":"参考答案(选择题只写字母)"}`
  const question = GenSchema.parse(await deps.chatJSON(deps.roles.generator, GEN_SYSTEM, genUser, GenSchema, 'gen'))
  const optionsBlock = question.options?.length ? `选项:\n${question.options.join('\n')}` : ''
  const solveUser = `用两种思路本质不同的方法分步求解下题,两种方法必须各自独立得出答案并在末尾互相印证;
若存在比两种方法都更快捷的解法,一并给出,否则该字段为 null。
输出 JSON:
{"method_a":"方法A分步解答(Markdown)","method_b":"方法B分步解答(Markdown)",
 "faster":"更快捷解法(Markdown)或 null","final_answer":"最终答案"}
题目:${question.stem}
${optionsBlock}`
  const solve = SolveSchema.parse(await deps.chatJSON(deps.roles.solver, SOLVE_SYSTEM, solveUser, SolveSchema, 'solve'))
  const verifyUser = `独立完成下题,再判断给出的解答是否正确:命题人参考答案与解题人最终答案是否与你的一致、
两种解法过程是否严谨。一致且严谨输出 agree,否则 disagree 并说明分歧。
输出 JSON:{"verdict":"agree"或"disagree","note":"简要说明(disagree 时必填分歧点)"}
题目:${question.stem}
${optionsBlock}
命题人参考答案:${question.answer}
解题人最终答案:${solve.final_answer}
解法过程:
${solve.method_a}

${solve.method_b}`
  const verify = VerifySchema.parse(
    await deps.chatJSON(deps.roles.verifier, VERIFY_SYSTEM, verifyUser, VerifySchema, 'verify')
  )
  const verifyStatus =
    answersMatch(question.answer, solve.final_answer, p.qtype) && verify.verdict === 'agree'
      ? 'verified'
      : 'pending'
  return {
    question,
    solution: { ...solve, verdict: verify.verdict, note: verify.note ?? null },
    verifyStatus
  }
}
