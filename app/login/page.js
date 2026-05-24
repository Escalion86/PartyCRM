import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const normalizeCallbackUrl = (value) => {
  if (typeof value !== 'string') return '/party/entry'
  if (!value.startsWith('/')) return '/party/entry'
  if (value.startsWith('//')) return '/party/entry'
  return value
}

export default async function LoginRedirectPage({ searchParams }) {
  const params = await searchParams
  const callbackUrl = normalizeCallbackUrl(params?.callbackUrl)
  redirect(`/party/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
}
