"use client"

import { useEffect, useState } from "react"
import { useAuth } from "../../lib/auth"
import { fetchAnalytics, type AnalyticsOverview } from "../../lib/api"

function toPercent(value?: number): string {
  return `${Math.round((value || 0) * 100)}%`
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
          <h2>本周草稿采纳漏斗</h2>
          <p>围绕 Ads 申诉生成与草稿采纳/拒绝反馈追踪。</p>
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
          <h3>{funnel?.successFeedback ?? "--"}</h3>
        </div>
        <div className="card">
          <div className="notice">草稿拒绝数</div>
          <h3>{funnel?.failFeedback ?? "--"}</h3>
        </div>
        <div className="card">
          <div className="notice">反馈回收率</div>
          <h3>{toPercent(funnel?.feedbackRate)}</h3>
        </div>
        <div className="card">
          <div className="notice">采纳信号强度</div>
          <h3>{toPercent(funnel?.approvalSignal)}</h3>
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
              <th>采纳</th>
              <th>拒绝</th>
            </tr>
          </thead>
          <tbody>
            {(data?.daily || []).map((row) => (
              <tr key={row.day}>
                <td>{new Date(row.day).toLocaleDateString()}</td>
                <td>{row.ads_generated}</td>
                <td>{row.generation_success}</td>
                <td>{row.feedback_success}</td>
                <td>{row.feedback_fail}</td>
              </tr>
            ))}
            {!data?.daily?.length && (
              <tr>
                <td colSpan={5} className="notice">
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
                <td>{row.success}</td>
                <td>{row.fail}</td>
              </tr>
            ))}
            {!data?.promptPerformance?.length && (
              <tr>
                <td colSpan={5} className="notice">
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
