"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../../lib/auth"
import { fetchUsers, updateUserPlan, type AdminUserRow } from "../../lib/api"

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function UsersPage() {
  const { session } = useAuth()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)

  const totalPages = useMemo(() => Math.max(Math.ceil(total / pageSize), 1), [total, pageSize])

  const load = async () => {
    if (!session) return
    setLoading(true)
    setStatus("")
    try {
      const result = await fetchUsers(session.access_token, { query, page, pageSize })
      setRows(result.users)
      setTotal(result.total)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }

  const applyPlan = async (userId: string, payload: { plan: string; currentPeriodEnd?: string | null }) => {
    if (!session) return
    setStatus("")
    try {
      await updateUserPlan(session.access_token, userId, payload)
      await load()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "更新失败")
    }
  }

  useEffect(() => {
    load()
  }, [session, page])

  return (
    <div>
      <div className="hero">
        <div>
          <h2>用户管理</h2>
          <p>按邮箱或 UID 搜索，并快速调整套餐。</p>
        </div>
      </div>

      <div className="card">
        <div className="form-row cols-2" style={{ alignItems: "center" }}>
          <input
            className="input"
            placeholder="搜索邮箱或 UID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="button"
            onClick={() => {
              setPage(1)
              load()
            }}
          >
            搜索
          </button>
        </div>
        {status && <div className="notice" style={{ marginTop: 12 }}>
          {status}
        </div>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>用户</th>
              <th>套餐</th>
              <th>到期时间</th>
              <th>最近使用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div>{row.email || "-"}</div>
                  <div className="notice">{row.id}</div>
                </td>
                <td>{row.plan}</td>
                <td>{formatDate(row.currentPeriodEnd)}</td>
                <td>{formatDate(row.lastUsage)}</td>
                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={async () => {
                        await applyPlan(row.id, { plan: "free", currentPeriodEnd: null })
                      }}
                    >
                      设为 Free
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={async () => {
                        const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                        await applyPlan(row.id, { plan: "pro", currentPeriodEnd: end })
                      }}
                    >
                      7 天 Pro
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={async () => {
                        const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                        await applyPlan(row.id, { plan: "pro", currentPeriodEnd: end })
                      }}
                    >
                      30 天 Pro
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td colSpan={5} className="notice">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, alignItems: "center" }}>
          <div className="notice">
            共 {total} 条，当前第 {page} / {totalPages} 页
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="button ghost"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            >
              上一页
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
