"use client"

import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CirclePlay,
  Loader2,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  SkipForward,
  Trophy,
  X,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"

import { AppShell, errMsg } from "@/components/app-shell"
import { Brand } from "@/components/brand"
import { LessonNotes } from "@/components/note-list"
import { QuizList } from "@/components/quiz-list"
import { PdfPreview } from "@/components/pdf-preview"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { VideoPlayer } from "@/components/video-player"
import { roleHome, useUser } from "@/hooks/use-user"
import {
  UUID_RE,
  downloadNote,
  getCourse,
  listCourseVideos,
  listLessons,
  listQuizzes,
  type Course,
  type Lesson,
  type Note,
  type Quiz,
  type Video,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const UP_NEXT_SECONDS = 5

type Section = { lesson: Lesson; videos: Video[] }

export default function LearnPage() {
  return (
    <AppShell bare>
      <Suspense>
        <Learn />
      </Suspense>
    </AppShell>
  )
}

// ── per-browser conveniences (no backend API for these yet) ─────────────────
function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/** Lectures this user marked complete in this course (stored in this browser only). */
function useCompleted(userId: string, courseId: string) {
  const key = `lms_done:${userId}:${courseId}`
  const [done, setDone] = useState(() => new Set(readList(key)))
  const set = (videoId: string, on: boolean) =>
    setDone((cur) => {
      if (cur.has(videoId) === on) return cur
      const next = new Set(cur)
      if (on) next.add(videoId)
      else next.delete(videoId)
      write(key, [...next])
      return next
    })
  return [done, set] as const
}

function Learn() {
  const user = useUser()!
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const requested = useSearchParams().get("v")
  const valid = UUID_RE.test(id)

  const [course, setCourse] = useState<Course | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(valid)
  const [error, setError] = useState<string | null>(valid ? null : "That is not a valid course ID.")
  const [done, setDone] = useCompleted(user.id, id)
  const lastKey = `lms_last:${user.id}:${id}`
  const [lastWatched] = useState(() => readList(lastKey)[0] ?? null)
  const [sidebar, setSidebar] = useState(true)
  const [upNext, setUpNext] = useState<{ from: string; to: string } | null>(null)

  useEffect(() => {
    if (!valid) return
    Promise.all([getCourse(id), listLessons(id), listCourseVideos(id)])
      .then(([c, lessons, videos]) => {
        setCourse(c)
        // Only ready videos are playable; keep the course's lesson order.
        const ready = videos.filter((v) => v.status === "ready")
        setSections(
          lessons.map((lesson) => ({ lesson, videos: ready.filter((v) => v.lessonId === lesson.id) })).filter((s) => s.videos.length > 0)
        )
      })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false))
  }, [id, valid])

  const preview = course?.access === "preview"
  // Locked lectures (previewing a course) are listed but never played, so navigation skips them.
  const flat = sections.flatMap((s) => s.videos).filter((v) => !v.locked)
  const lockedCount = sections.reduce((n, s) => n + s.videos.filter((v) => v.locked).length, 0)
  const current =
    flat.find((v) => v.id === requested) ??
    flat.find((v) => v.id === lastWatched) ??
    flat.find((v) => !done.has(v.id)) ??
    flat[0]
  const index = current ? flat.indexOf(current) : -1
  const prev = index > 0 ? flat[index - 1] : undefined
  const next = index >= 0 ? flat[index + 1] : undefined
  const section = sections.find((s) => s.lesson.id === current?.lessonId)
  const sectionNo = section ? sections.indexOf(section) + 1 : 0
  const completed = flat.filter((v) => done.has(v.id)).length

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // The current lecture's section is always shown open.
  const isOpen = (lessonId: string) => expanded.has(lessonId) !== (lessonId === current?.lessonId)

  function go(v: Video) {
    const old = current?.lessonId
    if (old !== v.lessonId)
      setExpanded((cur) => {
        // Flip both toggles so neither section visibly changes as "current" moves between them.
        const n = new Set(cur)
        for (const l of [old, v.lessonId]) {
          if (!l) continue
          if (n.has(l)) n.delete(l)
          else n.add(l)
        }
        return n
      })
    setUpNext(null)
    write(lastKey, [v.id])
    router.replace(`/courses/${id}/learn?v=${v.id}`, { scroll: false })
  }

  function onEnded() {
    if (!current) return
    setDone(current.id, true)
    if (next) setUpNext({ from: current.id, to: next.id })
  }

  const showUpNext = upNext && upNext.from === current?.id ? flat.find((v) => v.id === upNext.to) : undefined
  const content = (
    <CourseContent
      sections={sections}
      preview={preview}
      currentId={current?.id}
      done={done}
      isOpen={isOpen}
      onToggleSection={(lessonId) =>
        setExpanded((cur) => {
          const n = new Set(cur)
          if (n.has(lessonId)) n.delete(lessonId)
          else n.add(lessonId)
          return n
        })
      }
      onToggleDone={(v) => setDone(v.id, !done.has(v.id))}
      onSelect={go}
    />
  )

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 bg-navy px-4 text-white sm:px-6">
        <Link href={roleHome(user.role)} aria-label="Home" className="shrink-0">
          <Brand onDark className="[&_span]:hidden sm:[&_span]:inline [&>div]:size-8" />
        </Link>
        <span aria-hidden className="hidden h-6 w-px bg-white/20 sm:block" />
        <Link href={`/courses/${id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-secondary sm:text-base">
          {course?.title ?? "Course"}
        </Link>
        {preview && <Badge variant="lime" className="shrink-0">Free preview</Badge>}
        {flat.length > 0 && <ProgressRing done={completed} total={flat.length} />}
        <Button
          variant="ghost"
          size="sm"
          className="hidden text-white hover:bg-white/10 hover:text-white lg:inline-flex"
          onClick={() => setSidebar((s) => !s)}
          aria-pressed={sidebar}
        >
          {sidebar ? <PanelRightClose /> : <PanelRightOpen />}
          Course content
        </Button>
        <Link href={`/courses/${id}`} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-white hover:bg-white/10 hover:text-white" })}>
          <ArrowLeft /> <span className="hidden sm:inline">Back to course</span>
        </Link>
      </header>

      {loading && (
        <p className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="size-4 animate-spin" /> Loading course…
        </p>
      )}
      {!loading && (error || !current) && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-mint text-teal">
            <CirclePlay className="size-7" strokeWidth={1.5} />
          </span>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{error ? "Can't open this course" : lockedCount > 0 ? "Enroll to watch" : "No videos yet"}</h1>
            <p className="max-w-md text-sm text-muted-foreground">
              {error ??
                (lockedCount > 0
                  ? `This course has ${lockedCount} ${lockedCount === 1 ? "lecture" : "lectures"} and none are free to preview. Ask your admin to enroll you.`
                  : "Lectures will appear here once the instructor uploads them and they finish processing.")}
            </p>
          </div>
          <Link href={`/courses/${id}`} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft /> Back to course
          </Link>
        </div>
      )}

      {!loading && !error && current && (
        <div className="flex flex-1">
          <main className="min-w-0 flex-1">
            <div className="bg-black">
              <div className="mx-auto aspect-video w-full max-w-[calc((100svh-8rem)*16/9)]">
                <VideoPlayer
                  videoId={current.id}
                  title={current.title}
                  onEnded={onEnded}
                  onPrev={prev && (() => go(prev))}
                  onNext={next && (() => go(next))}
                  overlay={
                    showUpNext && (
                      <UpNext
                        key={showUpNext.id}
                        video={showUpNext}
                        sectionTitle={sections.find((s) => s.lesson.id === showUpNext.lessonId)?.lesson.title ?? ""}
                        onPlay={() => go(showUpNext)}
                        onCancel={() => setUpNext(null)}
                      />
                    )
                  }
                />
              </div>
            </div>

            <LectureTabs
              course={course!}
              lesson={section!.lesson}
              video={current}
              sectionNo={sectionNo}
              lectureNo={index + 1}
              totalLectures={flat.length}
              totalSections={sections.length}
              isOwner={user.role !== "student" && course?.instructorId === user.id}
              setNotes={(fn) =>
                setSections((ss) =>
                  ss.map((s) => (s.lesson.id === section!.lesson.id ? { ...s, lesson: { ...s.lesson, notes: fn(s.lesson.notes ?? []) } } : s))
                )
              }
              content={content}
              next={next}
              onNext={next && (() => go(next))}
            />
          </main>

          {sidebar && (
            <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-[360px] shrink-0 flex-col border-l border-border bg-white lg:flex xl:w-[400px]">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pr-2 pl-4">
                <h2 className="text-base font-semibold">Course content</h2>
                <Button variant="ghost" size="icon-sm" aria-label="Close course content" onClick={() => setSidebar(false)}>
                  <X />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  const pct = total ? done / total : 0
  return (
    <div className="flex shrink-0 items-center gap-2" title={`${done} of ${total} lectures complete`}>
      <span className="relative flex size-9 items-center justify-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <Trophy className="size-4 text-secondary" strokeWidth={2} />
      </span>
      <span className="tnum hidden text-xs text-white/80 md:block">
        {done} of {total} complete
      </span>
    </div>
  )
}

function CourseContent({
  sections,
  preview,
  currentId,
  done,
  isOpen,
  onToggleSection,
  onToggleDone,
  onSelect,
}: {
  sections: Section[]
  preview: boolean
  currentId: string | undefined
  done: Set<string>
  isOpen: (lessonId: string) => boolean
  onToggleSection: (lessonId: string) => void
  onToggleDone: (v: Video) => void
  onSelect: (v: Video) => void
}) {
  // Lecture numbers run across the whole course.
  const firstNo = sections.map((_, i) => sections.slice(0, i).reduce((sum, s) => sum + s.videos.length, 1))
  return (
    <div>
      {sections.map((s, i) => {
        const open = isOpen(s.lesson.id)
        const finished = s.videos.filter((v) => done.has(v.id)).length
        const allLocked = s.videos.every((v) => v.locked)
        return (
          <section key={s.lesson.id} className="border-b border-border">
            <button
              type="button"
              onClick={() => onToggleSection(s.lesson.id)}
              aria-expanded={open}
              className="flex w-full items-start gap-3 bg-gray-50 px-4 py-3.5 text-left transition-colors hover:bg-gray-100"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-1.5 text-sm leading-snug font-semibold text-heading">
                  {allLocked && <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Locked" />}
                  Section {i + 1}: {s.lesson.title}
                </span>
                <span className="tnum mt-0.5 block text-xs text-muted-foreground">
                  {finished} / {s.videos.length} {s.videos.length === 1 ? "lecture" : "lectures"}
                </span>
              </span>
              <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-heading/70 transition-transform duration-300", open && "rotate-180")} />
            </button>
            <div className="expand" data-open={open}>
              <div>
                <ol>
                  {s.videos.map((v, j) => {
                    const n = firstNo[i] + j
                    const active = v.id === currentId
                    const checked = done.has(v.id)
                    if (v.locked)
                      return (
                        <li key={v.id} className="flex items-start gap-3 px-4 py-3 text-muted-foreground">
                          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm leading-snug">
                              {n}. {v.title}
                            </span>
                            <span className="mt-1 block text-xs">Enroll to watch</span>
                          </span>
                        </li>
                      )
                    return (
                      <li key={v.id} className={cn("relative flex items-start gap-3 px-4 py-3 transition-colors", active ? "bg-mint" : "hover:bg-gray-50")}>
                        {active && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-teal" />}
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 cursor-pointer"
                          checked={checked}
                          onChange={() => onToggleDone(v)}
                          aria-label={`Mark "${v.title}" ${checked ? "not complete" : "complete"}`}
                        />
                        <button type="button" onClick={() => onSelect(v)} aria-current={active ? "true" : undefined} className="min-w-0 flex-1 text-left">
                          <span className={cn("block text-sm leading-snug text-heading", active && "font-semibold")}>
                            {n}. {v.title}
                          </span>
                          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CirclePlay className="size-3.5" />
                            {active ? "Playing" : "Video"}
                            {preview && <Badge variant="lime" className="ml-1 h-4 px-1.5 text-[10px]">Free</Badge>}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function UpNext({ video, sectionTitle, onPlay, onCancel }: { video: Video; sectionTitle: string; onPlay: () => void; onCancel: () => void }) {
  const [left, setLeft] = useState(UP_NEXT_SECONDS)
  const fired = useRef(false)

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (left > 0 || fired.current) return
    fired.current = true
    onPlay()
  }, [left, onPlay])

  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="flex size-full items-center justify-center bg-black/80 p-6 backdrop-blur-[2px]">
      <div className="pop w-full max-w-sm text-center text-white">
        <p className="text-xs font-semibold tracking-widest text-white/60 uppercase">Up next</p>
        <p className="mt-2 text-lg leading-snug font-semibold text-balance">{video.title}</p>
        {sectionTitle && <p className="mt-1 truncate text-sm text-white/60">{sectionTitle}</p>}
        <button
          type="button"
          onClick={onPlay}
          aria-label={`Play now: ${video.title}`}
          className="group relative mx-auto mt-5 flex size-16 items-center justify-center rounded-full"
        >
          <svg viewBox="0 0 60 60" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="30" cy="30" r={r} fill="none" stroke="white" strokeOpacity={0.2} strokeWidth="3" />
            <circle
              cx="30"
              cy="30"
              r={r}
              fill="none"
              stroke="hsl(var(--secondary))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (left / UP_NEXT_SECONDS)}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <SkipForward className="size-6 fill-current transition-transform group-hover:scale-110" />
        </button>
        <p className="tnum mt-3 text-sm text-white/70">Playing in {Math.max(0, left)}s</p>
        <Button variant="ghost" size="sm" className="mt-2 text-white hover:bg-white/10 hover:text-white" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

type Tab = "content" | "overview" | "notes" | "quizzes"

function LectureTabs({
  course,
  lesson,
  video,
  sectionNo,
  lectureNo,
  totalLectures,
  totalSections,
  isOwner,
  setNotes,
  content,
  next,
  onNext,
}: {
  course: Course
  lesson: Lesson
  video: Video
  sectionNo: number
  lectureNo: number
  totalLectures: number
  totalSections: number
  isOwner: boolean
  /** Updates this lesson's notes after the owner shares, edits or deletes one. */
  setNotes: (fn: (n: Note[]) => Note[]) => void
  content: React.ReactNode
  next?: Video
  onNext?: () => void
}) {
  // "content" is the mobile-only curriculum tab; on large screens the sidebar shows it, so Overview stands in.
  const [tab, setTab] = useState<Tab>("overview")
  // Keyed by lesson so a stale list never shows after moving to another section.
  const [loaded, setLoaded] = useState<{ lessonId: string; quizzes: Quiz[] } | null>(null)
  const quizzes = loaded?.lessonId === lesson.id ? loaded.quizzes : null
  const [preview, setPreview] = useState<Note | null>(null)
  const notes = lesson.notes ?? []

  useEffect(() => {
    listQuizzes(lesson.id)
      .then((qs) => setLoaded({ lessonId: lesson.id, quizzes: isOwner ? qs : qs.filter((q) => q.status === "published") }))
      .catch(() => setLoaded({ lessonId: lesson.id, quizzes: [] }))
  }, [lesson.id, isOwner])

  const tabs: { key: Tab; label: string; className?: string }[] = [
    { key: "content", label: "Course content", className: "lg:hidden" },
    { key: "overview", label: "Overview" },
    { key: "notes", label: `Notes${notes.length ? ` (${notes.length})` : ""}` },
    { key: "quizzes", label: `Tests${quizzes?.length ? ` (${quizzes.length})` : ""}` },
  ]
  const overviewActive = tab === "overview"

  const overview = (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <p className="tnum text-xs font-semibold tracking-wide text-teal uppercase">
          Section {sectionNo} · Lecture {lectureNo} of {totalLectures}
        </p>
        <h1 className="text-2xl leading-tight font-semibold sm:text-3xl">{video.title}</h1>
        <p className="text-sm text-muted-foreground">{lesson.title}</p>
      </div>
      {lesson.content && <p className="max-w-[70ch] text-[15px] leading-relaxed whitespace-pre-wrap text-gray-700">{lesson.content}</p>}
      {next && onNext && (
        <button
          type="button"
          onClick={onNext}
          className="group flex w-full max-w-md items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-teal/40 hover:bg-gray-50"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-mint text-teal">
            <SkipForward className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Next lecture</span>
            <span className="block truncate text-sm font-semibold text-heading">{next.title}</span>
          </span>
          <ArrowRight className="size-4 text-heading/50 transition-transform group-hover:translate-x-1" />
        </button>
      )}
      <dl className="grid max-w-md grid-cols-2 gap-4 border-t border-border pt-6">
        <div>
          <dt className="text-xs text-muted-foreground">Sections</dt>
          <dd className="tnum text-2xl font-semibold text-heading">{totalSections}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Lectures</dt>
          <dd className="tnum text-2xl font-semibold text-heading">{totalLectures}</dd>
        </div>
      </dl>
      {course.description && (
        <div className="space-y-2 border-t border-border pt-6">
          <h2 className="text-base font-semibold">About this course</h2>
          <p className="max-w-[70ch] text-sm leading-relaxed whitespace-pre-wrap text-gray-700">{course.description}</p>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div role="tablist" aria-label="Lecture" className="flex gap-6 overflow-x-auto border-b border-border px-4 sm:px-8">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent py-3.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-heading",
              tab === t.key && "border-heading text-heading",
              // On large screens the hidden "content" tab falls back to Overview.
              t.key === "overview" && tab === "content" && "lg:border-heading lg:text-heading",
              t.key === "content" && tab === "content" && "lg:border-transparent",
              t.className
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={cn(tab === "content" ? "lg:px-8 lg:py-8" : "px-4 py-8 sm:px-8")}>
        {tab === "content" && (
          <>
            <div className="lg:hidden">{content}</div>
            <div className="hidden lg:block">{overview}</div>
          </>
        )}
        {overviewActive && overview}
        {tab === "notes" && (
          <div className="max-w-3xl space-y-3">
            <LessonNotes
              lessonId={lesson.id}
              notes={notes}
              setNotes={setNotes}
              isOwner={isOwner}
              onOpen={setPreview}
              empty={<Empty>No notes for this lecture.</Empty>}
            />
          </div>
        )}
        {tab === "quizzes" && (
          <div className="max-w-3xl space-y-3">
            {quizzes === null && (
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </p>
            )}
            {quizzes?.length === 0 && <Empty>No tests for this lecture.</Empty>}
            {quizzes && <QuizList quizzes={quizzes} />}
          </div>
        )}
      </div>
      {preview && <PdfPreview title={preview.title} load={() => downloadNote(preview.id)} onClose={() => setPreview(null)} />}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>
  )
}
