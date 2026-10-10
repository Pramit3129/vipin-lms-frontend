"use client"

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  FileText,
  FileUp,
  Loader2,
  X,
} from "lucide-react"
import { useRef, useState } from "react"

import { ErrorNote, errMsg } from "@/components/app-shell"
import { QuizBuilder } from "@/components/quiz-builder"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import {
  QUIZ_TYPE_LABEL,
  QUIZ_TYPE_PLURAL,
  createQuiz,
  type Quiz,
  type QuizStatus,
  type QuizType,
} from "@/lib/api"
import {
  ANSWERS_SAMPLE,
  QUESTIONS_SAMPLE,
  MAX_QUESTIONS_PER_QUIZ,
  combine,
  readPdfLines,
  splitSet,
  type FormatIssue,
  type ImportedSet,
  type PdfFile,
  type QuizPart,
} from "@/lib/quiz-pdf"

const TYPE_HINT: Record<QuizType, string> = {
  mock_test: "Timed and scored, with a pass mark",
  practice: "Untimed, no marks; answers revealed per question",
}

/**
 * The owner's "Create quiz" panel: pick mock test or practice set, then upload a question paper
 * and answer key as PDFs (or build the questions by hand).
 */
export function QuizCreator({
  lessonId,
  onSaved,
  onClose,
}: {
  lessonId: string
  onSaved: (q: Quiz) => void
  onClose: () => void
}) {
  const [type, setType] = useState<QuizType | null>(null)
  const [manual, setManual] = useState(false)

  if (!type) {
    return (
      <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-heading">What are you adding?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["mock_test", "practice"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className="rounded-md border border-border bg-white p-3 text-left text-sm transition-colors hover:border-teal hover:bg-mint focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="block font-medium text-heading">
                {QUIZ_TYPE_LABEL[t]}
              </span>
              <span className="block text-xs text-gray-500">
                {TYPE_HINT[t]}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setType(null)
            setManual(false)
          }}
        >
          <ChevronLeft /> {QUIZ_TYPE_LABEL[type]}
        </Button>
        <span className="text-gray-400">·</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setManual((m) => !m)}
        >
          {manual ? "Upload PDFs instead" : "Build questions manually instead"}
        </Button>
      </div>
      {manual ? (
        <QuizBuilder
          lessonId={lessonId}
          initialType={type}
          onSaved={(q) => {
            onSaved(q)
            onClose()
          }}
        />
      ) : (
        <PdfImport
          key={type}
          lessonId={lessonId}
          type={type}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </div>
  )
}

type Progress = [done: number, total: number] | null

type Parse =
  | { status: "idle" }
  | { status: "parsing"; progress: Record<PdfFile, Progress> }
  | { status: "error"; issues: FormatIssue[] }
  | { status: "ok"; sets: ImportedSet[]; parts: QuizPart[] }

const FILE_LABEL: Record<FormatIssue["file"], string> = {
  questions: "Question paper",
  answers: "Answer key",
  both: "Both files",
}

const baseTitle = (name: string) =>
  name
    .replace(/\.pdf$/i, "")
    .replace(/[_\s]+/g, " ")
    .trim()

const partKey = (p: QuizPart) => `${p.set}-${p.part}`
const partLabel = (p: QuizPart) =>
  `Set ${p.set}${p.parts > 1 ? ` part ${p.part}` : ""}`

function PdfImport({
  lessonId,
  type,
  onSaved,
  onClose,
}: {
  lessonId: string
  type: QuizType
  onSaved: (q: Quiz) => void
  onClose: () => void
}) {
  const practice = type === "practice"
  const noun = (n: number) =>
    (n === 1 ? QUIZ_TYPE_LABEL : QUIZ_TYPE_PLURAL)[type].toLowerCase()
  const [files, setFiles] = useState<Record<PdfFile, File | null>>({
    questions: null,
    answers: null,
  })
  const [parse, setParse] = useState<Parse>({ status: "idle" })
  const run = useRef(0)

  // Keyed by partKey: one quiz per part of a set.
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [include, setInclude] = useState<Record<string, boolean>>({})
  const [description, setDescription] = useState("")
  const [passPercent, setPass] = useState(70)
  const [minutes, setMinutes] = useState("")
  const [status, setStatus] = useState<QuizStatus>("published")
  const [isFree, setIsFree] = useState(false)
  const [saving, setSaving] = useState<Progress>(null)
  const [error, setError] = useState<string | null>(null)

  // Parse as soon as both files are in; a newer pick supersedes an in-flight parse.
  async function parseFiles({
    questions,
    answers,
  }: Record<PdfFile, File | null>) {
    const id = ++run.current
    if (!questions || !answers) {
      setParse({ status: "idle" })
      return
    }
    setParse({
      status: "parsing",
      progress: { questions: null, answers: null },
    })
    setError(null)
    const read = async (file: PdfFile, f: File) => {
      try {
        const lines = await readPdfLines(f, (done, total) => {
          if (id !== run.current) return
          setParse((p) =>
            p.status === "parsing"
              ? { ...p, progress: { ...p.progress, [file]: [done, total] } }
              : p
          )
        })
        return { lines }
      } catch (err) {
        return { issue: { file, message: errMsg(err) } as FormatIssue }
      }
    }
    const [q, a] = await Promise.all([
      read("questions", questions),
      read("answers", answers),
    ])
    if (id !== run.current) return
    if (q.issue || a.issue) {
      setParse({
        status: "error",
        issues: [q.issue, a.issue].filter((x): x is FormatIssue => !!x),
      })
      return
    }
    const result = combine(q.lines!, a.lines!)
    if (!result.ok) {
      setParse({ status: "error", issues: result.issues })
      return
    }
    const parts = result.sets.flatMap(splitSet)
    const base = baseTitle(questions.name)
    const manySets = result.sets.length > 1
    const title = (p: QuizPart) =>
      `${base}${manySets ? ` — Set ${p.set}` : ""}${p.parts > 1 ? ` (Part ${p.part} of ${p.parts})` : ""}`.slice(
        0,
        200
      )
    setTitles(Object.fromEntries(parts.map((p) => [partKey(p), title(p)])))
    setInclude(Object.fromEntries(parts.map((p) => [partKey(p), true])))
    setParse({ status: "ok", sets: result.sets, parts })
  }

  const sets = parse.status === "ok" ? parse.sets : []
  const parts = parse.status === "ok" ? parse.parts : []
  const chosen = parts.filter((p) => include[partKey(p)])
  const total = sets.reduce((n, s) => n + s.questions.length, 0)
  const split = sets.filter((s) => s.questions.length > MAX_QUESTIONS_PER_QUIZ)
  const timeLimitSec = minutes ? Math.round(Number(minutes) * 60) : undefined

  // Practice sets reject passPercent and timeLimitSec with a 400, so never send them.
  const bodyFor = (p: QuizPart) => ({
    type,
    title: (titles[partKey(p)] ?? "").trim(),
    description: description.trim(),
    ...(practice
      ? {}
      : { passPercent, ...(timeLimitSec ? { timeLimitSec } : {}) }),
    status,
    isFree,
    questions: p.questions,
  })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // One request per part. Stop at the first failure and untick the parts already created, so a retry doesn't duplicate them.
    const done: QuizPart[] = []
    for (const p of chosen) {
      setSaving([done.length + 1, chosen.length])
      try {
        onSaved(await createQuiz(lessonId, bodyFor(p)))
        done.push(p)
      } catch (err) {
        if (done.length)
          setInclude((inc) => ({
            ...inc,
            ...Object.fromEntries(done.map((d) => [partKey(d), false])),
          }))
        setError(
          `${done.length ? `Created ${done.map(partLabel).join(", ")}. ` : ""}${partLabel(p)} failed: ${errMsg(err)}`
        )
        setSaving(null)
        return
      }
    }
    onClose()
  }

  function setFile(k: PdfFile, f: File | null) {
    const next = { ...files, [k]: f }
    setFiles(next)
    void parseFiles(next)
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <PdfDrop
          label="Question paper"
          file={files.questions}
          onFile={(f) => setFile("questions", f)}
        />
        <PdfDrop
          label="Answer key"
          file={files.answers}
          onFile={(f) => setFile("answers", f)}
        />
      </div>

      {parse.status === "idle" && (
        <p className="text-xs text-gray-500">
          Upload both PDFs. They&apos;re read in your browser; nothing is sent
          until you create the {noun(1)}.
        </p>
      )}
      {parse.status === "parsing" && (
        <div className="space-y-1 text-sm text-gray-600" role="status">
          <p className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Reading PDFs…
          </p>
          {(["questions", "answers"] as const).map((k) => {
            const p = parse.progress[k]
            return (
              p && (
                <p key={k} className="tnum pl-6 text-xs text-gray-500">
                  {FILE_LABEL[k]}: page {p[0]} of {p[1]}
                </p>
              )
            )
          })}
        </div>
      )}
      {parse.status === "error" && <FormatIssues issues={parse.issues} />}
      {parse.status !== "ok" && <FormatGuide open={parse.status === "error"} />}

      {parse.status === "ok" && (
        <>
          <div className="space-y-1 text-sm" role="status">
            <p className="flex items-center gap-2 text-teal">
              <CheckCircle2 className="size-4 shrink-0" />
              Found {sets.length} {sets.length === 1 ? "set" : "sets"} · {total}{" "}
              questions → {parts.length} {noun(parts.length)}.
            </p>
            {split.length > 0 && (
              <p className="pl-6 text-xs text-gray-600">
                A test can have at most {MAX_QUESTIONS_PER_QUIZ} questions, so{" "}
                {split
                  .map((s) => `Set ${s.number} (${s.questions.length})`)
                  .join(", ")}{" "}
                {split.length === 1 ? "is" : "are"} split into parts.
              </p>
            )}
          </div>
          <div className="space-y-2">
            {sets.map((s) => (
              <SetPreview
                key={s.number}
                set={s}
                parts={parts.filter((p) => p.set === s.number)}
                titles={titles}
                onTitle={(k, t) => setTitles((ts) => ({ ...ts, [k]: t }))}
                include={include}
                onInclude={(k, v) => setInclude((inc) => ({ ...inc, [k]: v }))}
              />
            ))}
          </div>

          <div className="grid gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel>Description</FieldLabel>
              <Input
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            {!practice && (
              <>
                <Field>
                  <FieldLabel>Pass mark (%)</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={passPercent}
                    onChange={(e) => setPass(Number(e.target.value))}
                  />
                </Field>
                <Field>
                  <FieldLabel>Time limit (minutes, optional)</FieldLabel>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as QuizStatus)}
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
              />
              Free preview (open without enrolling)
            </label>
          </div>

          <RequestPreview
            requests={() =>
              chosen.map((p) => ({ label: partLabel(p), body: bodyFor(p) }))
            }
            path={`/lessons/${lessonId}/quizzes`}
          />

          <ErrorNote error={error} />
          <Button type="submit" disabled={!!saving || chosen.length === 0}>
            {saving && <Loader2 className="animate-spin" />}
            {saving
              ? `Creating ${saving[0]} of ${saving[1]}…`
              : `Create ${chosen.length > 1 ? `${chosen.length} ` : ""}${noun(chosen.length)}`}
          </Button>
        </>
      )}
    </form>
  )
}

function PdfDrop({
  label,
  file,
  onFile,
}: {
  label: string
  file: File | null
  onFile: (f: File | null) => void
}) {
  const [over, setOver] = useState(false)
  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
        <FileText className="size-5 shrink-0 text-teal" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            {label}
          </p>
          <p className="truncate text-sm text-heading" title={file.name}>
            {file.name}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${label.toLowerCase()}`}
          onClick={() => onFile(null)}
        >
          <X />
        </Button>
      </div>
    )
  }
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
      className={
        "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed bg-white px-3 py-6 text-center text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring " +
        (over ? "border-teal bg-mint" : "border-border hover:border-teal/50")
      }
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = "" // let the same file be picked again after removing it
          if (f) onFile(f)
        }}
      />
      <FileUp className="size-5 text-teal" />
      <span className="font-medium text-heading">{label}</span>
      <span className="text-xs text-gray-500">
        Drop a PDF or click to choose
      </span>
    </label>
  )
}

const ISSUES_SHOWN = 20

function FormatIssues({ issues }: { issues: FormatIssue[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? issues : issues.slice(0, ISSUES_SHOWN)
  return (
    <div
      role="alert"
      className="space-y-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 shrink-0" />
        {issues.length === 1 ? "1 problem" : `${issues.length} problems`} with
        the PDF format. Fix them and upload again.
      </p>
      <ul className="max-h-96 space-y-1 overflow-y-auto">
        {shown.map((x, i) => (
          <li key={i} className="flex gap-2">
            <span className="h-fit shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap">
              {FILE_LABEL[x.file]}
              {x.page ? ` · p.${x.page}` : ""}
            </span>
            <span>{x.message}</span>
          </li>
        ))}
      </ul>
      {issues.length > ISSUES_SHOWN && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-red-700"
          onClick={() => setAll((a) => !a)}
        >
          {all ? "Show fewer" : `Show all ${issues.length}`}
        </Button>
      )}
    </div>
  )
}

function FormatGuide({ open }: { open: boolean }) {
  return (
    <details
      open={open}
      className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm"
    >
      <summary className="cursor-pointer font-medium text-heading select-none">
        Expected PDF format
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">
        <li>
          Each set starts with its own line: &quot;Set 1&quot; (optionally
          followed by &quot;25 Questions&quot;). Any number of sets and
          questions.
        </li>
        <li>
          Questions are numbered &quot;1. &quot;, &quot;2. &quot; … in order,
          starting at 1 in each set or carrying on from the previous set;
          options are lettered &quot;A. &quot;, &quot;B. &quot; … (2 to 10).
        </li>
        <li>
          Statements like &quot;I. &quot;, &quot;II. &quot; inside a question
          are kept as part of it.
        </li>
        <li>
          The answer key has a &quot;Set 1 Answer Key&quot; line, the answers
          (&quot;1. A 2. C …&quot;, in rows or columns), an
          &quot;Explanations&quot; line, then one &quot;1. A - …&quot;
          explanation per question with an optional &quot;Concept tested:
          …&quot; line. Exactly one answer per question.
        </li>
        <li>
          Both files need the same sets and question numbers. A set over{" "}
          {MAX_QUESTIONS_PER_QUIZ} questions is split into several tests.
          Scanned (image-only) PDFs can&apos;t be read.
        </li>
      </ul>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          ["Question paper", QUESTIONS_SAMPLE],
          ["Answer key", ANSWERS_SAMPLE],
        ].map(([label, sample]) => (
          <div key={label}>
            <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
            <pre className="overflow-x-auto rounded border border-gray-200 bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700">
              {sample}
            </pre>
          </div>
        ))}
      </div>
    </details>
  )
}

const PREVIEW_PAGE = 50

function SetPreview({
  set,
  parts,
  titles,
  onTitle,
  include,
  onInclude,
}: {
  set: ImportedSet
  parts: QuizPart[]
  titles: Record<string, string>
  onTitle: (key: string, t: string) => void
  include: Record<string, boolean>
  onInclude: (key: string, v: boolean) => void
}) {
  // Questions render only once the preview is opened, a page at a time: a set can run to hundreds.
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(PREVIEW_PAGE)
  return (
    <div className="space-y-2 rounded-lg border border-border bg-white p-3">
      <p className="text-sm">
        <span className="font-medium text-heading">Set {set.number}</span>
        <span className="text-gray-500">
          {" "}
          · {set.questions.length} questions
          {parts.length > 1 ? ` · ${parts.length} tests` : ""}
        </span>
      </p>
      {parts.map((p) => {
        const k = partKey(p)
        const on = !!include[k]
        return (
          <div
            key={k}
            className={
              "flex flex-wrap items-center gap-2 " + (on ? "" : "opacity-60")
            }
          >
            <input
              type="checkbox"
              aria-label={`Create ${partLabel(p)}`}
              checked={on}
              onChange={(e) => onInclude(k, e.target.checked)}
            />
            <Input
              aria-label={`${partLabel(p)} test title`}
              required={on}
              disabled={!on}
              maxLength={200}
              value={titles[k] ?? ""}
              className="h-9 min-w-0 flex-1"
              onChange={(e) => onTitle(k, e.target.value)}
            />
            <span className="tnum text-xs whitespace-nowrap text-gray-500">
              Q{p.first}–{p.last} · {p.questions.length}
            </span>
          </div>
        )
      })}
      <details
        className="text-sm"
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer text-xs text-gray-500 select-none">
          Preview questions
        </summary>
        {open && (
          <ol className="mt-2 max-h-96 space-y-3 overflow-y-auto pr-1">
            {set.questions.slice(0, shown).map((q, i) => (
              <li
                key={i}
                className="space-y-1.5 border-t border-gray-100 pt-2 first:border-0 first:pt-0"
              >
                <p className="font-medium whitespace-pre-line text-gray-900">
                  {set.numbers[i]}. {q.questionText}
                </p>
                <ul className="space-y-0.5">
                  {q.options.map((o, j) => (
                    <li
                      key={j}
                      className={
                        "flex gap-1.5 text-xs " +
                        (o.isCorrect
                          ? "font-medium text-teal"
                          : "text-gray-700")
                      }
                    >
                      <span className="w-4 shrink-0">
                        {String.fromCharCode(65 + j)}.
                      </span>
                      <span>{o.optionText}</span>
                      {o.isCorrect && (
                        <CheckCircle2
                          className="size-3.5 shrink-0"
                          aria-label="Correct answer"
                        />
                      )}
                    </li>
                  ))}
                </ul>
                {q.explanation && (
                  <p className="text-xs whitespace-pre-line text-gray-500">
                    {q.explanation}
                  </p>
                )}
              </li>
            ))}
            {shown < set.questions.length && (
              <li>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShown((n) => n + PREVIEW_PAGE)}
                >
                  Show {Math.min(PREVIEW_PAGE, set.questions.length - shown)}{" "}
                  more ({set.questions.length - shown} left)
                </Button>
              </li>
            )}
          </ol>
        )}
      </details>
    </div>
  )
}

const PREVIEW_CHARS = 20_000

/** The exact create bodies, built only when opened (they can run to megabytes) and clipped for display. */
function RequestPreview({
  requests,
  path,
}: {
  requests: () => { label: string; body: object }[]
  path: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <details
      className="text-xs text-gray-500"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer select-none">Request preview</summary>
      {open && (
        <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white p-3 text-[11px] leading-relaxed text-gray-700">
          {requests()
            .map(({ label, body }) => {
              const json = JSON.stringify(body, null, 2)
              const clipped =
                json.length > PREVIEW_CHARS
                  ? `${json.slice(0, PREVIEW_CHARS)}\n… (${Math.round(json.length / 1024)} KB in total)`
                  : json
              return `# ${label}\nPOST ${path}\n${clipped}`
            })
            .join("\n\n")}
        </pre>
      )}
    </details>
  )
}
