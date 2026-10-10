"use client"

import { ChevronDown, ChevronsUpDown, CirclePlay, ClipboardList, Eye, EyeOff, FileText, Film, Layers, Loader2, Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { AppShell, ErrorNote, PageTitle, errMsg } from "@/components/app-shell"
import { LessonNotes } from "@/components/note-list"
import { PdfPreview } from "@/components/pdf-preview"
import { QuizCreator } from "@/components/quiz-pdf-import"
import { QuizList } from "@/components/quiz-list"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { VideoList, VideoSection } from "@/components/video-section"
import { useUser } from "@/hooks/use-user"
import {
  UUID_RE,
  createLesson,
  deleteCourse,
  deleteLesson,
  downloadNote,
  getCourse,
  listExams,
  listCourseVideos,
  listLessons,
  listQuizzes,
  updateCourse,
  updateCourseStatus,
  updateLesson,
  type Course as CourseT,
  type CourseStatus,
  type Exam,
  type Lesson,
  type Note,
  type Quiz,
  type Video,
} from "@/lib/api"


const slugOk = "[a-z0-9]+(-[a-z0-9]+)*"

export default function CoursePage() {
  return (
    <AppShell>
      <CourseView />
    </AppShell>
  )
}

function CourseView() {
  const user = useUser()!
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const valid = UUID_RE.test(id)
  const [course, setCourse] = useState<CourseT | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(valid)
  const [error, setError] = useState<string | null>(valid ? null : "That is not a valid course ID.")
  const [mode, setMode] = useState<"lesson" | "edit" | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  // Only the course owner (its instructor, or an admin who is its instructor) can manage it.
  const isOwner = !!course && user.role !== "student" && course.instructorId === user.id
  // An admin who doesn't own the course can read it but has no access to its lessons.
  const canSeeLessons = !!course && (user.role !== "admin" || isOwner)

  const load = useCallback(async () => {
    setError(null)
    try {
      const c = await getCourse(id)
      setCourse(c)
      if (user.role !== "admin" || c.instructorId === user.id) {
        const [ls, vs] = await Promise.all([listLessons(id), listCourseVideos(id)])
        setLessons(ls)
        setVideos(vs)
      }
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [id, user.id, user.role])

  useEffect(() => {
    if (!valid) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [valid, load])

  async function onStatus(next: CourseStatus) {
    setError(null)
    try {
      const c = await updateCourseStatus(id, next)
      setCourse((cur) => (cur ? { ...cur, status: c.status } : cur))
    } catch (e) {
      setError(errMsg(e))
    }
  }

  async function onDelete() {
    if (!course || !confirm(`Delete "${course.title}"? Students will lose access to it.`)) return
    setError(null)
    try {
      await deleteCourse(id)
      router.replace(user.role === "admin" ? "/courses" : "/feed")
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const readyVideos = videos.filter((v) => v.status === "ready").length
  // Not enrolled in a paid course: only free lessons, notes, quizzes and videos open.
  const preview = course?.access === "preview"
  const playable = videos.filter((v) => v.status === "ready" && !v.locked).length
  const freeLessons = lessons.filter((l) => !l.locked).length
  const learnHref = `/courses/${id}/learn`
  // Each lesson card manages its own slice of the course's videos.
  const setLessonVideos = (lessonId: string) => (fn: (v: Video[]) => Video[]) =>
    setVideos((all) => [...all.filter((v) => v.lessonId !== lessonId), ...fn(all.filter((v) => v.lessonId === lessonId))])

  const patchLesson = (lessonId: string, fn: (l: Lesson) => Lesson) =>
    setLessons((ls) => ls.map((l) => (l.id === lessonId ? fn(l) : l)))

  return (
    <>
      <PageTitle
        title={course?.title ?? "Course"}
        subtitle={
          isOwner
            ? "Manage lessons, share PDF notes and publish tests."
            : course?.shortDescription || "Lessons, notes and tests for this course."
        }
        actions={
          isOwner ? (
            <div className="flex flex-wrap items-center gap-2">
              {readyVideos > 0 && (
                <Link href={learnHref} className={buttonVariants({ variant: "outline" })}>
                  <CirclePlay /> Preview player
                </Link>
              )}
              <Select aria-label="Course status" className="h-9 w-36" value={course.status} onChange={(e) => onStatus(e.target.value as CourseStatus)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
              <Button variant="outline" onClick={() => setMode(mode === "edit" ? null : "edit")}>
                <Pencil /> Edit
              </Button>
              <Button variant="destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </Button>
              <Button onClick={() => setMode(mode === "lesson" ? null : "lesson")}>
                <Plus /> Add lesson
              </Button>
            </div>
          ) : (
            canSeeLessons &&
            playable > 0 && (
              <Link href={learnHref} className={buttonVariants({ variant: "navy", size: "lg" })}>
                <CirclePlay /> {preview ? "Watch free preview" : "Start learning"}
              </Link>
            )
          )
        }
      />

      <ErrorNote error={error} />

      {preview && canSeeLessons && (
        <div className="rise flex flex-wrap items-center gap-4 rounded-lg border border-secondary bg-lime-soft/50 p-5" style={{ "--i": 1 } as React.CSSProperties}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-navy">
            <LockOpen className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-semibold text-heading">You&apos;re previewing this course</p>
            <p className="tnum text-sm text-heading/80">
              {freeLessons} of {lessons.length} {lessons.length === 1 ? "lesson is" : "lessons are"} free to preview, along with any free videos and
              tests. Ask your admin to enroll you to unlock everything.
            </p>
          </div>
        </div>
      )}

      {course && (
        <div className="rise grid gap-6 rounded-lg border border-border bg-white p-6 shadow-[0_1px_2px_rgba(10,37,64,0.05)] lg:grid-cols-[1fr_auto] lg:items-center" style={{ "--i": 1 } as React.CSSProperties}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={course.status === "published" ? "default" : "secondary"}>{course.status}</Badge>
              {course.isFree && <Badge variant="lime">Free</Badge>}
              {preview && <Badge variant="secondary">Preview</Badge>}
              {user.role === "admin" && !isOwner && <Badge variant="secondary">Owned by another instructor</Badge>}
            </div>
            {course.description && (
              <p className="max-w-[70ch] text-[15px] leading-relaxed whitespace-pre-wrap text-gray-700">{course.description}</p>
            )}
          </div>
          {canSeeLessons && (
            <dl className="flex gap-8 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
              <div>
                <dt className="text-xs text-muted-foreground">Lessons</dt>
                <dd className="tnum text-3xl font-semibold text-heading">{lessons.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Videos</dt>
                <dd className="tnum text-3xl font-semibold text-heading">{isOwner ? videos.length : readyVideos}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="tnum text-3xl font-semibold text-heading">{lessons.reduce((n, l) => n + (l.notes?.length ?? 0), 0)}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {isOwner && mode === "edit" && course && (
        <EditCourse
          course={course}
          onSaved={(c) => {
            setCourse(c)
            setMode(null)
          }}
        />
      )}
      {isOwner && mode === "lesson" && (
        <NewLesson
          courseId={id}
          onCreated={() => {
            setMode(null)
            load()
          }}
        />
      )}

      {loading && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}
      {course && !canSeeLessons && (
        <Card className="bg-white">
          <CardContent className="py-8 text-center text-sm text-gray-500">
            Lessons, notes and tests are managed by the course&apos;s instructor.
          </CardContent>
        </Card>
      )}
      {!loading && !error && canSeeLessons && lessons.length === 0 && (
        <Card className="bg-white">
          <CardContent className="py-10 text-center text-sm text-gray-500">
            {isOwner ? "No lessons yet. Add the first one." : "No lessons have been published yet."}
          </CardContent>
        </Card>
      )}

      {canSeeLessons && lessons.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
          <h2 className="text-2xl font-semibold text-heading">Course content</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenIds(openIds.size === lessons.length ? new Set() : new Set(lessons.map((l) => l.id)))}
          >
            <ChevronsUpDown />
            {openIds.size === lessons.length ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      )}
      {canSeeLessons &&
        lessons.map((l, i) => (
          <LessonCard
            key={l.id}
            open={openIds.has(l.id)}
            setOpen={(v) =>
              setOpenIds((cur) => {
                const next = new Set(cur)
                const on = typeof v === "function" ? v(cur.has(l.id)) : v
                if (on) next.add(l.id)
                else next.delete(l.id)
                return next
              })
            }
            index={i + 1}
            lesson={l}
            isOwner={isOwner}
            videos={videos.filter((v) => v.lessonId === l.id)}
            setVideos={setLessonVideos(l.id)}
            onChange={(fn) => patchLesson(l.id, fn)}
            onDeleted={() => setLessons((ls) => ls.filter((x) => x.id !== l.id))}
          />
        ))}
    </>
  )
}

function EditCourse({ course, onSaved }: { course: CourseT; onSaved: (c: CourseT) => void }) {
  const [exams, setExams] = useState<Exam[]>([])
  const [form, setForm] = useState({
    title: course.title,
    slug: course.slug,
    shortDescription: course.shortDescription,
    description: course.description,
    examId: course.examId,
    isFree: course.isFree,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    listExams().then(setExams).catch((e) => setError(errMsg(e)))
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      onSaved(await updateCourse(course.id, { ...form, title: form.title.trim(), slug: form.slug.trim() }))
    } catch (err) {
      setError(errMsg(err))
      setSaving(false)
    }
  }

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>Edit course</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ce-exam">Exam</FieldLabel>
            <Select id="ce-exam" value={form.examId} onChange={(e) => set("examId", e.target.value)}>
              {exams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} — {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ce-title">Title</FieldLabel>
            <Input id="ce-title" required maxLength={200} value={form.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ce-slug">Slug</FieldLabel>
            <Input id="ce-slug" required maxLength={200} pattern={slugOk} title="Lowercase letters, numbers and single dashes" value={form.slug} onChange={(e) => set("slug", e.target.value)} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ce-short">Short description</FieldLabel>
            <Input id="ce-short" maxLength={500} value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ce-desc">Description</FieldLabel>
            <Textarea id="ce-desc" maxLength={10000} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
            <input type="checkbox" checked={form.isFree} onChange={(e) => set("isFree", e.target.checked)} />
            Free course
          </label>
          <div className="space-y-3 sm:col-span-2">
            <ErrorNote error={error} />
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function NewLesson({ courseId, onCreated }: { courseId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [isFree, setIsFree] = useState(false)
  const [isPublished, setPublished] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await createLesson(courseId, { title: title.trim(), content: content.trim(), isFree, isPublished })
      onCreated()
    } catch (err) {
      setError(errMsg(err))
      setSaving(false)
    }
  }

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>New lesson</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="ltitle">Title</FieldLabel>
            <Input id="ltitle" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="lcontent">Short description</FieldLabel>
            <Textarea id="lcontent" maxLength={50000} value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
          <div className="flex gap-6 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isPublished} onChange={(e) => setPublished(e.target.checked)} />
              Published (visible to students)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
              Free preview
            </label>
          </div>
          <ErrorNote error={error} />
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Create lesson
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function LessonCard({
  open: open_,
  setOpen,
  index,
  lesson,
  isOwner,
  videos,
  setVideos,
  onChange,
  onDeleted,
}: {
  open: boolean
  setOpen: (v: boolean | ((c: boolean) => boolean)) => void
  index: number
  lesson: Lesson
  isOwner: boolean
  videos: Video[]
  setVideos: (fn: (v: Video[]) => Video[]) => void
  onChange: (fn: (l: Lesson) => Lesson) => void
  onDeleted: () => void
}) {
  const [preview, setPreview] = useState<Note | null>(null)
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<"quiz" | "video" | "edit" | null>(null)
  const notes = lesson.notes ?? []
  const locked = !!lesson.locked
  const setNotes = (fn: (n: Note[]) => Note[]) => onChange((l) => ({ ...l, notes: fn(l.notes ?? []) }))

  useEffect(() => {
    listQuizzes(lesson.id).then(setQuizzes).catch((e) => setError(errMsg(e)))
  }, [lesson.id])

  async function togglePublished() {
    setError(null)
    try {
      const l = await updateLesson(lesson.id, { isPublished: !lesson.isPublished })
      onChange((x) => ({ ...x, isPublished: l.isPublished }))
    } catch (e) {
      setError(errMsg(e))
    }
  }

  async function removeLesson() {
    if (!confirm(`Delete lesson "${lesson.title}"? Its notes and PDFs will be removed.`)) return
    setError(null)
    try {
      await deleteLesson(lesson.id)
      onDeleted()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  // Students preview inside the app only (no file URL, no download); owners keep the plain open-in-tab flow.
  async function open(n: Note) {
    setError(null)
    if (!isOwner) return setPreview(n)
    try {
      const url = URL.createObjectURL(await downloadNote(n.id))
      window.open(url, "_blank", "noopener")
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <article
      className="rise overflow-hidden rounded-lg border border-border bg-white shadow-[0_1px_2px_rgba(10,37,64,0.05)] transition-shadow duration-200 hover:shadow-md"
      style={{ "--i": Math.min(index, 6) } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open_}
          aria-controls={`lesson-${lesson.id}`}
          className="group flex min-w-0 flex-1 items-center gap-4 rounded-md text-left"
        >
          {locked ? (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500" aria-label="Locked">
              <Lock className="size-4.5" />
            </span>
          ) : (
            <span className="tnum flex size-11 shrink-0 items-center justify-center rounded-full bg-teal text-base font-semibold text-white transition-transform duration-200 group-hover:scale-105">
              {index}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold text-heading">{lesson.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><FileText className="size-3.5" />{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
              <span className="flex items-center gap-1.5"><ClipboardList className="size-3.5" />{quizzes.length} {quizzes.length === 1 ? "test" : "tests"}</span>
              <span className="flex items-center gap-1.5"><Film className="size-3.5" />{videos.length} {videos.length === 1 ? "video" : "videos"}</span>
            </span>
          </span>
          <ChevronDown className={"size-5 shrink-0 text-heading/60 transition-transform duration-300 " + (open_ ? "rotate-180" : "")} />
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && !lesson.isPublished && <Badge variant="secondary">Draft</Badge>}
          {lesson.isFree && <Badge variant="lime">Free preview</Badge>}
          {locked && <Badge variant="outline">Enroll to unlock</Badge>}
          {isOwner && (
            <>
              <Button variant="outline" size="sm" onClick={togglePublished}>
                {lesson.isPublished ? <EyeOff /> : <Eye />}
                {lesson.isPublished ? "Unpublish" : "Publish"}
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${lesson.title}`} onClick={() => { setOpen(true); setPanel(panel === "edit" ? null : "edit") }}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${lesson.title}`} className="hover:bg-destructive/10 hover:text-destructive" onClick={removeLesson}>
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="expand" data-open={open_} id={`lesson-${lesson.id}`}>
        <div>
          <div className="space-y-6 border-t border-border bg-gray-50/60 p-5 sm:p-6">
            {lesson.content && (
              <p className="max-w-[70ch] text-[15px] leading-relaxed whitespace-pre-wrap text-gray-700">{lesson.content}</p>
            )}
            <ErrorNote error={error} />

            {isOwner && panel === "edit" && (
              <EditLesson
                lesson={lesson}
                onSaved={(l) => {
                  onChange((x) => ({ ...x, title: l.title, content: l.content, isFree: l.isFree, isPublished: l.isPublished }))
                  setPanel(null)
                }}
              />
            )}

            {!isOwner && <VideoList videos={videos} />}
            {isOwner && (
              <VideoSection
                lessonId={lesson.id}
                videos={videos}
                setVideos={setVideos}
                formOpen={panel === "video"}
                setFormOpen={(v) => setPanel(v ? "video" : null)}
              />
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-heading uppercase">
                  <Layers className="size-4 text-teal" /> Notes
                </h3>
                <LessonNotes
                  lessonId={lesson.id}
                  notes={notes}
                  setNotes={setNotes}
                  isOwner={isOwner}
                  onOpen={open}
                  empty={
                    <p className="rounded-md border border-dashed border-border bg-white px-4 py-5 text-center text-sm text-muted-foreground">
                      No notes shared yet.
                    </p>
                  }
                />
              </section>

              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-heading uppercase">
                  <ClipboardList className="size-4 text-teal" /> Tests
                </h3>
                {quizzes.length === 0 && (
                  <p className="rounded-md border border-dashed border-border bg-white px-4 py-5 text-center text-sm text-muted-foreground">
                    No tests yet.
                  </p>
                )}
                <QuizList quizzes={quizzes} />
                {isOwner && (
                  <Button variant="outline" size="sm" onClick={() => setPanel(panel === "quiz" ? null : "quiz")}>
                    <Plus /> Create test
                  </Button>
                )}
                {isOwner && panel === "quiz" && (
                  <QuizCreator
                    lessonId={lesson.id}
                    onSaved={(q) => setQuizzes((qs) => [...qs, q])}
                    onClose={() => setPanel(null)}
                  />
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
      {preview && <PdfPreview title={preview.title} load={() => downloadNote(preview.id)} onClose={() => setPreview(null)} />}
    </article>
  )
}

function EditLesson({ lesson, onSaved }: { lesson: Lesson; onSaved: (l: Lesson) => void }) {
  const [title, setTitle] = useState(lesson.title)
  const [content, setContent] = useState(lesson.content)
  const [isFree, setIsFree] = useState(lesson.isFree)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      onSaved(await updateLesson(lesson.id, { title: title.trim(), content: content.trim(), isFree }))
    } catch (err) {
      setError(errMsg(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border bg-white p-5 shadow-sm">
      <Field>
        <FieldLabel htmlFor={`el-${lesson.id}`}>Title</FieldLabel>
        <Input id={`el-${lesson.id}`} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`ec-${lesson.id}`}>Short description</FieldLabel>
        <Textarea id={`ec-${lesson.id}`} maxLength={50000} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
        Free preview
      </label>
      <ErrorNote error={error} />
      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        Save lesson
      </Button>
    </form>
  )
}
