import "../style.css"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ComplianceProfile, MetricEventType } from "@formpilot/shared"
import { createStreamParser } from "../lib/streamParser"
import { maskSensitiveText, restoreMaskedText } from "../lib/pii"
import {
  fetchComplianceProfile,
  fetchUsage,
  generateContent,
  redeemInvite,
  sendMetric,
  type GenerateMeta
} from "../lib/api"
import {
  clearLongDocDraft,
  getAuthState,
  getLongDocDraft,
  setLongDocDraft,
  type AuthState
} from "../lib/storage"

const LONG_DOC_CONTEXT_DESCRIPTION = "FormPilot Ads Compliance Focus Mode"
const DRAFT_SAVE_DELAY_MS = 800
const RECHARGE_URL = process.env.PLASMO_PUBLIC_RECHARGE_URL || "https://formpilot.ai/recharge"

function formatDraftTimeLabel(timestamp: number): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? "刚刚" : date.toLocaleString("zh-CN")
}

function buildHint(goal: string): string {
  return goal.trim()
}

function missingFieldWarnings(profile: ComplianceProfile | null, hasContextPool: boolean): string[] {
  if (hasContextPool) {
    return []
  }

  if (!profile) {
    return ["可选增强：补充企业资质库（公司名、官网、主营业务）可提升稳定性。"]
  }

  const mapping: Array<[boolean, string]> = [
    [!profile.legalName.trim(), "缺少【公司法定名称】"],
    [!profile.website.trim(), "缺少【官网】"],
    [!profile.businessCategory.trim(), "缺少【主营业务】"],
    [!profile.fulfillmentModel.trim(), "缺少【履约模式】"],
    [!profile.returnPolicyUrl.trim(), "缺少【退换货政策链接】"],
    [!profile.supportEmail.trim(), "缺少【客服邮箱】"],
    [!profile.supportPhone.trim(), "缺少【客服电话】"]
  ]

  return mapping.filter(([missing]) => missing).map(([, message]) => message)
}

function filenameFromTitle(title: string): string {
  const trimmed = title.trim() || "formpilot-ads-appeal"
  return trimmed
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60)
}

export function LongDocWorkspace() {
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [credits, setCredits] = useState(0)
  const [profile, setProfile] = useState<ComplianceProfile | null>(null)
  const [docTitle, setDocTitle] = useState("")
  const [goal, setGoal] = useState("")
  const [reference, setReference] = useState("")
  const [output, setOutput] = useState("")
  const [translation, setTranslation] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [draftNotice, setDraftNotice] = useState("")
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [meta, setMeta] = useState<GenerateMeta | null>(null)
  const [maskedNotice, setMaskedNotice] = useState("")
  const [needRecharge, setNeedRecharge] = useState(false)
  const [requiredCredits, setRequiredCredits] = useState(0)
  const [rechargeCode, setRechargeCode] = useState("")
  const [rechargeStatus, setRechargeStatus] = useState("")
  const [recharging, setRecharging] = useState(false)
  const [sendContextPool, setSendContextPool] = useState(true)

  const copyTimerRef = useRef<number | null>(null)
  const didTrackOpenRef = useRef(false)

  const trackMetric = useCallback(
    async (eventType: MetricEventType, metadata?: Record<string, string | number | boolean>) => {
      try {
        await sendMetric({ eventType, metadata })
      } catch {
        // ignore metric errors
      }
    },
    []
  )

  const refreshAccount = useCallback(async () => {
    const [auth, draft] = await Promise.all([getAuthState(), getLongDocDraft()])
    setAuthState(auth)

    if (draft && (draft.title || draft.goal || draft.reference)) {
      setDocTitle(draft.title)
      setGoal(draft.goal)
      setReference(draft.reference)
      setDraftNotice(`已恢复草稿（${formatDraftTimeLabel(draft.updatedAt)}）`)
    }
    setDraftLoaded(true)

    if (!auth) {
      setCredits(0)
      setProfile(null)
      if (!didTrackOpenRef.current) {
        didTrackOpenRef.current = true
        void trackMetric("longdoc_open", { loggedIn: false })
      }
      return
    }

    const [usage, profileData] = await Promise.all([fetchUsage(), fetchComplianceProfile()])
    setCredits(usage?.credits || 0)
    setProfile(profileData)

    if (!didTrackOpenRef.current) {
      didTrackOpenRef.current = true
      void trackMetric("longdoc_open", { loggedIn: true })
    }
  }, [trackMetric])

  useEffect(() => {
    void refreshAccount()

    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [refreshAccount])

  useEffect(() => {
    if (!draftLoaded) return
    const timer = window.setTimeout(() => {
      const hasContent = Boolean(docTitle.trim() || goal.trim() || reference.trim())
      if (!hasContent) {
        void clearLongDocDraft()
        return
      }
      void setLongDocDraft({
        title: docTitle,
        goal,
        reference
      })
    }, DRAFT_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [draftLoaded, docTitle, goal, reference])

  const isLoggedIn = Boolean(authState)
  const hasDraftContent = Boolean(docTitle.trim() || goal.trim() || reference.trim())
  const hasContextPool = Boolean(reference.trim())
  const estimatedCost = useMemo(() => {
    if (reference.trim().length > 7000) return 10
    return 5
  }, [reference])
  const complianceWarnings = useMemo(() => {
    const merged = [...(meta?.missingFields || []), ...missingFieldWarnings(profile, hasContextPool)]
    return Array.from(new Set(merged.filter((item) => item && item.trim())))
  }, [meta, profile, hasContextPool])

  const handleSaveDraft = useCallback(async () => {
    if (!hasDraftContent) {
      await clearLongDocDraft()
      setDraftNotice("已清空草稿")
      return
    }

    await setLongDocDraft({
      title: docTitle,
      goal,
      reference
    })
    setDraftNotice(`草稿已手动保存（${formatDraftTimeLabel(Date.now())}）`)
  }, [hasDraftContent, docTitle, goal, reference])

  const handleGenerate = useCallback(async () => {
    setStatus("")
    setError("")
    setTranslation("")
    setMeta(null)
    setNeedRecharge(false)
    setRequiredCredits(0)
    setRechargeStatus("")

    if (!isLoggedIn) {
      setError("请先登录后再生成")
      return
    }

    const hint = buildHint(goal)
    const contextPool = reference.trim()
    const effectiveContextPool = sendContextPool ? contextPool : ""
    if (!hint && !effectiveContextPool) {
      setError("请先输入文档目标，或启用并填写 Context Pool")
      return
    }

    setOutput("")
    setIsGenerating(true)
    setMaskedNotice("")
    let hadError = false
    let generatedChars = 0
    const maskedPairs: Array<[string, string]> = []

    const parser = createStreamParser({
      onTranslation: (text) => setTranslation((prev) => prev + text),
      onReply: (text) => {
        const restored = restoreMaskedText(text, maskedPairs)
        generatedChars += restored.length
        setOutput((prev) => prev + restored)
      }
    })

    try {
      let maskIndex = 1
      const maskedHint = maskSensitiveText(hint, maskIndex)
      maskIndex = maskedHint.nextIndex
      const maskedContextPool = maskSensitiveText(effectiveContextPool, maskIndex)
      maskedPairs.push(...maskedHint.pairs, ...maskedContextPool.pairs)
      if (maskedPairs.length > 0) {
        setMaskedNotice(`已在本地脱敏 ${maskedPairs.length} 处敏感信息`)
      }

      await generateContent(
        {
          pageContext: {
            title: docTitle.trim() || "Google Ads Appeal Focus Mode",
            description: LONG_DOC_CONTEXT_DESCRIPTION,
            lang: "en",
            url: window.location.href
          },
          fieldContext: {
            label: docTitle.trim() || "Appeal Topic",
            placeholder: "Complete appeal body",
            type: "textarea",
            surroundingText: LONG_DOC_CONTEXT_DESCRIPTION
          },
          scenario: "ads_compliance",
          complianceSnapshot: profile || undefined,
          userHint: maskedHint.masked,
          mode: "longDoc",
          contextPool: sendContextPool && maskedContextPool.masked ? maskedContextPool.masked : undefined,
          useGlobalContext: false
        },
        {
          onToken: (token) => parser.push(token),
          onMeta: (nextMeta) => setMeta(nextMeta),
          onError: (message, details) => {
            hadError = true
            if (details?.errorCode === "INSUFFICIENT_CREDITS") {
              const required = details.requiredCredits || estimatedCost
              setNeedRecharge(true)
              setRequiredCredits(required)
              setError("")
              setStatus("")
              setRechargeStatus(
                `当前余额不足。此任务需 ${required} 点，请先输入企业充值码。`
              )
              void trackMetric("paywall_shown", {
                reason: "insufficient_credits",
                mode: "longDoc",
                requiredCredits: required
              })
              return
            }
            setError(message || "生成失败")
          }
        }
      )

      const usage = await fetchUsage()
      setCredits(usage?.credits || credits)
      if (!hadError) {
        setStatus("长文档生成完成")
        void trackMetric("longdoc_generate_success", {
          chars: generatedChars,
          hasContextPool,
          contextPoolSent: sendContextPool && Boolean(maskedContextPool.masked)
        })
      }
    } finally {
      parser.flush()
      setIsGenerating(false)
    }
  }, [isLoggedIn, goal, reference, docTitle, profile, trackMetric, credits, hasContextPool, sendContextPool])

  const handleRedeem = useCallback(async () => {
    if (!isLoggedIn) {
      setRechargeStatus("请先登录")
      return
    }

    const code = rechargeCode.trim()
    if (!code) {
      setRechargeStatus("请输入充值码")
      return
    }

    setRecharging(true)
    setRechargeStatus("")
    try {
      const result = await redeemInvite(code)
      setCredits(result.credits)
      setNeedRecharge(false)
      setRechargeCode("")
      setRechargeStatus(
        `兑换成功，已到账 ${result.creditsAdded} 点。当前余额 ${result.credits} 点，请重新生成。`
      )
    } catch (redeemError) {
      setRechargeStatus(redeemError instanceof Error ? redeemError.message : "兑换失败")
    } finally {
      setRecharging(false)
    }
  }, [isLoggedIn, rechargeCode])

  const handleCopy = useCallback(async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    setCopied(true)
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800)
    void trackMetric("longdoc_copy_success", { chars: output.length })
  }, [output, trackMetric])

  const handleDownload = useCallback(() => {
    if (!output) return
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${filenameFromTitle(docTitle)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    void trackMetric("longdoc_download", { chars: output.length })
  }, [output, docTitle, trackMetric])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-4 px-5 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-800/90 px-5 py-4">
          <div>
            <h1 className="text-xl font-semibold">Google Ads Appeal Focus Mode</h1>
            <p className="text-xs text-slate-300">
              专为长文本申诉优化。当前余额 {credits} 点，本次预计消耗 {meta?.creditsCost || estimatedCost} 点。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
              onClick={handleSaveDraft}
            >
              保存草稿
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
              onClick={async () => {
                await clearLongDocDraft()
                setDocTitle("")
                setGoal("")
                setReference("")
                setDraftNotice("已清空草稿")
              }}
            >
              清空草稿
            </button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/90 p-4">
          <input
            className="w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm"
            placeholder="申诉主题（例如：Business Operations Verification）"
            value={docTitle}
            onChange={(event) => setDocTitle(event.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm"
            rows={5}
            placeholder="明确你的目标和要表达的核心业务事实"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm"
            rows={7}
            placeholder="临时上下文池（Context Pool）：可粘贴商业计划、供应链说明、官网 About Us、工单记录等"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              id="sendContextPool"
              checked={sendContextPool}
              onChange={(event) => setSendContextPool(event.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
            />
            <label htmlFor="sendContextPool" className="cursor-pointer">
              发送 Context Pool（若本次申请包含商业机密，可取消勾选，仅发送“文档目标”）
            </label>
          </div>
          {complianceWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-100/90 p-3 text-xs text-amber-900">
              <div className="font-semibold">可选增强：补全资质库可提升通过稳定性</div>
              <div className="mt-1 leading-5">{complianceWarnings.join("；")}</div>
            </div>
          )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                      >
                        {isGenerating ? "生成中..." : `生成完整申诉信 (${estimatedCost} 点)`}
                      </button>
                      <button type="button" className="rounded-lg border border-slate-600 px-3 py-2 text-xs" onClick={handleCopy}>
                        {copied ? "已复制" : "复制正文"}
                      </button>
                      <button type="button" className="rounded-lg border border-slate-600 px-3 py-2 text-xs" onClick={handleDownload}>
                        下载文本
                      </button>
                    </div>
                    {needRecharge && (
                      <div className="rounded-lg border border-amber-300 bg-amber-100/90 p-3 text-xs text-amber-900">
                        <div className="font-semibold">余额不足，需 {requiredCredits || estimatedCost} 点</div>
                        <div className="mt-1">请输入充值码后继续生成完整申诉信。</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input
                            className="min-w-[260px] flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs uppercase tracking-wider text-slate-800"
                            value={rechargeCode}
                            onChange={(event) => setRechargeCode(event.target.value)}
                            placeholder="FP-ADS-XXXX"
                          />
                          <button
                            type="button"
                            className="rounded-md bg-amber-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                            onClick={handleRedeem}
                            disabled={recharging}
                          >
                            {recharging ? "兑换中..." : "兑换充值码"}
                          </button>
                        </div>
                        <div className="mt-3">
                          <a
                            href={RECHARGE_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded bg-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-300 transition"
                          >
                            [获取专属充值码]
                          </a>
                        </div>
                      </div>
                    )}
            {draftNotice && <div className="text-xs text-slate-300">{draftNotice}</div>}
            {maskedNotice && <div className="text-xs text-slate-300">{maskedNotice}</div>}
            {rechargeStatus && <div className="text-xs text-amber-200">{rechargeStatus}</div>}
            {status && <div className="text-xs text-emerald-300">{status}</div>}
            {error && <div className="text-xs text-rose-300">{error}</div>}
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            {translation && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-3 text-xs text-slate-300">
                <div className="mb-1 text-[11px] text-slate-400">中文对照</div>
                <div className="whitespace-pre-wrap leading-6">{translation}</div>
              </div>
            )}
            <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-3">
              <div className="mb-2 text-[11px] text-slate-400">英文提交正文</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-slate-100">
                {output || "生成结果将在这里显示"}
              </pre>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
