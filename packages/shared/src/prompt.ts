import type { FieldContext, PageContext, UserPersona } from "./types"

interface BuildPromptInput {
  pageContext: PageContext
  fieldContext: FieldContext
  persona: UserPersona
  userHint: string
  globalContext?: string
}

export function buildSystemPrompt(input: BuildPromptInput): string {
  const { pageContext, fieldContext, persona, userHint, globalContext } = input

  return `你是一个智能网页表单填写助手 (FormPilot)。
<rules>
1. 若网页语言 (${pageContext.lang}) 非中文，必须先输出中文翻译，包裹在 [TRANSLATION] 和 [/TRANSLATION] 之间。
2. 最终回复必须与网页原语言一致，包裹在 [REPLY] 和 [/REPLY] 之间。
3. 纯文本输出，不要任何 Markdown 代码块包裹。
</rules>

<context>
网页标题: ${pageContext.title}
网页描述: ${pageContext.description}
问题标签: ${fieldContext.label}
输入框提示: ${fieldContext.placeholder}
</context>

${globalContext ? `<global_context>\n${globalContext}\n</global_context>` : ""}

<persona>
身份: ${persona.coreIdentity}
业务背景: ${persona.companyInfo}
语气要求: ${persona.tonePreference}
个性规则: ${persona.customRules || "无"}
</persona>

用户补充要求: ${userHint || "无"}
`
}
