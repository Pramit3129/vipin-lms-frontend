"use client"

import { AlertCircle, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ApiError } from "@/lib/api"

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 429 && err.retryAfter) {
      return `${err.message} Try again in ${formatWait(err.retryAfter)}.`
    }
    return err.message
  }
  return "Something went wrong"
}

function formatWait(seconds: number) {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds}s`
}

/** Counts down from `start` seconds; `restart` re-arms it. */
function useCooldown(start: number) {
  const [left, setLeft] = useState(start)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft] as const
}

/**
 * 6-digit code entry with resend. `onSubmit` verifies the code (throw to show an error);
 * `onResend` requests a fresh one.
 */
export function OtpStep({
  email,
  submitLabel,
  onSubmit,
  onResend,
}: {
  email?: string
  submitLabel: string
  onSubmit: (otp: string) => Promise<void>
  onResend: () => Promise<void>
}) {
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  // Backend allows one code per minute per user, so start the resend timer at 60s.
  const [cooldown, setCooldown] = useCooldown(60)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSubmit(otp)
    } catch (err) {
      setError(errorMessage(err))
      setLoading(false)
    }
  }

  async function resend() {
    setError(null)
    setResending(true)
    try {
      await onResend()
      setOtp("")
      setCooldown(60)
    } catch (err) {
      if (err instanceof ApiError && err.retryAfter) setCooldown(err.retryAfter)
      setError(errorMessage(err))
    } finally {
      setResending(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="otp">Verification code</FieldLabel>
          <Input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            required
            autoFocus
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="bg-white text-center text-lg tracking-[0.5em]"
          />
          {email && <p className="text-xs text-gray-500">Sent to {email}. Expires in 10 minutes.</p>}
        </Field>

        <Button type="submit" size="lg" disabled={loading || otp.length !== 6} className="w-full">
          {loading && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={cooldown > 0 || resending}
          onClick={resend}
          className="w-full"
        >
          {resending && <Loader2 className="animate-spin" />}
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </Button>
      </FieldGroup>
    </form>
  )
}
