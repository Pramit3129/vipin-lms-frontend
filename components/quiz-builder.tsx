"use client"

import { Loader2, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { ErrorNote, errMsg } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { QUIZ_TYPE_LABEL, createQuiz, updateQuiz, type Quiz, type QuizStatus, type QuizType } from "@/lib/api"

type Draft = { text: string; explanation: string; options: string[]; correct: number }

const blank = (): Draft => ({ text: "", explanation: "", options: ["", ""], correct: 0 })

const fromQuiz = (q: Quiz): Draft[] =>
  (q.questions ?? []).map((x) => ({
    text: x.questionText,
    explanation: x.explanation ?? "",
    options: x.options.map((o) => o.optionText),
    correct: Math.max(0, x.options.findIndex((o) => o.isCorrect)),
  }))

/** Creates a quiz on `lessonId`, or edits `quiz` when given (the owner sees the answers). */
export function QuizBuilder({
  lessonId,
  quiz,
  initialType,
  onSaved,
}: {
  lessonId?: string
  quiz?: Quiz
  /** Starting type for a new quiz. */
  initialType?: QuizType
  onSaved: (q: Quiz) => void
}) {
  const editing = !!quiz
  const key = quiz?.id ?? lessonId
  const [title, setTitle] = useState(quiz?.title ?? "")
  const [description, setDescription] = useState(quiz?.description ?? "")
  const [type, setType] = useState<QuizType>(quiz?.type ?? initialType ?? "mock_test")
  const practice = type === "practice"
  const [passPercent, setPass] = useState(quiz?.passPercent ?? 70)
  const [minutes, setMinutes] = useState(quiz?.timeLimitSec ? String(Math.round(quiz.timeLimitSec / 60)) : "")
  const [status, setStatus] = useState<QuizStatus>(quiz?.status ?? "published")
  // New quizzes start paid: only quizzes marked free open without enrolling, even in a free lesson.
  const [isFree, setIsFree] = useState(quiz?.isFree ?? false)
  const [questions, setQuestionsRaw] = useState<Draft[]>(quiz ? fromQuiz(quiz) : [blank()])
  // Only send questions when they were touched: the server replaces them all, and refuses once students have attempted.
  const [dirty, setDirty] = useState(false)
  const setQuestions = (fn: (q: Draft[]) => Draft[]) => {
    setDirty(true)
    setQuestionsRaw(fn)
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (i: number, p: Partial<Draft>) =>
    setQuestions((qs) => qs.map((q, k) => (k === i ? { ...q, ...p } : q)))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const payloadQuestions = questions.map((q) => ({
        questionText: q.text.trim(),
        explanation: q.explanation.trim(),
        options: q.options.map((o, i) => ({ optionText: o.trim(), isCorrect: i === q.correct })),
      }))
      const timeLimitSec = minutes ? Math.round(Number(minutes) * 60) : undefined
      // Practice sets reject passPercent and timeLimitSec with a 400, so never send them.
      const saved = editing
        ? await updateQuiz(quiz.id, {
            title: title.trim(),
            description: description.trim(),
            // Only when changed: the server refuses a type change once students have attempted.
            ...(type !== quiz.type ? { type } : {}),
            ...(practice ? {} : { passPercent, timeLimitSec: timeLimitSec ?? 0 }), // 0 = untimed
            status,
            isFree,
            ...(dirty ? { questions: payloadQuestions } : {}),
          })
        : await createQuiz(lessonId!, {
            type,
            title: title.trim(),
            description: description.trim(),
            ...(practice ? {} : { passPercent, timeLimitSec }),
            status,
            isFree,
            questions: payloadQuestions,
          })
      onSaved(saved)
    } catch (err) {
      setError(errMsg(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900">Test type</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["mock_test", "practice"] as const).map((t) => (
            <label
              key={t}
              className={
                "flex cursor-pointer items-start gap-3 rounded-md border bg-white p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring " +
                (type === t ? "border-teal bg-mint" : "border-border hover:border-teal/40")
              }
            >
              <input type="radio" name={`type-${key}`} className="mt-0.5 size-4" checked={type === t} onChange={() => setType(t)} />
              <span>
                <span className="block font-medium text-heading">{QUIZ_TYPE_LABEL[t]}</span>
                <span className="block text-xs text-gray-500">{t === "mock_test" ? "Timed, scored" : "Untimed, no marks"}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500">Type can&apos;t change after students attempt it.</p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`qt-${key}`}>Title</FieldLabel>
          <Input id={`qt-${key}`} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel>Description</FieldLabel>
          <Input maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {!practice && (
          <>
            <Field>
              <FieldLabel>Pass mark (%)</FieldLabel>
              <Input type="number" min={0} max={100} required value={passPercent} onChange={(e) => setPass(Number(e.target.value))} />
            </Field>
            <Field>
              <FieldLabel>Time limit (minutes, optional)</FieldLabel>
              <Input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
          </>
        )}
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select value={status} onChange={(e) => setStatus(e.target.value as QuizStatus)}>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
          <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
          Free preview (open without enrolling)
        </label>
      </div>

      {questions.map((q, i) => (
        <fieldset key={i} className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-medium text-gray-900">Question {i + 1}</legend>
            {questions.length > 1 && (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove question ${i + 1}`} onClick={() => setQuestions((qs) => qs.filter((_, k) => k !== i))}>
                <Trash2 />
              </Button>
            )}
          </div>
          <Textarea required aria-label={`Question ${i + 1} text`} placeholder="Question" className="min-h-14" maxLength={2000} value={q.text} onChange={(e) => patch(i, { text: e.target.value })} />
          <div className="space-y-2">
            {q.options.map((o, j) => (
              <div key={j} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${key}-${i}`}
                  checked={q.correct === j}
                  onChange={() => patch(i, { correct: j })}
                  aria-label={`Option ${j + 1} is correct`}
                />
                <Input
                  required
                  aria-label={`Question ${i + 1} option ${j + 1}`}
                  placeholder={`Option ${j + 1}`}
                  maxLength={1000}
                  value={o}
                  className="h-9 bg-white"
                  onChange={(e) => patch(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })}
                />
                {q.options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove option ${j + 1}`}
                    onClick={() =>
                      patch(i, {
                        options: q.options.filter((_, k) => k !== j),
                        correct: q.correct === j ? 0 : q.correct > j ? q.correct - 1 : q.correct,
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {q.options.length < 10 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => patch(i, { options: [...q.options, ""] })}>
                <Plus /> Add option
              </Button>
            )}
          </div>
          <Input aria-label={`Question ${i + 1} explanation`} placeholder={`Explanation ${practice ? "shown after checking the answer" : "shown after submitting"} (optional)`} maxLength={5000} value={q.explanation} className="h-9 bg-white" onChange={(e) => patch(i, { explanation: e.target.value })} />
        </fieldset>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={() => setQuestions((qs) => [...qs, blank()])}>
        <Plus /> Add question
      </Button>
      <ErrorNote error={error} />
      <div>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Save test" : "Create test"}
        </Button>
      </div>
    </form>
  )
}
