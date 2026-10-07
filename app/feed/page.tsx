"use client"

import { ArrowRight, BookOpen, Compass, Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { AppShell, ErrorNote, PageTitle, errMsg } from "@/components/app-shell"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useUser } from "@/hooks/use-user"
import {
  createPost,
  deletePost,
  listMyCourses,
  listPosts,
  type Course,
  type Post,
} from "@/lib/api"

export default function FeedPage() {
  return (
    <AppShell>
      <Feed />
    </AppShell>
  )
}

function Feed() {
  const user = useUser()!
  // Instructors and admins own courses; students only take them.
  const canTeach = user.role !== "student"
  const [posts, setPosts] = useState<Post[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [c, p] = await Promise.all([listMyCourses(100, 0), listPosts(50, 0)])
      setCourses(c)
      setPosts(p)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const owned = new Set(courses.filter((c) => c.instructorId === user.id).map((c) => c.id))

  return (
    <>
      <PageTitle
        title={canTeach ? "My courses" : "My learning"}
        subtitle={
          canTeach
            ? "Courses you own and the updates you have shared."
            : "Your enrolled courses and the latest updates from your instructors."
        }
      />

      <ErrorNote error={error} />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-heading">Courses</h2>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        )}
        {!loading && courses.length === 0 && !error && (
          <Card className="bg-white">
            <CardContent className="py-8 text-center text-sm text-gray-500">
              {canTeach ? (
                "You don't own any courses yet."
              ) : (
                <div className="space-y-3">
                  <p>You are not enrolled in any course yet. Free lessons are open to everyone.</p>
                  <Link href="/explore" className={buttonVariants({ variant: "navy", size: "sm" })}>
                    <Compass /> Explore free previews
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => (
            <li key={c.id} className="rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
              <Link href={`/courses/${c.id}`} className="group block h-full rounded-lg border border-border bg-white p-6 shadow-[0_1px_2px_rgba(10,37,64,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-teal/40 hover:shadow-md">
                <div className="mb-4 flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-md bg-mint text-teal transition-colors duration-200 group-hover:bg-teal group-hover:text-white">
                    <BookOpen className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="flex size-8 items-center justify-center rounded-full border border-heading/40 text-heading transition-colors duration-200 group-hover:border-teal group-hover:bg-teal group-hover:text-white">
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </div>
                <h3 className="text-lg leading-snug font-semibold text-heading">{c.title}</h3>
                {c.shortDescription && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">{c.shortDescription}</p>}
                {canTeach && (
                  <Badge variant={c.status === "published" ? "default" : "secondary"} className="mt-4">
                    {c.status}
                  </Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {canTeach && owned.size > 0 && <NewPost courses={courses} onPosted={load} />}

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-heading">Feed</h2>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        )}
        {!loading && posts.length === 0 && <p className="text-sm text-gray-500">No posts yet.</p>}
        {posts.map((p, i) => (
          <Card key={p.id} className="rise bg-white" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
            <CardContent className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-sm font-semibold text-white">
                {p.authorName.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs text-gray-500">
                  <span className="text-sm font-semibold text-heading">{p.authorName}</span> in{" "}
                  <Link href={`/courses/${p.courseId}`} className="underline-offset-4 hover:underline">
                    {p.courseTitle}
                  </Link>{" "}
                  · {new Date(p.createdAt).toLocaleString()}
                </div>
                {canTeach && owned.has(p.courseId) && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete post"
                    onClick={async () => {
                      if (!confirm("Delete this post?")) return
                      try {
                        await deletePost(p.id)
                        setPosts((x) => x.filter((y) => y.id !== p.id))
                      } catch (e) {
                        setError(errMsg(e))
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              {/* Rendered as text, never as HTML. */}
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-gray-700">{p.content}</p>
              {p.links && p.links.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {p.links.map((l) => (
                    <li key={l}>
                      <a
                        href={l}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="break-all text-indigo-600 underline-offset-4 hover:underline"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  )
}

function NewPost({ courses, onPosted }: { courses: Course[]; onPosted: () => void }) {
  const me = useUser()!
  const [courseId, setCourseId] = useState("")
  const [content, setContent] = useState("")
  const [links, setLinks] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!courseId) return setError("Choose a course.")
    setSaving(true)
    try {
      await createPost({
        courseId,
        content: content.trim(),
        links: links.split("\n").map((l) => l.trim()).filter(Boolean),
      })
      setContent("")
      setLinks("")
      onPosted()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>Post an update</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="pcourse">Course</FieldLabel>
            <Select id="pcourse" required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Select a course…</option>
              {courses.filter((c) => c.instructorId === me.id).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="pcontent">Message</FieldLabel>
            <Textarea id="pcontent" required value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="plinks">Links (one per line, http or https)</FieldLabel>
            <Textarea id="plinks" className="min-h-14" value={links} onChange={(e) => setLinks(e.target.value)} />
          </Field>
          <ErrorNote error={error} />
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Post
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
