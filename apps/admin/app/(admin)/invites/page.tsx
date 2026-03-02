"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../../lib/auth"
import { fetchInvites, generateInvites, type InviteRow, type InviteBatchRow } from "../../lib/api"

const BFF_URL = process.env.NEXT_PUBLIC_BFF_URL || "http://localhost:8787"

export default function InvitesPage() {
  const { session } = useAuth()
  const [count, setCount] = useState(100)
  const [credits, setCredits] = useState(50)
  const [batchNote, setBatchNote] = useState("")
  const [generated, setGenerated] = useState<string[]>([])
  const [rows, setRows] = useState<InviteRow[]>([])
  const [batchRows, setBatchRows] = useState<InviteBatchRow[]>([])
  const [status, setStatus] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterBatch, setFilterBatch] = useState("")

  const load = async () => {
    if (!session) return
    const result = await fetchInvites(session.access_token, {
      status: filterStatus === "all" ? undefined : filterStatus,
      batchNote: filterBatch || undefined,
      page: 1,
      pageSize: 100
    })
    setRows(result.invites)
    setBatchRows(result.batches)
  }

  useEffect(() => {
    load().catch((error) => setStatus(error instanceof Error ? error.message : "加载失败"))
  }, [session, filterStatus, filterBatch])

  const generatedText = useMemo(() => generated.join("\n"), [generated])

  return (
    <div>
      <div className="hero">
        <div>
          <h2>The Mint</h2>
          <p>直营发码、16 位大写充值码库存对账、CSV 导出。</p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>批量制码</h3>
          <div className="form-row cols-2" style={{ marginTop: 12 }}>
            <input
              className="input"
              type="number"
              min={1}
              max={5000}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              placeholder="生成数量"
            />
            <input
              className="input"
              type="number"
              min={1}
              max={5000}
              value={credits}
              onChange={(event) => setCredits(Number(event.target.value))}
              placeholder="点数面额"
            />
          </div>
          <input
            className="input"
            style={{ marginTop: 12 }}
            value={batchNote}
            onChange={(event) => setBatchNote(event.target.value)}
            placeholder='批次备注（例如：2026-03-01 跨境社群活动直销包）'
          />
          <button
            type="button"
            className="button"
            style={{ marginTop: 12 }}
            onClick={async () => {
              if (!session) return
              if (!batchNote.trim()) {
                setStatus("请先填写批次备注")
                return
              }
              setStatus("")
              try {
                const result = await generateInvites(session.access_token, {
                  count,
                  credits,
                  batchNote: batchNote.trim()
                })
                setGenerated(result.codes)
                await load()
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "生成失败")
              }
            }}
          >
            生成充值码
          </button>
          {generated.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="notice">已生成 {generated.length} 个充值码</div>
              <textarea className="input" rows={6} readOnly value={generatedText} style={{ marginTop: 8 }} />
              <button
                type="button"
                className="button ghost"
                style={{ marginTop: 8 }}
                onClick={() => navigator.clipboard.writeText(generatedText)}
              >
                复制充值码
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <h3>筛选与导出</h3>
          <div className="form-row cols-2" style={{ marginTop: 12 }}>
            <select className="select" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
              <option value="all">全部</option>
              <option value="unused">未兑换</option>
              <option value="used">已兑换</option>
            </select>
            <input
              className="input"
              value={filterBatch}
              onChange={(event) => setFilterBatch(event.target.value)}
              placeholder="按批次备注筛选"
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
                if (filterBatch) params.set("batchNote", filterBatch)
                const url = `${BFF_URL}/api/admin/invites/export?${params.toString()}`
                const response = await fetch(url, {
                  headers: { Authorization: `Bearer ${session.access_token}` }
                })
                if (!response.ok) throw new Error("导出失败")
                const blob = await response.blob()
                const link = document.createElement("a")
                link.href = window.URL.createObjectURL(blob)
                link.download = `credits-batches-${Date.now()}.csv`
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
        <h3 style={{ marginTop: 0 }}>批次对账网格</h3>
        <table className="table">
          <thead>
            <tr>
              <th>批次备注</th>
              <th>面额(点数)</th>
              <th>总发码量</th>
              <th>已兑换</th>
              <th>剩余库存</th>
            </tr>
          </thead>
          <tbody>
            {batchRows.map((row) => (
              <tr key={`${row.batchNote}-${row.credits}`}>
                <td>{row.batchNote}</td>
                <td>{row.credits}</td>
                <td>{row.total}</td>
                <td>{row.redeemed}</td>
                <td>{row.remaining}</td>
              </tr>
            ))}
            {!batchRows.length && (
              <tr>
                <td colSpan={5} className="notice">暂无批次</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>充值码明细</h3>
        <table className="table">
          <thead>
            <tr>
              <th>充值码</th>
              <th>批次</th>
              <th>点数</th>
              <th>创建时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <td>{row.code}</td>
                <td>{row.batchNote || "-"}</td>
                <td>{row.credits}</td>
                <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}</td>
                <td>{row.redeemedAt ? "已兑换" : "未兑换"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="notice">暂无充值码</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
