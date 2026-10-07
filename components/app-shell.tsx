"use client"

import { BookOpen, Compass, GraduationCap, LogOut, Newspaper, Users } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { Brand } from "@/components/brand"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { roleHome, useUser } from "@/hooks/use-user"
import { ApiError, getMe, isSessionFresh, logout, markSessionVerified, saveUser, type Role } from "@/lib/api"
import { cn } from "@/lib/utils"

const NAV: Record<Role, { href: string; label: string; icon: typeof BookOpen }[]> = {
  admin: [
    { href: "/courses", label: "All courses", icon: BookOpen },
    { href: "/feed", label: "My courses", icon: Newspaper },
    { href: "/enrollments", label: "Enrollments", icon: Users },
  ],
  instructor: [
    { href: "/feed", label: "My classroom", icon: Newspaper },
    { href: "/explore", label: "Explore", icon: Compass },
  ],
  student: [
    { href: "/feed", label: "My learning", icon: GraduationCap },
    { href: "/explore", label: "Explore", icon: Compass },
  ],
}

// The server is the source of truth for who is signed in and their role.
// The cached profile in local storage lets the page render instantly; it is periodically verified and refreshed in the background.
function useVerifiedSession(userId: string | undefined) {
  const [verifiedFor, setVerifiedFor] = useState<string | null>(() => userId ?? null)

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    const verify = () => {
      getMe()
        .then((me) => {
          markSessionVerified()
          saveUser(me) // picks up a changed role or name
          if (!cancelled) setVerifiedFor(me.id)
        })
        .catch((e) => {
          // If offline or non-401 network issue: keep cached session.
          // 401 calls clearUser() inside call() which triggers re-render via useUser() -> sign out.
          if (!(e instanceof ApiError && e.status === 401) && !cancelled) {
            setVerifiedFor(userId)
          }
        })
    }

    if (!isSessionFresh()) {
      verify()
    } else {
      setVerifiedFor(userId)
    }

    // Keep session active in the background by refreshing/verifying every 4 minutes (well before 14m expiry)
    const interval = setInterval(() => {
      verify()
    }, 4 * 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [userId])

  return !!userId && verifiedFor === userId
}

/**
 * Page frame + client-side route guard. The UI only shows what a role can do;
 * the API enforces the same rules on the server, so this is a convenience, not the security boundary.
 */
export function AppShell({
  roles,
  bare,
  children,
}: {
  roles?: Role[]
  /** Guard only, no header/footer/container: for full-bleed pages like the video player. */
  bare?: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useUser()
  const verified = useVerifiedSession(user?.id)
  const allowed = !!user && (!roles || roles.includes(user.role))

  useEffect(() => {
    if (user === undefined) return // still hydrating
    if (!user) router.replace("/login")
    else if (!allowed && verified) router.replace(roleHome(user.role))
  }, [user, allowed, verified, router])

  if (!user || !allowed || !verified) return null
  if (bare) return children

  return (
    <div className="flex min-h-svh flex-col bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-border bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between gap-4 px-6 lg:px-8">
          <div className="flex items-center gap-10">
            <Link href={roleHome(user.role)} aria-label="Home">
              <Brand />
            </Link>
            <nav aria-label="Primary" className="hidden items-center gap-7 sm:flex">
              {NAV[user.role].map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 border-b-2 border-transparent py-1 text-sm font-medium text-heading transition-colors duration-200 hover:text-teal",
                      active && "border-teal text-teal"
                    )}
                  >
                    <Icon className="size-4" strokeWidth={1.75} />
                    {label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right md:block">
              <div className="text-sm leading-tight font-semibold text-heading">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
            <Badge variant="tag">{user.role}</Badge>
            <Button
              variant="navy"
              size="sm"
              onClick={async () => {
                await logout().catch(() => {})
                router.replace("/login")
              }}
            >
              <LogOut />
              Sign out
            </Button>
          </div>
        </div>
        <nav aria-label="Primary mobile" className="flex gap-6 overflow-x-auto border-t border-border px-6 sm:hidden">
          {NAV[user.role].map(({ href, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "border-b-2 border-transparent py-3 text-sm font-medium whitespace-nowrap text-heading",
                  active && "border-teal text-teal"
                )}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 space-y-8 px-6 py-12 lg:px-8 lg:py-14">{children}</main>
      <footer className="bg-navy">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5 text-xs text-white/60 lg:px-8">
          <Brand onDark className="[&_span]:text-sm [&>div]:size-7" />
          <span>© {new Date().getFullYear()} LMS Platform</span>
        </div>
      </footer>
    </div>
  )
}

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="rise relative overflow-hidden rounded-xl bg-gradient-to-br from-[#E3F2C9] via-[#CBE8DC] to-[#8FC3CB] px-6 py-9 sm:px-10 sm:py-12">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full border border-white/50" />
      <div aria-hidden className="pointer-events-none absolute -right-4 -bottom-28 size-72 rounded-full border border-white/40" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl space-y-3">
          <h1 className="text-3xl leading-[1.1] font-semibold tracking-tight text-heading sm:text-5xl">{title}</h1>
          {subtitle && <p className="text-base leading-relaxed text-heading/80 sm:text-lg">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  )
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
    </p>
  )
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong")
