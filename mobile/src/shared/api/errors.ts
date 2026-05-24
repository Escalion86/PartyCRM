import type { ApiErrorShape } from './types'

export class ApiError extends Error {
  code?: string
  type?: string
  status: number
  field?: string

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const parseApiError = async (res: Response) => {
  const fallback = new ApiError('Неизвестная ошибка API', res.status)

  try {
    const json = (await res.json()) as Partial<ApiErrorShape>
    const message = json?.error?.message || `HTTP ${res.status}`
    const err = new ApiError(message, res.status)
    err.code = json?.error?.code
    err.type = json?.error?.type || 'unknown'
    err.field = json?.error?.field
    return err
  } catch (error) {
    return fallback
  }
}
