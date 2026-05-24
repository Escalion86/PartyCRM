const TRANSCRIPTION_PROVIDERS = Object.freeze({
  openai: {
    apiUrl: 'https://api.openai.com/v1/audio/transcriptions',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_TRANSCRIPTION_MODEL',
    defaultModel: 'whisper-1',
  },
  aitunnel: {
    apiUrl: 'https://api.aitunnel.ru/v1/audio/transcriptions',
    apiKeyEnv: 'AITUNNEL_KEY',
    modelEnv: 'AITUNNEL_TRANSCRIPTION_MODEL',
    defaultModel: 'whisper-1',
  },
})

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

const getTranscriptionProviderConfig = (settings = {}) => {
  const providerName = String(
    settings.aiTranscriptionProvider ||
      process.env.AI_TRANSCRIPTION_PROVIDER ||
      'aitunnel'
  )
    .trim()
    .toLowerCase()
  const provider = TRANSCRIPTION_PROVIDERS[providerName]
  if (!provider) {
    return {
      name: providerName,
      error: 'TRANSCRIPTION_PROVIDER_UNSUPPORTED',
    }
  }
  return {
    name: providerName,
    apiUrl: process.env.AI_TRANSCRIPTION_API_URL || provider.apiUrl,
    apiKey:
      providerName === 'aitunnel'
        ? settings.aitunnelKey || process.env[provider.apiKeyEnv]
        : process.env[provider.apiKeyEnv],
    model:
      settings.aiTranscriptionModel ||
      process.env[provider.modelEnv] ||
      provider.defaultModel,
  }
}

const getFileNameFromUrl = (url) => {
  try {
    const parsed = new URL(url)
    const name = parsed.pathname.split('/').filter(Boolean).pop()
    return name || 'recording.mp3'
  } catch (error) {
    return 'recording.mp3'
  }
}

const fetchRecordingBlob = async (recordingUrl) => {
  const response = await fetch(recordingUrl)
  if (!response.ok) {
    throw new Error(`RECORDING_DOWNLOAD_FAILED:${response.status}`)
  }

  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_AUDIO_BYTES) {
    throw new Error('RECORDING_TOO_LARGE')
  }

  const arrayBuffer = await response.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error('RECORDING_TOO_LARGE')
  }

  const contentType = response.headers.get('content-type') || 'audio/mpeg'
  return new Blob([arrayBuffer], { type: contentType })
}

const transcribeBlobWithOpenAiCompatible = async ({
  provider,
  audioBlob,
  fileName,
}) => {
  const formData = new FormData()
  formData.set('model', provider.model)
  formData.set('language', 'ru')
  formData.set('response_format', 'json')
  formData.set('file', audioBlob, fileName || 'recording.webm')

  const response = await fetch(provider.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: formData,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `${provider.name} transcription failed: ${response.status}`
    throw new Error(message)
  }

  const text = String(payload?.text || '').trim()
  if (!text) throw new Error('TRANSCRIPTION_EMPTY')
  return text
}

const transcribeWithOpenAiCompatible = async ({ provider, recordingUrl }) => {
  const audioBlob = await fetchRecordingBlob(recordingUrl)
  return transcribeBlobWithOpenAiCompatible({
    provider,
    audioBlob,
    fileName: getFileNameFromUrl(recordingUrl),
  })
}

export const transcribeAudioBlob = async (
  audioBlob,
  fileName = 'recording.webm',
  settings = {}
) => {
  if (!audioBlob) throw new Error('AUDIO_FILE_REQUIRED')
  if (audioBlob.size > MAX_AUDIO_BYTES) throw new Error('RECORDING_TOO_LARGE')

  const provider = getTranscriptionProviderConfig(settings)
  if (provider.error) throw new Error(provider.error)
  if (!provider.apiKey) throw new Error('TRANSCRIPTION_API_KEY_REQUIRED')

  if (provider.name === 'openai' || provider.name === 'aitunnel') {
    return transcribeBlobWithOpenAiCompatible({ provider, audioBlob, fileName })
  }

  throw new Error('TRANSCRIPTION_PROVIDER_UNSUPPORTED')
}

export const transcribeCallRecording = async (recordingUrl, settings = {}) => {
  if (!recordingUrl) throw new Error('RECORDING_URL_REQUIRED')

  const provider = getTranscriptionProviderConfig(settings)
  if (provider.error) throw new Error(provider.error)
  if (!provider.apiKey) throw new Error('TRANSCRIPTION_API_KEY_REQUIRED')

  if (provider.name === 'openai' || provider.name === 'aitunnel') {
    return transcribeWithOpenAiCompatible({ provider, recordingUrl })
  }

  throw new Error('TRANSCRIPTION_PROVIDER_UNSUPPORTED')
}
