"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

interface NavLinkProps {
  href: string
  label: string
}

export default function NavLink({ href, label }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href
  return (
    <Link href={href} className={`nav-link${isActive ? " active" : ""}`}>
      {label}
    </Link>
  )
}
