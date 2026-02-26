import "./globals.css"
import type { ReactNode } from "react"
import { Space_Grotesk } from "next/font/google"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans" })

export const metadata = {
  title: "FormPilot Admin",
  description: "FormPilot admin console"
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body>{children}</body>
    </html>
  )
}
