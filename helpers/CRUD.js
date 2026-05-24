import urlQueryGenerator from './urlQueryGenerator'

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

const buildHttpError = async (res) => {
  let message = ''
  try {
    const json = await res.json()
    message = extractApiErrorMessage(json)
  } catch (error) {
    message = ''
  }
  const fallback = `HTTP ${res.status}`
  const httpError = new Error(message || fallback)
  httpError.status = res.status
  return httpError
}

export const getData = async (
  url,
  form,
  callbackOnSuccess = null,
  callbackOnError = null,
  resJson = false
) => {
  const actualUrl = urlQueryGenerator(url, form)

  try {
    const res = await fetch(actualUrl, {
      method: 'GET',
      headers: {
        Accept: contentType,
        'Content-Type': contentType,
      },
    })
    // Throw error with status code in case Fetch API req failed
    if (!res.ok) {
      throw await buildHttpError(res)
    }

    const json = await res.json()
    const result = resJson ? json : json.data
    // mutate(url, data, false)
    if (callbackOnSuccess) callbackOnSuccess(result)
    return result
  } catch (error) {
    console.log('Failed to update (GET) on ' + actualUrl)
    console.log(error)
    if (callbackOnError) callbackOnError(error)
    return null
  }
}

export const putData = async (
  url,
  form,
  callbackOnSuccess = null,
  callbackOnError = null,
  resJson = false
) => {
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Accept: contentType,
        'Content-Type': contentType,
      },
      body: JSON.stringify(form),
    })

    // Throw error with status code in case Fetch API req failed
    if (!res.ok) {
      throw await buildHttpError(res)
    }

    const json = await res.json()
    const result = resJson ? json : json.data
    // mutate(url, data, false)
    if (callbackOnSuccess) callbackOnSuccess(result)
    return result
  } catch (error) {
    console.log('Failed to update (PUT) on ' + url)
    console.log(error)
    if (callbackOnError) callbackOnError(error)
    return null
  }
}

/* The POST method adds a new entry in the mongodb database. */
export const postData = async (
  url,
  form,
  callbackOnSuccess = null,
  callbackOnError = null,
  resJson = false,
  dispatcher
) => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: contentType,
        'Content-Type': contentType,
      },
      body: JSON.stringify(form),
      dispatcher,
    })

    // Throw error with status code in case Fetch API req failed
    if (!res.ok) {
      throw await buildHttpError(res)
    }
    const json = await res.json()
    const result = resJson ? json : json.data
    // mutate(url, data, false)
    if (callbackOnSuccess) callbackOnSuccess(result)
    return result
  } catch (error) {
    console.log('Failed to add (POST) on ' + url)
    console.log(error)
    if (callbackOnError) callbackOnError(error)
  }
}

export const deleteData = async (
  url,
  callbackOnSuccess = null,
  callbackOnError = null,
  params = {},
  resJson = false
) => {
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Accept: contentType,
        'Content-Type': contentType,
      },
      body: JSON.stringify(params),
      // body: dontAddUserId
      //   ? JSON.stringify(form)
      //   : JSON.stringify({ data: form, userId }),
    })

    // Throw error with status code in case Fetch API req failed
    if (!res.ok) {
      throw await buildHttpError(res)
    }
    let json = null
    try {
      json = await res.json()
    } catch (error) {
      json = { success: true }
    }
    const result = resJson ? json : json.data
    // mutate(url, data, false)
    if (callbackOnSuccess) callbackOnSuccess(result)
    return result
  } catch (error) {
    console.log('Failed to delete on ' + url)
    console.log(error)
    if (callbackOnError) callbackOnError(error)
  }
}
