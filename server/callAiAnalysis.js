const EVENT_TYPES = new Set([
  'kids',
  'birthday',
  'wedding',
  'corporate',
  'presentation',
  'opening',
  'club',
])

const AI_PROVIDERS = Object.freeze({
  openai: {
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_CALL_ANALYSIS_MODEL',
    defaultModel: 'gpt-4o-mini',
  },
  deepseek: {
    apiUrl: 'https://api.deepseek.com/chat/completions',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_CALL_ANALYSIS_MODEL',
    defaultModel: 'deepseek-v4-flash',
  },
  aitunnel: {
    apiUrl: 'https://api.aitunnel.ru/v1/chat/completions',
    apiKeyEnv: 'AITUNNEL_KEY',
    modelEnv: 'AITUNNEL_CALL_ANALYSIS_MODEL',
    defaultModel: 'gpt-4o-mini',
  },
})

const trimText = (value, maxLength = 12000) =>
  String(value ?? '').trim().slice(0, maxLength)

const parseJsonObject = (value) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    const match = String(value).match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch (nestedError) {
      return null
    }
  }
}

const parseDateOrNull = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseBudget = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(number) && number >= 0 ? number : null
}

const normalizeStringList = (items) =>
  Array.isArray(items)
    ? items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : []

const normalizeEventType = (value, allowedEventTypes = []) => {
  const normalized = String(value ?? '').trim()
  const lowerNormalized = normalized.toLowerCase()
  const existingEventType = allowedEventTypes.find(
    (item) => item.toLowerCase() === lowerNormalized
  )
  if (existingEventType) return existingEventType
  if (allowedEventTypes.length) return ''
  return EVENT_TYPES.has(normalized) ? normalized : ''
}

export const normalizeAiCallAnalysis = (raw, options = {}) => {
  const data = raw && typeof raw === 'object' ? raw : {}
  const allowedEventTypes = normalizeStringList(options.eventTypes)
  const confidence = Number(data.confidence)
  return {
    summary: trimText(data.summary, 3000),
    extractedFields: {
      clientName: trimText(data.clientName, 120),
      eventType: normalizeEventType(data.eventType, allowedEventTypes),
      eventDate: parseDateOrNull(data.eventDate),
      eventCity: trimText(data.eventCity, 120),
      eventLocation: trimText(data.eventLocation, 240),
      guestCount: trimText(data.guestCount, 80),
      budget: parseBudget(data.budget),
      nextContactAt: parseDateOrNull(data.nextContactAt),
      nextContactReason: trimText(data.nextContactReason, 240),
      objections: Array.isArray(data.objections)
        ? data.objections.map((item) => trimText(item, 180)).filter(Boolean)
        : [],
      confidence: Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : 0,
    },
  }
}

const buildFallbackAnalysis = (transcript, settings = {}) => {
  const text = trimText(transcript, 3000)
  const firstLine = text.split('\n').find(Boolean) || text.slice(0, 220)
  return normalizeAiCallAnalysis(
    {
      summary: firstLine
        ? `AI-анализ не настроен. Черновое резюме по transcript: ${firstLine}`
        : 'AI-анализ не настроен. Добавьте transcript или настройте AI provider API key.',
      eventType: '',
      confidence: 0.1,
    },
    settings
  )
}

const getAiProviderConfig = (settings = {}) => {
  const providerName = String(
    settings.aiAnalysisProvider || process.env.AI_ANALYSIS_PROVIDER || 'deepseek'
  )
    .trim()
    .toLowerCase()
  const provider = AI_PROVIDERS[providerName] || AI_PROVIDERS.deepseek
  const normalizedProviderName = AI_PROVIDERS[providerName]
    ? providerName
    : 'deepseek'
  return {
    name: normalizedProviderName,
    apiUrl:
      process.env.AI_ANALYSIS_API_URL ||
      process.env[`${normalizedProviderName.toUpperCase()}_API_URL`] ||
      provider.apiUrl,
    apiKey:
      normalizedProviderName === 'aitunnel'
        ? settings.aitunnelKey || process.env[provider.apiKeyEnv]
        : process.env[provider.apiKeyEnv],
    model:
      settings.aiAnalysisModel ||
      process.env[provider.modelEnv] ||
      provider.defaultModel,
  }
}

const buildProviderRequestBody = (provider, cleanTranscript, settings = {}) => {
  const body = {
    model: provider.model,
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Ты аккуратный CRM-ассистент. Извлекаешь только явно подтвержденные данные и возвращаешь строгий JSON.',
      },
      { role: 'user', content: buildPrompt(cleanTranscript, settings) },
    ],
  }

  if (provider.name === 'deepseek' && provider.model.startsWith('deepseek-v4')) {
    body.thinking = { type: 'disabled' }
  }

  return body
}

const buildEventTypeInstruction = (settings = {}) => {
  const eventTypes = normalizeStringList(settings.eventTypes)
  if (!eventTypes.length) {
    return 'одно из kids, birthday, wedding, corporate, presentation, opening, club; если нет уверенного совпадения, верни пустую строку.'
  }
  return `строго одно из существующих значений: ${eventTypes
    .map((item) => JSON.stringify(item))
    .join(', ')}; если нет уверенного совпадения, верни пустую строку.`
}

const buildPrompt = (transcript, settings = {}) => `
Ты анализируешь телефонный разговор артиста с потенциальным клиентом CRM.
Верни только JSON без markdown.

Нужно извлечь поля:
- summary: краткое резюме разговора на русском языке.
- clientName: имя клиента, если оно явно звучит.
- eventType: ${buildEventTypeInstruction(settings)}
- eventDate: дата/время мероприятия в ISO 8601 или null.
- eventCity: город, если есть.
- eventLocation: площадка/адрес/комментарий к месту, если есть.
- guestCount: количество гостей строкой, если есть.
- budget: число в рублях или null.
- nextContactAt: дата/время следующего контакта в ISO 8601 или null.
- nextContactReason: почему нужен следующий контакт.
- objections: массив сомнений/возражений клиента.
- confidence: число от 0 до 1.

Если данных нет или они сомнительные, ставь null/пустую строку и снижай confidence.

Transcript:
${transcript}
`

export const analyzeCallTranscript = async (transcript, settings = {}) => {
  const cleanTranscript = trimText(transcript)
  if (!cleanTranscript) {
    return buildFallbackAnalysis('', settings)
  }

  const provider = getAiProviderConfig(settings)
  if (!provider.apiKey) return buildFallbackAnalysis(cleanTranscript, settings)

  const response = await fetch(provider.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      buildProviderRequestBody(provider, cleanTranscript, settings)
    ),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `${provider.name} request failed: ${response.status}`
    throw new Error(message)
  }

  const content = payload?.choices?.[0]?.message?.content
  const json = parseJsonObject(content)
  if (!json) throw new Error('AI вернул некорректный JSON')

  return normalizeAiCallAnalysis(json, settings)
}
