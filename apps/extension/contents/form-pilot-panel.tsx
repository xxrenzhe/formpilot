import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, RefObject } from "react"
import type { GenerateMode, MetricEventType, UserPersona, UserPlan } from "@formpilot/shared"

const QUICK_TWEAKS = [
  { id: "shorter", label: "🤏 更简短", hint: "请更简短" },
  { id: "business", label: "👔 更商务", hint: "请更商务、正式一些" },
  { id: "friendly", label: "🙂 更友好", hint: "请更友好自然" },
  { id: "detail", label: "🧩 更具体", hint: "请更具体，补充必要细节" }
]

const SLASH_COMMANDS = [
  { key: "/page_title", label: "页面标题" },
  { key: "/page_url", label: "页面地址" },
  { key: "/page_desc", label: "页面描述" },
  { key: "/page_lang", label: "页面语言" },
  { key: "/field_label", label: "问题标签" },
  { key: "/field_placeholder", label: "输入框提示" },
  { key: "/persona_name", label: "人设名称" },
  { key: "/my_company", label: "公司背景" },
  { key: "/my_role", label: "核心身份" }
]

const SLASH_LABELS: Record<string, string> = Object.fromEntries(
  SLASH_COMMANDS.map((command) => [command.key, command.label])
)

function findSlashToken(value: string, cursor: number): { token: string; start: number; end: number } | null {
  const prefix = value.slice(0, cursor)
  const match = prefix.match(/(?:^|\s)(\/[\w_-]*)$/)
  if (!match) return null
  const token = match[1]
  return {
    token,
    start: cursor - token.length,
    end: cursor
  }
}

interface FormPilotPanelProps {
  panelOpen: boolean
  isPii: boolean
  translation: string
  reply: string
  isGenerating: boolean
  error: string
  upgradeUrl: string
  personas: UserPersona[]
  selectedPersonaId: string
  userHint: string
  mode: GenerateMode
  plan: UserPlan
  usageLabel: string
  copied: boolean
  contextMeta?: { total: number; omitted: number } | null
  iconPosition: { top: number; left: number }
  panelPosition: { top: number; left: number }
  isLoggedIn: boolean
  rootRef: RefObject<HTMLDivElement>
  onOpenPanel: () => void
  onClosePanel: () => void
  onStartGeneration: (overrideHint?: string) => void
  onCopy: () => void
  onSelectPersona: (id: string) => void
  onUserHintChange: (value: string) => void
  onModeChange: (mode: GenerateMode) => void
  onOpenOptions: () => void
  onOpenUpgrade: (upgradeUrl?: string) => void
  onTrackMetric?: (eventType: MetricEventType, metadata?: Record<string, string | number | boolean>) => void
}

export default function FormPilotPanel(props: FormPilotPanelProps) {
  const {
    panelOpen,
    isPii,
    translation,
    reply,
    isGenerating,
    error,
    upgradeUrl,
    personas,
    selectedPersonaId,
    userHint,
    mode,
    plan,
    usageLabel,
    copied,
    contextMeta,
    iconPosition,
    panelPosition,
    isLoggedIn,
    rootRef,
    onOpenPanel,
    onClosePanel,
    onStartGeneration,
    onCopy,
    onSelectPersona,
    onUserHintChange,
    onModeChange,
    onOpenOptions,
    onOpenUpgrade,
    onTrackMetric
  } = props

  const [slashQuery, setSlashQuery] = useState("")
  const [slashRange, setSlashRange] = useState<{ start: number; end: number } | null>(null)
  const [pendingCursor, setPendingCursor] = useState<number | null>(null)
  const [activeSlashIndex, setActiveSlashIndex] = useState(0)
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null)
  const isLongDocLocked = plan === "free" && mode === "longDoc"
  const hintPlaceholder = mode === "longDoc" ? "一句话概述你的方案或思路..." : "补充要求..."

  useEffect(() => {
    if (pendingCursor === null) return
    const input = promptInputRef.current
    if (!input) return
    input.focus()
    input.selectionStart = pendingCursor
    input.selectionEnd = pendingCursor
    setPendingCursor(null)
  }, [pendingCursor, userHint])

  useEffect(() => {
    if (!panelOpen || isPii) return
    promptInputRef.current?.focus()
  }, [panelOpen, isPii])

  const slashSuggestions = useMemo(() => {
    if (!slashRange) return []
    if (!slashQuery) return []
    return SLASH_COMMANDS.filter((command) => command.key.startsWith(slashQuery))
  }, [slashQuery, slashRange])

  useEffect(() => {
    if (slashSuggestions.length === 0) {
      setActiveSlashIndex(0)
      return
    }
    setActiveSlashIndex((prev) => Math.min(prev, slashSuggestions.length - 1))
  }, [slashSuggestions.length])

  const updateSlashState = useCallback((value: string, cursor: number) => {
    const match = findSlashToken(value, cursor)
    if (!match) {
      setSlashQuery("")
      setSlashRange(null)
      return
    }
    setSlashQuery(match.token)
    setSlashRange({ start: match.start, end: match.end })
  }, [])

  const insertSlashCommand = useCallback(
    (command: (typeof SLASH_COMMANDS)[number]) => {
      const range = slashRange
      const base = userHint
      const start = range ? range.start : base.length
      const end = range ? range.end : base.length
      const next = `${base.slice(0, start)}${command.key} ${base.slice(end)}`
      onUserHintChange(next)
      setSlashQuery("")
      setSlashRange(null)
      setPendingCursor(start + command.key.length + 1)
    },
    [slashRange, userHint, onUserHintChange]
  )

  const handleUserHintChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value
      onUserHintChange(value)
      const cursor = event.target.selectionStart ?? value.length
      updateSlashState(value, cursor)
    },
    [onUserHintChange, updateSlashState]
  )

  const handlePromptKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (slashSuggestions.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault()
          setActiveSlashIndex((prev) => (prev + 1) % slashSuggestions.length)
          return
        }
        if (event.key === "ArrowUp") {
          event.preventDefault()
          setActiveSlashIndex((prev) => (prev - 1 + slashSuggestions.length) % slashSuggestions.length)
          return
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault()
          insertSlashCommand(slashSuggestions[activeSlashIndex])
          return
        }
        if (event.key === "Escape") {
          setSlashQuery("")
          setSlashRange(null)
          return
        }
      }

      if (event.key === "Enter" && !event.shiftKey && reply && !isGenerating) {
        event.preventDefault()
        onCopy()
      }
    },
    [slashSuggestions, activeSlashIndex, insertSlashCommand, reply, isGenerating, onCopy]
  )

  const handleQuickRewrite = useCallback(
    (hint: string) => {
      const combined = userHint ? `${userHint}\n${hint}` : hint
      onUserHintChange(combined)
      onStartGeneration(combined)
      onTrackMetric?.("rewrite_click", { label: hint })
    },
    [userHint, onUserHintChange, onStartGeneration, onTrackMetric]
  )

  return (
    <div ref={rootRef} className="fixed z-[2147483647]" style={{ top: 0, left: 0 }}>
      {!panelOpen && !isPii && (
        <button
          type="button"
          className="absolute flex items-center gap-2 rounded-full bg-white shadow-xl border border-storm px-3 py-2 text-xs text-ink hover:bg-mist transition"
          style={{ top: iconPosition.top, left: iconPosition.left }}
          onClick={onOpenPanel}
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
                onClick={onClosePanel}
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
                {!isLoggedIn && (
                  <div className="rounded-lg border border-storm bg-slate-50 p-3 text-xs text-slate-600 space-y-2">
                    <div>请先登录以继续使用 FormPilot。</div>
                    <button
                      type="button"
                      className="rounded-md bg-ocean text-white px-2 py-1 text-xs"
                      onClick={onOpenOptions}
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
                {contextMeta && (
                  <div className="text-[11px] text-slate-400">
                    已读取上下文 {contextMeta.total} 段，省略 {contextMeta.omitted} 段
                  </div>
                )}
                <div className="rounded-lg border border-storm p-3 min-h-[120px] text-ink whitespace-pre-wrap">
                  {reply || (isGenerating ? "正在生成..." : "点击生成")}
                </div>
                {reply && (
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TWEAKS.map((tweak) => (
                      <button
                        key={tweak.id}
                        type="button"
                        className="rounded-full border border-storm px-3 py-1 text-xs text-slate-600 hover:text-ink"
                        onClick={() => handleQuickRewrite(tweak.hint)}
                        disabled={isGenerating}
                      >
                        {tweak.label}
                      </button>
                    ))}
                  </div>
                )}

                {error && (
                  <div className="space-y-2">
                    <div className="text-xs text-red-600">{error}</div>
                    {(upgradeUrl || plan === "free") && (
                      <button
                        type="button"
                        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                        onClick={() => onOpenUpgrade(upgradeUrl)}
                      >
                        升级 Pro
                      </button>
                    )}
                  </div>
                )}

                {mode === "longDoc" && (
                  <div className="rounded-lg border border-storm bg-slate-50 p-3 text-xs text-slate-600">
                    文档生成模式：请在补充要求中输入核心思路，系统将输出带层级结构的完整文档。
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-ocean text-white px-3 py-2 text-xs font-semibold"
                    onClick={() => onStartGeneration()}
                    disabled={isGenerating || !isLoggedIn || isLongDocLocked}
                  >
                    {isGenerating ? "生成中" : "开始生成"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-storm px-3 py-2 text-xs"
                    onClick={onCopy}
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
                    onChange={(event) => onModeChange(event.target.value as GenerateMode)}
                  >
                    <option value="shortText">短文本</option>
                    <option value="longDoc">长文档</option>
                  </select>
                  <select
                    className="w-full rounded-md border border-storm bg-white px-2 py-1 text-xs"
                    value={selectedPersonaId}
                    onChange={(event) => onSelectPersona(event.target.value)}
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
                    placeholder={hintPlaceholder}
                    value={userHint}
                    ref={promptInputRef}
                    onChange={handleUserHintChange}
                    onKeyDown={handlePromptKeyDown}
                    onKeyUp={(event) => {
                      const cursor = event.currentTarget.selectionStart ?? event.currentTarget.value.length
                      updateSlashState(event.currentTarget.value, cursor)
                    }}
                    onClick={(event) => {
                      const cursor = event.currentTarget.selectionStart ?? event.currentTarget.value.length
                      updateSlashState(event.currentTarget.value, cursor)
                    }}
                  />
                  {slashSuggestions.length > 0 && (
                    <div className="rounded-md border border-storm bg-white text-xs shadow-sm">
                      {slashSuggestions.map((command, index) => {
                        const isActive = index === activeSlashIndex
                        return (
                          <button
                            key={command.key}
                            type="button"
                            className={`flex w-full items-center justify-between px-2 py-1 text-left hover:bg-mist ${
                              isActive ? "bg-mist" : ""
                            }`}
                            onClick={() => insertSlashCommand(command)}
                          >
                            <span className="text-ink">{command.key}</span>
                            <span className="text-slate-400">{SLASH_LABELS[command.key] || command.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {plan === "free" && (
                  <div className="flex items-center justify-between text-xs text-amber-600">
                    <span>
                      {mode === "longDoc"
                        ? "长文档仅 Pro 可用"
                        : "升级 Pro 解锁全站上下文与长文档"}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-amber-700 underline"
                      onClick={() => onOpenUpgrade(upgradeUrl)}
                    >
                      升级
                    </button>
                  </div>
                )}

                <details className="rounded-xl border border-storm bg-slate-50 p-3 text-xs text-slate-600">
                  <summary className="cursor-pointer text-slate-600">快捷键与变量</summary>
                  <div className="mt-2 space-y-1">
                    <div>Cmd/Ctrl + M：唤起面板</div>
                    <div>Enter：生成后快速复制（输入框中）</div>
                    <div>输入 / 调出变量：</div>
                    <div className="flex flex-wrap gap-2">
                      {SLASH_COMMANDS.map((command) => (
                        <span
                          key={command.key}
                          className="rounded-full border border-storm bg-white px-2 py-0.5 text-[11px]"
                        >
                          {command.key}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
