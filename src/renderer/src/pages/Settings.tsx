import { useCallback, useEffect, useState } from 'react'

type Roles = { generator: string; solver: string; verifier: string }
type TestState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string }

const ROLE_LABEL: Record<keyof Roles, string> = {
  generator: '出题',
  solver: '解题',
  verifier: '验证'
}

export default function Settings(): JSX.Element {
  const [masked, setMasked] = useState<string | null>(null)
  const [roles, setRoles] = useState<Roles>({ generator: '', solver: '', verifier: '' })
  const [models, setModels] = useState<string[]>([])
  const [keyInput, setKeyInput] = useState('')
  const [newModel, setNewModel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await window.api.settingsGetMasked()
      setMasked(s.apiKeyMasked)
      setRoles(s.roles)
      setModels(s.models)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function saveKey(): Promise<void> {
    setError(null)
    try {
      await window.api.settingsSetApiKey(keyInput)
      setKeyInput('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function clearKey(): Promise<void> {
    setError(null)
    try {
      await window.api.settingsClearApiKey()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function addModel(): Promise<void> {
    const name = newModel.trim()
    if (!name) return
    setError(null)
    try {
      await window.api.modelsAdd(name)
      setNewModel('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function removeModel(name: string): Promise<void> {
    setError(null)
    try {
      await window.api.modelsRemove(name)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function setRole(role: keyof Roles, model: string): Promise<void> {
    setError(null)
    try {
      await window.api.settingsSetRole(role, model)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function testConn(): Promise<void> {
    setTest({ kind: 'loading' })
    try {
      const r = await window.api.zenmuxTest()
      setTest(r.ok ? { kind: 'ok', message: r.message } : { kind: 'error', message: r.message })
    } catch (e) {
      setTest({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  if (loading) return <div>加载中…</div>

  return (
    <div className="page">
      <h1>设置</h1>
      {error && (
        <div className="banner error">
          {error}
          <button onClick={() => void reload()}>重试</button>
        </div>
      )}

      <section className="card">
        <h2>API-KEY</h2>
        {masked ? (
          <p>
            已保存：<code>{masked}</code>
            <button className="ml" onClick={() => void clearKey()}>
              清除
            </button>
          </p>
        ) : (
          <div>
            <p>尚未设置 API-KEY。请到 ZenMux 获取密钥后再保存。</p>
            <button onClick={() => void window.api.openInvite()}>打开邀请链接</button>
          </div>
        )}
        <div className="row">
          <input
            type="password"
            placeholder="输入 API-KEY"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button onClick={() => void saveKey()} disabled={!keyInput}>
            保存
          </button>
        </div>
      </section>

      <section className="card">
        <h2>模型</h2>
        <ul className="list">
          {models.map((m) => (
            <li key={m}>
              {m}
              <button onClick={() => void removeModel(m)}>删除</button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input
            placeholder="模型名，如 test/model-x"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
          />
          <button onClick={() => void addModel()}>添加</button>
        </div>
      </section>

      <section className="card">
        <h2>角色指派</h2>
        {(Object.keys(ROLE_LABEL) as (keyof Roles)[]).map((role) => (
          <label key={role} className="row">
            <span>{ROLE_LABEL[role]}</span>
            <select value={roles[role]} onChange={(e) => void setRole(role, e.target.value)}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>

      <section className="card">
        <h2>连接测试</h2>
        <button onClick={() => void testConn()} disabled={test.kind === 'loading'}>
          {test.kind === 'loading' ? '测试中…' : '测试连接'}
        </button>
        {test.kind === 'ok' && <p className="ok">✓ 连接正常（模型回复：{test.message}）</p>}
        {test.kind === 'error' && <p className="err">{test.message}</p>}
      </section>
    </div>
  )
}
