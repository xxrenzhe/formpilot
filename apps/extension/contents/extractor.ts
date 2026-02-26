import type { FieldContext, PageContext } from "@formpilot/shared"

const QUESTION_KEYWORDS = [
  "upload",
  "proposal",
  "document",
  "pdf",
  "file",
  "portfolio",
  "design"
]

export function extractPageContext(): PageContext {
  const title = document.title || ""
  const description =
    (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content || ""
  const lang = document.documentElement.lang || "en"
  return {
    title,
    description,
    lang,
    url: window.location.href
  }
}

function getLabelFromForId(target: HTMLElement): string {
  const id = target.getAttribute("id")
  if (!id) return ""
  const labelEl = document.querySelector(`label[for="${id}"]`) as HTMLElement | null
  return labelEl?.innerText?.trim() || ""
}

function getLabelFromAria(target: HTMLElement): string {
  return target.getAttribute("aria-label") || ""
}

function getParentText(target: HTMLElement): string {
  const parent = target.parentElement
  if (!parent) return ""
  const value = (target as HTMLInputElement).value || ""
  const text = parent.innerText || ""
  return text.replace(value, "").trim()
}

export function extractFieldContext(target: HTMLElement): FieldContext {
  const inputType = target.getAttribute("type") || target.tagName.toLowerCase()

  let label = getLabelFromForId(target)
  if (!label) label = getLabelFromAria(target)
  if (!label) label = getParentText(target)

  return {
    label,
    placeholder: target.getAttribute("placeholder") || "",
    type: inputType,
    surroundingText: getSurroundingText(target)
  }
}

export function getSurroundingText(target: HTMLElement): string {
  const container = target.closest("label") || target.parentElement
  if (!container) return ""
  const text = container.textContent || ""
  return text.replace((target as HTMLInputElement).value || "", "").trim()
}

export function detectLongDoc(field: FieldContext): boolean {
  const text = `${field.label} ${field.placeholder} ${field.surroundingText || ""}`.toLowerCase()
  return QUESTION_KEYWORDS.some((keyword) => text.includes(keyword))
}
