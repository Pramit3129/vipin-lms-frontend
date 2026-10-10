"use client"

import {
  ArrowRight,
  CircleCheck,
  CirclePlay,
  CloudUpload,
  Film,
  Loader2,
  Lock,
  RotateCw,
  TriangleAlert,
  X,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { ErrorNote, errMsg } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  MAX_VIDEO,
  VIDEO_EXT_RE,
  confirmVideo,
  getVideo,
  putVideoFile,
  requestVideoUpload,
  retryVideo,
  uploadUrlFresh,
  type Video,
  type VideoUpload,
} from "@/lib/api"

const POLL_MS = 5_000

type Phase = "starting" | "uploading" | "confirming" | "error"

// An upload running in this tab, before the server has the file and has queued transcoding.
type LocalUpload = {
  key: string
  file: File
  isFree: boolean
  phase: Phase
  loaded: number
  error?: string
  upload?: VideoUpload // signed URL, once requested
  sent?: boolean // the PUT finished; only confirm is left
}

export function fmtBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/**
 * Owner-only video manager for a lesson: uploads straight to storage via a signed URL,
 * confirms, then polls until transcoding is ready or failed (failed videos can be retried).
 */
export function VideoSection({
  lessonId,
  videos,
  setVideos,
  formOpen,
  setFormOpen,
}: {
  lessonId: string
  videos: Video[]
  setVideos: (fn: (v: Video[]) => Video[]) => void
  formOpen: boolean
  setFormOpen: (v: boolean) => void
}) {
  const [uploads, setUploads] = useState<LocalUpload[]>([])
  const [retrying, setRetrying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ctrls = useRef(new Map<string, AbortController>())
  // The parent passes a fresh setter each render; the poller must not restart because of it.
  const setVideosRef = useRef(setVideos)
  useEffect(() => {
    setVideosRef.current = setVideos
  })

  const patch = (key: string, p: Partial<LocalUpload>) =>
    setUploads((us) => us.map((u) => (u.key === key ? { ...u, ...p } : u)))

  // Abort in-flight PUTs if the lesson card goes away.
  useEffect(() => {
    const map = ctrls.current
    return () => map.forEach((c) => c.abort())
  }, [])

  // Closing the tab mid-upload loses the file, so ask first.
  const busy = uploads.some((u) => u.phase !== "error")
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [busy])

  // Poll every video that is transcoding until it settles.
  const pending = videos
    .filter((v) => v.status === "processing")
    .map((v) => v.id)
    .join(",")
  useEffect(() => {
    if (!pending) return
    const ids = pending.split(",")
    let inFlight = false
    const timer = setInterval(async () => {
      if (inFlight) return
      inFlight = true
      const fresh = await Promise.all(
        ids.map((vid) => getVideo(vid).catch(() => null))
      )
      inFlight = false
      setVideosRef.current((vs) =>
        vs.map((v) => fresh.find((f) => f?.id === v.id) ?? v)
      )
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [pending])

  async function run(u: LocalUpload) {
    const ctrl = new AbortController()
    ctrls.current.set(u.key, ctrl)
    let upload = u.upload
    try {
      if (!u.sent) {
        // Reuse the signed URL on retry unless it is about to expire.
        if (!upload || !uploadUrlFresh(upload)) {
          patch(u.key, { phase: "starting", error: undefined, loaded: 0 })
          upload = await requestVideoUpload(lessonId, {
            fileName: u.file.name,
            isFree: u.isFree,
          })
          patch(u.key, { upload })
        }
        patch(u.key, { phase: "uploading", error: undefined, loaded: 0 })
        await putVideoFile(
          upload,
          u.file,
          (loaded) => patch(u.key, { loaded }),
          ctrl.signal
        )
        patch(u.key, { sent: true })
      }
      patch(u.key, { phase: "confirming", error: undefined })
      const video = await confirmVideo(upload!.video.id)
      setUploads((us) => us.filter((x) => x.key !== u.key))
      setVideos((vs) => [video, ...vs.filter((v) => v.id !== video.id)])
    } catch (e) {
      if (ctrl.signal.aborted) return
      patch(u.key, { phase: "error", error: errMsg(e) })
    } finally {
      ctrls.current.delete(u.key)
    }
  }

  function start(file: File, isFree: boolean) {
    const u: LocalUpload = {
      key: crypto.randomUUID(),
      file,
      isFree,
      phase: "starting",
      loaded: 0,
    }
    setUploads((us) => [u, ...us])
    setFormOpen(false)
    run(u)
  }

  function cancel(u: LocalUpload) {
    if (u.phase !== "error" && !confirm(`Cancel uploading "${u.file.name}"?`))
      return
    ctrls.current.get(u.key)?.abort()
    setUploads((us) => us.filter((x) => x.key !== u.key))
  }

  async function retry(v: Video) {
    setError(null)
    setRetrying(v.id)
    try {
      const next = await retryVideo(v.id)
      setVideos((vs) => vs.map((x) => (x.id === v.id ? next : x)))
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setRetrying(null)
    }
  }

  const empty = videos.length === 0 && uploads.length === 0

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-heading uppercase">
        <Film className="size-4 text-teal" /> Videos
      </h3>
      <ErrorNote error={error} />
      {empty && !formOpen && (
        <p className="rounded-md border border-dashed border-border bg-white px-4 py-5 text-center text-sm text-muted-foreground">
          No videos uploaded yet.
        </p>
      )}

      <ul className="space-y-2">
        {uploads.map((u) => (
          <UploadRow
            key={u.key}
            u={u}
            onRetry={() => run(u)}
            onCancel={() => cancel(u)}
          />
        ))}
        {videos.map((v) => (
          <VideoRow
            key={v.id}
            v={v}
            retrying={retrying === v.id}
            onRetry={() => retry(v)}
          />
        ))}
      </ul>

      {!formOpen && (
        <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
          <CloudUpload /> Upload video
        </Button>
      )}
      {formOpen && (
        <VideoUploadForm
          lessonId={lessonId}
          onStart={start}
          onClose={() => setFormOpen(false)}
        />
      )}
    </section>
  )
}

function RowShell({
  tone,
  title,
  meta,
  chip,
  bar,
  children,
}: {
  tone: "teal" | "lime" | "red" | "gray"
  title: string
  meta: React.ReactNode
  chip: React.ReactNode
  bar?: React.ReactNode
  children?: React.ReactNode
}) {
  const tile = {
    teal: "bg-mint text-teal",
    lime: "bg-lime-soft text-navy",
    red: "bg-red-50 text-red-700",
    gray: "bg-gray-100 text-gray-500",
  }[tone]
  return (
    <li className="pop rounded-md border border-border bg-white p-3 transition-colors duration-200 hover:border-teal/40">
      <div className="flex items-center gap-3">
        <span
          className={
            "flex size-10 shrink-0 items-center justify-center rounded-md " +
            tile
          }
        >
          <Film className="size-5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-heading">
            {title}
          </span>
          <span className="tnum flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {meta}
          </span>
        </span>
        {chip}
        {children}
      </div>
      {bar}
    </li>
  )
}

function Chip({
  className,
  children,
}: {
  className: string
  children: React.ReactNode
}) {
  return (
    <span
      className={
        "tnum inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
        className
      }
    >
      {children}
    </span>
  )
}

function Bar({ pct }: { pct?: number }) {
  return (
    <div
      className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === undefined ? undefined : Math.round(pct)}
    >
      {pct === undefined ? (
        <div className="indeterminate h-full w-2/5 rounded-full bg-teal/60" />
      ) : (
        <div
          className="h-full rounded-full bg-teal transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )
}

function UploadRow({
  u,
  onRetry,
  onCancel,
}: {
  u: LocalUpload
  onRetry: () => void
  onCancel: () => void
}) {
  const pct = u.file.size ? Math.min(100, (u.loaded / u.file.size) * 100) : 0
  const failed = u.phase === "error"
  const label = {
    starting: "Preparing…",
    uploading: `${Math.floor(pct)}%`,
    confirming: "Verifying…",
    error: "Upload failed",
  }[u.phase]

  return (
    <RowShell
      tone={failed ? "red" : "teal"}
      title={u.file.name}
      meta={
        <>
          {u.phase === "uploading"
            ? `${fmtBytes(u.loaded)} of ${fmtBytes(u.file.size)}`
            : fmtBytes(u.file.size)}
          {u.isFree && <span>· Free preview</span>}
        </>
      }
      chip={
        <Chip
          className={failed ? "bg-red-50 text-red-700" : "bg-mint text-teal"}
        >
          {failed ? (
            <TriangleAlert className="size-3.5" />
          ) : (
            <Loader2 className="size-3.5 animate-spin" />
          )}
          {label}
        </Chip>
      }
      bar={
        failed ? (
          <p className="mt-2 text-xs text-red-700">{u.error}</p>
        ) : (
          <Bar pct={u.phase === "uploading" ? pct : undefined} />
        )
      }
    >
      {failed && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Cancel ${u.file.name}`}
        className="hover:bg-destructive/10 hover:text-destructive"
        onClick={onCancel}
      >
        <X />
      </Button>
    </RowShell>
  )
}

function VideoRow({
  v,
  retrying,
  onRetry,
}: {
  v: Video
  retrying: boolean
  onRetry: () => void
}) {
  const meta = (
    <>
      {v.sizeBytes > 0 && <span>{fmtBytes(v.sizeBytes)}</span>}
      {v.isFree && <span>{v.sizeBytes > 0 && "· "}Free preview</span>}
    </>
  )

  switch (v.status) {
    case "ready":
      return (
        <RowShell
          tone="teal"
          title={v.title}
          meta={meta}
          chip={
            <Chip className="bg-teal text-white">
              <CircleCheck className="size-3.5" /> Ready
            </Chip>
          }
        >
          <Link
            href={`/courses/${v.courseId}/learn?v=${v.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <CirclePlay /> Play
          </Link>
        </RowShell>
      )
    case "processing":
      return (
        <RowShell
          tone="lime"
          title={v.title}
          meta={
            <>
              {meta}
              <span>
                · Transcoding for streaming, this can take a few minutes
              </span>
            </>
          }
          chip={
            <Chip className="bg-lime-soft text-navy">
              <Loader2 className="size-3.5 animate-spin" /> Processing
            </Chip>
          }
          bar={<Bar />}
        />
      )
    case "failed":
      return (
        <RowShell
          tone="red"
          title={v.title}
          meta={meta}
          chip={
            <Chip className="bg-red-50 text-red-700">
              <TriangleAlert className="size-3.5" /> Failed
            </Chip>
          }
          bar={
            <p className="mt-2 text-xs text-red-700">
              {v.error || "Transcoding failed."}
            </p>
          }
        >
          <Button
            variant="outline"
            size="sm"
            disabled={retrying}
            onClick={onRetry}
          >
            {retrying ? <Loader2 className="animate-spin" /> : <RotateCw />}{" "}
            Retry
          </Button>
        </RowShell>
      )
    default:
      // 'uploading' on the server but not in this tab: the browser left before the file finished.
      return (
        <RowShell
          tone="gray"
          title={v.title}
          meta={
            <span>The upload didn&apos;t finish. Upload the file again.</span>
          }
          chip={<Chip className="bg-gray-100 text-gray-600">Incomplete</Chip>}
        />
      )
  }
}

function VideoUploadForm({
  lessonId,
  onStart,
  onClose,
}: {
  lessonId: string
  onStart: (file: File, isFree: boolean) => void
  onClose: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  // New videos start paid: only videos marked free play without enrolling, even in a free lesson.
  const [isFree, setIsFree] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pick(f: File | undefined) {
    setError(null)
    if (!f) return
    if (!VIDEO_EXT_RE.test(f.name))
      return setError("Only .mp4, .mov, .mkv or .webm videos are allowed.")
    if (f.size === 0) return setError("That file is empty.")
    if (f.size > MAX_VIDEO)
      return setError("The video must be 5 GB or smaller.")
    setFile(f)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return setError("Choose a video file.")
    onStart(file, isFree)
  }

  const inputId = `vf-${lessonId}`

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-border bg-white p-5 shadow-sm"
    >
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          pick(e.dataTransfer.files[0])
        }}
        className={
          "flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors duration-200 " +
          (dragging
            ? "border-teal bg-mint/60"
            : "border-border hover:border-teal/50 hover:bg-gray-50")
        }
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-mint text-teal">
          {file ? (
            <Film className="size-5" />
          ) : (
            <CloudUpload className="size-5" />
          )}
        </span>
        {file ? (
          <>
            <span className="max-w-full truncate text-sm font-semibold text-heading">
              {file.name}
            </span>
            <span className="tnum text-xs text-muted-foreground">
              {fmtBytes(file.size)} · click to change
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-heading">
              Drop a video here, or click to browse
            </span>
            <span className="text-xs text-muted-foreground">
              MP4, MOV, MKV or WebM · up to 5 GB
            </span>
          </>
        )}
        <input
          id={inputId}
          type="file"
          accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={isFree}
          onChange={(e) => setIsFree(e.target.checked)}
        />
        Free preview (watchable without enrolling)
      </label>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={!file}>
          <CloudUpload /> Start upload
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** Read-only lecture list for students; each row opens the player. Locked rows (previewing a course) only show the title. */
export function VideoList({ videos }: { videos: Video[] }) {
  const ready = videos.filter((v) => v.status === "ready")
  if (ready.length === 0) return null
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-heading uppercase">
        <Film className="size-4 text-teal" /> Videos
      </h3>
      <ul className="space-y-2">
        {ready.map((v) => (
          <li key={v.id}>
            {v.locked ? (
              <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-white/60 p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                  <Lock className="size-4.5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-heading/70">
                    {v.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Enroll to watch
                  </span>
                </span>
              </div>
            ) : (
              <Link
                href={`/courses/${v.courseId}/learn?v=${v.id}`}
                className="group/row flex items-center gap-3 rounded-md border border-border bg-white p-3 transition-all duration-200 hover:border-teal/40 hover:shadow-sm"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-mint text-teal transition-colors group-hover/row:bg-teal group-hover/row:text-white">
                  <CirclePlay className="size-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-heading">
                    {v.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Video lecture
                  </span>
                </span>
                {v.isFree && <Badge variant="lime">Preview</Badge>}
                <ArrowRight className="size-4 shrink-0 text-heading/50 transition-transform duration-200 group-hover/row:translate-x-1" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
