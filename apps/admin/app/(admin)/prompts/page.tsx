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

function toPercent(value?: number): string {
  return `${Math.round((value || 0) * 100)}%`
}

function toWeight(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--"
  return value.toFixed(2)
}

function toSignedWeight(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--"
  if (Math.abs(value) < 0.005) return "0.00"
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`
}

function actionSuggestionLabel(value?: PromptPerformanceRow["actionSuggestion"]): string {
  if (value === "increase_weight") return "建议提权"
  if (value === "decrease_weight") return "建议降权"
  if (value === "hold") return "建议持平"
  return "继续收集样本"
}

function confidenceLabel(value?: PromptPerformanceRow["confidenceLevel"]): string {
  if (value === "high") return "高"
  if (value === "medium") return "中"
  return "低"
}

export default function PromptsPage() {
  const { session } = useAuth()
  const scenario: "ads_compliance" = "ads_compliance"
  const [templates, setTemplates] = useState<PromptTemplateRow[]>([])
  const [performance, setPerformance] = useState<PromptPerformanceRow[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [name, setName] = useState("")
  const [weight, setWeight] = useState("1")
  const [active, setActive] = useState(true)
  const [templateBody, setTemplateBody] = useState("")
  const [status, setStatus] = useState("")
  const [creating, setCreating] = useState(false)
  const [applyingSuggestion, setApplyingSuggestion] = useState(false)
  const [batchApplyingSuggestion, setBatchApplyingSuggestion] = useState(false)
  const [sandboxHint, setSandboxHint] = useState("Please draft a compliant appeal for business verification.")
  const [sandboxContext, setSandboxContext] = useState("Store URL: https://example.com\nReturn policy: https://example.com/returns")
  const [sandboxOutput, setSandboxOutput] = useState("")
  const [sandboxRunning, setSandboxRunning] = useState(false)

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedId) || null,
    [templates, selectedId]
  )
  const performanceById = useMemo(() => {
    return new Map(performance.map((item) => [item.templateId, item]))
  }, [performance])

  const load = async () => {
    if (!session) return
    setStatus("")
    try {
      const [promptRows, perfRows] = await Promise.all([
        fetchPromptTemplates(session.access_token, scenario),
        fetchPromptPerformance(session.access_token)
      ])
      setTemplates(promptRows)
      setPerformance(perfRows.filter((item) => item.scenario === scenario))
      if (!selectedId && promptRows[0]) {
        setSelectedId(promptRows[0].id)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "加载失败")
    }
  }

  useEffect(() => {
    void load()
  }, [session])

  useEffect(() => {
    if (!selectedTemplate) return
    setName(selectedTemplate.name)
    setWeight(String(selectedTemplate.weight))
    setActive(selectedTemplate.active)
    setTemplateBody(selectedTemplate.templateBody)
  }, [selectedTemplate])

  const selectedPerformance = useMemo(
    () => performanceById.get(selectedId) || null,
    [performanceById, selectedId]
  )
  const canApplySuggestion = useMemo(() => {
    if (!selectedPerformance) return false
    if (selectedPerformance.actionSuggestion !== "increase_weight" && selectedPerformance.actionSuggestion !== "decrease_weight") {
      return false
    }
    return Math.abs(selectedPerformance.suggestedDelta || 0) >= 0.01
  }, [selectedPerformance])
  const highConfidenceCandidates = useMemo(() => {
    return templates
      .map((template) => {
        const perf = performanceById.get(template.id)
        if (!perf) return null
        if (perf.confidenceLevel !== "high") return null
        if (perf.actionSuggestion !== "increase_weight" && perf.actionSuggestion !== "decrease_weight") return null
        if (Math.abs(perf.suggestedDelta || 0) < 0.01) return null
        return { template, perf }
      })
      .filter((item): item is { template: PromptTemplateRow; perf: PromptPerformanceRow } => Boolean(item))
  }, [templates, performanceById])

  return (
    <div>
      <div className="hero">
        <div>
          <h2>Prompt 热更控制台</h2>
          <p>左侧挑模板，右侧编辑并立即生效（默认人工调权，插件反馈仅作参考）。</p>
        </div>
        <span className="badge">Ads Only</span>
      </div>

      {status && <div className="notice">{status}</div>}

      <div className="grid cols-2">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>模板列表</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="button ghost"
                disabled={!highConfidenceCandidates.length || batchApplyingSuggestion}
                onClick={async () => {
                  if (!session) return
                  if (!highConfidenceCandidates.length) {
                    setStatus("当前无可批量应用的高置信建议")
                    return
                  }

                  setStatus("")
                  setBatchApplyingSuggestion(true)
                  try {
                    await Promise.all(
                      highConfidenceCandidates.map(({ template, perf }) =>
                        updatePromptTemplate(session.access_token, template.id, {
                          name: template.name,
                          templateBody: template.templateBody,
                          weight: perf.suggestedWeight,
                          active: template.active
                        })
                      )
                    )
                    setStatus(`已批量更新 ${highConfidenceCandidates.length} 个高置信模板权重`)
                    await load()
                  } catch (error) {
                    setStatus(error instanceof Error ? error.message : "批量调权失败")
                  } finally {
                    setBatchApplyingSuggestion(false)
                  }
                }}
              >
                {batchApplyingSuggestion
                  ? "批量调权中..."
                  : `批量应用高置信建议 (${highConfidenceCandidates.length})`}
              </button>
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
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {templates.map((row) => {
              const perf = performanceById.get(row.id)
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
                  <div className="notice">近30天生成 {perf?.generated || 0} · 反馈 {perf?.feedbackTotal || 0}</div>
                  <div className="notice">
                    覆盖率 {toPercent(perf?.feedbackCoverage)} · 采纳率 {toPercent(perf?.adoptionRate)}
                  </div>
                  <div className="notice">
                    质量分 {toPercent(perf?.qualityScore)} · {actionSuggestionLabel(perf?.actionSuggestion)} · 建议权重{" "}
                    {toWeight(perf?.suggestedWeight)}
                  </div>
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
                <button
                  type="button"
                  className="button ghost"
                  disabled={!canApplySuggestion || applyingSuggestion}
                  onClick={async () => {
                    if (!session || !selectedTemplate || !selectedPerformance) return
                    setStatus("")
                    setApplyingSuggestion(true)
                    try {
                      const nextWeight = selectedPerformance.suggestedWeight
                      await updatePromptTemplate(session.access_token, selectedTemplate.id, {
                        name,
                        templateBody,
                        weight: nextWeight,
                        active
                      })
                      setWeight(String(nextWeight))
                      setStatus(`已按建议调权：${toWeight(selectedTemplate.weight)} → ${toWeight(nextWeight)}`)
                      await load()
                    } catch (error) {
                      setStatus(error instanceof Error ? error.message : "建议调权失败")
                    } finally {
                      setApplyingSuggestion(false)
                    }
                  }}
                >
                  {applyingSuggestion ? "调权中..." : "按建议调权"}
                </button>
              </div>

              {selectedPerformance && (
                <div className="notice" style={{ marginTop: 12 }}>
                  近30天数据: 生成 {selectedPerformance.generated}（成功 {selectedPerformance.generationSuccess} /
                  失败 {selectedPerformance.generationFail}），反馈 {selectedPerformance.feedbackTotal}（采纳{" "}
                  {selectedPerformance.success} / 拒绝 {selectedPerformance.fail}），覆盖率{" "}
                  {toPercent(selectedPerformance.feedbackCoverage)}，采纳率{" "}
                  {toPercent(selectedPerformance.adoptionRate)}，质量分{" "}
                  {toPercent(selectedPerformance.qualityScore)}（置信度{" "}
                  {confidenceLabel(selectedPerformance.confidenceLevel)}，{actionSuggestionLabel(selectedPerformance.actionSuggestion)}）。建议权重{" "}
                  {toWeight(selectedPerformance.suggestedWeight)}（{toSignedWeight(selectedPerformance.suggestedDelta)}）
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
