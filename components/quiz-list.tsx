import { ArrowRight, ClipboardList, Lock } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { QUIZ_TYPE_PLURAL, isPractice, type Quiz } from "@/lib/api"

const meta = (q: Quiz) => {
  const parts = [`${q.questionCount} questions`]
  if (isPractice(q)) parts.push("Practice")
  else {
    if (q.timeLimitSec) parts.push(`${Math.round(q.timeLimitSec / 60)} min`)
    if (q.passPercent !== null) parts.push(`Pass ${q.passPercent}%`)
  }
  return parts.join(" · ")
}

/**
 * Test rows in two sections, Mock tests and Practice tests. Once there is any test both sections
 * show, each with its own empty state; with none at all the caller shows its own empty message.
 * Locked tests (previewing a paid course) show but can't be opened.
 */
export function QuizList({ quizzes }: { quizzes: Quiz[] }) {
  if (quizzes.length === 0) return null
  const groups = (["mock_test", "practice"] as const).map((t) => ({
    label: QUIZ_TYPE_PLURAL[t],
    items: quizzes.filter((q) => q.type === t),
  }))

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.label} className="space-y-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {g.label}
          </h4>
          {g.items.length === 0 && (
            <p className="rounded-md border border-dashed border-border bg-white px-4 py-3 text-center text-sm text-muted-foreground">
              No {g.label.toLowerCase()} yet.
            </p>
          )}
          <ul className="space-y-2">
            {g.items.map((q) =>
              q.locked ? (
                <li
                  key={q.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-gray-50 p-3"
                  aria-label={`${q.title}, locked`}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                    <Lock className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-600">
                      {q.title}
                    </span>
                    <span className="tnum text-xs text-muted-foreground">
                      {meta(q)}
                    </span>
                  </span>
                  <Badge variant="outline">Enroll to unlock</Badge>
                </li>
              ) : (
                <li key={q.id}>
                  <Link
                    href={`/quizzes/${q.id}`}
                    className="group/row flex items-center gap-3 rounded-md border border-border bg-white p-3 transition-all duration-200 hover:border-teal/40 hover:shadow-sm"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-lime-soft text-navy transition-colors group-hover/row:bg-secondary">
                      <ClipboardList className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-heading">
                        {q.title}
                      </span>
                      <span className="tnum flex items-center gap-2 text-xs text-muted-foreground">
                        {meta(q)}
                        {q.isFree && <Badge variant="lime">Free preview</Badge>}
                        {q.status === "draft" && (
                          <Badge variant="secondary">Draft</Badge>
                        )}
                      </span>
                    </span>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-heading/40 text-heading transition-colors duration-200 group-hover/row:border-teal group-hover/row:bg-teal group-hover/row:text-white">
                      <ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                </li>
              )
            )}
          </ul>
        </div>
      ))}
    </div>
  )
}
