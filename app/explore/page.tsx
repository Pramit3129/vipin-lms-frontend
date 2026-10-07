"use client"

import { ArrowRight, BookOpen, CirclePlay, ClipboardList, FileText, Loader2, Search } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { AppShell, ErrorNote, PageTitle, errMsg } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { listCatalog, type CatalogCourse } from "@/lib/api"
import { cn } from "@/lib/utils"

export default function ExplorePage() {
  return (
    <AppShell roles={["student", "instructor"]}>
      <Explore />
    </AppShell>
  )
}

const hasFree = (c: CatalogCourse) => c.freeLessonCount + c.freeVideoCount + c.freeNoteCount + c.freeQuizCount > 0

function Explore() {
  const [courses, setCourses] = useState<CatalogCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [freeOnly, setFreeOnly] = useState(true)
  const [q, setQ] = useState("")

  useEffect(() => {
    listCatalog()
      .then(setCourses)
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false))
  }, [])

  const needle = q.trim().toLowerCase()
  const shown = courses.filter(
    (c) =>
      (!freeOnly || hasFree(c)) &&
      (!needle || c.title.toLowerCase().includes(needle) || c.instructorName.toLowerCase().includes(needle))
  )
  // One shelf per instructor, so each person's free lessons sit together.
  const byInstructor = new Map<string, { id: string; name: string; courses: CatalogCourse[] }>()
  for (const c of shown) {
    const shelf = byInstructor.get(c.instructorId) ?? { id: c.instructorId, name: c.instructorName, courses: [] }
    shelf.courses.push(c)
    byInstructor.set(c.instructorId, shelf)
  }
  const shelves = [...byInstructor.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <PageTitle
        title="Explore courses"
        subtitle="Watch free lectures, read free notes and try free quizzes from every instructor. No enrollment needed."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Show" className="inline-flex rounded-md border border-border bg-white p-1">
          {[
            { v: true, label: "Free previews" },
            { v: false, label: "All courses" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={freeOnly === o.v}
              onClick={() => setFreeOnly(o.v)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium text-heading transition-colors",
                freeOnly === o.v ? "bg-teal text-white" : "hover:bg-accent"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-56 flex-1 sm:max-w-xs">
          <span className="sr-only">Search courses or instructors</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses or instructors" className="pl-9" />
        </label>
      </div>

      <ErrorNote error={error} />
      {loading && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}
      {!loading && !error && shelves.length === 0 && (
        <Card className="bg-white">
          <CardContent className="py-10 text-center text-sm text-gray-500">
            {needle ? "No courses match your search." : freeOnly ? "No free previews yet. Check back soon." : "No published courses yet."}
          </CardContent>
        </Card>
      )}

      {shelves.map((shelf) => (
        <section key={shelf.id} className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">
              {shelf.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <h2 className="text-xl leading-tight font-semibold text-heading">{shelf.name}</h2>
              <p className="tnum text-xs text-muted-foreground">
                {shelf.courses.length} {shelf.courses.length === 1 ? "course" : "courses"}
              </p>
            </div>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shelf.courses.map((c, i) => (
              <li key={c.id} className="rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
                <CourseCard c={c} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function CourseCard({ c }: { c: CatalogCourse }) {
  const open = c.enrolled || c.isFree
  const freeShare = c.lessonCount ? c.freeLessonCount / c.lessonCount : 0
  const stats = [
    { n: c.freeVideoCount, one: "video", many: "videos", icon: CirclePlay },
    { n: c.freeNoteCount, one: "note", many: "notes", icon: FileText },
    { n: c.freeQuizCount, one: "quiz", many: "quizzes", icon: ClipboardList },
  ].filter((s) => s.n > 0)

  return (
    <article className="flex h-full flex-col rounded-lg border border-border bg-white p-6 shadow-[0_1px_2px_rgba(10,37,64,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-mint text-teal">
          <BookOpen className="size-5" strokeWidth={1.75} />
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          {c.enrolled && <Badge>Enrolled</Badge>}
          {c.isFree && <Badge variant="lime">Free course</Badge>}
        </div>
      </div>

      <h3 className="text-lg leading-snug font-semibold text-heading">
        <Link href={`/courses/${c.id}`} className="hover:text-teal">
          {c.title}
        </Link>
      </h3>
      {c.shortDescription && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">{c.shortDescription}</p>}

      <div className="mt-auto space-y-4 pt-5">
        {!open && c.lessonCount > 0 && (
          <div className="space-y-1.5">
            <p className="tnum text-xs font-medium text-heading">
              {c.freeLessonCount} of {c.lessonCount} {c.lessonCount === 1 ? "lesson" : "lessons"} free to preview
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
              <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.round(freeShare * 100)}%` }} />
            </div>
          </div>
        )}
        {stats.length > 0 && (
          <p className="tnum flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {stats.map(({ n, one, many, icon: Icon }) => (
              <span key={one} className="flex items-center gap-1.5">
                <Icon className="size-3.5 text-teal" />
                {n} {open ? "" : "free "}
                {n === 1 ? one : many}
              </span>
            ))}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {c.freeVideoCount > 0 && (
            <Link href={`/courses/${c.id}/learn`} className={buttonVariants({ variant: "navy", size: "sm" })}>
              <CirclePlay /> {c.enrolled ? "Continue" : open ? "Start learning" : "Watch free preview"}
            </Link>
          )}
          <Link href={`/courses/${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            View course <ArrowRight />
          </Link>
        </div>
      </div>
    </article>
  )
}
