import "../style.css"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PlasmoCSConfig } from "plasmo"
import type { FieldContext, GenerateMode, UserPersona, UserPlan, UsageSummary } from "@formpilot/shared"
import { isPiiField } from "@formpilot/shared"
import { extractFieldContext, extractPageContext, detectLongDoc } from "./extractor"
import { extractGlobalContext } from "./globalContext"
import { createStreamParser } from "../lib/streamParser"
import { fetchPersonas, fetchUsage, generateContent } from "../lib/api"
import { cachePersonas, getAppConfig, getAuthState, getCachedPersonas, setPlan } from "../lib/storage"
import type { AuthState } from "../lib/storage"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

const PANEL_WIDTH = 380

function isSupportedInput(target: HTMLElement): target is HTMLInputElement | HTMLTextAreaElement {
  const tag = target.tagName.toLowerCase()
  if (tag === "textarea") return true
  if (tag !== "input") return false
  const type = (target.getAttribute("type") || "text").toLowerCase()
  return ["text", "search", "url", "tel", "email", "file"].includes(type)
}

function calcPosition(rect: DOMRect | null) {
  if (!rect) {
    return { top: 80, left: window.innerWidth - PANEL_WIDTH - 24 }
  }
  const top = Math.min(rect.bottom + 8, window.innerHeight - 420)
  const left = Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 16)
  return { top: Math.max(16, top), left: Math.max(16, left) }
}

export default function FormPilotUi() {
  const [activeField, setActiveField] = useState<FieldContext | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [translation, setTranslation] = useState("")
  const [reply, setReply] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")
  const [upgradeUrl, setUpgradeUrl] = useState("")
  const [personas, setPersonas] = useState<UserPersona[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState("")
  const [userHint, setUserHint] = useState("")
  const [mode, setMode] = useState<GenerateMode>("shortText")
  const [plan, setPlanState] = useState<UserPlan>("unknown")
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [isPii, setIsPii] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [isManualMode, setIsManualMode] = useState(false)
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [copied, setCopied] = useState(false)

  const panelPosition = useMemo(() => calcPosition(anchorRect), [anchorRect])
  const activeElementRef = useRef<HTMLElement | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  const refreshAccount = useCallback(async () => {
    const auth = await getAuthState()
    setAuthState(auth)
    if (!auth) return

    const [usageData, list] = await Promise.all([fetchUsage(), fetchPersonas()])
    if (usageData) {
      setPlanState(usageData.plan)
      setUsage(usageData)
      await setPlan(usageData.plan)
    }
    if (list.length) {
      setPersonas(list)
      setSelectedPersonaId((prev) => prev || list.find((item) => item.isDefault)?.id || list[0]?.id || "")
      await cachePersonas(list)
    } else {
      const cached = await getCachedPersonas()
      if (cached.length) {
        setPersonas(cached)
        setSelectedPersonaId(cached[0].id)
      }
    }
  }, [])

  const handleFocus = useCallback((event: FocusEvent) => {
    const target = event.target as HTMLElement | null
    if (!target || !isSupportedInput(target)) return

    activeElementRef.current = target
    const field = extractFieldContext(target)
    setActiveField(field)
    setAnchorRect(target.getBoundingClientRect())
    setIsManualMode(false)
    setMode(detectLongDoc(field) || field.type === "file" ? "longDoc" : "shortText")
    const pii = isPiiField(field)
    setIsPii(pii)
    setPanelOpen(pii)
    setTranslation("")
    setReply("")
    setError("")
  }, [])

  const handleScroll = useCallback(() => {
    const target = activeElementRef.current
    if (!target) return
    setAnchorRect(target.getBoundingClientRect())
  }, [])

  const openManual = useCallback((text: string) => {
    activeElementRef.current = null
    const field: FieldContext = {
      label: text,
      placeholder: "",
      type: "text",
      surroundingText: ""
    }
    setActiveField(field)
    setAnchorRect(null)
    setIsManualMode(true)
    setMode("shortText")
    setIsPii(isPiiField(field))
    setPanelOpen(true)
    setTranslation("")
    setReply("")
    setError("")
  }, [])

  useEffect(() => {
    const listener = (message: { action?: string; text?: string }) => {
      if (message.action === "openManual" && message.text) {
        openManual(message.text)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [openManual])

  useEffect(() => {
    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local") return
      if (changes.authState) {
        const nextState = (changes.authState.newValue as AuthState | null) || null
        setAuthState(nextState)
        if (nextState) {
          refreshAccount()
        } else {
          setPlanState("unknown")
          setPersonas([])
          setUsage(null)
        }
      }
    }

    document.addEventListener("focusin", handleFocus)
    window.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", handleScroll)
    refreshAccount()
    chrome.storage.onChanged.addListener(storageListener)

    return () => {
      document.removeEventListener("focusin", handleFocus)
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", handleScroll)
      chrome.storage.onChanged.removeListener(storageListener)
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [handleFocus, handleScroll, refreshAccount])

  const startGeneration = useCallback(async () => {
    if (!activeField) return
    if (!authState) {
      setError("请先登录")
      return
    }

    setTranslation("")
    setReply("")
    setIsGenerating(true)
    setError("")
    setUpgradeUrl("")

    const parser = createStreamParser({
      onTranslation: (text) => setTranslation((prev) => prev + text),
      onReply: (text) => setReply((prev) => prev + text)
    })

    try {
      const persona = personas.find((item) => item.id === selectedPersonaId) || personas[0]
      if (!persona) {
        setError("请先配置人设")
        return
      }

      if (plan === "free" && mode === "longDoc") {
        setError("长文档仅 Pro 可用")
        return
      }

      const pageContext = extractPageContext()
      const useGlobalContext = plan === "pro"
      const globalContext = useGlobalContext ? extractGlobalContext() : undefined
      const config = await getAppConfig()

      await generateContent(
        {
          pageContext,
          fieldContext: activeField,
          personaId: persona.id,
          userHint,
          mode,
          useGlobalContext,
          globalContext
        },
        {
          onToken: (token) => parser.push(token),
          onError: (message, url) => {
            setError(message)
            if (url) setUpgradeUrl(url)
          },
          byokKey: plan === "pro" ? config.byokKey : undefined
        }
      )
      const usageData = await fetchUsage()
      if (usageData) {
        setUsage(usageData)
        setPlanState(usageData.plan)
      }
    } finally {
      parser.flush()
      setIsGenerating(false)
    }
  }, [activeField, authState, personas, selectedPersonaId, userHint, mode, plan])

  const handleCopy = useCallback(async () => {
    if (!reply) return
    await navigator.clipboard.writeText(reply)
    setCopied(true)
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current)
    }
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000)
  }, [reply])

  const usageLabel = useMemo(() => {
    if (!usage) return ""
    if (usage.limit === -1) return `本月已用 ${usage.used} 次`
    const remaining = Math.max(usage.limit - usage.used, 0)
    return `本月剩余 ${remaining} 次`
  }, [usage])

  if (!activeField && !isManualMode) return null

  const iconPosition = calcPosition(anchorRect)
  return (
    <div className="fixed z-[2147483647]" style={{ top: 0, left: 0 }}>
      {!panelOpen && !isPii && (
        <button
          type="button"
          className="absolute flex items-center gap-2 rounded-full bg-white shadow-xl border border-storm px-3 py-2 text-xs text-ink hover:bg-mist transition"
          style={{ top: iconPosition.top, left: iconPosition.left }}
          onClick={() => setPanelOpen(true)}
        >
          <span className="text-glow">✨</span>
          <span>FormPilot</span>
        </button>
      )}

      {panelOpen && (
        <div
          className="absolute w-[380px] bg-white border border-storm rounded-2xl shadow-2xl overflow-hidden text-sm"
          style={{ top: panelPosition.top, left: panelPosition.left }}
        >
          <div className="flex items-center justify-between px-4 py-3 bg-mist border-b border-storm">
            <div className="font-semibold">FormPilot</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-ink"
                onClick={() => setPanelOpen(false)}
              >
                收起
              </button>
            </div>
          </div>

          <div className="px-4 py-3 space-y-3">
            {isPii && (
              <div className="rounded-lg bg-slate-50 border border-storm p-3 text-xs text-slate-600">
                🔒 检测到隐私字段，请手动输入。FormPilot 不会读取或上传。
              </div>
            )}

            {!isPii && (
              <>
                {!authState && (
                  <div className="rounded-lg border border-storm bg-slate-50 p-3 text-xs text-slate-600 space-y-2">
                    <div>请先登录以继续使用 FormPilot。</div>
                    <button
                      type="button"
                      className="rounded-md bg-ocean text-white px-2 py-1 text-xs"
                      onClick={() => chrome.runtime.openOptionsPage()}
                    >
                      打开登录页
                    </button>
                  </div>
                )}
                {translation && (
                  <div className="rounded-lg bg-slate-50 border border-storm p-3 text-xs text-slate-600 whitespace-pre-wrap">
                    {translation}
                  </div>
                )}
                {usageLabel && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{plan === "pro" ? "Pro" : "Free"}</span>
                    <span>{usageLabel}</span>
                  </div>
                )}
                <div className="rounded-lg border border-storm p-3 min-h-[120px] text-ink whitespace-pre-wrap">
                  {reply || (isGenerating ? "正在生成..." : "点击生成")}
                </div>

                {error && (
                  <div className="space-y-2">
                    <div className="text-xs text-red-600">{error}</div>
                    {(upgradeUrl || plan === "free") && (
                      <button
                        type="button"
                        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                        onClick={() => {
                          if (upgradeUrl) {
                            chrome.tabs.create({ url: upgradeUrl })
                          } else {
                            chrome.runtime.openOptionsPage()
                          }
                        }}
                      >
                        升级 Pro
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-ocean text-white px-3 py-2 text-xs font-semibold"
                    onClick={startGeneration}
                    disabled={isGenerating || !authState || (plan === "free" && mode === "longDoc")}
                  >
                    {isGenerating ? "生成中" : "开始生成"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-storm px-3 py-2 text-xs"
                    onClick={handleCopy}
                  >
                    {copied ? "已复制" : "一键复制"}
                  </button>
                </div>

                <div className="rounded-xl bg-slate-50 border border-storm p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>当前模式</span>
                    <span className="font-semibold text-ink">{mode === "longDoc" ? "文档" : "短文本"}</span>
                  </div>
                  <select
                    className="w-full rounded-md border border-storm bg-white px-2 py-1 text-xs"
                    value={mode}
                    onChange={(event) => setMode(event.target.value as GenerateMode)}
                  >
                    <option value="shortText">短文本</option>
                    <option value="longDoc">长文档</option>
                  </select>
                  <select
                    className="w-full rounded-md border border-storm bg-white px-2 py-1 text-xs"
                    value={selectedPersonaId}
                    onChange={(event) => setSelectedPersonaId(event.target.value)}
                  >
                    {personas.map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="w-full rounded-md border border-storm bg-white px-2 py-1 text-xs"
                    rows={3}
                    placeholder="补充要求..."
                    value={userHint}
                    onChange={(event) => setUserHint(event.target.value)}
                  />
                </div>

                {plan === "free" && (
                  <div className="flex items-center justify-between text-xs text-amber-600">
                    <span>{mode === "longDoc" ? "长文档仅 Pro 可用" : "升级 Pro 解锁全站上下文与无限生成"}</span>
                    <button
                      type="button"
                      className="text-xs text-amber-700 underline"
                      onClick={() => chrome.runtime.openOptionsPage()}
                    >
                      升级
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
