interface OpenAIStreamParams {
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  userPrompt: string
  onToken: (token: string) => Promise<void>
}

export async function streamOpenAI(params: OpenAIStreamParams): Promise<void> {
  const { apiKey, baseUrl, model, systemPrompt, userPrompt, onToken } = params

  if (!apiKey) {
    throw new Error("缺少 AI_API_KEY")
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  })

  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(`AI 请求失败: ${response.status} ${text}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let lineBreakIndex = buffer.indexOf("\n")
    while (lineBreakIndex !== -1) {
      const line = buffer.slice(0, lineBreakIndex).trim()
      buffer = buffer.slice(lineBreakIndex + 1)

      if (line.startsWith("data:")) {
        const payload = line.replace(/^data:\s*/, "")
        if (payload === "[DONE]") return
        try {
          const json = JSON.parse(payload)
          const token = json.choices?.[0]?.delta?.content
          if (token) {
            await onToken(token)
          }
        } catch (error) {
          // 忽略单条解析错误，继续流式读取
        }
      }
      lineBreakIndex = buffer.indexOf("\n")
    }
  }
}
