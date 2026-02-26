"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import NavLink from "../components/NavLink"
import { supabase } from "../lib/supabase"
import { useAuth } from "../lib/auth"
import { ApiError, fetchSystemHealth } from "../lib/api"

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { session, loading, user } = useAuth()
  const [accessChecked, setAccessChecked] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [accessError, setAccessError] = useState("")

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login")
    }
  }, [loading, session, router])

  useEffect(() => {
    if (!session) return
    setAccessChecked(false)
    setAccessDenied(false)
    setAccessError("")
    fetchSystemHealth(session.access_token)
      .then(() => {
        setAccessChecked(true)
      })
      .catch((error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setAccessDenied(true)
          setAccessChecked(true)
          supabase.auth.signOut().finally(() => router.replace("/login"))
          return
        }
        setAccessError(error instanceof Error ? error.message : "权限校验失败")
        setAccessChecked(true)
      })
  }, [session, router])

  if (loading || (session && !accessChecked)) {
    return (
      <div className="main">
        <div className="card">加载中...</div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  if (accessDenied) {
    return (
      <div className="main">
        <div className="card">当前账号无管理员权限，请联系管理员。</div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <aside className="sidebar">
        <h1>FormPilot Admin</h1>
        <NavLink href="/analytics" label="概览" />
        <NavLink href="/users" label="用户" />
        <NavLink href="/plans" label="套餐" />
        <NavLink href="/invites" label="邀请码" />
        <NavLink href="/system" label="系统" />
        <div style={{ marginTop: 24, fontSize: 12, color: "var(--muted)" }}>{user?.email}</div>
        <button
          type="button"
          className="button ghost"
          style={{ marginTop: 12 }}
          onClick={async () => {
            await supabase.auth.signOut()
            router.replace("/login")
          }}
        >
          退出登录
        </button>
      </aside>
      <main className="main">
        {accessError && <div className="card">{accessError}</div>}
        {children}
      </main>
    </div>
  )
}
