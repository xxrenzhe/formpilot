import "../style.css"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { UserPersona, UsageSummary, UserPlan } from "@formpilot/shared"
import { createPersona, deletePersona, fetchMetricsDaily, fetchPersonas, fetchUsage, openCheckout, sendMetric, updatePersona } from "../lib/api"
import { consumeOAuthRedirect, signInWithEmail, signInWithGoogle, signOut, signUpWithEmail } from "../lib/supabase"
import { getAppConfig, getAuthState, setAppConfig, setAuthState } from "../lib/storage"

interface PersonaFormState {
  name: string
  isDefault: boolean
  coreIdentity: string
  companyInfo: string
  tonePreference: string
  customRules: string
}

const emptyPersona: PersonaFormState = {
  name: "",
  isDefault: false,
  coreIdentity: "",
  companyInfo: "",
  tonePreference: "",
  customRules: ""
}

export default function OptionsPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [authEmail, setAuthEmail] = useState<string>("")
  const [plan, setPlan] = useState<UserPlan>("unknown")
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [personas, setPersonas] = useState<UserPersona[]>([])
  const [personaForm, setPersonaForm] = useState<PersonaFormState>(emptyPersona)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [configApiBaseUrl, setConfigApiBaseUrl] = useState("")
  const [configByokKey, setConfigByokKey] = useState("")
  const [metricsRows, setMetricsRows] = useState<{ day: string; panel_users: number; generate_users: number; copy_users: number; paywall_users: number }[]>([])

  const refreshAccount = useCallback(async () => {
    const auth = await getAuthState()
    if (!auth) return
    setAuthEmail(auth.email)

    const [usageData, personaList] = await Promise.all([fetchUsage(), fetchPersonas()])
    if (usageData) {
      setUsage(usageData)
      setPlan(usageData.plan)
    }
    setPersonas(personaList)
    const metrics = await fetchMetricsDaily()
    setMetricsRows(metrics)
  }, [])

  const trackPaywall = useCallback(async (reason: string) => {
    try {
      await sendMetric({ eventType: "paywall_shown", metadata: { reason, source: "persona" } })
    } catch {
      // ignore metrics errors
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const config = await getAppConfig()
      setConfigApiBaseUrl(config.apiBaseUrl)
      setConfigByokKey(config.byokKey)

      const consumed = await consumeOAuthRedirect()
      if (consumed) {
        setStatus("已完成 Google 登录")
      }

      const auth = await getAuthState()
      if (auth) {
        setAuthEmail(auth.email)
        await refreshAccount()
      }
    }

    void init()
  }, [refreshAccount])

  const handleLogin = useCallback(async () => {
    setStatus("")
    try {
      await signInWithEmail(email, password)
      const auth = await getAuthState()
      setAuthEmail(auth?.email || "")
      await refreshAccount()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "登录失败")
    }
  }, [email, password, refreshAccount])

  const handleRegister = useCallback(async () => {
    setStatus("")
    try {
      await signUpWithEmail(email, password)
      const auth = await getAuthState()
      setAuthEmail(auth?.email || "")
      await refreshAccount()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "注册失败")
    }
  }, [email, password, refreshAccount])

  const handleLogout = useCallback(async () => {
    await signOut()
    await setAuthState(null)
    setAuthEmail("")
    setPlan("unknown")
    setUsage(null)
    setPersonas([])
  }, [])

  const handlePersonaSubmit = useCallback(async () => {
    setStatus("")
    if (!personaForm.name || !personaForm.coreIdentity || !personaForm.companyInfo || !personaForm.tonePreference) {
      setStatus("请填写完整人设信息")
      return
    }

    const payload = {
      name: personaForm.name,
      isDefault: personaForm.isDefault,
      coreIdentity: personaForm.coreIdentity,
      companyInfo: personaForm.companyInfo,
      tonePreference: personaForm.tonePreference,
      customRules: personaForm.customRules || undefined
    }

    try {
      let updated: UserPersona | null = null
      if (editingId) {
        updated = await updatePersona(editingId, payload)
      } else {
        updated = await createPersona(payload)
      }

      if (updated) {
        await refreshAccount()
        setPersonaForm(emptyPersona)
        setEditingId(null)
        setStatus("已保存人设")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败"
      setStatus(message)
      if (message.includes("人设数量已达上限")) {
        void trackPaywall("persona_limit")
      }
    }
  }, [personaForm, editingId, refreshAccount, trackPaywall])

  const handlePersonaEdit = useCallback((persona: UserPersona) => {
    setEditingId(persona.id)
    setPersonaForm({
      name: persona.name,
      isDefault: persona.isDefault,
      coreIdentity: persona.coreIdentity,
      companyInfo: persona.companyInfo,
      tonePreference: persona.tonePreference,
      customRules: persona.customRules || ""
    })
  }, [])

  const handlePersonaDelete = useCallback(async (personaId: string) => {
    await deletePersona(personaId)
    await refreshAccount()
  }, [refreshAccount])

  const handleCheckout = useCallback(async (price: "pro-month" | "pro-year") => {
    const url = await openCheckout(price)
    if (url) {
      chrome.tabs.create({ url })
    } else {
      setStatus("无法创建支付链接")
    }
  }, [])

  const handleSaveConfig = useCallback(async () => {
    await setAppConfig({
      apiBaseUrl: configApiBaseUrl,
      byokKey: configByokKey
    })
    setStatus("配置已保存")
  }, [configApiBaseUrl, configByokKey])

  const handleRefreshUsage = useCallback(async () => {
    setIsRefreshing(true)
    setStatus("")
    try {
      await refreshAccount()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "刷新失败")
    } finally {
      setIsRefreshing(false)
    }
  }, [refreshAccount])

  const metricsHint = useMemo(() => {
    if (!metricsRows.length) return "暂无指标数据"
    const latest = metricsRows[0]
    return `最近一天: 打开 ${latest.panel_users} | 生成 ${latest.generate_users} | 复制 ${latest.copy_users} | Paywall ${latest.paywall_users}`
  }, [metricsRows])

  const isLoggedIn = useMemo(() => Boolean(authEmail), [authEmail])
  const usageHint = useMemo(() => {
    if (!usage) return ""
    if (usage.limit === -1) return `已使用 ${usage.used} 次`
    const remaining = Math.max(usage.limit - usage.used, 0)
    return `已用 ${usage.used} 次，剩余 ${remaining} 次`
  }, [usage])
  const showPersonaUpgrade = status.includes("人设数量已达上限")

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-ink">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">FormPilot 控制台</h1>
            <p className="text-slate-500 text-sm">读懂网页，填你所想。</p>
          </div>
          {isLoggedIn && (
            <button
              type="button"
              className="rounded-full border border-storm px-4 py-2 text-xs"
              onClick={handleLogout}
            >
              退出登录
            </button>
          )}
        </header>

        {!isLoggedIn && (
          <section className="rounded-2xl border border-storm bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">登录或注册</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <input
                  className="w-full rounded-lg border border-storm px-3 py-2"
                  placeholder="邮箱"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <input
                  className="w-full rounded-lg border border-storm px-3 py-2"
                  type="password"
                  placeholder="密码"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-ocean text-white py-2 text-sm"
                    onClick={handleLogin}
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-lg border border-storm py-2 text-sm"
                    onClick={handleRegister}
                  >
                    注册
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <div className="mb-2">快速登录</div>
                <button
                  type="button"
                  className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm"
                  onClick={async () => {
                    try {
                      await signInWithGoogle()
                    } catch (error) {
                      setStatus(error instanceof Error ? error.message : "Google 登录失败")
                    }
                  }}
                >
                  使用 Google 登录
                </button>
                <p className="mt-3 text-xs text-slate-500">Google 登录完成后会自动返回此页面。</p>
              </div>
            </div>
          </section>
        )}

        {isLoggedIn && (
          <section className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-storm bg-white p-6 shadow-sm space-y-2">
              <h2 className="text-lg font-semibold">账号与套餐</h2>
              <p className="text-sm text-slate-600">当前账号：{authEmail}</p>
              <p className="text-sm text-slate-600">套餐：{plan === "pro" ? "Pro" : "Free"}</p>
              {usageHint ? (
                <p className="text-xs text-slate-500">{usageHint}</p>
              ) : (
                <p className="text-xs text-slate-400">额度未获取，请检查 API 配置或登录状态。</p>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-lg bg-ocean text-white px-3 py-2 text-xs"
                  onClick={() => handleCheckout("pro-month")}
                >
                  升级 Pro 月付
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-storm px-3 py-2 text-xs"
                  onClick={() => handleCheckout("pro-year")}
                >
                  升级 Pro 年付
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-storm px-3 py-2 text-xs"
                  onClick={handleRefreshUsage}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "刷新中" : "刷新额度"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-storm bg-white p-6 shadow-sm space-y-3">
              <h2 className="text-lg font-semibold">连接设置</h2>
              <label className="text-xs text-slate-500">BFF API 地址</label>
              <input
                className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                value={configApiBaseUrl}
                onChange={(event) => setConfigApiBaseUrl(event.target.value)}
              />
              <label className="text-xs text-slate-500">BYOK (仅 Pro)</label>
              <input
                className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                value={configByokKey}
                onChange={(event) => setConfigByokKey(event.target.value)}
                disabled={plan !== "pro"}
              />
              <button
                type="button"
                className="rounded-lg bg-slate-900 text-white px-4 py-2 text-xs"
                onClick={handleSaveConfig}
              >
                保存配置
              </button>
            </div>
          </section>
        )}

        {isLoggedIn && (
          <section className="rounded-2xl border border-storm bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">云端人设库</h2>
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => {
                  setPersonaForm(emptyPersona)
                  setEditingId(null)
                }}
              >
                清空表单
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <input
                  className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                  placeholder="人设名称"
                  value={personaForm.name}
                  onChange={(event) => setPersonaForm({ ...personaForm, name: event.target.value })}
                />
                <input
                  className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                  placeholder="核心身份"
                  value={personaForm.coreIdentity}
                  onChange={(event) => setPersonaForm({ ...personaForm, coreIdentity: event.target.value })}
                />
                <input
                  className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                  placeholder="公司/背景"
                  value={personaForm.companyInfo}
                  onChange={(event) => setPersonaForm({ ...personaForm, companyInfo: event.target.value })}
                />
                <input
                  className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                  placeholder="语气偏好"
                  value={personaForm.tonePreference}
                  onChange={(event) => setPersonaForm({ ...personaForm, tonePreference: event.target.value })}
                />
                <textarea
                  className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                  rows={3}
                  placeholder="个性规则（可选）"
                  value={personaForm.customRules}
                  onChange={(event) => setPersonaForm({ ...personaForm, customRules: event.target.value })}
                />
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={personaForm.isDefault}
                    onChange={(event) => setPersonaForm({ ...personaForm, isDefault: event.target.checked })}
                  />
                  设为默认人设
                </label>
                <button
                  type="button"
                  className="rounded-lg bg-ocean text-white px-4 py-2 text-xs"
                  onClick={handlePersonaSubmit}
                >
                  {editingId ? "更新人设" : "创建人设"}
                </button>
              </div>

              <div className="space-y-2">
                {personas.map((persona) => (
                  <div key={persona.id} className="border border-storm rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm">{persona.name}</div>
                        <div className="text-xs text-slate-500">{persona.coreIdentity}</div>
                      </div>
                      {persona.isDefault && <span className="text-xs text-ocean">默认</span>}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        className="text-xs text-slate-600"
                        onClick={() => handlePersonaEdit(persona)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-500"
                        onClick={() => handlePersonaDelete(persona.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {isLoggedIn && (
          <section className="rounded-2xl border border-storm bg-white p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">指标概览</h2>
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={handleRefreshUsage}
                disabled={isRefreshing}
              >
                {isRefreshing ? "刷新中" : "刷新"}
              </button>
            </div>
            <p className="text-xs text-slate-500">{metricsHint}</p>
            <div className="grid md:grid-cols-2 gap-3 text-xs text-slate-600">
              {metricsRows.map((row) => (
                <div key={row.day} className="rounded-xl border border-storm p-3">
                <div className="font-semibold text-slate-700">
                  {new Date(row.day).toLocaleDateString("zh-CN")}
                </div>
                  <div className="mt-1">打开: {row.panel_users}</div>
                  <div>生成: {row.generate_users}</div>
                  <div>复制: {row.copy_users}</div>
                  <div>Paywall: {row.paywall_users}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {status && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>{status}</span>
            {showPersonaUpgrade && (
              <button type="button" className="text-xs text-amber-700 underline" onClick={() => handleCheckout("pro-month")}>
                升级 Pro
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
