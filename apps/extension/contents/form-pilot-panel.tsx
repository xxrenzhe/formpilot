import { useCallback } from "react"
import type { ChangeEvent, RefObject } from "react"

const RECHARGE_URL = process.env.PLASMO_PUBLIC_RECHARGE_URL || "https://formpilot.ai/recharge"

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
  isLongDocField: boolean
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
    isLongDocField,
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

  const renderStatusIndicator = () => {
    let color = "bg-emerald-500"
    let hint = "系统状态健康"
    if (!isLoggedIn) {
      color = "bg-red-500"
      hint = "未登录"
    } else if (credits < estimatedCost) {
      color = "bg-red-500"
      hint = "点数不足"
    } else if (complianceWarnings.length > 0) {
      color = "bg-amber-500"
      hint = "合规资质缺失"
    } else if (hasMaskedHint) {
      color = "bg-emerald-500"
      hint = "已开启端侧脱敏保护"
    }

    return (
      <div className="group relative flex items-center gap-1.5 cursor-pointer">
        <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="text-[10px] text-slate-500">{hint}</span>
        {/* Tooltip on hover */}
        {complianceWarnings.length > 0 && (
          <div className="absolute left-0 top-full mt-1 hidden w-64 rounded-md border border-slate-200 bg-white p-2 text-[10px] text-slate-600 shadow-lg group-hover:block z-50">
            <div className="font-semibold text-amber-600 mb-1">⚠️ 合规资质库缺失材料：</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {complianceWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>
    )
  }

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
          className="absolute w-[390px] overflow-visible rounded-2xl border border-storm bg-white text-sm shadow-2xl"
          style={{ top: panelPosition.top, left: panelPosition.left }}
        >
          <div className="flex items-center justify-between border-b border-storm bg-mist px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="font-semibold">FormPilot</div>
              {renderStatusIndicator()}
            </div>
            <div className="flex items-center gap-2">
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

            {isLongDocField ? (
              <div className="flex flex-col items-center justify-center space-y-3 py-8 px-4 text-center">
                <div className="text-4xl">📝</div>
                <div className="text-sm font-semibold text-slate-800">检测到长文档/复杂认证表单</div>
                <div className="text-xs text-slate-500">
                  当前题目需要填写极长的业务背景或运营细节，建议进入沉浸式 Focus 工作台处理。
                </div>
                <button
                  type="button"
                  className="mt-2 w-full rounded-lg bg-ocean px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-ocean/90"
                  onClick={onOpenLongDocWorkspace}
                >
                  进入 Focus 工作台
                </button>
              </div>
            ) : (
              <>
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
                              placeholder="FP-ADS-XXXX"
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
                          <div className="mt-3 flex items-center justify-between">
                            <a
                              href={RECHARGE_URL}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-200"
                            >
                              [获取专属充值码]
                            </a>
                            <button
                              type="button"
                              className="text-[11px] text-slate-500 underline"
                              onClick={onOpenOptions}
                            >
                              控制台
                            </button>
                          </div>
                          {rechargeStatus && <div className="mt-2 text-[11px] text-slate-600">{rechargeStatus}</div>}
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
                      👍 已采纳
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-700"
                      onClick={() => onFeedback("fail")}
                    >
                      👎 不满意
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
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>

                <textarea
                  className="w-full rounded-md border border-storm bg-white px-2 py-1 text-xs"
                  rows={2}
                  placeholder="补充业务事实或语气要求..."
                  value={userHint}
                  onChange={handleHintChange}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
