import { useEffect, useState } from "react"
import OptionsConsolePage from "./console-page"
import { LongDocWorkspace } from "./longdoc-workspace"

type OptionsView = "console" | "longdoc"

function resolveViewFromHash(hash: string): OptionsView {
  return hash === "#longdoc" ? "longdoc" : "console"
}

export default function OptionsPageRouter() {
  const [view, setView] = useState<OptionsView>(() => resolveViewFromHash(window.location.hash))

  useEffect(() => {
    const handleHashChange = () => {
      setView(resolveViewFromHash(window.location.hash))
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  if (view === "longdoc") {
    return <LongDocWorkspace />
  }

  return <OptionsConsolePage />
}
