"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseClient } from "../lib/supabase"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)

  return (
    <div style={{ maxWidth: 420, margin: "10vh auto", padding: "0 16px" }}>
      <div className="card">
        <div className="hero" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <h2>管理后台登录</h2>
          <p>仅限管理员账号访问。</p>
        </div>
        <div className="form-row">
          <input
            className="input"
            placeholder="邮箱"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="input"
            placeholder="密码"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="button"
            disabled={loading}
            onClick={async () => {
              setStatus("")
              setLoading(true)
              try {
                const supabase = getSupabaseClient()
                const { error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error
                router.replace("/analytics")
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "登录失败")
              } finally {
                setLoading(false)
              }
            }}
          >
            {loading ? "登录中" : "登录"}
          </button>
          {status && <div className="notice">{status}</div>}
        </div>
      </div>
    </div>
  )
}
