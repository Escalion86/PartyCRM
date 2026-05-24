const contentType = 'application/json'

const extractApiErrorMessage = (json) => {
  if (!json) return ''
  if (typeof json?.error?.message === 'string' && json.error.message.trim()) {
    return json.error.message.trim()
  }
  if (typeof json?.error === 'string' && json.error.trim()) {
    return json.error.trim()
  }
  return ''
}

export const apiJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: contentType,
      'Content-Type': contentType,
      ...(options.headers ?? {}),
    },
  })
  const json = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(extractApiErrorMessage(json) || `HTTP ${response.status}`)
    error.status = response.status
    error.payload = json
    throw error
  }

  return json
}
