"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../../lib/auth"
import { fetchInvites, generateInvites, type InviteRow } from "../../lib/api"

const BFF_URL = process.env.NEXT_PUBLIC_BFF_URL || "http://localhost:8787"

export default function InvitesPage() {
  const { session } = useAuth()
  const [count, setCount] = useState(10)
  const [batchId, setBatchId] = useState("")
  const [generated, setGenerated] = useState<string[]>([])
  const [rows, setRows] = useState<InviteRow[]>([])
  const [status, setStatus] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterBatch, setFilterBatch] = useState("")

  const load = async () => {
    if (!session) return
    const result = await fetchInvites(session.access_token, {
      status: filterStatus === "all" ? undefined : filterStatus,
      batchId: filterBatch || undefined,
      page: 1,
      pageSize: 50
    })
    setRows(result.invites)
  }

  useEffect(() => {
    load().catch((error) => setStatus(error instanceof Error ? error.message : "加载失败"))
  }, [session, filterStatus, filterBatch])

  const generatedText = useMemo(() => generated.join("\n"), [generated])

  return (
    <div>
      <div className="hero">
        <div>
          <h2>邀请码管理</h2>
          <p>生成、导出与追踪邀请码使用情况。</p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>批量生成</h3>
          <div className="form-row cols-2" style={{ marginTop: 12 }}>
            <input
              className="input"
              type="number"
              min={1}
              max={1000}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              placeholder="数量"
            />
            <input
              className="input"
              value={batchId}
              onChange={(event) => setBatchId(event.target.value)}
              placeholder="批次号(可选)"
            />
          </div>
          <button
            type="button"
            className="button"
            style={{ marginTop: 12 }}
            onClick={async () => {
              if (!session) return
              setStatus("")
              try {
                const result = await generateInvites(session.access_token, { count, batchId: batchId || undefined })
                setGenerated(result.codes)
                load()
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "生成失败")
              }
            }}
          >
            生成邀请码
          </button>
          {generated.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="notice">已生成 {generated.length} 个邀请码</div>
              <textarea className="input" rows={6} readOnly value={generatedText} style={{ marginTop: 8 }} />
              <button
                type="button"
                className="button ghost"
                style={{ marginTop: 8 }}
                onClick={() => navigator.clipboard.writeText(generatedText)}
              >
                复制邀请码
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <h3>导出与筛选</h3>
          <div className="form-row cols-2" style={{ marginTop: 12 }}>
            <select className="select" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
              <option value="all">全部</option>
              <option value="unused">未使用</option>
              <option value="used">已使用</option>
            </select>
            <input
              className="input"
              value={filterBatch}
              onChange={(event) => setFilterBatch(event.target.value)}
              placeholder="批次号筛选"
            />
          </div>
          <button
            type="button"
            className="button ghost"
            style={{ marginTop: 12 }}
            onClick={async () => {
              if (!session) return
              try {
                const params = new URLSearchParams()
                if (filterStatus !== "all") params.set("status", filterStatus)
                if (filterBatch) params.set("batchId", filterBatch)
                const url = `${BFF_URL}/api/admin/invites/export?${params.toString()}`
                const response = await fetch(url, {
                  headers: { Authorization: `Bearer ${session.access_token}` }
                })
                if (!response.ok) throw new Error("导出失败")
                const blob = await response.blob()
                const link = document.createElement("a")
                link.href = window.URL.createObjectURL(blob)
                link.download = `invites-${Date.now()}.csv`
                link.click()
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "导出失败")
              }
            }}
          >
            导出 CSV
          </button>
          {status && <div className="notice" style={{ marginTop: 12 }}>{status}</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>邀请码</th>
              <th>批次</th>
              <th>创建时间</th>
              <th>状态</th>
              <th>兑换人</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <td>{row.code}</td>
                <td>{row.batchId || "-"}</td>
                <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}</td>
                <td>{row.redeemedAt ? "已使用" : "未使用"}</td>
                <td>{row.redeemedBy || "-"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="notice">暂无邀请码</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
