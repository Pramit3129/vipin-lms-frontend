"use client"

import { Loader2 } from "lucide-react"
import { useState } from "react"

import { ErrorNote, errMsg } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { updateNote, uploadNote, type Note } from "@/lib/api"

const MAX_PDF = 25 * 1024 * 1024

/**
 * Uploads a PDF note to `lessonId`, or edits `note` when given (title, description, free preview;
 * the PDF itself can't be replaced).
 */
export function NoteForm({
  lessonId,
  note,
  onSaved,
  onCancel,
}: {
  lessonId?: string
  note?: Note
  onSaved: (n: Note) => void
  onCancel?: () => void
}) {
  const editing = !!note
  const key = note?.id ?? lessonId
  const [title, setTitle] = useState(note?.title ?? "")
  const [description, setDescription] = useState(note?.description ?? "")
  // New notes start paid: only notes marked free open without enrolling, even in a free lesson.
  const [isFree, setIsFree] = useState(note?.isFree ?? false)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!editing) {
      if (!file) return setError("Choose a PDF file.")
      if (
        !/\.pdf$/i.test(file.name) ||
        (file.type && file.type !== "application/pdf")
      )
        return setError("Only PDF files are allowed.")
      if (file.size > MAX_PDF)
        return setError("The PDF must be 25 MB or smaller.")
    }
    setSaving(true)
    try {
      const input = {
        title: title.trim(),
        description: description.trim(),
        isFree,
      }
      onSaved(
        editing
          ? await updateNote(note.id, input)
          : await uploadNote(lessonId!, { ...input, file: file! })
      )
    } catch (err) {
      setError(errMsg(err))
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-border bg-white p-5 shadow-sm"
    >
      <Field>
        <FieldLabel htmlFor={`nt-${key}`}>Title</FieldLabel>
        <Input
          id={`nt-${key}`}
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`nd-${key}`}>Description (optional)</FieldLabel>
        <Input
          id={`nd-${key}`}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {!editing && (
        <Field>
          <FieldLabel htmlFor={`nf-${key}`}>PDF (max 25 MB)</FieldLabel>
          <Input
            id={`nf-${key}`}
            type="file"
            accept="application/pdf,.pdf"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={isFree}
          onChange={(e) => setIsFree(e.target.checked)}
        />
        Free preview (open without enrolling)
      </label>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Save note" : "Upload"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
