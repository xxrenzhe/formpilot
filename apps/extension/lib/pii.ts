export type MaskPair = [string, string]

const DEFAULT_PATTERNS = [/\b\d{2}-?\d{7}\b/g, /\b\d{8,18}\b/g]

export function maskSensitiveText(
  input: string,
  startIndex = 1
): { masked: string; pairs: MaskPair[]; nextIndex: number } {
  let masked = input
  const pairs: MaskPair[] = []
  let count = Math.max(startIndex, 1) - 1

  DEFAULT_PATTERNS.forEach((pattern) => {
    masked = masked.replace(pattern, (match) => {
      count += 1
      const key = `[MASKED_${count}]`
      pairs.push([key, match])
      return key
    })
  })

  return { masked, pairs, nextIndex: count + 1 }
}

export function restoreMaskedText(input: string, pairs: MaskPair[]): string {
  let output = input
  pairs.forEach(([key, value]) => {
    output = output.split(key).join(value)
  })
  return output
}

export function containsSensitiveValue(value: string): boolean {
  if (!value) return false
  return DEFAULT_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(value)
  })
}
