"use client"

import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { AuthShell } from "@/components/auth-shell"
import { errorMessage, OtpStep } from "@/components/otp-step"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { forgotPassword, resetPassword, verifyOtp } from "@/lib/api"

type Step = "email" | "otp" | "password" | "done"

const HEADINGS: Record<Step, { title: string; subtitle: string }> = {
  email: { title: "Forgot password?", subtitle: "Enter your email and we'll send you a reset code." },
  otp: { title: "Check your email", subtitle: "Enter the 6-digit code we sent you." },
  password: { title: "Set a new password", subtitle: "Choose a password of 8 to 72 characters." },
  done: { title: "Password updated", subtitle: "You can now sign in with your new password." },
}

export function ForgotPasswordFlow() {
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [resetToken, setResetToken] = useState("")
  const { title, subtitle } = HEADINGS[step]

  return (
    <AuthShell>
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight text-heading">{title}</h1>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>

      {step === "email" && (
        <EmailStep
          onSent={(value) => {
            setEmail(value)
            setStep("otp")
          }}
        />
      )}

      {step === "otp" && (
        <OtpStep
          email={email}
          submitLabel="Verify code"
          onSubmit={async (otp) => {
            const { resetToken } = await verifyOtp(email, "password_reset", otp)
            if (!resetToken) throw new Error("Missing reset token")
            setResetToken(resetToken)
            setStep("password")
          }}
          onResend={async () => {
            await forgotPassword(email)
          }}
        />
      )}

      {step === "password" && (
        <PasswordStep
          resetToken={resetToken}
          onDone={() => setStep("done")}
          onExpired={() => setStep("email")}
        />
      )}

      {step === "done" && (
        <div className="space-y-4">
          <CheckCircle2 className="size-10 text-teal" strokeWidth={1.5} />
          <Link href="/login" className={buttonVariants({ size: "lg", className: "w-full" })}>
            Back to sign in
          </Link>
        </div>
      )}

      {step !== "done" && (
        <p className="text-center text-sm text-gray-500">
          <Link href="/login" className="font-semibold text-teal underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      )}
    </AuthShell>
  )
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const email = String(new FormData(e.currentTarget).get("email")).trim()
    setLoading(true)
    try {
      await forgotPassword(email)
      onSent(email)
    } catch (err) {
      setError(errorMessage(err))
      setLoading(false)
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
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            autoFocus
            className="bg-white"
          />
        </Field>
        <Button type="submit" size="lg" disabled={loading} className="w-full">
          {loading && <Loader2 className="animate-spin" />}
          Send reset code
        </Button>
      </FieldGroup>
    </form>
  )
}

function PasswordStep({
  resetToken,
  onDone,
  onExpired,
}: {
  resetToken: string
  onDone: () => void
  onExpired: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)
  const [password, setPassword] = useState("")
  const [expired, setExpired] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await resetPassword(resetToken, password)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      // 400 is either a weak password or a dead token; offer a restart so the user is never stuck.
      setExpired(true)
      setLoading(false)
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
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <div className="relative">
            <Input
              id="newPassword"
              name="newPassword"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              minLength={8}
              maxLength={72}
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 transition-colors hover:text-gray-900"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" size="lg" disabled={loading} className="w-full">
          {loading && <Loader2 className="animate-spin" />}
          Update password
        </Button>
        {expired && (
          <Button type="button" variant="ghost" onClick={onExpired} className="w-full">
            Start over with a new code
          </Button>
        )}
      </FieldGroup>
    </form>
  )
}
