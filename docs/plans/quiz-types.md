# Plan: Mock tests and practice sets

## Context

The backend (`vipin-lms-backend`, migration `29_quiz_type`) now has two kinds of quiz, set by a new `type` field:

- **`mock_test`** (default): the existing behaviour. It can have a time limit, is scored, and has a pass mark.
- **`practice`**: untimed and unscored. The correct answer and explanation are still revealed, and students can check one question at a time.

The endpoints are unchanged. This plan brings the existing quiz UI in line with the new API contract and adds the practice experience.

## API contract (backend)

| Endpoint | Behaviour |
|---|---|
| `POST /lessons/{id}/quizzes` | Body accepts `type` (`mock_test` \| `practice`, default `mock_test`). For `practice`, sending `timeLimitSec` or `passPercent` returns **400**. |
| `PATCH /quizzes/{id}` | Accepts `type`. Changing it resets the time limit and pass percent (mock gets 70 unless `passPercent` is sent). It returns **409** once the quiz has attempts. For a practice quiz, sending `passPercent` returns 400. |
| `GET /lessons/{id}/quizzes?type=` | Optional filter: `mock_test` or `practice`. Any other value returns 400. Each quiz has `type`. |
| `GET /quizzes/{id}` | Includes `type`. For practice, `timeLimitSec` and `passPercent` are `null`. Students never get `isCorrect` or `explanation`. |
| `POST /quizzes/{id}/attempts` | Mock: every question is graded (skipped = wrong), and the response has `score`, `total` and `passed`. Practice: only the answered questions are graded (at least one required, else 400), and `score`, `total` and `passed` are `null`. |
| `GET /quizzes/{id}/attempts` | Returns the same shapes. A practice set has one attempt per check. |

Example practice create body:

```json
{
  "title": "Chapter 1 Practice",
  "type": "practice",
  "questions": [
    {
      "questionText": "What is 2 + 2?",
      "explanation": "Basic addition: 2 + 2 = 4.",
      "options": [{ "optionText": "3" }, { "optionText": "4", "isCorrect": true }]
    }
  ]
}
```

## 1. Types and client — `lib/api.ts`

- Add `export type QuizType = "mock_test" | "practice"`.
- `Quiz`: add `type: QuizType`, and change `passPercent` to `number | null`.
- `QuizAttempt`: change `score`, `total` to `number | null`, and `passed` to `boolean | null`.
- `createQuiz` / `updateQuiz` input: add `type?: QuizType`.
- `listQuizzes(lessonId, type?: QuizType)`: pass `query: { type }`. It's optional; the pages below make one request and group the results themselves.
- Helpers: `isPractice(q: Quiz)` and `QUIZ_TYPE_LABEL = { mock_test: "Mock test", practice: "Practice set" }`.

The nullable fields will cause type errors in the quiz page. Fix them in step 3.

## 2. Quiz builder — `components/quiz-builder.tsx`

- Add a **type picker** at the top: two radio cards, "Mock test" (timed, scored) and "Practice set" (untimed, no marks). It's initialised from `quiz?.type ?? "mock_test"`.
- When the type is practice, **hide the pass-mark and time-limit fields**.
- Build the request body so the backend never returns 400:
  - Create mock: `{ type, passPercent, timeLimitSec?, title, description, status, questions }`.
  - Create practice: `{ type: "practice", title, description, status, questions }`, with no `passPercent` or `timeLimitSec`.
  - Edit mock: as today, plus `type`.
  - Edit practice: `type`, `title`, `description`, `status` and the questions if they changed, with no `passPercent` or `timeLimitSec`.
- A type change on a quiz with attempts returns 409. Show the server's message through the existing `ErrorNote`, and add a hint under the picker: "Type can't change after students attempt it."
- Explanation placeholder: "Shown after submitting" for mock tests, "Shown after checking the answer" for practice sets.

## 3. Quiz page — `app/quizzes/[id]/page.tsx`

Branch on `quiz.type`.

- **Badges:** a type badge, then `Pass mark n%` and the time limit for mock tests, or `Untimed · No marks` for practice sets.
- **Mock test:** keep `Take` and `Result` and their behaviour as they are. Only update them for the nullable fields (`attempt.score ?? 0`, `attempt.passed ?? false`, and the attempts list). The attempts history list is unchanged.
- **Practice set:** add a new `Practice` component.
  - The start button reads "Start practice". There's no timer and no score header.
  - Each question card has its options and a **Check answer** button, which is disabled until an option is picked. Clicking it calls `submitAttempt(quiz.id, [{ questionId, optionId }])`. From the returned answer, show the correct option in green, the wrong pick in red, and the explanation, all inside that card. The question is then locked.
  - A progress bar shows `x of n checked` (no score).
  - **Practice again** resets the local state.
  - Move the option styling from `Result` (correct = green, wrong pick = red, others plain) into a shared `OptionReveal` component, so mock results and practice checks look the same.
- **Practice history:** practice saves one attempt per check, so instead of a score list show a summary card built from `listAttempts`: `Last practiced <date> · <unique questions checked> of <n> questions checked`. It shows no marks.
- **Owner view:** the existing `Answers` view is unchanged.

## 4. Quiz lists — new `components/quiz-list.tsx`

The quiz row markup is duplicated today in `app/courses/[id]/page.tsx` (around line 658) and `app/courses/[id]/learn/page.tsx` (around line 639).

- Move it into a shared `QuizList({ quizzes })`. It groups the quizzes into **Mock tests** and **Practice sets** sub-sections, and hides a group when it's empty.
- Row metadata:
  - Mock test: `20 questions · 30 min · Pass 60%`. Leave out the time when the test is untimed.
  - Practice set: `20 questions · Practice`.
  - The Draft badge stays as it is.
- Both pages render `QuizList`. On the learn page the tab label stays `Quizzes (n)`. The owner's "Create quiz" button and `QuizBuilder` panel on the course page stay as they are.

## 5. Out of scope / unchanged

- `app/explore/page.tsx`: `freeQuizCount` counts both types.
- Auth, routing and the `/quizzes/[id]` URL.
- Server-side enforcement of the mock-test time limit. The timer stays client-side only, as today.
- The changes are client components only, but per `AGENTS.md`, check `node_modules/next/dist/docs/` before touching any Next.js APIs.

## Verification

1. Run the `typecheck` and `lint` scripts; both must be clean.
2. Run the backend with migration 29 applied, then the frontend `dev` server (port 3001).
3. As the course owner: create a mock test and a practice set, and check that practice hides the pass and time fields. Then edit the practice set's title and confirm it saves without a 400.
4. As a student on the mock test: the timer, submit and score/passed result behave as before.
5. As a student on the practice set: check one question at a time, see the explanation right away, and see no score anywhere. Reload and the history summary shows.
6. Try to change the type after an attempt: the 409 message appears in the builder.
7. Course page and learn tab: the Mock tests and Practice sets groups render, and an empty group is hidden.
