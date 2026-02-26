"use client"

import { useEffect, useState } from "react"
import { useAuth } from "../../lib/auth"
import { fetchAnalytics, type AnalyticsOverview } from "../../lib/api"

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
  const toPercent = (value?: number) => `${Math.round((value || 0) * 100)}%`

  return (
    <div>
      <div className="hero">
        <div>
          <h2>转化概览</h2>
          <p>基于最近 30 天的漏斗与付费转化。</p>
        </div>
        <span className="badge">实时更新</span>
      </div>

      {status && <div className="notice">{status}</div>}

      <div className="grid cols-3">
        <div className="card">
          <div className="notice">DAU / MAU</div>
          <h3>{funnel ? `${funnel.dau} / ${funnel.mau}` : "--"}</h3>
        </div>
        <div className="card">
          <div className="notice">生成 → 复制</div>
          <h3>{toPercent(funnel?.ahaRate)}</h3>
        </div>
        <div className="card">
          <div className="notice">生成 → Paywall</div>
          <h3>{toPercent(funnel?.paywallRate)}</h3>
        </div>
        <div className="card">
          <div className="notice">付费转化率</div>
          <h3>{toPercent(funnel?.paidConversionRate)}</h3>
        </div>
        <div className="card">
          <div className="notice">付费用户数</div>
          <h3>{funnel?.paidUsers ?? "--"}</h3>
        </div>
        <div className="card">
          <div className="notice">生成用户数</div>
          <h3>{funnel?.generateUsers ?? "--"}</h3>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="hero" style={{ marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0 }}>每日指标</h3>
            <p>Panel/生成/复制/Paywall 的日级趋势。</p>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>日期</th>
              <th>打开</th>
              <th>生成</th>
              <th>复制</th>
              <th>Paywall</th>
            </tr>
          </thead>
          <tbody>
            {(data?.daily || []).map((row) => (
              <tr key={row.day}>
                <td>{new Date(row.day).toLocaleDateString()}</td>
                <td>{row.panel_users}</td>
                <td>{row.generate_users}</td>
                <td>{row.copy_users}</td>
                <td>{row.paywall_users}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
