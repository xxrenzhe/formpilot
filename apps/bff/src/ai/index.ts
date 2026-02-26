import { env } from "../config"
import { streamOpenAI } from "./openai"

interface StreamGenerateParams {
  systemPrompt: string
  userPrompt: string
  onToken: (token: string) => Promise<void>
  apiKeyOverride?: string
  modelOverride?: string
}

export async function streamGenerate(params: StreamGenerateParams): Promise<void> {
  const apiKey = params.apiKeyOverride || env.aiApiKey
  const model = params.modelOverride || env.aiModel

  if (env.aiProvider === "openai") {
    return streamOpenAI({
      apiKey,
      baseUrl: env.aiBaseUrl,
      model,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      onToken: params.onToken
    })
  }

  throw new Error(`未支持的 AI_PROVIDER: ${env.aiProvider}`)
}
