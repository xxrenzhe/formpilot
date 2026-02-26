import type { Context } from "hono"
import type { GenerateErrorResponse } from "@formpilot/shared"

export function jsonError(
  c: Context,
  status: number,
  payload: GenerateErrorResponse
): Response {
  return c.json(payload, status)
}
