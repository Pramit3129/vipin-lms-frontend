"use client"

import {
  ArrowRight,
  FileText,
  Lock,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react"
import { useState } from "react"

import { ErrorNote, errMsg } from "@/components/app-shell"
import { NoteForm } from "@/components/note-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { deleteNote, type Note } from "@/lib/api"

const size = (n: Note) => `PDF · ${(n.sizeBytes / 1024).toFixed(0)} KB`

/**
 * PDF note rows. Locked notes (previewing a paid course) show but can't be opened.
 * Pass onEdit and onDelete for the course owner's controls; editingId swaps that row for `editor`.
 */
export function NoteList({
  notes,
  onOpen,
  onEdit,
  onDelete,
  editingId,
  editor,
}: {
  notes: Note[]
  onOpen: (n: Note) => void
  onEdit?: (n: Note) => void
  onDelete?: (n: Note) => void
  editingId?: string | null
  editor?: React.ReactNode
}) {
  return (
    <ul className="space-y-2">
      {notes.map((n) =>
        n.id === editingId ? (
          <li key={n.id}>{editor}</li>
        ) : n.locked ? (
          <li
            key={n.id}
            className="flex items-center gap-3 rounded-md border border-border bg-gray-50 p-3"
            aria-label={`${n.title}, locked`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
              <Lock className="size-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-600">
                {n.title}
              </span>
              <span className="tnum text-xs text-muted-foreground">
                {size(n)}
              </span>
            </span>
            <Badge variant="outline">Enroll to unlock</Badge>
          </li>
        ) : (
          <li
            key={n.id}
            className="group/row flex items-center gap-1 rounded-md border border-border bg-white pr-2 transition-all duration-200 hover:border-teal/40 hover:shadow-sm"
          >
            <button
              type="button"
              onClick={() => onOpen(n)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-3 text-left"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-mint text-teal transition-colors group-hover/row:bg-teal group-hover/row:text-white">
                <FileText className="size-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-heading">
                  {n.title}
                </span>
                <span className="tnum flex items-center gap-2 text-xs text-muted-foreground">
                  {size(n)}
                  {n.isFree && <Badge variant="lime">Free preview</Badge>}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-heading/50 transition-transform duration-200 group-hover/row:translate-x-1" />
            </button>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${n.title}`}
                onClick={() => onEdit(n)}
              >
                <Pencil />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${n.title}`}
                className="hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDelete(n)}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        )
      )}
    </ul>
  )
}

/**
 * A lesson's notes with the owner's controls: share a PDF, edit a note's title, description and
 * free preview, or delete it. Everyone else just gets the list.
 */
export function LessonNotes({
  lessonId,
  notes,
  setNotes,
  isOwner,
  onOpen,
  empty,
}: {
  lessonId: string
  notes: Note[]
  setNotes: (fn: (n: Note[]) => Note[]) => void
  isOwner: boolean
  onOpen: (n: Note) => void
  /** Shown when the lesson has no notes. */
  empty: React.ReactNode
}) {
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const editing = notes.find((n) => n.id === editingId)

  async function remove(n: Note) {
    if (!confirm(`Delete "${n.title}"? The PDF will be removed.`)) return
    setError(null)
    try {
      await deleteNote(n.id)
      setNotes((ns) => ns.filter((x) => x.id !== n.id))
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <div className="space-y-3">
      {notes.length === 0 && empty}
      <NoteList
        notes={notes}
        onOpen={onOpen}
        onEdit={
          isOwner
            ? (n) => {
                setUploading(false)
                setEditingId(n.id)
              }
            : undefined
        }
        onDelete={isOwner ? remove : undefined}
        editingId={editingId}
        editor={
          editing && (
            <NoteForm
              key={editing.id}
              note={editing}
              onSaved={(saved) => {
                setNotes((ns) => ns.map((x) => (x.id === saved.id ? saved : x)))
                setEditingId(null)
              }}
              onCancel={() => setEditingId(null)}
            />
          )
        }
      />
      <ErrorNote error={error} />
      {isOwner && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingId(null)
            setUploading((v) => !v)
          }}
        >
          <Upload /> Share a note
        </Button>
      )}
      {isOwner && uploading && (
        <NoteForm
          lessonId={lessonId}
          onSaved={(n) => {
            setNotes((ns) => [n, ...ns])
            setUploading(false)
          }}
          onCancel={() => setUploading(false)}
        />
      )}
    </div>
  )
}
