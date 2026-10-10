"use client"

import { CheckCircle2, Clock, Loader2, Pencil, Trash2, XCircle } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { AppShell, ErrorNote, PageTitle, errMsg } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { QuizBuilder } from "@/components/quiz-builder"
import { Select } from "@/components/ui/select"
import { useUser } from "@/hooks/use-user"
import {
  QUIZ_TYPE_LABEL,
  UUID_RE,
  deleteQuiz,
  getCourse,
  getQuiz,
  isPractice,
  listAttempts,
  submitAttempt,
  updateQuizStatus,
  type AttemptAnswer,
  type Quiz,
  type QuizAttempt,
  type QuizStatus,
} from "@/lib/api"

export default function QuizPage() {
  return (
    <AppShell>
      <QuizView />
    </AppShell>
  )
}

function QuizView() {
  const user = useUser()!
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const valid = UUID_RE.test(id)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [result, setResult] = useState<QuizAttempt | null>(null)
  const [error, setError] = useState<string | null>(valid ? null : "That is not a valid test ID.")
  const [taking, setTaking] = useState(false)
  // Bumped by "Practice again" to remount <Practice> with fresh state.
  const [practiceRun, setPracticeRun] = useState(0)
  const [editing, setEditing] = useState(false)
  const [owner, setOwner] = useState(false)
  const isStudent = user.role === "student"

  useEffect(() => {
    if (!valid) return
    getQuiz(id)
      .then(async (q) => {
        setQuiz(q)
        // Owner = instructor/admin whose id is the course's instructor id.
        if (!isStudent) {
          const c = await getCourse(q.courseId).catch(() => null)
          setOwner(!!c && c.instructorId === user.id)
        }
      })
      .catch((e) => setError(errMsg(e)))
    if (isStudent) listAttempts(id).then(setAttempts).catch((e) => setError(errMsg(e)))
  }, [id, valid, isStudent, user.id])

  async function onDelete() {
    if (!quiz || !confirm(`Delete "${quiz.title}"? Students' past attempts are kept.`)) return
    setError(null)
    try {
      await deleteQuiz(id)
      router.replace(`/courses/${quiz.courseId}`)
    } catch (e) {
      setError(errMsg(e))
    }
  }

  async function onStatus(s: QuizStatus) {
    setError(null)
    try {
      const q = await updateQuizStatus(id, s)
      setQuiz((cur) => (cur ? { ...cur, status: q.status } : cur))
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const questions = quiz?.questions ?? []
  const practice = !!quiz && isPractice(quiz)

  return (
    <>
      <PageTitle
        title={quiz?.title ?? "Test"}
        subtitle={quiz?.description}
        actions={
          owner && quiz && (
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Test status" className="h-9 w-36" value={quiz.status} onChange={(e) => onStatus(e.target.value as QuizStatus)}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </Select>
              <Button variant="outline" onClick={() => setEditing((v) => !v)}>
                <Pencil /> Edit
              </Button>
              <Button variant="destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </Button>
            </div>
          )
        }
      />
      <ErrorNote error={error} />
      {!quiz && !error && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}

      {quiz && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{quiz.questionCount} questions</Badge>
          <Badge variant="secondary">{QUIZ_TYPE_LABEL[quiz.type]}</Badge>
          {practice ? (
            <Badge variant="secondary">Untimed · No marks</Badge>
          ) : (
            <>
              <Badge variant="secondary">Pass mark {quiz.passPercent}%</Badge>
              <Badge variant="secondary">{quiz.timeLimitSec ? `${Math.round(quiz.timeLimitSec / 60)} min limit` : "Untimed"}</Badge>
            </>
          )}
        </div>
      )}

      {owner && quiz && editing && (
        <QuizBuilder
          key={quiz.id}
          quiz={quiz}
          onSaved={(q) => {
            setQuiz(q)
            setEditing(false)
          }}
        />
      )}

      {!isStudent && quiz && !editing && <Answers questions={questions} />}

      {isStudent && quiz && !result && !taking && (
        <Button onClick={() => setTaking(true)} disabled={questions.length === 0}>
          {practice ? "Start practice" : "Start test"}
        </Button>
      )}

      {isStudent && quiz && practice && taking && (
        <Practice
          key={practiceRun}
          quiz={quiz}
          onChecked={(a) => setAttempts((x) => [a, ...x])}
          onReset={() => setPracticeRun((n) => n + 1)}
        />
      )}

      {isStudent && quiz && !practice && taking && !result && (
        <Take
          quiz={quiz}
          onDone={(a) => {
            setResult(a)
            setTaking(false)
            setAttempts((x) => [a, ...x])
          }}
        />
      )}

      {result && quiz && <Result quiz={quiz} attempt={result} />}

      {isStudent && quiz && practice && attempts.length > 0 && <PracticeSummary quiz={quiz} attempts={attempts} />}

      {isStudent && !practice && attempts.length > 0 && (
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>My attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {attempts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span>{new Date(a.submittedAt).toLocaleString()}</span>
                  <span className="flex items-center gap-2">
                    {a.score ?? 0}/{a.total ?? 0}
                    <Badge variant={a.passed ? "default" : "secondary"}>{a.passed ? "Passed" : "Not passed"}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}

function Answers({ questions }: { questions: NonNullable<Quiz["questions"]> }) {
  return (
    <div className="space-y-4">
      {questions.map((q, i) => (
        <Card key={q.id} className="rise bg-white" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
          <CardContent className="space-y-2">
            <p className="text-base font-semibold whitespace-pre-line text-heading">
              <span className="tnum mr-2 text-teal">{i + 1}.</span>
              {q.questionText}
            </p>
            <ul className="space-y-2 text-sm">
              {q.options.map((o) => (
                <li
                  key={o.id}
                  className={
                    "flex items-center gap-2 rounded-md border px-3 py-2 " +
                    (o.isCorrect ? "border-green-600/30 bg-lime-soft/60 font-medium text-green-700" : "border-border text-gray-700")
                  }
                >
                  {o.isCorrect ? <CheckCircle2 className="size-4 shrink-0" /> : <span className="size-4 shrink-0 rounded-full border border-gray-300" />}
                  {o.optionText}
                </li>
              ))}
            </ul>
            {q.explanation && <p className="text-xs whitespace-pre-line text-gray-500">{q.explanation}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function Take({ quiz, onDone }: { quiz: Quiz; onDone: (a: QuizAttempt) => void }) {
  const questions = quiz.questions ?? []
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [left, setLeft] = useState(quiz.timeLimitSec ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitted = useRef(false)

  const submit = useCallback(async () => {
    if (submitted.current) return
    submitted.current = true
    setSaving(true)
    setError(null)
    try {
      onDone(
        await submitAttempt(
          quiz.id,
          Object.entries(picked).map(([questionId, optionId]) => ({ questionId, optionId }))
        )
      )
    } catch (e) {
      submitted.current = false
      setError(errMsg(e))
      setSaving(false)
    }
  }, [quiz.id, picked, onDone])

  // The time limit is advisory in the UI; the server grades whatever is submitted.
  useEffect(() => {
    if (left === null) return
    const t = setTimeout(
      () => (left <= 0 ? submit() : setLeft((s) => (s === null ? s : s - 1))),
      left <= 0 ? 0 : 1000
    )
    return () => clearTimeout(t)
  }, [left, submit])

  return (
    <div className="space-y-4">
      <div className="sticky top-[88px] z-20 space-y-2 rounded-lg border border-border bg-white/95 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="tnum font-semibold text-heading">
            {Object.keys(picked).length} of {questions.length} answered
          </span>
          {left !== null && (
            <span className={"tnum flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-bold " + (left <= 30 ? "bg-red-50 text-red-700" : "bg-mint text-teal")} aria-live="off">
              <Clock className="size-3.5" />
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-teal transition-[width] duration-500 ease-out"
            style={{ width: `${questions.length ? (Object.keys(picked).length / questions.length) * 100 : 0}%` }}
          />
        </div>
      </div>
      {questions.map((q, i) => (
        <Card key={q.id} className="rise bg-white" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
          <CardContent className="space-y-4">
            <p className="text-base leading-snug font-semibold whitespace-pre-line text-heading">
              <span className="tnum mr-2 text-teal">{i + 1}.</span>
              {q.questionText}
            </p>
            <div className="space-y-2" role="radiogroup" aria-label={`Question ${i + 1}`}>
              {q.options.map((o) => {
                const on = picked[q.id] === o.id
                return (
                  <label
                    key={o.id}
                    className={
                      "flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm transition-all duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring " +
                      (on ? "border-teal bg-mint font-medium text-heading" : "border-border text-gray-700 hover:border-teal/40 hover:bg-gray-50")
                    }
                  >
                    <input type="radio" name={q.id} className="size-4" checked={on} onChange={() => setPicked((p) => ({ ...p, [q.id]: o.id }))} />
                    {o.optionText}
                  </label>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
      <ErrorNote error={error} />
      <Button size="lg" onClick={submit} disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        Submit answers
      </Button>
    </div>
  )
}

function Result({ quiz, attempt }: { quiz: Quiz; attempt: QuizAttempt }) {
  const byQ = new Map((attempt.answers ?? []).map((a) => [a.questionId, a]))
  return (
    <div className="space-y-3">
      <Card className="pop overflow-hidden bg-navy">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm text-white/75">Your score</div>
            <div className="tnum text-5xl font-semibold text-white">
              {attempt.score ?? 0}<span className="text-2xl text-white/60">/{attempt.total ?? 0}</span>
            </div>
          </div>
          <Badge variant={attempt.passed ? "lime" : "secondary"} className="h-7 px-3 text-xs">{attempt.passed ? "Passed" : "Not passed"}</Badge>
        </CardContent>
      </Card>
      {(quiz.questions ?? []).map((q, i) => {
        const a = byQ.get(q.id)
        return (
          <Card key={q.id} className="rise bg-white" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
            <CardContent className="space-y-3">
              <p className="flex items-start gap-2 font-semibold whitespace-pre-line text-heading">
                {a?.isCorrect ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
                {i + 1}. {q.questionText}
              </p>
              <OptionReveal options={q.options} correctOptionId={a?.correctOptionId} selectedOptionId={a?.selectedOptionId} />
              {!a?.selectedOptionId && <p className="text-xs text-gray-500">Skipped</p>}
              {a?.explanation && <p className="text-xs whitespace-pre-line text-gray-500">{a.explanation}</p>}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/** Option list that marks the correct option green and a wrong pick red; shared by mock results and practice checks. */
function OptionReveal({
  options,
  correctOptionId,
  selectedOptionId,
}: {
  options: NonNullable<Quiz["questions"]>[number]["options"]
  correctOptionId?: string
  selectedOptionId?: string | null
}) {
  return (
    <ul className="space-y-2 text-sm">
      {options.map((o) => (
        <li
          key={o.id}
          className={
            "rounded-md border px-3 py-2 " +
            (o.id === correctOptionId
              ? "border-green-600/30 bg-lime-soft/60 font-medium text-green-700"
              : o.id === selectedOptionId
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-border text-gray-700")
          }
        >
          {o.id === correctOptionId ? "✓ " : o.id === selectedOptionId ? "✗ " : "• "}
          {o.optionText}
        </li>
      ))}
    </ul>
  )
}

function Practice({
  quiz,
  onChecked,
  onReset,
}: {
  quiz: Quiz
  onChecked: (a: QuizAttempt) => void
  onReset: () => void
}) {
  const questions = quiz.questions ?? []
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Record<string, AttemptAnswer>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const done = Object.keys(checked).length

  async function check(questionId: string) {
    setBusy(questionId)
    setError(null)
    try {
      const attempt = await submitAttempt(quiz.id, [{ questionId, optionId: picked[questionId] }])
      const answer = attempt.answers?.find((x) => x.questionId === questionId)
      if (answer) setChecked((c) => ({ ...c, [questionId]: answer }))
      onChecked(attempt)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-[88px] z-20 space-y-2 rounded-lg border border-border bg-white/95 p-4 shadow-sm backdrop-blur-sm">
        <span className="tnum text-sm font-semibold text-heading">
          {done} of {questions.length} checked
        </span>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-teal transition-[width] duration-500 ease-out"
            style={{ width: `${questions.length ? (done / questions.length) * 100 : 0}%` }}
          />
        </div>
      </div>
      {questions.map((q, i) => {
        const a = checked[q.id]
        return (
          <Card key={q.id} className="rise bg-white" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
            <CardContent className="space-y-4">
              <p className="flex items-start gap-2 text-base leading-snug font-semibold text-heading">
                {a && (a.isCorrect ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />)}
                <span className="whitespace-pre-line">
                  <span className="tnum mr-2 text-teal">{i + 1}.</span>
                  {q.questionText}
                </span>
              </p>
              {a ? (
                <>
                  <OptionReveal options={q.options} correctOptionId={a.correctOptionId} selectedOptionId={a.selectedOptionId} />
                  {a.explanation && <p className="text-xs whitespace-pre-line text-gray-500">{a.explanation}</p>}
                </>
              ) : (
                <>
                  <div className="space-y-2" role="radiogroup" aria-label={`Question ${i + 1}`}>
                    {q.options.map((o) => {
                      const on = picked[q.id] === o.id
                      return (
                        <label
                          key={o.id}
                          className={
                            "flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm transition-all duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring " +
                            (on ? "border-teal bg-mint font-medium text-heading" : "border-border text-gray-700 hover:border-teal/40 hover:bg-gray-50")
                          }
                        >
                          <input type="radio" name={q.id} className="size-4" checked={on} onChange={() => setPicked((p) => ({ ...p, [q.id]: o.id }))} />
                          {o.optionText}
                        </label>
                      )
                    })}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => check(q.id)} disabled={!picked[q.id] || busy !== null}>
                    {busy === q.id && <Loader2 className="animate-spin" />}
                    Check answer
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
      <ErrorNote error={error} />
      {questions.length > 0 && done === questions.length && <Button onClick={onReset}>Practice again</Button>}
    </div>
  )
}

function PracticeSummary({ quiz, attempts }: { quiz: Quiz; attempts: QuizAttempt[] }) {
  const checked = new Set(attempts.flatMap((a) => (a.answers ?? []).map((x) => x.questionId)))
  const last = attempts.reduce((m, a) => (a.submittedAt > m ? a.submittedAt : m), attempts[0].submittedAt)
  return (
    <Card className="bg-white">
      <CardContent className="text-sm text-gray-700">
        Last practiced {new Date(last).toLocaleDateString()} · {checked.size} of {quiz.questionCount} questions checked
      </CardContent>
    </Card>
  )
}
