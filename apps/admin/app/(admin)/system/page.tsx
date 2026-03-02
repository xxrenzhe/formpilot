"use client"

import { useEffect, useState } from "react"
import { useAuth } from "../../lib/auth"
import { fetchSystemHealth, type SystemHealth } from "../../lib/api"

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className={`status-dot ${ok ? "status-ok" : "status-bad"}`} />
      <span>{label}</span>
    </div>
  )
}

export default function SystemPage() {
  const { session } = useAuth()
  const [data, setData] = useState<SystemHealth | null>(null)
  const [status, setStatus] = useState("")

  useEffect(() => {
    if (!session) return
    fetchSystemHealth(session.access_token)
      .then(setData)
      .catch((error) => setStatus(error instanceof Error ? error.message : "加载失败"))
  }, [session])

  return (
    <div>
      <div className="hero">
        <div>
          <h2>系统健康</h2>
          <p>检查 API、数据库与模板可用性。</p>
        </div>
      </div>

      {status && <div className="notice">{status}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h3>服务状态</h3>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <StatusBadge ok={data?.bff.ok ?? false} label="BFF API" />
            <StatusBadge ok={data?.supabase.ok ?? false} label="Supabase" />
          </div>
          <div className="notice" style={{ marginTop: 12 }}>
            启用模板数：{data?.promptTemplates.active ?? "--"}
          </div>
        </div>
        <div className="card">
          <h3>最近 24 小时错误</h3>
          <div style={{ fontSize: 28, fontWeight: 600, marginTop: 12 }}>{data?.recentErrors ?? "--"}</div>
          <p className="notice">基于 usage_logs 中 success=false 的数量。</p>
        </div>
      </div>
    </div>
  )
}
