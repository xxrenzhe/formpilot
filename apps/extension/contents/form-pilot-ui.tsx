import "../style.css"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PlasmoCSConfig } from "plasmo"
import type { ComplianceProfile, FieldContext, GenerateMode, MetricEventType } from "@formpilot/shared"
import { isLikelyAdsScenario } from "@formpilot/shared"
import { extractFieldContext, extractPageContext, detectLongDoc } from "./extractor"
import { extractGlobalContext } from "./globalContext"
import FormPilotPanel from "./form-pilot-panel"
import { createStreamParser } from "../lib/streamParser"
import { containsSensitiveValue, maskSensitiveText, restoreMaskedText } from "../lib/pii"
import {
  fetchComplianceProfile,
  fetchUsage,
  generateContent,
  redeemInvite,
  sendMetric,
  sendPromptFeedback,
  type GenerateMeta
} from "../lib/api"
import { getAuthState, type AuthState } from "../lib/storage"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

export async function createShadowRoot(shadowHost: Element): Promise<ShadowRoot> {
  return shadowHost.attachShadow({ mode: "closed" })
}

const PANEL_WIDTH = 390
const PANEL_DEFAULT_TOP = 80
const PANEL_DEFAULT_LEFT_PADDING = 24
const PANEL_OPEN_BATCH_WINDOW_MS = 5000

function isSupportedInput(target: HTMLElement): target is HTMLInputElement | HTMLTextAreaElement {
  const tag = target.tagName.toLowerCase()
  if (tag === "textarea") return true
  if (tag !== "input") return false
  const type = (target.getAttribute("type") || "text").toLowerCase()
  return ["text", "search", "url", "tel", "email", "file"].includes(type)
}

function calcPosition(rect: DOMRect | null) {
  if (!rect) {
    return { top: PANEL_DEFAULT_TOP, left: window.innerWidth - PANEL_WIDTH - PANEL_DEFAULT_LEFT_PADDING }
  }
  const top = Math.min(rect.bottom + 8, window.innerHeight - 430)
  const left = Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 16)
  return { top: Math.max(16, top), left: Math.max(16, left) }
}

function sniffScenario(): "general" | "ads_compliance" {
  const context = extractPageContext()
  return isLikelyAdsScenario({
    url: context.url,
    title: context.title,
    description: context.description
  })
    ? "ads_compliance"
    : "general"
}

function resolveCost(field: FieldContext | null, userHint: string, globalContextLength: number): number {
  if (!field) return 1
  const fieldSignal = `${field.label} ${field.placeholder} ${field.surroundingText || ""}`.toLowerCase()
  if (
    globalContextLength > 7000 ||
    field.type.toLowerCase().includes("file") ||
    fieldSignal.includes("upload") ||
    fieldSignal.includes("attachment") ||
    userHint.length > 2500
  ) {
    return 10
  }
  if (detectLongDoc(field)) {
    return 5
  }
  return 1
}

function missingFieldWarnings(profile: ComplianceProfile | null): string[] {
  if (!profile) {
    return ["请先在控制台补充企业法定名称、官网、主营业务与退换货政策链接。"]
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
  return mapping.filter(([missing]) => missing).map(([, label]) => label)
}

function teaserText(requiredCredits: number): string {
  return `Dear Google Ads Review Team,\n\nWe operate a legitimate cross-border ecommerce business with transparent fulfillment and customer support procedures. We have completed internal policy checks and strengthened ad-account safeguards to ensure ongoing compliance.\n\n[后续完整方案已锁定，解锁需 ${requiredCredits} 点]`
}

export default function FormPilotUi() {
  const [activeField, setActiveField] = useState<FieldContext | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [reply, setReply] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")
  const [userHint, setUserHint] = useState("")
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [copied, setCopied] = useState(false)
  const [usageCredits, setUsageCredits] = useState(0)
  const [accountHint, setAccountHint] = useState("")
  const [scenario, setScenario] = useState<"general" | "ads_compliance">("general")
  const [complianceProfile, setComplianceProfile] = useState<ComplianceProfile | null>(null)
  const [shouldBlurReply, setShouldBlurReply] = useState(false)
  const [hasMaskedHint, setHasMaskedHint] = useState(false)
  const [sensitiveInputDetected, setSensitiveInputDetected] = useState(false)
  const [rechargeCode, setRechargeCode] = useState("")
  const [rechargeStatus, setRechargeStatus] = useState("")
  const [recharging, setRecharging] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [lastMeta, setLastMeta] = useState<GenerateMeta | null>(null)

  const panelPosition = useMemo(() => calcPosition(anchorRect), [anchorRect])
  const panelRootRef = useRef<HTMLDivElement | null>(null)
  const copyTimerRef = useRef<number | null>(null)
  const teaserTimerRef = useRef<number | null>(null)
  const maskedPairsRef = useRef<Array<[string, string]>>([])
  const panelOpenBatchRef = useRef<{ count: number; sources: Set<string>; timer: number | null }>({
    count: 0,
    sources: new Set<string>(),
    timer: null
  })

  const complianceWarnings = useMemo(() => {
    if (scenario !== "ads_compliance") return []
    const merged = [...(lastMeta?.missingFields || []), ...missingFieldWarnings(complianceProfile)]
    return Array.from(new Set(merged.filter((item) => item && item.trim())))
  }, [scenario, complianceProfile, lastMeta])

  const estimatedCost = useMemo(() => {
    const globalContextLength = userHint.length > 0 ? 4000 : 2000
    return resolveCost(activeField, userHint, globalContextLength)
  }, [activeField, userHint])

  const flushPanelOpenMetrics = useCallback(async () => {
    const batch = panelOpenBatchRef.current
    if (batch.count === 0) return

    const count = batch.count
    const sources = Array.from(batch.sources)
    batch.count = 0
    batch.sources.clear()
    if (batch.timer) {
      window.clearTimeout(batch.timer)
      batch.timer = null
    }

    const metadata: Record<string, string | number | boolean> = {
      batched: true,
      count
    }
    if (sources.length) {
      metadata.sources = sources.join(",")
    }

    try {
      await sendMetric({
        eventType: "panel_open",
        metadata
      })
    } catch {
      // ignore metrics errors
    }
  }, [])

  const queuePanelOpenMetric = useCallback(
    (source: string) => {
      const batch = panelOpenBatchRef.current
      batch.count += 1
      batch.sources.add(source)
      if (batch.timer) return

      batch.timer = window.setTimeout(() => {
        void flushPanelOpenMetrics()
      }, PANEL_OPEN_BATCH_WINDOW_MS)
    },
    [flushPanelOpenMetrics]
  )

  const trackMetric = useCallback(
    async (eventType: MetricEventType, metadata?: Record<string, string | number | boolean>) => {
      if (eventType === "panel_open") {
        const source = typeof metadata?.source === "string" ? metadata.source : "unknown"
        queuePanelOpenMetric(source)
        return
      }

      try {
        await sendMetric({ eventType, metadata })
      } catch {
        // ignore metrics errors
      }
    },
    [queuePanelOpenMetric]
  )

  const refreshAccount = useCallback(async () => {
    const auth = await getAuthState()
    setAuthState(auth)
    if (!auth) {
      setUsageCredits(0)
      setAccountHint("")
      setComplianceProfile(null)
      return
    }

    const [usageData, profile] = await Promise.all([fetchUsage(), fetchComplianceProfile()])
    if (usageData) {
      setUsageCredits(usageData.credits)
      setAccountHint(usageData.trialHint || "")
    }
    setComplianceProfile(profile)
  }, [])

  const activateField = useCallback((target: HTMLElement | null, source: "shortcut" | "bubble" | "manual") => {
    const currentScenario = sniffScenario()
    setScenario(currentScenario)

    if (target && isSupportedInput(target)) {
      const field = extractFieldContext(target)
      setActiveField(field)
      setAnchorRect(target.getBoundingClientRect())
      setSensitiveInputDetected(containsSensitiveValue((target as HTMLInputElement | HTMLTextAreaElement).value || ""))
    } else {
      setActiveField({
        label: "Google Ads Appeal",
        placeholder: "Describe your appeal objective",
        type: "textarea",
        surroundingText: ""
      })
      setAnchorRect(null)
      setSensitiveInputDetected(false)
    }

    setPanelOpen(true)
    setReply("")
    setError("")
    setShouldBlurReply(false)
    setRechargeCode("")
    setRechargeStatus("")
    setLastMeta(null)
    setHasMaskedHint(false)
    void trackMetric("panel_open", { source })
  }, [trackMetric])

  useEffect(() => {
    const listener = (message: { action?: string; text?: string }) => {
      if (message.action === "openManual") {
        setUserHint(message.text || "")
        activateField(null, "manual")
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [activateField])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "m") return
      if (event.repeat) return
      const path = event.composedPath()
      if (panelRootRef.current && path.includes(panelRootRef.current)) return
      event.preventDefault()
      const target = document.activeElement as HTMLElement | null
      activateField(target, "shortcut")
    }

    const visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        void flushPanelOpenMetrics()
      }
    }

    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== "local") return
      if (changes.authState) {
        const nextState = (changes.authState.newValue as AuthState | null) || null
        setAuthState(nextState)
        if (nextState) {
          void refreshAccount()
        } else {
          setUsageCredits(0)
          setAccountHint("")
          setComplianceProfile(null)
        }
      }
    }

    document.addEventListener("keydown", handleShortcut, true)
    document.addEventListener("visibilitychange", visibilityHandler)
    chrome.storage.onChanged.addListener(storageListener)
    void refreshAccount()

    return () => {
      document.removeEventListener("keydown", handleShortcut, true)
      document.removeEventListener("visibilitychange", visibilityHandler)
      chrome.storage.onChanged.removeListener(storageListener)
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
      if (teaserTimerRef.current) {
        window.clearInterval(teaserTimerRef.current)
      }
      void flushPanelOpenMetrics()
    }
  }, [flushPanelOpenMetrics, refreshAccount, activateField])

  useEffect(() => {
    if (!panelOpen) return
    const target = document.activeElement as HTMLElement | null
    if (!target || !isSupportedInput(target)) return

    const poll = () => {
      const value = (target as HTMLInputElement | HTMLTextAreaElement).value || ""
      setSensitiveInputDetected(containsSensitiveValue(value))
    }

    poll()
    const timer = window.setInterval(poll, 500)
    return () => window.clearInterval(timer)
  }, [panelOpen, activeField])

  const startGeneration = useCallback(
    async (overrideHint?: string) => {
      if (!activeField) return
      if (!authState) {
        setError("请先登录")
        return
      }

      setReply("")
      setIsGenerating(true)
      setError("")
      setShouldBlurReply(false)
      setRechargeStatus("")
      setLastMeta(null)
      if (teaserTimerRef.current) {
        window.clearInterval(teaserTimerRef.current)
        teaserTimerRef.current = null
      }
      let hadError = false
      let blockedByCredits = false

      const parser = createStreamParser({
        onTranslation: () => {
          // translation block removed in panel UI
        },
        onReply: (text) => {
          const restored = restoreMaskedText(text, maskedPairsRef.current)
          setReply((prev) => prev + restored)
        }
      })

      try {
        const pageContext = extractPageContext()
        const currentScenario = sniffScenario()
        setScenario(currentScenario)
        if (overrideHint) {
          void trackMetric("rewrite_click", {
            scenario: currentScenario,
            tweak: true
          })
        }
        const useGlobalContext = true
        const globalContext = extractGlobalContext()
        const resolvedHint = typeof overrideHint === "string" ? `${userHint}\n${overrideHint}`.trim() : userHint
        const maskedHint = maskSensitiveText(resolvedHint, 1)
        const maskedGlobal = maskSensitiveText(globalContext, maskedHint.nextIndex)
        maskedPairsRef.current = [...maskedHint.pairs, ...maskedGlobal.pairs]
        setHasMaskedHint(maskedPairsRef.current.length > 0)

        await generateContent(
          {
            pageContext,
            fieldContext: activeField,
            scenario: currentScenario,
            complianceSnapshot: complianceProfile || undefined,
            userHint: maskedHint.masked,
            mode: detectLongDoc(activeField) ? "longDoc" : ("shortText" as GenerateMode),
            useGlobalContext,
            globalContext: maskedGlobal.masked
          },
          {
            onToken: (token) => parser.push(token),
            onMeta: (meta) => {
              setLastMeta(meta)
            },
            onError: (message, details) => {
              hadError = true
              if (details?.errorCode === "INSUFFICIENT_CREDITS") {
                blockedByCredits = true
                const teaser = teaserText(details.requiredCredits || estimatedCost)
                setReply("")
                setShouldBlurReply(false)
                setRechargeStatus("余额不足，请输入充值码后重新生成完整方案。")
                let cursor = 0
                teaserTimerRef.current = window.setInterval(() => {
                  cursor += 8
                  setReply(teaser.slice(0, cursor))
                  if (cursor >= teaser.length) {
                    if (teaserTimerRef.current) {
                      window.clearInterval(teaserTimerRef.current)
                      teaserTimerRef.current = null
                    }
                    setShouldBlurReply(true)
                  }
                }, 20)
                void trackMetric("paywall_shown", {
                  reason: "insufficient_credits",
                  requiredCredits: details.requiredCredits || estimatedCost
                })
              } else {
                setError(message)
              }
            }
          }
        )

        const usageData = await fetchUsage()
        if (usageData) {
          setUsageCredits(usageData.credits)
          setAccountHint(usageData.trialHint || "")
        }
        if (!hadError && !blockedByCredits) {
          void trackMetric("generate_success", {
            scenario: currentScenario,
            mode: detectLongDoc(activeField) ? "longDoc" : "shortText"
          })
        }
      } finally {
        parser.flush()
        setIsGenerating(false)
      }
    },
    [activeField, authState, userHint, complianceProfile, estimatedCost, trackMetric]
  )

  const handleCopy = useCallback(async () => {
    if (!reply) return
    await navigator.clipboard.writeText(reply)
    setCopied(true)
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800)
    void trackMetric("copy_success", { scenario })
  }, [reply, scenario, trackMetric])

  const openLongDocWorkspace = useCallback(() => {
    const url = chrome.runtime.getURL("options.html#longdoc")
    if (chrome.windows?.create) {
      chrome.windows.create({
        url,
        type: "popup",
        width: 1160,
        height: 780,
        focused: true
      })
      return
    }
    chrome.runtime.openOptionsPage()
  }, [])

  const handleRedeemCode = useCallback(async () => {
    if (!authState) {
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
      setUsageCredits(result.credits)
      setAccountHint("")
      setError("")
      setShouldBlurReply(false)
      setReply("")
      setRechargeCode("")
      setRechargeStatus(`兑换成功，已到账 ${result.creditsAdded} 点。当前余额 ${result.credits} 点，请重新生成。`)
    } catch (error) {
      setRechargeStatus(error instanceof Error ? error.message : "兑换失败")
    } finally {
      setRecharging(false)
    }
  }, [authState, rechargeCode])

  if (!panelOpen) {
    const iconPosition = {
      top: window.innerHeight - 74,
      left: window.innerWidth - 174
    }
    return (
      <FormPilotPanel
        panelOpen={false}
        reply={reply}
        isGenerating={isGenerating}
        error={error}
        userHint={userHint}
        copied={copied}
        isLoggedIn={Boolean(authState)}
        scenario={scenario}
        credits={usageCredits}
        accountHint={accountHint}
        estimatedCost={estimatedCost}
        complianceWarnings={complianceWarnings}
        hasMaskedHint={hasMaskedHint || sensitiveInputDetected}
        shouldBlurReply={shouldBlurReply}
        rechargeCode={rechargeCode}
        rechargeStatus={rechargeStatus}
        recharging={recharging}
        iconPosition={iconPosition}
        panelPosition={panelPosition}
        rootRef={panelRootRef}
        onOpenPanel={() => activateField(document.activeElement as HTMLElement | null, "bubble")}
        onClosePanel={() => setPanelOpen(false)}
        onStartGeneration={startGeneration}
        onCopy={handleCopy}
        onUserHintChange={setUserHint}
        onRechargeCodeChange={setRechargeCode}
        onRedeemCode={handleRedeemCode}
        onOpenOptions={() => chrome.runtime.openOptionsPage()}
        onOpenLongDocWorkspace={openLongDocWorkspace}
        onFeedback={() => {
          // hidden while panel closed
        }}
      />
    )
  }

  const iconPosition = {
    top: window.innerHeight - 74,
    left: window.innerWidth - 174
  }

  return (
    <FormPilotPanel
      panelOpen={panelOpen}
      reply={reply}
      isGenerating={isGenerating}
      error={error}
      userHint={userHint}
      copied={copied}
      isLoggedIn={Boolean(authState)}
      scenario={scenario}
      credits={usageCredits}
      accountHint={accountHint}
      estimatedCost={lastMeta?.creditsCost || estimatedCost}
      complianceWarnings={complianceWarnings}
      hasMaskedHint={hasMaskedHint || sensitiveInputDetected}
      shouldBlurReply={shouldBlurReply}
      rechargeCode={rechargeCode}
      rechargeStatus={rechargeStatus}
      recharging={recharging}
      iconPosition={iconPosition}
      panelPosition={panelPosition}
      rootRef={panelRootRef}
      onOpenPanel={() => activateField(document.activeElement as HTMLElement | null, "bubble")}
      onClosePanel={() => setPanelOpen(false)}
      onStartGeneration={startGeneration}
      onCopy={handleCopy}
      onUserHintChange={setUserHint}
      onRechargeCodeChange={setRechargeCode}
      onRedeemCode={handleRedeemCode}
      onOpenOptions={() => chrome.runtime.openOptionsPage()}
      onOpenLongDocWorkspace={openLongDocWorkspace}
      onFeedback={(outcome) => {
        if (!lastMeta?.templateId || !lastMeta?.scenario) return
        void sendPromptFeedback({
          templateId: lastMeta.templateId,
          scenario: lastMeta.scenario === "ads_compliance" ? "ads_compliance" : "general",
          outcome
        })
      }}
    />
  )
}
