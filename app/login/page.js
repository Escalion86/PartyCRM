import { getServerSession } from 'next-auth'
import LoginInputs from './loginInputs'
import { redirect } from 'next/navigation'
import authOptions from '../api/auth/[...nextauth]/_options'
// import { signIn } from 'next-auth/react'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Вход в ArtistCRM',
  robots: {
    index: false,
    follow: false,
  },
}

const normalizeCallbackUrl = (value) => {
  if (typeof value !== 'string') return '/cabinet'
  if (!value.startsWith('/')) return '/cabinet'
  if (value.startsWith('//')) return '/cabinet'
  return value
}

export default async function Login({ searchParams }) {
  let session = null
  const params = await searchParams
  const callbackUrl = normalizeCallbackUrl(params?.callbackUrl)

  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    console.error('Ошибка получения сессии в /login', error)
  }

  if (session) return redirect(callbackUrl)

  return <LoginInputs callbackUrl={callbackUrl} />
}
