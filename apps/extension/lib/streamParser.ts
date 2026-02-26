export type StreamSection = "translation" | "reply" | "none"

export interface StreamParserCallbacks {
  onTranslation: (text: string) => void
  onReply: (text: string) => void
}

const MARKERS = ["[TRANSLATION]", "[/TRANSLATION]", "[REPLY]", "[/REPLY]"] as const

function findNextMarker(input: string): { marker: string; index: number } | null {
  let minIndex = Number.POSITIVE_INFINITY
  let found: string | null = null

  for (const marker of MARKERS) {
    const index = input.indexOf(marker)
    if (index !== -1 && index < minIndex) {
      minIndex = index
      found = marker
    }
  }

  if (!found || minIndex === Number.POSITIVE_INFINITY) return null
  return { marker: found, index: minIndex }
}

export function createStreamParser(callbacks: StreamParserCallbacks) {
  let buffer = ""
  let current: StreamSection = "none"

  const emit = (text: string) => {
    if (!text) return
    if (current === "translation") callbacks.onTranslation(text)
    if (current === "reply") callbacks.onReply(text)
  }

  const applyMarker = (marker: string) => {
    if (marker === "[TRANSLATION]") current = "translation"
    if (marker === "[/TRANSLATION]") current = "none"
    if (marker === "[REPLY]") current = "reply"
    if (marker === "[/REPLY]") current = "none"
  }

  const flushPartial = () => {
    const tailLength = 20
    if (buffer.length <= tailLength) return
    const safe = buffer.slice(0, buffer.length - tailLength)
    buffer = buffer.slice(buffer.length - tailLength)
    emit(safe)
  }

  return {
    push(token: string) {
      buffer += token

      while (true) {
        const next = findNextMarker(buffer)
        if (!next) break
        const before = buffer.slice(0, next.index)
        emit(before)
        applyMarker(next.marker)
        buffer = buffer.slice(next.index + next.marker.length)
      }

      flushPartial()
    },
    flush() {
      emit(buffer)
      buffer = ""
    }
  }
}
