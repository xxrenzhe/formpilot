import { randomBytes } from "crypto"

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const DEFAULT_INVITE_LENGTH = 10

export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

export function formatInviteCode(input: string): string {
  const normalized = normalizeInviteCode(input)
  if (normalized.length <= 4) return normalized
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`
}

function randomInviteCode(length: number): string {
  const bytes = randomBytes(length)
  let output = ""
  for (let i = 0; i < length; i += 1) {
    output += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length]
  }
  return output
}

export function generateInviteCodes(count: number, length: number = DEFAULT_INVITE_LENGTH): string[] {
  const codes = new Set<string>()
  while (codes.size < count) {
    codes.add(randomInviteCode(length))
  }
  return Array.from(codes)
}
