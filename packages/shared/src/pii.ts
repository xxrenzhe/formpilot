import type { FieldContext } from "./types"

const DEFAULT_PII_KEYWORDS = [
  "password",
  "passcode",
  "email",
  "e-mail",
  "phone",
  "mobile",
  "ssn",
  "social security",
  "tax id",
  "taxid",
  "passport",
  "credit card",
  "card number",
  "cvv",
  "bank",
  "account number"
]

const DEFAULT_PII_INPUT_TYPES = new Set(["password", "email", "tel"])

export function containsPii(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return DEFAULT_PII_KEYWORDS.some((keyword) => lower.includes(keyword))
}

export function isPiiField(field: FieldContext): boolean {
  const type = (field.type || "").toLowerCase()
  if (DEFAULT_PII_INPUT_TYPES.has(type)) return true
  return containsPii(`${field.label} ${field.placeholder} ${field.surroundingText || ""}`)
}
