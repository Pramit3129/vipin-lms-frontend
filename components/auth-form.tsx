"use client"

import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { roleHome } from "@/hooks/use-user"
import { ApiError, login, register, saveUser, sendVerifyEmail } from "@/lib/api"

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const isSignup = mode === "signup"

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.currentTarget)
    const email = String(form.get("email")).trim()
    const password = String(form.get("password"))

    setLoading(true)
    try {
      const user = isSignup
        ? await register({
            firstName: String(form.get("firstName")).trim(),
            lastName: String(form.get("lastName")).trim(),
            email,
            password,
          })
        : await login(email, password)
      saveUser(user)
      if (isSignup) {
        // Register sets the login cookie, so the verification code can go out right away.
        // If sending fails the verify page lets the user retry.
        const sent = await sendVerifyEmail().then(
          () => true,
          () => false
        )
        router.push(sent ? "/verify-email?sent=1" : "/verify-email")
        return
      }
      router.push(roleHome(user.role))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <AuthShell>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight text-heading">
              {isSignup ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-gray-500">
              {isSignup
                ? "Sign up to start learning today."
                : "Enter your details to access your courses."}
            </p>
          </div>

          <form onSubmit={onSubmit}>
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isSignup && (
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="firstName">First name</FieldLabel>
                    <Input id="firstName" name="firstName" placeholder="Jane" required className="bg-white" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                    <Input id="lastName" name="lastName" placeholder="Doe" required className="bg-white" />
                  </Field>
                </div>
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
                  className="bg-white"
                />
              </Field>

              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  {!isSignup && (
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium text-teal underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    className="bg-white pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-400 transition-colors hover:text-gray-900"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="w-full"
              >
                {loading && <Loader2 className="animate-spin" />}
                {isSignup ? "Create account" : "Sign in"}
              </Button>
            </FieldGroup>
          </form>

          <p className="text-center text-sm text-gray-500">
            {isSignup ? "Already have an account?" : "Don't have an account?"}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className="ml-1 font-semibold text-teal underline-offset-4 hover:underline"
            >
              {isSignup ? "Sign in" : "Sign up"}
            </Link>
          </p>
    </AuthShell>
  )
}
