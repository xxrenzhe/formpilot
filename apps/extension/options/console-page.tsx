import "../style.css"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ComplianceProfile } from "@formpilot/shared"
import { fetchComplianceProfile, fetchUsage, redeemInvite, upsertComplianceProfile } from "../lib/api"
import { consumeOAuthRedirect, signInWithEmail, signInWithGoogle, signOut, signUpWithEmail } from "../lib/supabase"
import { getAppConfig, getAuthState, setAppConfig, setAuthState } from "../lib/storage"

const EMPTY_PROFILE: ComplianceProfile = {
  legalName: "",
  website: "",
  businessCategory: "",
  hasOwnFactory: false,
  fulfillmentModel: "",
  returnPolicyUrl: "",
  supportEmail: "",
  supportPhone: "",
  additionalEvidence: ""
}

export default function OptionsConsolePage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [authEmail, setAuthEmail] = useState("")
  const [credits, setCredits] = useState(0)
  const [lifetimeUsed, setLifetimeUsed] = useState(0)
  const [trialHint, setTrialHint] = useState("")
  const [profile, setProfile] = useState<ComplianceProfile>(EMPTY_PROFILE)
  const [status, setStatus] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [inviteStatus, setInviteStatus] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState("")

  const isLoggedIn = useMemo(() => Boolean(authEmail), [authEmail])

  const refreshAccount = useCallback(async () => {
    const auth = await getAuthState()
    if (!auth) {
      setAuthEmail("")
      setCredits(0)
      setLifetimeUsed(0)
      setTrialHint("")
      setProfile(EMPTY_PROFILE)
      return
    }

    setAuthEmail(auth.email)
    const [usage, profileData] = await Promise.all([fetchUsage(), fetchComplianceProfile()])
    if (usage) {
      setCredits(usage.credits)
      setLifetimeUsed(usage.lifetimeUsed)
      setTrialHint(usage.trialHint || "")
    }
    if (profileData) {
      setProfile(profileData)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const config = await getAppConfig()
      setApiBaseUrl(config.apiBaseUrl)

      const consumed = await consumeOAuthRedirect()
      if (consumed) {
        setStatus("已完成 Google 登录")
      }

      await refreshAccount()
    }

    void init()
  }, [refreshAccount])

  const handleLogin = useCallback(async () => {
    setStatus("")
    try {
      await signInWithEmail(email, password)
      await refreshAccount()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "登录失败")
    }
  }, [email, password, refreshAccount])

  const handleRegister = useCallback(async () => {
    setStatus("")
    try {
      await signUpWithEmail(email, password)
      await refreshAccount()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "注册失败")
    }
  }, [email, password, refreshAccount])

  const handleLogout = useCallback(async () => {
    await signOut()
    await setAuthState(null)
    await refreshAccount()
  }, [refreshAccount])

  const handleSaveProfile = useCallback(async () => {
    setStatus("")
    setIsSaving(true)
    try {
      const saved = await upsertComplianceProfile(profile)
      setProfile(saved)
      setStatus("合规资质库已保存")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败")
    } finally {
      setIsSaving(false)
    }
  }, [profile])

  const handleRedeem = useCallback(async () => {
    setInviteStatus("")
    const code = inviteCode.trim()
    if (!code) {
      setInviteStatus("请输入充值码")
      return
    }

    try {
      const result = await redeemInvite(code)
      setInviteStatus(`充值成功，到账 ${result.creditsAdded} 点，当前余额 ${result.credits} 点`)
      setInviteCode("")
      await refreshAccount()
    } catch (error) {
      setInviteStatus(error instanceof Error ? error.message : "充值失败")
    }
  }, [inviteCode, refreshAccount])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-ink">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">FormPilot 合规控制台</h1>
            <p className="text-sm text-slate-500">Google Ads 申诉与 API 申请专用。</p>
          </div>
          {isLoggedIn && (
            <button type="button" className="rounded-full border border-storm px-4 py-2 text-xs" onClick={handleLogout}>
              退出登录
            </button>
          )}
        </header>

        {!isLoggedIn && (
          <section className="rounded-2xl border border-storm bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">登录或注册</h2>
            <div className="grid gap-4 md:grid-cols-2">
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
                  <button type="button" className="flex-1 rounded-lg bg-ocean py-2 text-sm text-white" onClick={handleLogin}>
                    登录
                  </button>
                  <button type="button" className="flex-1 rounded-lg border border-storm py-2 text-sm" onClick={handleRegister}>
                    注册
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <div className="mb-2">快速登录</div>
                <button
                  type="button"
                  className="w-full rounded-lg bg-slate-900 py-2 text-sm text-white"
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
                <p className="mt-3 text-xs text-slate-500">登录完成后自动回到此页面。</p>
              </div>
            </div>
          </section>
        )}

        {isLoggedIn && (
          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-storm bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">账号与点数</h2>
              <p className="mt-2 text-sm text-slate-600">当前账号：{authEmail}</p>
              <p className="text-sm text-slate-600">剩余点数：{credits}</p>
              <p className="text-xs text-slate-500">累计消耗：{lifetimeUsed} 点</p>
              {trialHint && <p className="text-xs text-amber-700">{trialHint}</p>}
              <button
                type="button"
                className="mt-3 rounded-lg border border-storm px-3 py-2 text-xs"
                onClick={() => {
                  void refreshAccount()
                }}
              >
                刷新余额
              </button>
            </div>

            <div className="rounded-2xl border border-storm bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">充值码</h2>
              <p className="text-xs text-slate-500">输入 16 位企业充值码，点数即时到账。</p>
              <input
                className="mt-3 w-full rounded-lg border border-storm px-3 py-2 text-sm uppercase tracking-wider"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="FP-ADS-XXXX-XXXX-XXXX-XXXX"
              />
              <button type="button" className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs text-white" onClick={handleRedeem}>
                兑换充值码
              </button>
              {inviteStatus && <p className="mt-2 text-xs text-slate-600">{inviteStatus}</p>}
            </div>
          </section>
        )}

        {isLoggedIn && (
          <section className="rounded-2xl border border-storm bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">合规资质库 (Fact-based Vault)</h2>
              <p className="text-xs text-slate-500">只填真实事实，系统会自动包装成审核友好的专业表达。</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                placeholder="公司法定名称"
                value={profile.legalName}
                onChange={(event) => setProfile((prev) => ({ ...prev, legalName: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                placeholder="官网 URL"
                value={profile.website}
                onChange={(event) => setProfile((prev) => ({ ...prev, website: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                placeholder="主营业务"
                value={profile.businessCategory}
                onChange={(event) => setProfile((prev) => ({ ...prev, businessCategory: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                placeholder="履约模式（如自建仓/第三方仓）"
                value={profile.fulfillmentModel}
                onChange={(event) => setProfile((prev) => ({ ...prev, fulfillmentModel: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                placeholder="退换货政策链接"
                value={profile.returnPolicyUrl}
                onChange={(event) => setProfile((prev) => ({ ...prev, returnPolicyUrl: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                placeholder="客服邮箱"
                value={profile.supportEmail}
                onChange={(event) => setProfile((prev) => ({ ...prev, supportEmail: event.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-storm px-3 py-2 text-sm"
                placeholder="客服电话"
                value={profile.supportPhone}
                onChange={(event) => setProfile((prev) => ({ ...prev, supportPhone: event.target.value }))}
              />
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={profile.hasOwnFactory}
                  onChange={(event) => setProfile((prev) => ({ ...prev, hasOwnFactory: event.target.checked }))}
                />
                是否有自有工厂
              </label>
            </div>

            <textarea
              className="mt-4 w-full rounded-lg border border-storm px-3 py-2 text-sm"
              rows={4}
              placeholder="补充证据（可选）"
              value={profile.additionalEvidence || ""}
              onChange={(event) => setProfile((prev) => ({ ...prev, additionalEvidence: event.target.value }))}
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-lg bg-ocean px-4 py-2 text-xs text-white"
                onClick={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving ? "保存中..." : "保存资质库"}
              </button>
              <span className="text-xs text-slate-500">🔒 Tax ID 等敏感数据会在浏览器本地脱敏后再发给 AI。</span>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-storm bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">连接设置</h2>
          <label className="mt-2 block text-xs text-slate-500">BFF API 地址</label>
          <input
            className="mt-2 w-full rounded-lg border border-storm px-3 py-2 text-sm"
            value={apiBaseUrl}
            onChange={(event) => setApiBaseUrl(event.target.value)}
          />
          <button
            type="button"
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs text-white"
            onClick={async () => {
              await setAppConfig({ apiBaseUrl })
              setStatus("配置已保存")
            }}
          >
            保存配置
          </button>
        </section>

        {status && <div className="text-sm text-slate-600">{status}</div>}
      </div>
    </div>
  )
}
