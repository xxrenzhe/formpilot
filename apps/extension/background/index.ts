chrome.runtime.onInstalled.addListener(() => {
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
