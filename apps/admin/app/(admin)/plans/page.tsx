"use client"

import { useEffect, useState } from "react"
import { useAuth } from "../../lib/auth"
import { fetchUsers, updateUserPlan, type AdminUserRow } from "../../lib/api"

export default function PlansPage() {
  const { session } = useAuth()
  const [query, setQuery] = useState("")
  const [user, setUser] = useState<AdminUserRow | null>(null)
  const [plan, setPlan] = useState("free")
  const [end, setEnd] = useState("")
  const [status, setStatus] = useState("")

  useEffect(() => {
    if (user) {
      setPlan(user.plan)
      setEnd(user.currentPeriodEnd ? user.currentPeriodEnd.slice(0, 16) : "")
    }
  }, [user])

  return (
    <div>
      <div className="hero">
        <div>
          <h2>套餐管理</h2>
          <p>按用户邮箱或 UID 精准调整套餐。</p>
        </div>
      </div>

      <div className="card">
        <div className="form-row cols-2" style={{ alignItems: "center" }}>
          <input
            className="input"
            placeholder="输入邮箱或 UID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="button"
            onClick={async () => {
              setStatus("")
              if (!session) return
              const result = await fetchUsers(session.access_token, { query, page: 1, pageSize: 1 })
              setUser(result.users[0] || null)
              if (!result.users[0]) {
                setStatus("未找到用户")
              }
            }}
          >
            查询
          </button>
        </div>
        {status && <div className="notice" style={{ marginTop: 12 }}>
          {status}
        </div>}
      </div>

      {user && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <strong>{user.email || user.id}</strong>
            <div className="notice">当前套餐：{user.plan}</div>
          </div>
          <div className="form-row cols-2">
            <select className="select" value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
            <input
              className="input"
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              placeholder="到期时间"
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="button"
            onClick={async () => {
              if (!session) return
              try {
                const payload = {
                  plan,
                  currentPeriodEnd: end ? new Date(end).toISOString() : null
                }
                await updateUserPlan(session.access_token, user.id, payload)
                setStatus("已更新")
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "更新失败")
              }
            }}
          >
            保存
          </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                setPlan("pro")
                setEnd(inSevenDays.toISOString().slice(0, 16))
              }}
            >
              预设 7 天
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
