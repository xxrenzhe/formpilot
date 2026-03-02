"use client"

import { useEffect, useState } from "react"
import { useAuth } from "../../lib/auth"
import { fetchAnalytics, type AnalyticsOverview } from "../../lib/api"

function toPercent(value?: number): string {
  return `${Math.round((value || 0) * 100)}%`
}

function toWeight(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--"
  return value.toFixed(2)
}

function actionSuggestionLabel(value?: AnalyticsOverview["promptPerformance"][number]["actionSuggestion"]): string {
  if (value === "increase_weight") return "提权"
  if (value === "decrease_weight") return "降权"
  if (value === "hold") return "持平"
  return "收集样本"
}

export default function AnalyticsPage() {
  const { session } = useAuth()
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [status, setStatus] = useState("")

  useEffect(() => {
    if (!session) return
    fetchAnalytics(session.access_token)
      .then(setData)
      .catch((error) => setStatus(error instanceof Error ? error.message : "加载失败"))
  }, [session])

  const funnel = data?.funnel

  return (
    <div>
      <div className="hero">
        <div>
          <h2>本周反馈双轨漏斗</h2>
          <p>分离展示草稿采纳信号与最终过审信号，避免误导 Prompt 调权。</p>
        </div>
        <span className="badge">Prompt 在线热更</span>
      </div>

      {status && <div className="notice">{status}</div>}

      <div className="grid cols-3">
        <div className="card">
          <div className="notice">Ads 申诉生成数</div>
          <h3>{funnel?.generatedAppeals ?? "--"}</h3>
        </div>
        <div className="card">
          <div className="notice">草稿采纳数</div>
          <h3>{funnel?.draftSuccessFeedback ?? funnel?.successFeedback ?? "--"}</h3>
        </div>
        <div className="card">
          <div className="notice">草稿拒绝数</div>
          <h3>{funnel?.draftFailFeedback ?? funnel?.failFeedback ?? "--"}</h3>
        </div>
        <div className="card">
          <div className="notice">草稿回收率</div>
          <h3>{toPercent(funnel?.draftFeedbackRate ?? funnel?.feedbackRate)}</h3>
        </div>
        <div className="card">
          <div className="notice">草稿采纳强度</div>
          <h3>{toPercent(funnel?.draftAdoptionSignal)}</h3>
        </div>
        <div className="card">
          <div className="notice">过审成功反馈</div>
          <h3>{funnel?.appealSuccessFeedback ?? "--"}</h3>
        </div>
        <div className="card">
          <div className="notice">过审失败反馈</div>
          <h3>{funnel?.appealFailFeedback ?? "--"}</h3>
        </div>
        <div className="card">
          <div className="notice">过审反馈覆盖率</div>
          <h3>{toPercent(funnel?.appealFeedbackRate)}</h3>
        </div>
        <div className="card">
          <div className="notice">过审信号强度</div>
          <h3>{toPercent(funnel?.approvalSignal)}</h3>
        </div>
        <div className="card">
          <div className="notice">试用风控拦截</div>
          <h3>{funnel?.trialRateLimitedCount ?? 0}</h3>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="hero" style={{ marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0 }}>每日漏斗明细</h3>
            <p>按日查看生成成功与反馈质量。</p>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>日期</th>
              <th>Ads 生成</th>
              <th>生成成功</th>
              <th>草稿采纳</th>
              <th>草稿拒绝</th>
              <th>过审成功</th>
              <th>过审失败</th>
              <th>风控拦截</th>
            </tr>
          </thead>
          <tbody>
            {(data?.daily || []).map((row) => (
              <tr key={row.day}>
                <td>{new Date(row.day).toLocaleDateString()}</td>
                <td>{row.ads_generated}</td>
                <td>{row.generation_success}</td>
                <td>{row.draft_feedback_success ?? row.feedback_success ?? 0}</td>
                <td>{row.draft_feedback_fail ?? row.feedback_fail ?? 0}</td>
                <td>{row.appeal_feedback_success ?? 0}</td>
                <td>{row.appeal_feedback_fail ?? 0}</td>
                <td>{row.trial_rate_limited ?? 0}</td>
              </tr>
            ))}
            {!data?.daily?.length && (
              <tr>
                <td colSpan={8} className="notice">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="hero" style={{ marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>模板表现</h3>
            <p>用于识别近期拒绝率激增的模板。</p>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>模板</th>
              <th>场景</th>
              <th>权重</th>
              <th>近30天生成</th>
              <th>反馈覆盖率</th>
              <th>采纳率</th>
              <th>质量分</th>
              <th>建议</th>
              <th>建议权重</th>
              <th>采纳</th>
              <th>拒绝</th>
            </tr>
          </thead>
          <tbody>
            {(data?.promptPerformance || []).map((row) => (
              <tr key={row.templateId}>
                <td>{row.name}</td>
                <td>{row.scenario}</td>
                <td>{row.weight}</td>
                <td>{row.generated}</td>
                <td>{toPercent(row.feedbackCoverage)}</td>
                <td>{toPercent(row.adoptionRate)}</td>
                <td>{toPercent(row.qualityScore)}</td>
                <td>{actionSuggestionLabel(row.actionSuggestion)}</td>
                <td>{toWeight(row.suggestedWeight)}</td>
                <td>{row.success}</td>
                <td>{row.fail}</td>
              </tr>
            ))}
            {!data?.promptPerformance?.length && (
              <tr>
                <td colSpan={11} className="notice">
                  暂无模板反馈数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
