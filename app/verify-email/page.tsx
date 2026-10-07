import { VerifyEmailFlow } from "@/components/verify-email-flow"

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const { sent } = await searchParams
  return <VerifyEmailFlow initialSent={sent === "1"} />
}
