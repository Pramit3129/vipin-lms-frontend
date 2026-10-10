// Typed client for the Vipin LMS API (see http://localhost:3000/swagger/index.html).
// Auth is cookie based (HttpOnly access_token + refresh_token), so no token is ever readable from JS.

export type Role = "student" | "instructor" | "admin"

export type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: Role
  lastLoginAt: string
}

export type CourseStatus = "draft" | "published" | "archived"
export type EnrollmentStatus = "active" | "completed" | "expired" | "cancelled"
export type QuizStatus = "draft" | "published"
export type QuizType = "mock_test" | "practice"

export const QUIZ_TYPE_LABEL: Record<QuizType, string> = { mock_test: "Mock test", practice: "Practice test" }
/** Section headings: tests are always shown to people as mock tests or practice tests, never "quizzes". */
export const QUIZ_TYPE_PLURAL: Record<QuizType, string> = { mock_test: "Mock tests", practice: "Practice tests" }

export type UserSummary = Pick<User, "id" | "firstName" | "lastName" | "email" | "role">

export type Exam = { id: string; code: string; name: string; description: string }

export type Course = {
  id: string
  examId: string
  instructorId: string
  title: string
  slug: string
  shortDescription: string
  description: string
  status: CourseStatus
  isFree: boolean
  createdAt: string
  /**
   * Only from GET /courses/{id}. "full": enrolled, or the course is free. "preview": published course
   * the user isn't enrolled in, so only free lessons, notes, quizzes and videos open.
   */
  access?: CourseAccess
}

export type CourseAccess = "owner" | "full" | "preview"

/** A published course in the catalog, with what a non-enrolled user can open for free. */
export type CatalogCourse = Course & {
  instructorName: string
  enrolled: boolean
  lessonCount: number
  videoCount: number
  freeLessonCount: number
  freeVideoCount: number
  freeNoteCount: number
  freeQuizCount: number
}

export type Enrollment = {
  id: string
  userId: string
  courseId: string
  status: EnrollmentStatus
  source: string
  enrolledAt: string
  expiresAt: string | null
}

export type Note = {
  id: string
  courseId: string
  lessonId: string
  title: string
  description: string
  fileName: string
  sizeBytes: number
  /** Free preview: opens without enrolling, even in a paid lesson. */
  isFree: boolean
  uploadedBy: string
  uploaderName: string
  createdAt: string
  /** Previewing a course you're not enrolled in: the title shows, but it can't be opened. */
  locked?: boolean
}

export type Lesson = {
  id: string
  courseId: string
  title: string
  content: string
  lessonType: string
  position: number
  isFree: boolean
  isPublished: boolean
  createdAt: string
  notes: Note[] | null
  /** Previewing a course you're not enrolled in: this lesson's content stays closed. */
  locked?: boolean
}

/** uploading → (PUT + confirm) → processing → ready | failed */
export type VideoStatus = "uploading" | "processing" | "ready" | "failed"

export type Video = {
  id: string
  courseId: string
  lessonId: string
  title: string
  isFree: boolean
  sizeBytes: number
  status: VideoStatus
  error: string
  createdAt: string
  updatedAt: string
  /** Previewing a course you're not enrolled in: the title shows, but it can't be streamed. */
  locked?: boolean
}

export type VideoStream = {
  /** Signed HLS manifest; every playlist/segment inside is signed too. Expires at `expiresAt`. */
  manifestUrl: string
  queryParams: string
  expiresAt: string
  /** Seconds; where this user stopped last time (0 = from the start). */
  resumeAt: number
}

export type VideoUpload = {
  video: Video
  uploadUrl: string
  method: string
  headers: Record<string, string> | null
  expiresAt: string
}

export type Post = {
  id: string
  authorId: string
  authorName: string
  courseId: string
  courseTitle: string
  content: string
  links: string[] | null
  createdAt: string
}

export type QuestionOption = {
  id: string
  optionText: string
  position: number
  // Only present for the instructor; hidden from students until they submit.
  isCorrect?: boolean | null
}

export type Question = {
  id: string
  questionText: string
  explanation?: string
  position: number
  options: QuestionOption[]
}

export type Quiz = {
  id: string
  courseId: string
  lessonId: string
  createdBy: string
  title: string
  description: string
  type: QuizType
  status: QuizStatus
  isFree: boolean
  /** null for practice sets. */
  passPercent: number | null
  timeLimitSec: number | null
  questionCount: number
  questions?: Question[] | null
  createdAt: string
  /** Previewing a course you're not enrolled in: the title shows, but it can't be opened. */
  locked?: boolean
}

export type AttemptAnswer = {
  questionId: string
  selectedOptionId: string | null
  correctOptionId: string
  isCorrect: boolean
  explanation?: string
}

export type QuizAttempt = {
  id: string
  quizId: string
  userId: string
  /** score, total and passed are null for practice attempts. */
  score: number | null
  total: number | null
  passed: boolean | null
  startedAt: string
  submittedAt: string
  answers: AttemptAnswer[] | null
}

export const isPractice = (q: Pick<Quiz, "type">) => q.type === "practice"

export type NewQuestion = {
  questionText: string
  explanation?: string
  options: { optionText: string; isCorrect: boolean }[]
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Seconds from the `Retry-After` header on 429 responses. */
    public retryAfter?: number
  ) {
    super(message)
  }
}

const API_BASE = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1`

type Query = Record<string, string | number | undefined>
type Options = { body?: unknown; form?: FormData; query?: Query; keepalive?: boolean }

const id = encodeURIComponent

function url(path: string, query?: Query) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== "") qs.set(k, String(v))
  }
  const s = qs.toString()
  return `${API_BASE}${path}${s ? `?${s}` : ""}`
}

async function send(method: string, path: string, { body, form, query, keepalive }: Options) {
  const headers: Record<string, string> = { Accept: "application/json" }
  let payload: BodyInit | undefined
  if (form) {
    payload = form // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    payload = JSON.stringify(body)
  }
  try {
    return await fetch(url(path, query), {
      method,
      credentials: "include",
      headers,
      body: payload,
      keepalive,
    })
  } catch {
    throw new ApiError("Unable to reach the server. Please try again.", 0)
  }
}

const NO_RENEW = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/forgot-password",
  "/auth/verify-otp",
  "/auth/reset-password",
])

let lastRefreshedAt = 0
let refreshing: Promise<boolean> | null = null

/**
 * Renews the access_token using the refresh_token cookie.
 * Deduplicates in-flight refresh requests and prevents rapid redundant refreshes.
 */
export function refreshOnce(): Promise<boolean> {
  if (Date.now() - lastRefreshedAt < 5_000) {
    return Promise.resolve(true)
  }
  if (refreshing) return refreshing

  refreshing = send("POST", "/auth/refresh", {})
    .then((r) => {
      if (r.ok) {
        lastRefreshedAt = Date.now()
        markSessionVerified()
        return true
      }
      return false
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })

  return refreshing
}

// Sends the request; on 401 renews the access token once and retries.
// If that fails the session is gone, so the local user is cleared and the UI returns to /login.
async function call(method: string, path: string, opts: Options = {}) {
  let res = await send(method, path, opts)
  // Login/register/refresh/logout handle their own 401s; everything else (incl. /auth/me) may renew the session.
  if (res.status === 401 && !NO_RENEW.has(path)) {
    const refreshed = await refreshOnce()
    if (refreshed) {
      res = await send(method, path, opts)
    }
    if (res.status === 401) {
      clearUser()
    }
  }
  return res
}

async function fail(res: Response): Promise<never> {
  // Backend returns JSON {status,message}, but plain text for some malformed payloads.
  const text = await res.text()
  let message: string | undefined
  try {
    message = JSON.parse(text).message
  } catch {}
  const retry = Number(res.headers.get("Retry-After"))
  throw new ApiError(
    message || text.trim() || "Something went wrong",
    res.status,
    Number.isFinite(retry) && retry > 0 ? retry : undefined
  )
}

async function json<T>(method: string, path: string, opts?: Options): Promise<T> {
  const res = await call(method, path, opts)
  if (!res.ok) return fail(res)
  const parsed = (await res.json().catch(() => null)) as { data?: T } | null
  return parsed?.data as T
}

// ── auth ────────────────────────────────────────────────────────────────────
export const login = (email: string, password: string) =>
  json<User>("POST", "/auth/login", { body: { email, password } })

export const register = (input: {
  firstName: string
  lastName: string
  email: string
  password: string
}) => json<User>("POST", "/auth/register", { body: input })

export const refreshSession = () => refreshOnce()

/** The server's view of the signed-in user (current role included). */
export const getMe = () => json<User>("GET", "/auth/me")

/** Clears the HttpOnly auth cookies on the server, then the local copy. */
export async function logout() {
  try {
    await json<string>("POST", "/auth/logout")
  } finally {
    clearUser()
  }
}

export type OtpPurpose = "email_verification" | "password_reset"

/** Emails a 6-digit code to the signed-in user (login required). */
export const sendVerifyEmail = () => json<unknown>("POST", "/auth/verify-email")

/** Emails a reset code if the account exists; the reply is identical either way. */
export const forgotPassword = (email: string) =>
  json<unknown>("POST", "/auth/forgot-password", { body: { email } })

/** Checks a code. For `password_reset` the result carries the single-use `resetToken`. */
export const verifyOtp = (email: string, purpose: OtpPurpose, otp: string) =>
  json<{ resetToken?: string }>("POST", "/auth/verify-otp", { body: { email, purpose, otp } })

export const resetPassword = (resetToken: string, newPassword: string) =>
  json<unknown>("POST", "/auth/reset-password", { body: { resetToken, newPassword } })

// ── users (admin) ───────────────────────────────────────────────────────────
export const listUsers = async (role?: Role, limit = 200, offset = 0) =>
  (await json<UserSummary[]>("GET", "/users", { query: { role, limit, offset } })) ?? []

// ── exams ───────────────────────────────────────────────────────────────────
export const listExams = async () => (await json<Exam[]>("GET", "/exams")) ?? []

// ── courses ─────────────────────────────────────────────────────────────────
export const listCourses = async (limit = 50, offset = 0) =>
  (await json<Course[]>("GET", "/courses", { query: { limit, offset } })) ?? []

export const listMyCourses = async (limit = 100, offset = 0) =>
  (await json<Course[]>("GET", "/me/courses", { query: { limit, offset } })) ?? []

/** Every published course with its free-preview counts; any logged-in user. */
export const listCatalog = async (freeOnly = false, limit = 100, offset = 0) =>
  (await json<CatalogCourse[]>("GET", "/catalog/courses", {
    query: { freeOnly: freeOnly ? "true" : undefined, limit, offset },
  })) ?? []

export const getCourse = (courseId: string) => json<Course>("GET", `/courses/${id(courseId)}`)

export const createCourse = (input: {
  examId: string
  /** Optional: the server defaults to the logged-in admin. */
  instructorId?: string
  title: string
  slug: string
  shortDescription?: string
  description?: string
  status?: CourseStatus
  isFree?: boolean
}) => json<Course>("POST", "/courses", { body: input })

export const updateCourse = (
  courseId: string,
  input: Partial<{
    title: string
    slug: string
    shortDescription: string
    description: string
    examId: string
    isFree: boolean
  }>
) => json<Course>("PATCH", `/courses/${id(courseId)}`, { body: input })

export const deleteCourse = (courseId: string) =>
  json<string>("DELETE", `/courses/${id(courseId)}`)

export const updateCourseStatus = (courseId: string, status: CourseStatus) =>
  json<Course>("PATCH", `/courses/${id(courseId)}/status`, { body: { status } })

// ── lessons & notes ─────────────────────────────────────────────────────────
export const listLessons = async (courseId: string) =>
  (await json<Lesson[]>("GET", `/courses/${id(courseId)}/lessons`)) ?? []

export const createLesson = (
  courseId: string,
  input: { title: string; content?: string; isFree?: boolean; isPublished?: boolean }
) => json<Lesson>("POST", `/courses/${id(courseId)}/lessons`, { body: input })

export const updateLesson = (
  lessonId: string,
  input: Partial<{ title: string; content: string; isFree: boolean; isPublished: boolean }>
) => json<Lesson>("PATCH", `/lessons/${id(lessonId)}`, { body: input })

export const deleteLesson = (lessonId: string) =>
  json<string>("DELETE", `/lessons/${id(lessonId)}`)

export const uploadNote = (
  lessonId: string,
  input: { title: string; description?: string; isFree?: boolean; file: File }
) => {
  const form = new FormData()
  form.set("title", input.title)
  if (input.description) form.set("description", input.description)
  form.set("isFree", String(!!input.isFree))
  form.set("file", input.file)
  return json<Note>("POST", `/lessons/${id(lessonId)}/notes`, { form })
}

/** Changes only the fields sent; the PDF itself can't be replaced. */
export const updateNote = (noteId: string, input: Partial<{ title: string; description: string; isFree: boolean }>) =>
  json<Note>("PATCH", `/notes/${id(noteId)}`, { body: input })

export const deleteNote = (noteId: string) =>
  json<string>("DELETE", `/notes/${id(noteId)}`)

/** Fetches the PDF as a Blob (the cookie-authenticated endpoint cannot be used as a plain link). */
export async function downloadNote(noteId: string): Promise<Blob> {
  const res = await call("GET", `/notes/${id(noteId)}/file`)
  if (!res.ok) return fail(res)
  return new Blob([await res.arrayBuffer()], { type: "application/pdf" })
}

// ── videos ──────────────────────────────────────────────────────────────────
export const VIDEO_EXT_RE = /\.(mp4|mov|mkv|webm)$/i
export const MAX_VIDEO = 5 * 1024 * 1024 * 1024 // 5 GB, enforced by the signed URL too

/** Owner sees every video; students see ready videos of published lessons (free ones only if not enrolled). */
export const listCourseVideos = async (courseId: string) =>
  (await json<{ videos: Video[] | null }>("GET", `/courses/${id(courseId)}/videos`))?.videos ?? []

export const listLessonVideos = async (lessonId: string) =>
  (await json<{ videos: Video[] | null }>("GET", `/lessons/${id(lessonId)}/videos`))?.videos ?? []

/** Creates the video row ('uploading') and returns a signed URL to PUT the file to. */
export const requestVideoUpload = (lessonId: string, input: { fileName: string; isFree: boolean }) =>
  json<VideoUpload>("POST", `/lessons/${id(lessonId)}/videos`, { body: input })

/** Tells the server the PUT finished; it checks the file and queues transcoding. */
export const confirmVideo = async (videoId: string) =>
  (await json<{ video: Video }>("POST", `/videos/${id(videoId)}/confirm`)).video

export const getVideo = async (videoId: string) =>
  (await json<{ video: Video }>("GET", `/videos/${id(videoId)}`)).video

export const getVideoStream = (videoId: string) =>
  json<VideoStream>("GET", `/videos/${id(videoId)}/stream`)

/** `keepalive` lets the save finish while the page unloads. */
export const saveVideoProgress = (videoId: string, positionSec: number, keepalive = false) =>
  json<{ positionSec: number }>("PUT", `/videos/${id(videoId)}/progress`, {
    body: { positionSec: Math.max(0, Math.min(86_400, Math.floor(positionSec))) },
    keepalive,
  })

/** Re-queues transcoding of a failed video; the uploaded file is reused. */
export const retryVideo = async (videoId: string) =>
  (await json<{ video: Video }>("POST", `/videos/${id(videoId)}/retry`)).video

/** True while the signed upload URL has at least a minute left, so a retry can reuse it. */
export const uploadUrlFresh = (upload: VideoUpload) => Date.parse(upload.expiresAt) - Date.now() > 60_000

/**
 * PUTs the file straight to storage. Uses XHR (not fetch) for upload progress.
 * No cookies are sent: the signature in the URL is the credential.
 */
export function putVideoFile(
  upload: VideoUpload,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(upload.method || "PUT", upload.uploadUrl)
    // The signed headers must be sent unchanged, or storage rejects the signature.
    const headers = { "x-goog-content-length-range": `0,${MAX_VIDEO}`, ...upload.headers }
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : file.size)
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(`Upload rejected by storage (HTTP ${xhr.status}).`, xhr.status))
    xhr.onerror = () => reject(new ApiError("Upload failed. Check your connection and try again.", 0))
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"))
    signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.send(file)
  })
}

// ── enrollments ─────────────────────────────────────────────────────────────
export const listEnrollments = async (
  filter: { courseId?: string; userId?: string } = {},
  limit = 50,
  offset = 0
) =>
  (await json<Enrollment[]>("GET", "/enrollments", { query: { ...filter, limit, offset } })) ?? []

export const createEnrollment = (input: { userId: string; courseId: string; months: number }) =>
  json<Enrollment>("POST", "/enrollments", { body: input })

export const updateEnrollmentStatus = (enrollmentId: string, status: EnrollmentStatus) =>
  json<Enrollment>("PATCH", `/enrollments/${id(enrollmentId)}`, { body: { status } })

// ── posts ───────────────────────────────────────────────────────────────────
export const listPosts = async (limit = 50, offset = 0) =>
  (await json<Post[]>("GET", "/posts", { query: { limit, offset } })) ?? []

export const createPost = (input: { courseId: string; content: string; links?: string[] }) =>
  json<Post>("POST", "/posts", { body: input })

export const deletePost = (postId: string) => json<string>("DELETE", `/posts/${id(postId)}`)

// ── quizzes ─────────────────────────────────────────────────────────────────
export const listQuizzes = async (lessonId: string, type?: QuizType) =>
  (await json<Quiz[]>("GET", `/lessons/${id(lessonId)}/quizzes`, { query: { type } })) ?? []

export const createQuiz = (
  lessonId: string,
  input: {
    title: string
    type?: QuizType
    description?: string
    isFree?: boolean
    /** Not allowed for practice sets. */
    passPercent?: number
    /** Not allowed for practice sets. */
    timeLimitSec?: number
    status?: QuizStatus
    questions: NewQuestion[]
  }
) => json<Quiz>("POST", `/lessons/${id(lessonId)}/quizzes`, { body: input })

export const updateQuiz = (
  quizId: string,
  input: Partial<{
    title: string
    /** 409 once the quiz has attempts. */
    type: QuizType
    description: string
    isFree: boolean
    passPercent: number
    /** 0 makes the quiz untimed. */
    timeLimitSec: number
    status: QuizStatus
    questions: NewQuestion[]
  }>
) => json<Quiz>("PATCH", `/quizzes/${id(quizId)}`, { body: input })

export const deleteQuiz = (quizId: string) => json<string>("DELETE", `/quizzes/${id(quizId)}`)

export const getQuiz = (quizId: string) => json<Quiz>("GET", `/quizzes/${id(quizId)}`)

export const updateQuizStatus = (quizId: string, status: QuizStatus) =>
  json<Quiz>("PATCH", `/quizzes/${id(quizId)}/status`, { body: { status } })

export const submitAttempt = (
  quizId: string,
  answers: { questionId: string; optionId: string }[]
) => json<QuizAttempt>("POST", `/quizzes/${id(quizId)}/attempts`, { body: { answers } })

export const listAttempts = async (quizId: string) =>
  (await json<QuizAttempt[]>("GET", `/quizzes/${id(quizId)}/attempts`)) ?? []

// ── local session cache (profile only; tokens live in HttpOnly cookies) ─────
export const USER_KEY = "lms_user"

let lastVerified = 0
export const VERIFY_EVERY_MS = 60_000

export function markSessionVerified() {
  lastVerified = Date.now()
}

export function isSessionFresh() {
  return Date.now() - lastVerified < VERIFY_EVERY_MS
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function subscribeSession(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

export function readSession(): string | null {
  try {
    return localStorage.getItem(USER_KEY)
  } catch {
    return null
  }
}

export function parseUser(raw: string | null): User | null {
  if (!raw) return null
  try {
    const u = JSON.parse(raw) as User
    return u && typeof u.id === "string" && typeof u.role === "string" ? u : null
  } catch {
    return null
  }
}

export function saveUser(user: User) {
  markSessionVerified()
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {}
  notify()
}

export function clearUser() {
  lastVerified = 0
  try {
    localStorage.removeItem(USER_KEY)
  } catch {}
  notify()
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

