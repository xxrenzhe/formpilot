const GLOBAL_SELECTORS = ["main", "article", "body"]
const HEADING_SELECTORS = ["h1", "h2", "h3", "h4"]

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

export function extractGlobalContext(maxLength = 6000): string {
  const sections: string[] = []

  HEADING_SELECTORS.forEach((selector) => {
    const nodes = Array.from(document.querySelectorAll(selector))
    nodes.forEach((node) => {
      const text = cleanText(node.textContent || "")
      if (text) sections.push(text)
    })
  })

  GLOBAL_SELECTORS.forEach((selector) => {
    const node = document.querySelector(selector)
    if (!node) return
    const text = cleanText(node.textContent || "")
    if (text) sections.push(text)
  })

  const combined = cleanText(sections.join("\n"))
  if (combined.length <= maxLength) return combined
  return combined.slice(0, maxLength)
}
