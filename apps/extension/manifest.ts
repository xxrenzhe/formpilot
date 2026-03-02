import type { PlasmoManifest } from "plasmo"

const manifest: PlasmoManifest = {
  manifest_version: 3,
  name: "FormPilot",
  version: "0.1.0",
  description: "Google Ads Compliance Appeal Co-Pilot",
  icons: {
    "16": "assets/icon.png",
    "32": "assets/icon.png",
    "128": "assets/icon.png"
  },
  permissions: ["storage", "contextMenus"],
  host_permissions: ["<all_urls>"],
  background: {
    service_worker: "background/index.ts"
  },
  options_ui: {
    page: "options/index.html",
    open_in_tab: true
  }
}

export default manifest
