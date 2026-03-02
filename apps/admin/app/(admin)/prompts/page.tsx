"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../../lib/auth"
import {
  createPromptTemplate,
  fetchPromptPerformance,
  fetchPromptTemplates,
  runPromptSandbox,
  updatePromptTemplate,
  type PromptPerformanceRow,
  type PromptTemplateRow
} from "../../lib/api"

type Scenario = "general" | "ads_compliance"

export default function PromptsPage() {
  const { session } = useAuth()
  const [scenario, setScenario] = useState<Scenario>("ads_compliance")
  const [templates, setTemplates] = useState<PromptTemplateRow[]>([])
  const [performance, setPerformance] = useState<PromptPerformanceRow[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [name, setName] = useState("")
  const [weight, setWeight] = useState("1")
  const [active, setActive] = useState(true)
  const [templateBody, setTemplateBody] = useState("")
  const [status, setStatus] = useState("")
  const [creating, setCreating] = useState(false)
  const [sandboxHint, setSandboxHint] = useState("Please draft a compliant appeal for business verification.")
  const [sandboxContext, setSandboxContext] = useState("Store URL: https://example.com\nReturn policy: https://example.com/returns")
  const [sandboxOutput, setSandboxOutput] = useState("")
  const [sandboxRunning, setSandboxRunning] = useState(false)

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedId) || null,
    [templates, selectedId]
  )

  const load = async () => {
    if (!session) return
    setStatus("")
    try {
      const [promptRows, perfRows] = await Promise.all([
        fetchPromptTemplates(session.access_token, scenario),
        fetchPromptPerformance(session.access_token)
      ])
      setTemplates(promptRows)
      setPerformance(perfRows)
      if (!selectedId && promptRows[0]) {
        setSelectedId(promptRows[0].id)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "加载失败")
    }
  }

  useEffect(() => {
    void load()
  }, [session, scenario])

  useEffect(() => {
    if (!selectedTemplate) return
    setName(selectedTemplate.name)
    setWeight(String(selectedTemplate.weight))
    setActive(selectedTemplate.active)
    setTemplateBody(selectedTemplate.templateBody)
  }, [selectedTemplate])

  const selectedPerformance = useMemo(
    () => performance.find((item) => item.templateId === selectedId) || null,
    [performance, selectedId]
  )

  return (
    <div>
      <div className="hero">
        <div>
          <h2>Prompt 热更控制台</h2>
          <p>左侧挑模板，右侧编辑并立即生效。</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={`button ${scenario === "ads_compliance" ? "" : "ghost"}`}
            onClick={() => setScenario("ads_compliance")}
          >
            Ads
          </button>
          <button
            type="button"
            className={`button ${scenario === "general" ? "" : "ghost"}`}
            onClick={() => setScenario("general")}
          >
            General
          </button>
        </div>
      </div>

      {status && <div className="notice">{status}</div>}

      <div className="grid cols-2">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>模板列表</h3>
            <button
              type="button"
              className="button ghost"
              onClick={async () => {
                if (!session) return
                setCreating(true)
                try {
                  const created = await createPromptTemplate(session.access_token, {
                    scenario,
                    name: `New ${scenario} template`,
                    templateBody: "Describe compliance strategy here.",
                    weight: 1,
                    active: true
                  })
                  setSelectedId(created.id)
                  await load()
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : "创建失败")
                } finally {
                  setCreating(false)
                }
              }}
            >
              {creating ? "创建中..." : "新建模板"}
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {templates.map((row) => {
              const perf = performance.find((item) => item.templateId === row.id)
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`card ${row.id === selectedId ? "active-card" : ""}`}
                  onClick={() => setSelectedId(row.id)}
                  style={{ textAlign: "left", padding: 12 }}
                >
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  <div className="notice">权重 {row.weight} · {row.active ? "启用" : "停用"}</div>
                  <div className="notice">成功 {perf?.success || 0} / 失败 {perf?.fail || 0}</div>
                </button>
              )
            })}
            {!templates.length && <div className="notice">暂无模板</div>}
          </div>
        </div>

        <div className="card">
          <h3>编辑模板</h3>
          {!selectedTemplate && <div className="notice">请选择左侧模板</div>}
          {selectedTemplate && (
            <>
              <div className="form-row" style={{ marginTop: 12 }}>
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="模板名称" />
                <input className="input" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="权重" />
                <label className="notice" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
                  启用模板
                </label>
                <textarea
                  className="input"
                  rows={12}
                  value={templateBody}
                  onChange={(event) => setTemplateBody(event.target.value)}
                  placeholder="模板正文"
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="button"
                  onClick={async () => {
                    if (!session || !selectedTemplate) return
                    setStatus("")
                    try {
                      await updatePromptTemplate(session.access_token, selectedTemplate.id, {
                        name,
                        templateBody,
                        weight: Number(weight) || 1,
                        active
                      })
                      setStatus("模板已热更新")
                      await load()
                    } catch (error) {
                      setStatus(error instanceof Error ? error.message : "保存失败")
                    }
                  }}
                >
                  保存并发布
                </button>
              </div>

              {selectedPerformance && (
                <div className="notice" style={{ marginTop: 12 }}>
                  当前反馈: 成功 {selectedPerformance.success} / 失败 {selectedPerformance.fail}
                </div>
              )}

              <div style={{ marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <h3 style={{ margin: "0 0 8px" }}>沙盒测试</h3>
                <div className="form-row">
                  <textarea
                    className="input"
                    rows={3}
                    value={sandboxHint}
                    onChange={(event) => setSandboxHint(event.target.value)}
                    placeholder="测试意图"
                  />
                  <textarea
                    className="input"
                    rows={4}
                    value={sandboxContext}
                    onChange={(event) => setSandboxContext(event.target.value)}
                    placeholder="测试上下文"
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="button ghost"
                    disabled={sandboxRunning}
                    onClick={async () => {
                      if (!session || !selectedTemplate) return
                      setSandboxRunning(true)
                      setStatus("")
                      try {
                        const result = await runPromptSandbox(session.access_token, {
                          scenario,
                          templateBody,
                          userHint: sandboxHint,
                          sampleGlobalContext: sandboxContext
                        })
                        setSandboxOutput(result.output)
                      } catch (error) {
                        setStatus(error instanceof Error ? error.message : "沙盒运行失败")
                      } finally {
                        setSandboxRunning(false)
                      }
                    }}
                  >
                    {sandboxRunning ? "测试中..." : "运行沙盒"}
                  </button>
                </div>
                <textarea
                  className="input"
                  rows={8}
                  readOnly
                  value={sandboxOutput}
                  placeholder="沙盒输出将在此显示"
                  style={{ marginTop: 8 }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
