import { env } from '../config/env'
import { getAuthToken } from '../auth/tokenStore'
import { parseApiError } from './errors'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

const buildUrl = (path: string) => {
  const base = env.apiBaseUrl.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}

export const createApiClient = () => {
  const request = async <TResponse>(
    path: string,
    options: RequestOptions = {}
  ) => {
    const token = await getAuthToken()

    const res = await fetch(buildUrl(path), {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })

    if (!res.ok) {
      throw await parseApiError(res)
    }

    const json = await res.json()
    return json as TResponse
  }

  return {
    get: <TResponse>(path: string, options?: Omit<RequestOptions, 'method'>) =>
      request<TResponse>(path, { ...options, method: 'GET' }),
    post: <TResponse>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>
    ) => request<TResponse>(path, { ...options, method: 'POST', body }),
    put: <TResponse>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>
    ) => request<TResponse>(path, { ...options, method: 'PUT', body }),
    patch: <TResponse>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>
    ) => request<TResponse>(path, { ...options, method: 'PATCH', body }),
    delete: <TResponse>(
      path: string,
      options?: Omit<RequestOptions, 'method'>
    ) => request<TResponse>(path, { ...options, method: 'DELETE' }),
  }
}
