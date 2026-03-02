import { useCallback } from "react";
import type { ChangeEvent, RefObject } from "react";

const RECHARGE_URL =
  process.env.PLASMO_PUBLIC_RECHARGE_URL || "https://formpilot.ai/recharge";

const QUICK_TWEAKS = [
  {
    id: "policy",
    label: "更符合政策合规",
    hint: "请改为更符合 Google Ads 政策审核偏好的表达",
  },
  {
    id: "technical",
    label: "补充技术细节",
    hint: "请补充可执行的技术风控细节与流程",
  },
];

interface FormPilotPanelProps {
  panelOpen: boolean;
  reply: string;
  isGenerating: boolean;
  error: string;
  userHint: string;
  copied: boolean;
  isLoggedIn: boolean;
  scenario: "general" | "ads_compliance";
  credits: number;
  accountHint?: string;
  estimatedCost: number;
  complianceWarnings: string[];
  hasMaskedHint: boolean;
  needsRecharge: boolean;
  rechargeCode: string;
  rechargeStatus: string;
  recharging: boolean;
  iconPosition: { top: number; left: number };
  panelPosition: { top: number; left: number };
  isLongDocField: boolean;
  rootRef: RefObject<HTMLDivElement>;
  onOpenPanel: () => void;
  onClosePanel: () => void;
  onStartGeneration: (overrideHint?: string) => void;
  onCopy: () => void;
  onUserHintChange: (value: string) => void;
  onRechargeCodeChange: (value: string) => void;
  onRedeemCode: () => void;
  onOpenOptions: () => void;
  onOpenLongDocWorkspace: () => void;
  onFeedback: (outcome: "success" | "fail") => void;
  appealFeedbackStatus: string;
  onAppealFeedback: (outcome: "success" | "fail") => void;
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
    needsRecharge,
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
    onFeedback,
    appealFeedbackStatus,
    onAppealFeedback,
  } = props;

  const handleHintChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onUserHintChange(event.target.value);
    },
    [onUserHintChange],
  );

  const status =
    !isLoggedIn || credits < estimatedCost
      ? {
          color: "bg-red-500",
          hint: !isLoggedIn ? "未登录" : "积分耗尽",
          actionLabel: !isLoggedIn ? "去登录" : "去充值",
          actionKind: !isLoggedIn ? "login" : "recharge",
        }
      : complianceWarnings.length > 0
        ? {
            color: "bg-amber-500",
            hint: "需补齐合规档案",
            actionLabel: "去补齐",
            actionKind: "profile",
          }
        : {
            color: "bg-emerald-500",
            hint: "就绪",
            actionLabel: "",
            actionKind: "none",
          };

  return (
    <div
      ref={rootRef}
      className="fixed z-[2147483647]"
      style={{ top: 0, left: 0 }}
    >
      {!panelOpen && (
        <button
          type="button"
          className="absolute flex items-center gap-2 rounded-full border border-storm bg-white px-3 py-2 text-xs text-ink shadow-xl transition hover:bg-mist"
          style={{ top: iconPosition.top, left: iconPosition.left }}
          onClick={onOpenPanel}
        >
          <span className="text-glow">🛡️</span>
          <span>
            {scenario === "ads_compliance" ? "Ads 合规模式" : "FormPilot"}
          </span>
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
              <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${status.color}`} />
                <span className="text-[10px] text-slate-500">{status.hint}</span>
                {status.actionKind === "login" || status.actionKind === "profile" ? (
                  <button
                    type="button"
                    className="text-[10px] text-slate-500 underline"
                    onClick={onOpenOptions}
                  >
                    {status.actionLabel}
                  </button>
                ) : null}
                {status.actionKind === "recharge" ? (
                  <a
                    href={RECHARGE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-slate-500 underline"
                  >
                    {status.actionLabel}
                  </a>
                ) : null}
              </div>
            </div>
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

          <div className="space-y-3 px-4 py-3">
            {!isLoggedIn && (
              <div className="rounded-lg border border-storm bg-slate-50 p-3 text-xs text-slate-600">
                请先登录后继续使用。
                <div className="mt-2">
                  <button
                    type="button"
                    className="rounded-md bg-ocean px-2 py-1 text-xs text-white"
                    onClick={onOpenOptions}
                  >
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
            {isLoggedIn && complianceWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                ⚠️ 资质库缺失：{complianceWarnings.join("；")}
              </div>
            )}

            {isLongDocField ? (
              <div className="flex flex-col items-center justify-center space-y-3 py-8 px-4 text-center">
                <div className="text-4xl">📝</div>
                <div className="text-sm font-semibold text-slate-800">
                  检测到长文档/复杂认证表单
                </div>
                <div className="text-xs text-slate-500">
                  当前题目需要填写极长的业务背景或运营细节，建议进入沉浸式 Focus
                  工作台处理。
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
                    {needsRecharge ? (
                      <div className="flex flex-col items-center justify-center space-y-3 h-full pt-4">
                        <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-sm">
                          <div className="text-xs font-semibold text-amber-800">
                            🔑 {rechargeStatus || "输入充值码解锁完整方案"}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <input
                              className="min-w-0 flex-1 rounded-md border border-amber-300 px-2 py-1 text-xs uppercase tracking-wider bg-white"
                              value={rechargeCode}
                              onChange={(event) =>
                                onRechargeCodeChange(event.target.value)
                              }
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
                              className="rounded bg-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-300"
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
                        </div>
                      </div>
                    ) : (
                      reply || (isGenerating ? "正在生成..." : "点击按钮起草")
                    )}
                  </div>
                </div>

                {reply && !needsRecharge && (
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

                {reply && !needsRecharge && (
                  <div className="rounded-lg border border-storm bg-slate-50 px-2 py-2">
                    <div className="text-[11px] text-slate-600">
                      提交平台审核后，可补录最终结果（用于过审信号）
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700"
                        onClick={() => onAppealFeedback("success")}
                      >
                        ✅ 过审成功
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-700"
                        onClick={() => onAppealFeedback("fail")}
                      >
                        ❌ 仍被拒
                      </button>
                    </div>
                    {appealFeedbackStatus && (
                      <div className="mt-2 text-[11px] text-slate-500">{appealFeedbackStatus}</div>
                    )}
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
                    {isGenerating
                      ? "生成中"
                      : `一键起草专业申诉信 (需 ${estimatedCost} 点)`}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-storm px-3 py-2 text-xs"
                    onClick={onCopy}
                  >
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
  );
}
