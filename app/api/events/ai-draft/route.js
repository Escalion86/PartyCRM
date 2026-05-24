import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import Clients from '@models/Clients'

/**
 * POST /api/events/ai-draft
 *
 * Принимает расшифрованный голосовой текст и возвращает структурированные поля события,
 * извлечённые с помощью OpenAI-совместимого LLM.
 *
 * Тело запроса:  { text: string }
 * Ответ:         { fields: { eventType?, eventDate?, description?, address?, contractSum?, ... }, error? }
 */
export async function POST(request) {
  try {
    // --- авторизация ---
    const { tenantId, user } = await getTenantContext()
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Неавторизованный доступ', fields: null },
        { status: 401 }
      )
    }

    const body = await request.json()
    const text = (body?.text ?? '').trim()
    if (!text) {
      return NextResponse.json(
        { error: 'Пустой текст', fields: {} },
        { status: 400 }
      )
    }

    // --- получаем список клиентов для матчинга имён ---
    await dbConnect()
    const clients = await Clients.find({ tenantId })
      .select('_id firstName secondName thirdName')
      .lean()

    const clientNames = clients.map((c) => ({
      id: String(c._id),
      name: [c.firstName, c.secondName, c.thirdName]
        .filter(Boolean)
        .join(' ')
        .trim(),
    }))

    // --- получаем сегодняшнюю дату для контекста ---
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // --- собираем промпт ---
    const systemPrompt = `Ты — ассистент CRM для иллюзиониста (артиста, ведущего мероприятий). Твоя задача — извлечь из свободного описания события структурированные данные для заполнения формы.

Возвращай ТОЛЬКО валидный JSON-объект с полями, которые удалось извлечь. Если поле не удалось определить — не включай его в ответ.

Доступные поля (все опциональны):
- eventType: строка, тип события. Например: "свадьба", "корпоратив", "день рождения", "выпускной", "юбилей", "новый год", "детский праздник", "гендер пати", "квартирник", "концерт", "тимбилдинг", "выставка", "презентация", "фуршет", "банкет", "помолвка", "девичник", "мальчишник", "крестины", "встреча", "тест", "другое"
- eventDate: строка даты и времени в ISO 8601 (например "2026-06-15T18:00:00"). Если указан только день — ставь время на 18:00. Если «завтра»/«послезавтра» — вычисляй относительно сегодня (${todayStr}). Если не указан год — подставляй текущий (${today.getFullYear()}).
- dateEnd: строка даты окончания в ISO 8601. Если указана только продолжительность (например «на 4 часа»), вычисли eventDate + длительность.
- description: строка, краткое описание события (2-3 предложения). Не дублируй то, что уже извлечено в другие поля.
- contractSum: число, сумма контракта в рублях. Извлекай из фраз вроде «бюджет 50 тысяч», «за 30000 руб», «гонорар 100к», «стоимость 15000₽».
- waitDeposit: булево, true если упоминается задаток/предоплата («нужен задаток», «возьму предоплату», «аванс»).
- depositExpectedAmount: число, сумма задатка если указана («задаток 10 тысяч»).
- isByContract: булево, true если упоминается договор («по договору», «с договором», «оформим договор»).
- financeComment: строка, финансовые заметки не попавшие в другие поля.

- address: объект с полями адреса. Любые из:
  - town: строка, город
  - street: строка, улица
  - house: строка, дом
  - comment: строка, примечание об адресе («вход со двора», «3 этаж»)

- clientId: строка (ID клиента) или null если клиент найден. Сопоставляй имя из текста со списком ниже.
- clientName: строка, имя клиента как оно упомянуто в тексте (даже если не найден в списке).

Список клиентов (id → name):
${clientNames.map((c) => `- ${c.id}: "${c.name}"`).join('\n')}

ВАЖНО: 
- Возвращай ТОЛЬКО JSON, без markdown-блоков.
- Не выдумывай данные — если чего-то нет в тексте, не добавляй это поле.
- Если клиент найден в списке — верни clientId, иначе — не включай clientId в ответ.
- Суммы возвращай как числа (не строки).
- Даты в ISO 8601.`

    // --- LLM: используем OpenAI-совместимый API ---
    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

    if (!apiKey) {
      // Если ключа нет — возвращаем заглушку с извлечением по регуляркам
      console.warn('[ai-draft] OPENAI_API_KEY не задан, использую regex-заглушку')
      const fields = extractFieldsFallback(text, clientNames, todayStr)
      return NextResponse.json({ fields })
    }

    const llmResponse = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    })

    if (!llmResponse.ok) {
      const errorBody = await llmResponse.text().catch(() => '')
      console.error(
        `[ai-draft] LLM API error ${llmResponse.status}: ${errorBody.slice(0, 300)}`
      )
      // fallback на regex
      const fields = extractFieldsFallback(text, clientNames, todayStr)
      return NextResponse.json({ fields })
    }

    const data = await llmResponse.json()
    const content = data?.choices?.[0]?.message?.content ?? ''

    // Парсим LLM-ответ (может быть с markdown-блоком или без)
    let parsed = null
    try {
      // Пробуем прямой JSON
      parsed = JSON.parse(content)
    } catch {
      // Пробуем извлечь из ```json ... ```
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim())
        } catch {
          console.warn('[ai-draft] не удалось разобрать LLM-ответ, использую regex')
        }
      }
    }

    if (!parsed) {
      const fields = extractFieldsFallback(text, clientNames, todayStr)
      return NextResponse.json({ fields })
    }

    // Валидируем и нормализуем поля
    const fields = normalizeLLMFields(parsed, clientNames)
    return NextResponse.json({ fields })

  } catch (error) {
    console.error('[ai-draft] ошибка:', error)
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', fields: null },
      { status: 500 }
    )
  }
}

// ============================================================================
// Fallback: извлечение полей регулярными выражениями (когда нет LLM)
// ============================================================================

function extractFieldsFallback(text, clientNames, todayStr) {
  const fields = {}

  // --- дата события ---
  const datePatterns = [
    // "15 июня 2026", "15.06.2026", "15/06/2026", "15-06-2026"
    /(\d{1,2})\s+(январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\s*(\d{4})?/i,
    /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/,
    // "завтра", "послезавтра"
    /\b(завтра|послезавтра)\b/i,
  ]

  const months = {
    'января':1,'январь':1,'февраля':2,'февраль':2,'марта':3,'март':3,
    'апреля':4,'апрель':4,'мая':5,'май':5,'июня':6,'июнь':6,
    'июля':7,'июль':7,'августа':8,'август':8,'сентября':9,'сентябрь':9,
    'октября':10,'октябрь':10,'ноября':11,'ноябрь':11,'декабря':12,'декабрь':12,
  }

  // Пробуем «завтра» / «послезавтра»
  const tomorrowMatch = text.match(/\bпослезавтра\b/i)
  const todayMatch = text.match(/\bзавтра\b/i)
  const now = new Date()
  if (tomorrowMatch) {
    now.setDate(now.getDate() + 2)
    now.setHours(18, 0, 0, 0)
    fields.eventDate = now.toISOString()
  } else if (todayMatch) {
    now.setDate(now.getDate() + 1)
    now.setHours(18, 0, 0, 0)
    fields.eventDate = now.toISOString()
  } else {
    // Пробуем числовую дату
    const numMatch = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
    if (numMatch) {
      let [, d, m, y] = numMatch
      m = parseInt(m, 10)
      d = parseInt(d, 10)
      y = parseInt(y, 10)
      if (y < 100) y += 2000
      const date = new Date(y, m - 1, d, 18, 0, 0)
      if (!Number.isNaN(date.getTime())) {
        fields.eventDate = date.toISOString()
      }
    }

    // Пробуем текстовую дату
    const textMatch = text.match(/(\d{1,2})\s+(январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\s*(\d{4})?/i)
    if (textMatch) {
      const d = parseInt(textMatch[1], 10)
      const mStr = textMatch[2].toLowerCase()
      const m = months[mStr] ?? months[mStr.replace(/[ья]$/, 'ь')] ?? 1
      const y = parseInt(textMatch[3] || String(now.getFullYear()), 10)
      const date = new Date(y, m - 1, d, 18, 0, 0)
      if (!Number.isNaN(date.getTime())) {
        fields.eventDate = date.toISOString()
      }
    }
  }

  // --- тип события ---
  const typeMatch = text.match(
    /(свадьб[аы]|корпоратив|день\s+рождени[яе]|выпускной|юбилей|новый\s+год|детский\s+праздник|гендер\s+пати|квартирник|концерт|тимбилдинг|выставк[аи]|презентаци[яю]|фуршет|банкет|помолвк[аи]|девичник|мальчишник|крестины|встреч[ау]|тест)/i
  )
  if (typeMatch) {
    fields.eventType = typeMatch[0].toLowerCase()
  }

  // --- сумма контракта ---
  const sumMatch = text.match(
    /(?:бюджет|гонорар|стоимость|сумма|цена|контракт|оплата|за\s+)?\s*(\d[\d\s]*)\s*(?:тыс(?:яч[аи]?)?|к|руб|₽|р\b)/i
  )
  if (sumMatch) {
    let value = parseInt(sumMatch[1].replace(/\s/g, ''), 10)
    if (/тыс|к\b/i.test(sumMatch[0])) value *= 1000
    if (value > 0) fields.contractSum = value
  }

  // --- задаток ---
  if (/задаток|предоплата|аванс/i.test(text)) {
    fields.waitDeposit = true
    const depositMatch = text.match(/задаток\s*(\d[\d\s]*)/i)
    if (depositMatch) {
      const val = parseInt(depositMatch[1].replace(/\s/g, ''), 10)
      if (val > 0 && /тыс|к\b/i.test(text.slice(text.indexOf('задаток'), text.indexOf('задаток') + 30))) {
        fields.depositExpectedAmount = val * 1000
      } else if (val > 0) {
        fields.depositExpectedAmount = val
      }
    }
  }

  // --- договор ---
  if (/договор|по\s+договору/i.test(text)) {
    fields.isByContract = true
  }

  // --- адрес ---
  const townMatch = text.match(/гор(?:од[е]?|\.)?\s*(\S+)/i)
  if (townMatch) fields.address = { town: townMatch[1].replace(/[,.]/g, '') }

  const streetMatch = text.match(/ул(?:иц[ае]|\.)?\s*(\S+)/i)
  if (streetMatch) {
    fields.address = { ...(fields.address || {}), street: streetMatch[1].replace(/[,.]/g, '') }
  }

  const houseMatch = text.match(/д(?:ом|\.)?\s*(\d+[\w/]*)/i)
  if (houseMatch) {
    fields.address = { ...(fields.address || {}), house: houseMatch[1] }
  }

  // --- описание ---
  // Удаляем технические фрагменты (даты, суммы, адреса) и оставляем осмысленную часть
  let desc = text
    .replace(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g, '')
    .replace(/\d+\s*(?:тыс|руб|₽|р\b|к\b)/gi, '')
    .replace(/бюджет|гонорар|стоимость|сумма|договор|задаток|предоплата|ул\.|гор\.|д\.\s*\d+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (desc.length > 10) {
    // берём первые 300 символов
    fields.description = desc.slice(0, 300)
  }

  // --- client matching ---
  const lowerText = text.toLowerCase()
  for (const c of clientNames) {
    const nameParts = c.name.toLowerCase().split(/\s+/)
    // проверяем, есть ли хотя бы 2 части имени или уникальное имя в тексте
    const matches = nameParts.filter((part) => part.length > 2 && lowerText.includes(part))
    if (matches.length >= Math.min(2, nameParts.length)) {
      fields.clientId = c.id
      fields.clientName = c.name
      break
    }
  }

  return fields
}

// ============================================================================
// Нормализация полей от LLM
// ============================================================================

function normalizeLLMFields(parsed, clientNames) {
  const fields = {}

  if (typeof parsed.eventType === 'string' && parsed.eventType.trim()) {
    fields.eventType = parsed.eventType.trim()
  }

  if (typeof parsed.eventDate === 'string' && parsed.eventDate.trim()) {
    const d = new Date(parsed.eventDate)
    if (!Number.isNaN(d.getTime())) {
      fields.eventDate = d.toISOString()
    }
  }

  if (typeof parsed.dateEnd === 'string' && parsed.dateEnd.trim()) {
    const d = new Date(parsed.dateEnd)
    if (!Number.isNaN(d.getTime())) {
      fields.dateEnd = d.toISOString()
    }
  }

  if (typeof parsed.description === 'string' && parsed.description.trim()) {
    fields.description = parsed.description.trim().slice(0, 2000)
  }

  if (typeof parsed.contractSum === 'number' && parsed.contractSum > 0) {
    fields.contractSum = Math.round(parsed.contractSum)
  }

  if (typeof parsed.waitDeposit === 'boolean') {
    fields.waitDeposit = parsed.waitDeposit
  }

  if (typeof parsed.depositExpectedAmount === 'number' && parsed.depositExpectedAmount > 0) {
    fields.depositExpectedAmount = Math.round(parsed.depositExpectedAmount)
  }

  if (typeof parsed.isByContract === 'boolean') {
    fields.isByContract = parsed.isByContract
  }

  if (typeof parsed.financeComment === 'string' && parsed.financeComment.trim()) {
    fields.financeComment = parsed.financeComment.trim().slice(0, 500)
  }

  // address
  if (parsed.address && typeof parsed.address === 'object') {
    const addr = {}
    if (typeof parsed.address.town === 'string') addr.town = parsed.address.town.trim()
    if (typeof parsed.address.street === 'string') addr.street = parsed.address.street.trim()
    if (typeof parsed.address.house === 'string') addr.house = parsed.address.house.trim()
    if (typeof parsed.address.comment === 'string') addr.comment = parsed.address.comment.trim()
    if (Object.keys(addr).length > 0) fields.address = addr
  }

  // clientId validation
  if (typeof parsed.clientId === 'string' && parsed.clientId.trim()) {
    const validIds = clientNames.map((c) => c.id)
    if (validIds.includes(parsed.clientId)) {
      fields.clientId = parsed.clientId
    }
  }

  if (typeof parsed.clientName === 'string' && parsed.clientName.trim()) {
    fields.clientName = parsed.clientName.trim()
  }

  return fields
}
