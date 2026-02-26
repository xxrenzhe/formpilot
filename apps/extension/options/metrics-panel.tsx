import type { MetricsDailyRow, MetricsFunnelSummary } from "../lib/api"

interface MetricsPanelProps {
  metricsRows: MetricsDailyRow[]
  metricsSummary: MetricsFunnelSummary | null
  metricsHint: string
  isRefreshing: boolean
  onRefresh: () => void
}

export function MetricsPanel(props: MetricsPanelProps) {
  const { metricsRows, metricsSummary, metricsHint, isRefreshing, onRefresh } = props
  const ahaRate = metricsSummary ? Math.round(metricsSummary.ahaRate * 100) : 0
  const ahaHint = metricsSummary
    ? `Aha 转化率 ${ahaRate}%（复制 ${metricsSummary.copyUsers} / 生成 ${metricsSummary.generateUsers}）`
    : "暂无 Aha 数据"
  const activeHint = metricsSummary ? `DAU ${metricsSummary.dau} / MAU ${metricsSummary.mau}` : "暂无活跃数据"

  return (
    <section className="rounded-2xl border border-storm bg-white p-6 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">指标概览</h2>
        <button
          type="button"
          className="text-xs text-slate-500"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? "刷新中" : "刷新"}
        </button>
      </div>
      <p className="text-xs text-slate-500">{metricsHint}</p>
      <p className="text-xs text-slate-500">{ahaHint}</p>
      <p className="text-xs text-slate-500">{activeHint}</p>
      <div className="grid md:grid-cols-2 gap-3 text-xs text-slate-600">
        {metricsRows.map((row) => (
          <div key={row.day} className="rounded-xl border border-storm p-3">
            <div className="font-semibold text-slate-700">
              {new Date(row.day).toLocaleDateString("zh-CN")}
            </div>
            <div className="mt-1">打开: {row.panel_users}</div>
            <div>生成: {row.generate_users}</div>
            <div>复制: {row.copy_users}</div>
            <div>Paywall: {row.paywall_users}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
