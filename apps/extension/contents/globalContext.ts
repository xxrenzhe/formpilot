function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export function extractGlobalContext(maxLength = 6000): string {
  // 靶向提取：只抓取核心区域，屏蔽侧边栏和底栏噪音
  const selectors = [
    "main",
    "form",
    "article",
    ".action-card",
    ".form-container",
    ".main-content",
    "[role='main']",
    "#main-content"
  ]

  let elements: Element[] = []
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector))
    if (candidates.length === 0) continue

    const meaningful = candidates.filter((el) => cleanText((el as HTMLElement).innerText || "").length >= 80)
    if (meaningful.length > 0) {
      elements = meaningful
      break
    }
  }

  if (elements.length === 0) return ""

  const seen = new Set<string>()
  const blocks: string[] = []
  for (const element of elements) {
    const normalized = cleanText((element as HTMLElement).innerText || "")
    if (!normalized || normalized.length < 40 || seen.has(normalized)) continue
    seen.add(normalized)
    blocks.push(normalized)
  }

  if (blocks.length === 0) return ""

  const combined = blocks.join("\n")
  if (combined.length <= maxLength) return combined
  return combined.slice(0, maxLength)
}
