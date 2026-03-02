import { randomBytes } from "crypto"

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const RAW_INVITE_LENGTH = 16

function randomRawCode(length: number): string {
  const bytes = randomBytes(length)
  let output = ""
  for (let i = 0; i < length; i += 1) {
    output += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length]
  }
  return output
}

export function normalizeInviteCode(input: string): string {
  const normalized = input.toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (normalized.startsWith("FPADS")) {
    return normalized.slice(5)
  }
  return normalized
}

export function formatInviteCode(raw: string): string {
  const normalized = normalizeInviteCode(raw)
  const chunks = normalized.match(/.{1,4}/g) || [normalized]
  return `FP-ADS-${chunks.join("-")}`
}

export function generateInviteCodes(count: number): string[] {
  const codes = new Set<string>()
  while (codes.size < count) {
    codes.add(randomRawCode(RAW_INVITE_LENGTH))
  }
  return Array.from(codes)
}
