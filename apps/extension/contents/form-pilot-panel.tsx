import { useCallback } from "react"
import type { ChangeEvent, RefObject } from "react"

const QUICK_TWEAKS = [
  { id: "policy", label: "更符合政策合规", hint: "请改为更符合 Google Ads 政策审核偏好的表达" },
  { id: "technical", label: "补充技术细节", hint: "请补充可执行的技术风控细节与流程" }
]

interface FormPilotPanelProps {
  panelOpen: boolean
  reply: string
  isGenerating: boolean
  error: string
  userHint: string
  copied: boolean
  isLoggedIn: boolean
  scenario: "general" | "ads_compliance"
  credits: number
  accountHint?: string
  estimatedCost: number
  complianceWarnings: string[]
  hasMaskedHint: boolean
  shouldBlurReply: boolean
  rechargeCode: string
  rechargeStatus: string
  recharging: boolean
  iconPosition: { top: number; left: number }
  panelPosition: { top: number; left: number }
  rootRef: RefObject<HTMLDivElement>
  onOpenPanel: () => void
  onClosePanel: () => void
  onStartGeneration: (overrideHint?: string) => void
  onCopy: () => void
  onUserHintChange: (value: string) => void
  onRechargeCodeChange: (value: string) => void
  onRedeemCode: () => void
  onOpenOptions: () => void
  onOpenLongDocWorkspace: () => void
  onFeedback: (outcome: "success" | "fail") => void
}

export default function FormPilotPanel(props: FormPilotPanelProps) {
  const {
    panelOpen,
    reply,
    isGenerating,
    error,
    userHint,
    copied,
    isLoggedIn,
    scenario,
    credits,
    accountHint,
    estimatedCost,
    complianceWarnings,
    hasMaskedHint,
    shouldBlurReply,
    rechargeCode,
    rechargeStatus,
    recharging,
    iconPosition,
    panelPosition,
    rootRef,
    onOpenPanel,
    onClosePanel,
    onStartGeneration,
    onCopy,
    onUserHintChange,
    onRechargeCodeChange,
    onRedeemCode,
    onOpenOptions,
    onOpenLongDocWorkspace,
    onFeedback
  } = props

  const handleHintChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onUserHintChange(event.target.value)
    },
    [onUserHintChange]
  )

  return (
    <div ref={rootRef} className="fixed z-[2147483647]" style={{ top: 0, left: 0 }}>
      {!panelOpen && (
        <button
          type="button"
          className="absolute flex items-center gap-2 rounded-full border border-storm bg-white px-3 py-2 text-xs text-ink shadow-xl transition hover:bg-mist"
          style={{ top: iconPosition.top, left: iconPosition.left }}
          onClick={onOpenPanel}
        >
          <span className="text-glow">🛡️</span>
          <span>{scenario === "ads_compliance" ? "Ads 合规模式" : "FormPilot"}</span>
        </button>
      )}

      {panelOpen && (
        <div
          className="absolute w-[390px] overflow-hidden rounded-2xl border border-storm bg-white text-sm shadow-2xl"
          style={{ top: panelPosition.top, left: panelPosition.left }}
        >
          <div className="flex items-center justify-between border-b border-storm bg-mist px-4 py-3">
            <div className="space-y-1">
              <div className="font-semibold">FormPilot</div>
              {scenario === "ads_compliance" && (
                <div className="inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white">
                  Google Ads 合规护航中
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-white" onClick={onOpenLongDocWorkspace}>
                Focus
              </button>
              <button type="button" className="text-xs text-slate-500 hover:text-ink" onClick={onClosePanel}>
                收起
              </button>
            </div>
          </div>

          <div className="space-y-3 px-4 py-3">
            {!isLoggedIn && (
              <div className="rounded-lg border border-storm bg-slate-50 p-3 text-xs text-slate-600">
                请先登录后继续使用。
                <div className="mt-2">
                  <button type="button" className="rounded-md bg-ocean px-2 py-1 text-xs text-white" onClick={onOpenOptions}>
                    打开登录页
                  </button>
                </div>
              </div>
            )}

            {isLoggedIn && (
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>剩余点数：{credits}</span>
                <span>本次预计消耗：{estimatedCost} 点</span>
              </div>
            )}
            {accountHint && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
                {accountHint}
              </div>
            )}

            {complianceWarnings.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <div className="font-semibold">⚠️ 您的合规资质库缺失关键材料，极易触发 Google 审核风控，建议补充！</div>
                <div className="mt-1 leading-5">{complianceWarnings.join("；")}</div>
              </div>
            )}

            {hasMaskedHint && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
                🔒 核心账单数据已在本地隔离脱敏，发送给 AI 的是占位符。
              </div>
            )}

            <div className="space-y-2">
              <div className="relative min-h-[130px] whitespace-pre-wrap rounded-lg border border-storm p-3 text-ink">
                {reply || (isGenerating ? "正在生成..." : "点击按钮起草")}
                {shouldBlurReply && reply && (
                  <div className="absolute inset-x-0 bottom-0 top-0 flex items-center justify-center bg-white/70 px-4 backdrop-blur-[6px]">
                    <div className="w-full rounded-xl border border-amber-200 bg-white p-3 shadow-lg">
                      <div className="text-xs font-semibold text-amber-800">🔑 输入充值码解锁完整方案</div>
                      <div className="mt-2 flex gap-2">
                        <input
                          className="min-w-0 flex-1 rounded-md border border-amber-300 px-2 py-1 text-xs uppercase tracking-wider"
                          value={rechargeCode}
                          onChange={(event) => onRechargeCodeChange(event.target.value)}
                          placeholder="FP-ADS-XXXX-XXXX-XXXX-XXXX"
                        />
                        <button
                          type="button"
                          className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-60"
                          onClick={onRedeemCode}
                          disabled={recharging}
                        >
                          {recharging ? "兑换中" : "兑换"}
                        </button>
                      </div>
                      {rechargeStatus && <div className="mt-2 text-[11px] text-slate-600">{rechargeStatus}</div>}
                      <button
                        type="button"
                        className="mt-2 text-[11px] text-slate-500 underline"
                        onClick={onOpenOptions}
                      >
                        打开控制台管理点数
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {reply && !shouldBlurReply && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700"
                  onClick={() => onFeedback("success")}
                >
                  👍 申诉成功
                </button>
                <button
                  type="button"
                  className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-700"
                  onClick={() => onFeedback("fail")}
                >
                  👎 被驳回
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {QUICK_TWEAKS.map((tweak) => (
                <button
                  key={tweak.id}
                  type="button"
                  className="rounded-full border border-storm px-3 py-1 text-xs text-slate-600 hover:text-ink"
                  onClick={() => onStartGeneration(tweak.hint)}
                  disabled={isGenerating}
                >
                  {tweak.label}
                </button>
              ))}
            </div>

            {error && <div className="text-xs text-red-600">{error}</div>}

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg bg-ocean px-3 py-2 text-xs font-semibold text-white"
                onClick={() => onStartGeneration()}
                disabled={isGenerating || !isLoggedIn}
              >
                {isGenerating ? "生成中" : `一键起草专业申诉信 (需 ${estimatedCost} 点)`}
              </button>
              <button type="button" className="rounded-lg border border-storm px-3 py-2 text-xs" onClick={onCopy}>
                {copied ? "已复制" : "一键复制"}
              </button>
            </div>

            <textarea
              className="w-full rounded-md border border-storm bg-white px-2 py-1 text-xs"
              rows={3}
              placeholder="补充业务事实或语气要求..."
              value={userHint}
              onChange={handleHintChange}
            />
          </div>
        </div>
      )}
    </div>
  )
}
