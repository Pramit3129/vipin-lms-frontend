"use client"

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { AuthShell } from "@/components/auth-shell"
import { errorMessage, OtpStep } from "@/components/otp-step"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { roleHome, useUser } from "@/hooks/use-user"
import { ApiError, getMe, saveUser, sendVerifyEmail, verifyOtp } from "@/lib/api"

type Step = "intro" | "otp" | "done"

// Signed-in only: the code goes to the account's own email.
export function VerifyEmailFlow({ initialSent = false }: { initialSent?: boolean }) {
  const router = useRouter()
  const user = useUser()
  // Coming from signup, the code is already on its way.
  const [step, setStep] = useState<Step>(initialSent ? "otp" : "intro")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (user === null) router.replace("/login")
  }, [user, router])

  if (!user) return null

  async function send() {
    setError(null)
    setSending(true)
    try {
      await sendVerifyEmail()
      setStep("otp")
    } catch (err) {
      // 409: the account is already verified, nothing left to do here.
      if (err instanceof ApiError && err.status === 409) setStep("done")
      else setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthShell>
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight text-heading">
          {step === "done" ? "Email verified" : "Verify your email"}
        </h1>
        <p className="text-sm text-gray-500">
          {step === "intro" && `We'll send a 6-digit code to ${user.email}.`}
          {step === "otp" && "Enter the code we sent you."}
          {step === "done" && "Your email address is confirmed."}
        </p>
      </div>

      {step === "intro" && (
        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button size="lg" disabled={sending} onClick={send} className="w-full">
            {sending && <Loader2 className="animate-spin" />}
            Send verification code
          </Button>
        </div>
      )}

      {step === "otp" && (
        <OtpStep
          email={user.email}
          submitLabel="Verify email"
          onSubmit={async (otp) => {
            await verifyOtp(user.email, "email_verification", otp)
            // Refresh the cached profile so the UI sees the verified state.
            await getMe().then(saveUser, () => {})
            setStep("done")
          }}
          onResend={sendVerifyEmail}
        />
      )}

      {step !== "done" && (
        <p className="text-center text-sm text-gray-500">
          <Link
            href={roleHome(user.role)}
            className="font-semibold text-teal underline-offset-4 hover:underline"
          >
            Skip for now
          </Link>
        </p>
      )}

      {step === "done" && (
        <div className="space-y-4">
          <CheckCircle2 className="size-10 text-teal" strokeWidth={1.5} />
          <Link href={roleHome(user.role)} className={buttonVariants({ size: "lg", className: "w-full" })}>
            Continue
          </Link>
        </div>
      )}
    </AuthShell>
  )
}
