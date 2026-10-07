import { BarChart3, BookOpen, Users } from "lucide-react"

import { Brand } from "@/components/brand"

// Two-column layout shared by every signed-out auth screen: brand panel + form panel.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh bg-white lg:grid-cols-[5fr_6fr]">
      {/* Brand panel */}
      <aside className="relative hidden bg-navy lg:flex lg:flex-col lg:justify-between lg:p-14">
        <Brand onDark />

        <div className="max-w-md space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl leading-[1.1] font-medium tracking-tight text-white">
              Learn at your own pace, grow without limits.
            </h2>
            <p className="text-base leading-relaxed text-white/75">
              Courses, progress tracking and community — all in one clean workspace.
            </p>
          </div>
          <ul className="space-y-4">
            {[
              { icon: BookOpen, text: "Structured courses from expert instructors" },
              { icon: BarChart3, text: "Track your progress at a glance" },
              { icon: Users, text: "Learn together with a supportive community" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex size-8 items-center justify-center rounded-md bg-white/10 text-secondary">
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/60">© {new Date().getFullYear()} LMS Platform</p>
      </aside>

      {/* Form panel */}
      <section className="flex flex-col items-center justify-center gap-8 p-6 sm:p-12">
        <Brand className="lg:hidden" />
        <div className="w-full max-w-sm space-y-6">{children}</div>
      </section>
    </main>
  )
}
