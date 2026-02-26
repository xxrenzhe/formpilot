import { env } from "../config"
import { streamOpenAI } from "./openai"

interface StreamGenerateParams {
  systemPrompt: string
  userPrompt: string
  onToken: (token: string) => Promise<void>
  apiKeyOverride?: string
}

export async function streamGenerate(params: StreamGenerateParams): Promise<void> {
  const apiKey = params.apiKeyOverride || env.aiApiKey

  if (env.aiProvider === "openai") {
    return streamOpenAI({
      apiKey,
      baseUrl: env.aiBaseUrl,
      model: env.aiModel,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      onToken: params.onToken
    })
  }

  throw new Error(`未支持的 AI_PROVIDER: ${env.aiProvider}`)
}
