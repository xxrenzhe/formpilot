const DEVICE_ID_KEY = "deviceId.v1"

function createDeviceId(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  let value = "fpdev_"
  for (let i = 0; i < bytes.length; i += 1) {
    value += charset[bytes[i] % charset.length]
  }
  return value
}

async function getOrCreateDeviceId(): Promise<string> {
  const stored = await chrome.storage.local.get(DEVICE_ID_KEY)
  const existing = stored?.[DEVICE_ID_KEY]
  if (typeof existing === "string" && existing) {
    return existing
  }
  const next = createDeviceId()
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: next })
  return next
}

chrome.runtime.onInstalled.addListener(() => {
  void getOrCreateDeviceId()
  chrome.contextMenus.create({
    id: "formpilot-send",
    title: "发送给 FormPilot",
    contexts: ["selection"]
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "formpilot-send") return
  if (!info.selectionText || !tab?.id) return

  chrome.tabs.sendMessage(tab.id, {
    action: "openManual",
    text: info.selectionText
  })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === "getDeviceId") {
    void getOrCreateDeviceId()
      .then((deviceId) => sendResponse({ deviceId }))
      .catch(() => sendResponse({ deviceId: null }))
    return true
  }

  if (message?.action === "proxyFetch") {
    const req = message.request as {
      url: string
      method?: string
      headers?: Record<string, string>
      body?: string
    }

    void (async () => {
      try {
        const response = await fetch(req.url, {
          method: req.method || "GET",
          headers: req.headers || {},
          body: req.body
        })
        const text = await response.text()
        sendResponse({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          body: text
        })
      } catch (error) {
        sendResponse({
          ok: false,
          status: 0,
          statusText: "network_error",
          body: error instanceof Error ? error.message : "network_error"
        })
      }
    })()

    return true
  }

  return false
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "proxy-stream") return

  let connected = true
  const controllers = new Map<string, AbortController>()

  const safePost = (message: unknown): boolean => {
    if (!connected) return false
    try {
      port.postMessage(message)
      return true
    } catch {
      return false
    }
  }

  const abortRequest = (requestId: string) => {
    const controller = controllers.get(requestId)
    if (!controller) return
    controllers.delete(requestId)
    controller.abort()
  }

  const abortAll = () => {
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
  }

  port.onDisconnect.addListener(() => {
    connected = false
    abortAll()
  })

  port.onMessage.addListener((message: {
    action?: string
    requestId?: string
    request?: {
      url: string
      method?: string
      headers?: Record<string, string>
      body?: string
    }
  }) => {
    if (!message?.requestId) {
      return
    }

    const { requestId } = message
    if (message.action === "cancelStream") {
      abortRequest(requestId)
      safePost({
        requestId,
        type: "done"
      })
      return
    }

    if (message?.action !== "startStream" || !message.request?.url) {
      return
    }

    const { request } = message
    abortRequest(requestId)

    void (async () => {
      const controller = new AbortController()
      controllers.set(requestId, controller)

      try {
        const response = await fetch(request.url, {
          method: request.method || "GET",
          headers: request.headers || {},
          body: request.body,
          signal: controller.signal
        })

        if (!response.ok || !response.body) {
          const body = await response.text()
          safePost({
            requestId,
            type: "error-response",
            status: response.status,
            body
          })
          controllers.delete(requestId)
          return
        }

        if (!safePost({
          requestId,
          type: "response",
          status: response.status
        })) {
          abortRequest(requestId)
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          if (chunk) {
            if (!safePost({
              requestId,
              type: "chunk",
              chunk
            })) {
              abortRequest(requestId)
              return
            }
          }
        }

        const tail = decoder.decode()
        if (tail) {
          if (!safePost({
            requestId,
            type: "chunk",
            chunk: tail
          })) {
            abortRequest(requestId)
            return
          }
        }

        safePost({
          requestId,
          type: "done"
        })
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          safePost({
            requestId,
            type: "done"
          })
          return
        }
        safePost({
          requestId,
          type: "stream-error",
          message: error instanceof Error ? error.message : "network_error"
        })
      } finally {
        controllers.delete(requestId)
      }
    })()
  })
})
