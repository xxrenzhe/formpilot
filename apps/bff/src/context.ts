export function cleanText(input: string): string {
  return input.replace(/\s+/g, " ").trim()
}

export function scoreLine(line: string): number {
  if (!line) return 0
  let score = 0
  if (line.length > 20) score += 2
  if (line.length > 80) score += 1
  if (/^(cookie|privacy|terms|copyright|all rights)/i.test(line)) score -= 2
  if (/(subscribe|newsletter|sign up|login)/i.test(line)) score -= 1
  if (/(footer|header|navigation)/i.test(line)) score -= 1
  return score
}

export function summarizeContext(text: string, maxLength: number): {
  summary: string
  omitted: number
  total: number
} {
  if (!text) return { summary: "", omitted: 0, total: 0 }
  const cleaned = cleanText(text)
  if (!cleaned) return { summary: "", omitted: 0, total: 0 }

  const lines = cleaned
    .split(/\n|\r/)
    .map((line) => cleanText(line))
    .filter(Boolean)

  const scored = lines
    .map((line) => ({ line, score: scoreLine(line) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)

  const total = scored.length
  let summary = ""
  let count = 0

  for (const item of scored) {
    if (!item.line) continue
    if ((summary + " " + item.line).trim().length > maxLength) break
    summary = summary ? `${summary}\n${item.line}` : item.line
    count += 1
  }

  return {
    summary,
    omitted: Math.max(total - count, 0),
    total
  }
}
