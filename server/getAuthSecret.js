import crypto from 'crypto'

const getAuthSecret = () => {
  const existingSecret = process.env.NEXTAUTH_SECRET

  if (existingSecret) return existingSecret

  const login = process.env.LOGIN
  const password = process.env.PASSWORD

  if (!login || !password) {
    const message =
      'NEXTAUTH_SECRET не задан. Укажите переменную окружения или задайте LOGIN и PASSWORD.'

    if (process.env.NODE_ENV !== 'production') {
      console.warn(message)
    }

    throw new Error(message)
  }

  const fallbackSecret = crypto
    .createHash('sha256')
    .update(`${login}:${password}`)
    .digest('hex')

  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'NEXTAUTH_SECRET не найден. Используется детерминированный секрет, сформированный из LOGIN и PASSWORD.'
    )
  }

  process.env.NEXTAUTH_SECRET = fallbackSecret

  return fallbackSecret
}

export default getAuthSecret
