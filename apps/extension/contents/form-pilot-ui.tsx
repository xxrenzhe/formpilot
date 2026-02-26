import "../style.css"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PlasmoCSConfig } from "plasmo"
import type { FieldContext, GenerateMode, PageContext, UserPersona, UserPlan, UsageSummary } from "@formpilot/shared"
import { isPiiField } from "@formpilot/shared"
import { extractFieldContext, extractPageContext, detectLongDoc } from "./extractor"
import { extractGlobalContext } from "./globalContext"
import FormPilotPanel from "./form-pilot-panel"
import { createStreamParser } from "../lib/streamParser"
import { fetchPersonas, fetchUsage, generateContent } from "../lib/api"
import { cachePersonas, getAppConfig, getAuthState, getCachedPersonas, setPlan } from "../lib/storage"
import type { AuthState } from "../lib/storage"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

const PANEL_WIDTH = 380

interface SlashContext {
  pageContext: PageContext
  fieldContext: FieldContext
  persona: UserPersona
}

function resolveSlashCommands(input: string, context: SlashContext): string {
  let output = input
  const replacements: Record<string, string> = {
    "/page_title": context.pageContext.title,
    "/page_url": context.pageContext.url || "",
    "/page_desc": context.pageContext.description,
    "/page_lang": context.pageContext.lang,
    "/field_label": context.fieldContext.label,
    "/field_placeholder": context.fieldContext.placeholder,
    "/persona_name": context.persona.name,
    "/my_company": context.persona.companyInfo,
    "/my_role": context.persona.coreIdentity
  }

  Object.entries(replacements).forEach(([key, value]) => {
    if (!value) return
    output = output.split(key).join(value)
  })

  return output
}

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
  const panelRootRef = useRef<HTMLDivElement | null>(null)

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

  const activateField = useCallback((target: HTMLElement, openPanel: boolean) => {
    activeElementRef.current = target
    const field = extractFieldContext(target)
    setActiveField(field)
    setAnchorRect(target.getBoundingClientRect())
    setIsManualMode(false)
    setMode(detectLongDoc(field) || field.type === "file" ? "longDoc" : "shortText")
    const pii = isPiiField(field)
    setIsPii(pii)
    setPanelOpen(openPanel || pii)
    setTranslation("")
    setReply("")
    setError("")
    setUpgradeUrl("")
  }, [])

  const handleFocus = useCallback(
    (event: FocusEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || !isSupportedInput(target)) return
      activateField(target, false)
    },
    [activateField]
  )

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
    setUpgradeUrl("")
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
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "m") return
      if (event.repeat) return
      const target = event.target as HTMLElement | null
      if (!target) return
      const path = event.composedPath()
      if (panelRootRef.current && path.includes(panelRootRef.current)) return
      if (!isSupportedInput(target)) return
      event.preventDefault()
      activateField(target, true)
    }

    document.addEventListener("keydown", handleShortcut, true)
    return () => document.removeEventListener("keydown", handleShortcut, true)
  }, [activateField])

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

  const startGeneration = useCallback(
    async (overrideHint?: string) => {
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

        const pageContext = extractPageContext()
        const useGlobalContext = plan === "pro"
        const globalContext = useGlobalContext ? extractGlobalContext() : undefined
        const config = await getAppConfig()
        const rawHint = typeof overrideHint === "string" ? overrideHint : userHint
        const resolvedHint = resolveSlashCommands(rawHint, {
          pageContext,
          fieldContext: activeField,
          persona
        })

        await generateContent(
          {
            pageContext,
            fieldContext: activeField,
            personaId: persona.id,
            userHint: resolvedHint,
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
    },
    [activeField, authState, personas, selectedPersonaId, userHint, mode, plan]
  )

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

  const isLoggedIn = Boolean(authState)

  if (!activeField && !isManualMode) return null

  const iconPosition = calcPosition(anchorRect)

  return (
    <FormPilotPanel
      panelOpen={panelOpen}
      isPii={isPii}
      translation={translation}
      reply={reply}
      isGenerating={isGenerating}
      error={error}
      upgradeUrl={upgradeUrl}
      personas={personas}
      selectedPersonaId={selectedPersonaId}
      userHint={userHint}
      mode={mode}
      plan={plan}
      usageLabel={usageLabel}
      copied={copied}
      iconPosition={iconPosition}
      panelPosition={panelPosition}
      isLoggedIn={isLoggedIn}
      rootRef={panelRootRef}
      onOpenPanel={() => setPanelOpen(true)}
      onClosePanel={() => setPanelOpen(false)}
      onStartGeneration={startGeneration}
      onCopy={handleCopy}
      onSelectPersona={setSelectedPersonaId}
      onUserHintChange={setUserHint}
      onModeChange={setMode}
      onOpenOptions={() => chrome.runtime.openOptionsPage()}
      onOpenUpgrade={(url) => {
        if (url) {
          chrome.tabs.create({ url })
        } else {
          chrome.runtime.openOptionsPage()
        }
      }}
    />
  )
}
