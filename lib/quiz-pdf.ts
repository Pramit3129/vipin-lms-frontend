/**
 * Turns a question-paper PDF and its answer-key PDF into quiz create bodies, entirely in the browser.
 *
 * The parser is strict: anything it can't place is reported as a FormatIssue rather than guessed at.
 * See QUESTIONS_SAMPLE / ANSWERS_SAMPLE for the expected layout.
 *
 * Kept free of app imports so it can be exercised directly with Node.
 */

export type PdfFile = "questions" | "answers"

/** One line of text, in reading order, with the page it came from. */
export type PdfLine = { text: string; page: number }

export type FormatIssue = {
  file: PdfFile | "both"
  page?: number
  message: string
}

export type ImportedQuestion = {
  questionText: string
  explanation: string
  options: { optionText: string; isCorrect: boolean }[]
}

/** A set from the PDFs. `numbers[i]` is the printed number of `questions[i]`. */
export type ImportedSet = {
  number: number
  numbers: number[]
  questions: ImportedQuestion[]
}

/** A slice of a set small enough for one create request. */
export type QuizPart = {
  set: number
  part: number
  parts: number
  first: number
  last: number
  questions: ImportedQuestion[]
}

export type ImportResult =
  { ok: true; sets: ImportedSet[] } | { ok: false; issues: FormatIssue[] }

export const QUESTIONS_SAMPLE = `Set 1
25 Questions
1. Which combination of statements is MOST accurate?
I. First statement.
II. Second statement.
A. I only
B. II only
C. I and II
D. Neither
2. Next question…`

export const ANSWERS_SAMPLE = `Set 1 Answer Key
1. C 2. A 3. B …
Explanations
1. C - Why C is correct.
Concept tested: Topic name
2. A - Why A is correct.
Concept tested: Topic name`

// Server limits (vipin-lms-backend internal/service/quizzes.go, internal/handlers/quizzes.go).
export const MAX_QUESTIONS_PER_QUIZ = 200
const MAX_QUESTION = 2000
const MAX_OPTION = 1000
const MAX_EXPLANATION = 5000
const MIN_OPTIONS = 2
const MAX_OPTIONS = 10
/** The server reads at most 4 MB per quiz body; leave room for the title and the rest. */
const MAX_PART_BYTES = 3.5 * 1024 * 1024

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
/** One answer letter, or several joined by ", ", " & ", "/" or " and " (rejected: one correct answer only). */
const ANSWER = String.raw`[A-Z](?:\s*(?:,|&|\/|\band\b)\s*[A-Z])*|[A-Z]+`
const SET_RE = /^Set\s+(\d+)$/i
const COUNT_RE = /^(\d+)\s+Questions?$/i
const QUESTION_RE = /^(\d+)\.\s+(.+)$/
const OPTION_RE = /^([A-Z])\.\s+(.+)$/
const ROMAN_RE = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s+/
const KEY_SET_RE = /^Set\s+(\d+)\s+Answer\s+Key$/i
const KEY_ENTRY_RE = new RegExp(String.raw`(\d+)\.\s*(${ANSWER})\b`, "g")
const EXPLANATIONS_RE = /^Explanations$/i
const EXPLANATION_RE = new RegExp(
  String.raw`^(\d+)\.\s+(${ANSWER})\s*[-–—]\s*(.*)$`
)
const CONCEPT_RE = /^Concept tested:\s*(.*)$/i
const PAGE_NUMBER_RE = /^(?:Page\s+)?\d+(?:\s+of\s+\d+)?$/i

const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s)

/** Joins a wrapped line, closing up words hyphenated across the break ("bi-" + "weekly"). */
const join = (a: string, b: string) =>
  a === "" ? b : /[A-Za-z]-$/.test(a) ? a + b : `${a} ${b}`

/** "A, C" → ["A", "C"]; "AC" → ["A", "C"]. */
const lettersOf = (answer: string) =>
  answer
    .replace(/\band\b/g, "")
    .replace(/[^A-Z]/g, "")
    .split("")

/** "3, 4, 5, 9" → "3–5, 9", capped so a long list stays readable. */
function ranges(ns: number[], max = 8) {
  const out: string[] = []
  for (let i = 0; i < ns.length; i++) {
    let j = i
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++
    out.push(i === j ? `${ns[i]}` : `${ns[i]}–${ns[j]}`)
    i = j
  }
  return out.length > max
    ? `${out.slice(0, max).join(", ")} and ${out.length - max} more`
    : out.join(", ")
}

/**
 * Normalises raw per-page lines: collapses whitespace, drops blank lines, bare page numbers,
 * and the running header (the first line, when every page starts with the same one).
 */
export function cleanLines(pages: string[][]): PdfLine[] {
  const norm = pages.map((lines) =>
    lines.map((l) => l.replace(/[\s ]+/g, " ").trim()).filter(Boolean)
  )
  const firsts = norm.map((p) => p[0]).filter(Boolean)
  const header =
    norm.length > 1 &&
    firsts.length === norm.length &&
    firsts.every((f) => f === firsts[0])
      ? firsts[0]
      : null
  const out: PdfLine[] = []
  norm.forEach((lines, i) => {
    for (const text of lines) {
      if (text === header || PAGE_NUMBER_RE.test(text)) continue
      out.push({ text, page: i + 1 })
    }
  })
  return out
}

type QDraft = {
  number: number
  page: number
  text: string
  options: { letter: string; text: string }[]
}
type QSet = {
  number: number
  page: number
  declared: number | null
  /** Last question number of the previous set, so numbering may run on across sets. */
  prevEnd: number
  questions: QDraft[]
}

export function parseQuestions(lines: PdfLine[]): {
  sets: QSet[]
  issues: FormatIssue[]
} {
  const issues: FormatIssue[] = []
  const issue = (page: number, message: string) =>
    issues.push({ file: "questions", page, message })
  const sets: QSet[] = []
  let set: QSet | null = null
  let q: QDraft | null = null
  let strayQuestion = false

  for (const { text, page } of lines) {
    const s = SET_RE.exec(text)
    if (s) {
      const prevEnd: number = set?.questions.at(-1)?.number ?? 0
      set = {
        number: Number(s[1]),
        page,
        declared: null,
        prevEnd,
        questions: [],
      }
      sets.push(set)
      q = null
      continue
    }
    if (!set) {
      // Title and intro text before the first set heading are ignored, but questions there are a mistake.
      if (QUESTION_RE.test(text) && !strayQuestion) {
        strayQuestion = true
        issue(
          page,
          `Question "${clip(text)}" appears before any "Set 1" heading.`
        )
      }
      continue
    }
    const where = `Set ${set.number}`
    const c = COUNT_RE.exec(text)
    if (c && !q && set.declared === null) {
      set.declared = Number(c[1])
      continue
    }

    const inStem = !!q && q.options.length === 0
    const qm = QUESTION_RE.exec(text)
    const last = set.questions.at(-1)
    const expected = last ? last.number + 1 : null
    // Inside a question's stem only the expected next number starts a new question; anything else is wrapped text.
    if (qm && (!inStem || Number(qm[1]) === expected)) {
      const n = Number(qm[1])
      if (expected === null) {
        if (n !== 1 && n !== set.prevEnd + 1)
          issue(
            page,
            `${where} starts at question ${n}; start it at 1${set.prevEnd ? ` or ${set.prevEnd + 1} (continuing the previous set)` : ""}.`
          )
      } else if (n !== expected) {
        issue(
          page,
          `${where}: expected question ${expected} after question ${expected - 1} but found question ${n}.`
        )
      }
      q = { number: n, page, text: qm[2], options: [] }
      set.questions.push(q)
      continue
    }
    if (!q) {
      issue(
        page,
        `${where}: unexpected text before the first question: "${clip(text)}".`
      )
      continue
    }
    const om = OPTION_RE.exec(text)
    if (om && om[1] === LETTERS[q.options.length]) {
      q.options.push({ letter: om[1], text: om[2] })
    } else if (inStem && ROMAN_RE.test(text)) {
      q.text += `\n${text}` // "I. …", "II. …" statements keep their own lines
    } else if (om && q.options.length > 0) {
      issue(
        page,
        `${where} Q${q.number}: option ${om[1]} is out of order (expected ${LETTERS[q.options.length]}).`
      )
    } else if (inStem) {
      q.text = join(q.text, text)
    } else {
      const lastOption = q.options[q.options.length - 1]
      lastOption.text = join(lastOption.text, text)
    }
  }

  if (sets.length === 0) {
    issues.push({
      file: "questions",
      message:
        'No "Set 1" heading found. Each set must start with a line like "Set 1".',
    })
  }
  const seen = new Set<number>()
  for (const st of sets) {
    const where = `Set ${st.number}`
    if (seen.has(st.number)) issue(st.page, `${where} appears more than once.`)
    seen.add(st.number)
    if (st.questions.length === 0)
      issue(
        st.page,
        `${where} has no questions. Questions must start with "1. ", "2. " …`
      )
    if (st.declared !== null && st.declared !== st.questions.length) {
      issue(
        st.page,
        `${where} says ${st.declared} questions but ${st.questions.length} were found.`
      )
    }
    for (const x of st.questions) {
      const at = `${where} Q${x.number}`
      if (x.options.length < MIN_OPTIONS)
        issue(
          x.page,
          `${at} has ${x.options.length} option(s); at least ${MIN_OPTIONS} lettered options ("A. ", "B. " …) are needed.`
        )
      if (x.options.length > MAX_OPTIONS)
        issue(
          x.page,
          `${at} has ${x.options.length} options; at most ${MAX_OPTIONS} (A–J) are allowed.`
        )
      if (x.text.length > MAX_QUESTION)
        issue(
          x.page,
          `${at} is ${x.text.length} characters; the limit is ${MAX_QUESTION}.`
        )
      for (const o of x.options)
        if (o.text.length > MAX_OPTION)
          issue(
            x.page,
            `${at} option ${o.letter} is ${o.text.length} characters; the limit is ${MAX_OPTION}.`
          )
    }
  }
  return { sets, issues }
}

type KEntry = {
  number: number
  letter: string
  page: number
  text: string
  concept: string | null
}
type KSet = {
  number: number
  page: number
  /** Raw answer-key text, read as one stream so a grid of answers may wrap or run in columns. */
  raw: string
  key: Map<number, string>
  entries: Map<number, KEntry>
  sawExplanations: boolean
}

export function parseAnswers(lines: PdfLine[]): {
  sets: KSet[]
  issues: FormatIssue[]
} {
  const issues: FormatIssue[] = []
  const issue = (page: number, message: string) =>
    issues.push({ file: "answers", page, message })
  const sets: KSet[] = []
  let set: KSet | null = null
  let e: KEntry | null = null

  for (const { text, page } of lines) {
    const s = KEY_SET_RE.exec(text)
    if (s) {
      set = {
        number: Number(s[1]),
        page,
        raw: "",
        key: new Map(),
        entries: new Map(),
        sawExplanations: false,
      }
      sets.push(set)
      e = null
      continue
    }
    if (!set) continue // title and intro text
    const where = `Set ${set.number}`
    if (!set.sawExplanations) {
      if (EXPLANATIONS_RE.test(text)) set.sawExplanations = true
      else set.raw += ` ${text}`
      continue
    }
    const em = EXPLANATION_RE.exec(text)
    // "<n>. <letter> - " starts a new explanation when n moves forward, so one missing explanation
    // is reported on its own instead of swallowing the rest as wrapped text.
    if (em && (!e || Number(em[1]) > e.number)) {
      const n = Number(em[1])
      const letters = lettersOf(em[2])
      if (letters.length > 1)
        issue(
          page,
          `${where} Q${n}: explanation gives ${letters.length} answers (${letters.join(", ")}); each question needs exactly one.`
        )
      if (set.entries.has(n))
        issue(page, `${where} Q${n}: explanation appears more than once.`)
      e = { number: n, letter: letters[0], page, text: em[3], concept: null }
      set.entries.set(n, e)
      continue
    }
    if (!e) {
      issue(
        page,
        `${where} explanations: expected "<number>. <letter> - <explanation>" but found "${clip(text)}".`
      )
      continue
    }
    const cm = CONCEPT_RE.exec(text)
    if (cm) e.concept = cm[1]
    else if (e.concept !== null) e.concept = join(e.concept, text)
    else e.text = join(e.text, text)
  }

  if (sets.length === 0) {
    issues.push({
      file: "answers",
      message:
        'No "Set 1 Answer Key" heading found. Each set must start with a line like "Set 1 Answer Key".',
    })
  }
  const seen = new Set<number>()
  for (const st of sets) {
    const where = `Set ${st.number}`
    if (seen.has(st.number))
      issue(st.page, `${where} answer key appears more than once.`)
    seen.add(st.number)

    const multi: string[] = []
    const dupes: number[] = []
    for (const m of st.raw.matchAll(KEY_ENTRY_RE)) {
      const n = Number(m[1])
      const letters = lettersOf(m[2])
      if (letters.length > 1) multi.push(`Q${n} (${letters.join(", ")})`)
      if (st.key.has(n)) dupes.push(n)
      st.key.set(n, letters[0])
    }
    const leftover = st.raw
      .replace(KEY_ENTRY_RE, " ")
      .replace(/[,;|]/g, " ")
      .trim()
    if (leftover)
      issue(
        st.page,
        `${where} answer key: couldn't read "${clip(leftover)}". Answers must look like "1. A 2. C …".`
      )
    if (multi.length)
      issue(
        st.page,
        `${where} answer key gives more than one answer for ${multi.slice(0, 6).join(", ")}${multi.length > 6 ? ` and ${multi.length - 6} more` : ""}. Each question needs exactly one correct answer.`
      )
    if (dupes.length)
      issue(
        st.page,
        `${where} answer key lists question ${ranges(dupes)} more than once.`
      )
    if (st.key.size === 0) {
      issue(
        st.page,
        `${where} answer key is empty. List answers like "1. A 2. C …".`
      )
      continue
    }

    const numbers = [...st.key.keys()].sort((a, b) => a - b)
    const gaps: number[] = []
    for (let n = numbers[0]; n <= numbers[numbers.length - 1]; n++)
      if (!st.key.has(n)) gaps.push(n)
    if (gaps.length)
      issue(st.page, `${where} answer key is missing question ${ranges(gaps)}.`)

    if (!st.sawExplanations) {
      issue(
        st.page,
        `${where} has no "Explanations" heading after its answer key.`
      )
      continue
    }
    const unexplained = numbers.filter((n) => !st.entries.has(n))
    if (unexplained.length)
      issue(
        st.page,
        `${where} has no explanation for question ${ranges(unexplained)}.`
      )
    for (const x of st.entries.values()) {
      const k = st.key.get(x.number)
      if (k === undefined)
        issue(
          x.page,
          `${where} Q${x.number}: explanation for a question that isn't in the answer key.`
        )
      else if (k !== x.letter)
        issue(
          x.page,
          `${where} Q${x.number}: answer key says ${k} but the explanation says ${x.letter}.`
        )
      if (!x.text) issue(x.page, `${where} Q${x.number}: explanation is empty.`)
    }
  }
  return { sets, issues }
}

const explanationOf = (e: KEntry | undefined) =>
  e ? (e.concept ? `${e.text}\n\nConcept tested: ${e.concept}` : e.text) : ""

/** Matches the two parsed documents set by set and question by question (by printed number). */
export function combine(
  questionLines: PdfLine[],
  answerLines: PdfLine[]
): ImportResult {
  if (
    questionLines.some((l) => KEY_SET_RE.test(l.text)) &&
    answerLines.some((l) => SET_RE.test(l.text))
  ) {
    return {
      ok: false,
      issues: [
        {
          file: "both",
          message:
            "The files look swapped: the answer key was uploaded as the question paper and vice versa.",
        },
      ],
    }
  }
  const qs = parseQuestions(questionLines)
  const ks = parseAnswers(answerLines)
  const issues = [...qs.issues, ...ks.issues]
  if (issues.length) return { ok: false, issues }

  const out: ImportedSet[] = []
  for (const st of qs.sets) {
    const where = `Set ${st.number}`
    const key = ks.sets.find((k) => k.number === st.number)
    if (!key) {
      issues.push({
        file: "answers",
        message: `${where} is in the question paper but has no "${where} Answer Key".`,
      })
      continue
    }
    const numbers = st.questions.map((x) => x.number)
    const asked = new Set(numbers)
    const unanswered = numbers.filter((n) => !key.key.has(n))
    const extra = [...key.key.keys()]
      .filter((n) => !asked.has(n))
      .sort((a, b) => a - b)
    if (unanswered.length)
      issues.push({
        file: "both",
        message: `${where}: question ${ranges(unanswered)} has no answer in the answer key.`,
      })
    if (extra.length)
      issues.push({
        file: "both",
        message: `${where}: the answer key has answers for question ${ranges(extra)}, which isn't in the question paper.`,
      })
    if (unanswered.length || extra.length) continue

    const questions = st.questions.map((x) => {
      const letter = key.key.get(x.number)!
      const correct = x.options.findIndex((o) => o.letter === letter)
      if (correct < 0)
        issues.push({
          file: "both",
          page: x.page,
          message: `${where} Q${x.number}: answer ${letter} isn't one of its options (A–${x.options.at(-1)?.letter}).`,
        })
      const entry = key.entries.get(x.number)
      const explanation = explanationOf(entry)
      if (explanation.length > MAX_EXPLANATION)
        issues.push({
          file: "answers",
          page: entry?.page,
          message: `${where} Q${x.number}: explanation is ${explanation.length} characters; the limit is ${MAX_EXPLANATION}.`,
        })
      return {
        questionText: x.text,
        explanation,
        options: x.options.map((o, j) => ({
          optionText: o.text,
          isCorrect: j === correct,
        })),
      }
    })
    out.push({ number: st.number, numbers, questions })
  }
  for (const k of ks.sets) {
    if (!qs.sets.some((s) => s.number === k.number)) {
      issues.push({
        file: "questions",
        message: `Set ${k.number} has an answer key but isn't in the question paper.`,
      })
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, sets: out }
}

const encoder = new TextEncoder()

/**
 * Splits a set into as few quizzes as the server allows: at most MAX_QUESTIONS_PER_QUIZ questions
 * and MAX_PART_BYTES of JSON each. Most sets come back as a single part.
 */
export function splitSet(set: ImportedSet): QuizPart[] {
  const chunks: [number, number][] = []
  let start = 0
  let bytes = 0
  set.questions.forEach((q, i) => {
    const size = encoder.encode(JSON.stringify(q)).length + 1
    if (
      i > start &&
      (i - start >= MAX_QUESTIONS_PER_QUIZ || bytes + size > MAX_PART_BYTES)
    ) {
      chunks.push([start, i])
      start = i
      bytes = 0
    }
    bytes += size
  })
  chunks.push([start, set.questions.length])
  return chunks.map(([from, to], i) => ({
    set: set.number,
    part: i + 1,
    parts: chunks.length,
    first: set.numbers[from],
    last: set.numbers[to - 1],
    questions: set.questions.slice(from, to),
  }))
}

/**
 * Reads a PDF's text as lines. Throws a readable Error when the file can't be read.
 * `onPage` reports progress, since a long paper can take a few seconds.
 */
export async function readPdfLines(
  file: File,
  onPage?: (done: number, total: number) => void
): Promise<PdfLine[]> {
  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  )
    throw new Error(`"${file.name}" is not a PDF.`)
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString()
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  })
  let doc
  try {
    doc = await task.promise
  } catch {
    void task.destroy()
    throw new Error(
      `"${file.name}" could not be opened. It may be damaged or password-protected.`
    )
  }
  try {
    const pages: string[][] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const { items } = await page.getTextContent()
      page.cleanup()
      const lines: string[] = []
      let cur = ""
      let lastY: number | null = null
      for (const it of items) {
        if (!("str" in it)) continue
        const y = it.transform[5]
        // Break on an explicit end of line, or when the baseline moves to a new line.
        if (
          it.str.trim() &&
          lastY !== null &&
          Math.abs(y - lastY) > 2 &&
          cur.trim()
        ) {
          lines.push(cur)
          cur = ""
        }
        cur += it.str
        if (it.str.trim()) lastY = y
        if (it.hasEOL) {
          lines.push(cur)
          cur = ""
        }
      }
      if (cur) lines.push(cur)
      pages.push(lines)
      onPage?.(p, doc.numPages)
    }
    const lines = cleanLines(pages)
    if (lines.length === 0)
      throw new Error(
        `"${file.name}" has no selectable text. Scanned or image-only PDFs can't be read.`
      )
    return lines
  } finally {
    void task.destroy()
  }
}
