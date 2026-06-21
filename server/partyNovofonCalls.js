const cleanText = (value, maxLength = 4000) => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : ''
}

const normalizePhoneDigits = (phone) => String(phone ?? '').replace(/[^\d]/g, '')

export const normalizePartyCallPhone = (phone) => {
  const digits = normalizePhoneDigits(phone)
  if (!digits) return ''
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

const normalizeDate = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const normalizeNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

const splitClientName = (value) => {
  const parts = cleanText(value, 160).split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] || '',
    secondName: parts.slice(1).join(' '),
  }
}

export const findPartyClientByCallPhone = async ({
  Client,
  tenantId,
  normalizedPhone,
}) => {
  if (!Client || !tenantId || !normalizedPhone) return null
  const phoneAsNumber = Number(normalizedPhone)
  const variants = Number.isFinite(phoneAsNumber)
    ? [normalizedPhone, phoneAsNumber]
    : [normalizedPhone]

  return Client.findOne({
    tenantId,
    status: { $ne: 'archived' },
    $or: [
      { phone: { $in: variants } },
      { whatsapp: { $in: variants } },
    ],
  }).lean()
}

const createPartyClientForCall = async ({
  Client,
  tenantId,
  normalizedPhone,
  extractedFields = {},
}) => {
  if (!Client || !tenantId || !normalizedPhone) return null
  const name = splitClientName(extractedFields.clientName)
  const client = await Client.create({
    tenantId,
    firstName: name.firstName,
    secondName: name.secondName,
    phone: normalizedPhone,
    whatsapp: normalizedPhone,
    preferredContactChannel: 'phone',
    comment: 'Клиент создан автоматически из звонка Novofon',
  })
  return typeof client?.toJSON === 'function' ? client.toJSON() : client
}

export const buildPartyOrderDraftFromCall = ({ call, client }) => {
  const fields = call?.aiExtractedFields ?? {}
  const budget = normalizeNumber(fields.budget, 0)
  const summaryParts = [
    call?.aiSummary ? `AI-резюме звонка:\n${call.aiSummary}` : '',
    call?.transcript ? `Transcript:\n${call.transcript}` : '',
  ].filter(Boolean)

  return {
    status: 'draft',
    title: cleanText(fields.eventType, 120) || 'Заявка из звонка',
    clientId: client?._id || null,
    client: {
      name: [client?.firstName, client?.secondName].filter(Boolean).join(' '),
      phone: cleanText(client?.phone || call?.normalizedPhone || call?.phone, 40),
      email: cleanText(client?.email, 160),
    },
    eventDate: normalizeDate(fields.eventDate),
    placeType: 'client_address',
    customAddress: cleanText(fields.eventLocation, 500),
    contractAmount: budget,
    clientPayment: {
      totalAmount: budget,
      prepaidAmount: 0,
      status: budget > 0 ? 'wait_prepayment' : 'none',
    },
    leadSource: 'Novofon',
    leadSourceLabel: 'Novofon',
    leadMeta: {
      sourceCallId: call?._id || null,
      aiConfidence: normalizeNumber(fields.confidence, 0),
    },
    adminComment: summaryParts.join('\n\n').trim(),
    additionalEvents: [],
  }
}

const asPlainObject = (value) =>
  value && typeof value.toJSON === 'function' ? value.toJSON() : value

export const createPartyOrderFromCallDraft = async ({
  models,
  tenantId,
  callId,
  now = new Date(),
  prepareOrderPayload = null,
}) => {
  if (!models?.Call || !models?.Order || !tenantId || !callId) {
    return {
      error: {
        status: 400,
        code: 'partycrm_call_order_context_required',
        message: 'Недостаточно данных для создания заказа из звонка',
      },
      order: null,
      call: null,
    }
  }

  const call = await models.Call.findOne({ _id: callId, tenantId }).lean()
  if (!call) {
    return {
      error: {
        status: 404,
        code: 'partycrm_call_not_found',
        message: 'Звонок не найден',
      },
      order: null,
      call: null,
    }
  }

  if (call.linkedOrderId) {
    return {
      error: {
        status: 409,
        code: 'partycrm_call_order_already_created',
        message: 'По этому звонку уже создан заказ',
      },
      order: null,
      call,
    }
  }

  if (!call.orderDraft || typeof call.orderDraft !== 'object') {
    return {
      error: {
        status: 400,
        code: 'partycrm_call_order_draft_missing',
        message: 'У звонка нет черновика заказа',
      },
      order: null,
      call,
    }
  }

  const {
    _id: ignoredId,
    tenantId: ignoredTenantId,
    linkedOrderId: ignoredLinkedOrderId,
    ...draftPayload
  } = call.orderDraft
  void ignoredId
  void ignoredTenantId
  void ignoredLinkedOrderId

  const orderPayload = {
    ...draftPayload,
    tenantId,
    status: draftPayload.status || 'draft',
    clientId: draftPayload.clientId || call.linkedClientId || null,
    leadSource: draftPayload.leadSource || 'Novofon',
    leadSourceLabel: draftPayload.leadSourceLabel || 'Novofon',
    leadMeta: {
      ...(draftPayload.leadMeta ?? {}),
      sourceCallId: call._id,
    },
  }
  const prepared =
    typeof prepareOrderPayload === 'function'
      ? await prepareOrderPayload(orderPayload)
      : { payload: orderPayload }
  if (prepared?.error) {
    return {
      error: prepared.error,
      order: null,
      call,
    }
  }

  const order = asPlainObject(
    await models.Order.create(prepared?.payload ?? orderPayload)
  )
  const orderId = order?._id || null
  const update = {
    $set: {
      linkedOrderId: orderId,
      status: 'linked',
      eventDecision: 'created',
      eventDecisionAt: now,
    },
  }

  await models.Call.updateOne({ _id: call._id, tenantId }, update)

  return {
    error: null,
    order,
    call: {
      ...call,
      ...update.$set,
    },
  }
}

const normalizeCallStatus = ({ normalized, hasTranscript, hasAi }) => {
  if (hasTranscript || hasAi) return 'ready'
  const status = cleanText(normalized.status, 40)
  return ['new', 'processing', 'ready', 'linked', 'ignored', 'failed'].includes(status)
    ? status
    : 'new'
}

export const savePartyNovofonCall = async ({
  models,
  tenantId,
  normalized = {},
  rawPayload = null,
  analyzeTranscript = null,
}) => {
  const normalizedPhone = normalizePartyCallPhone(normalized.phone)
  let analysis = null
  const transcript = cleanText(normalized.transcript, 12000)

  if (transcript && typeof analyzeTranscript === 'function') {
    analysis = await analyzeTranscript(transcript)
  }

  const extractedFields = analysis?.extractedFields ?? {}
  const existingClient = await findPartyClientByCallPhone({
    Client: models?.Client,
    tenantId,
    normalizedPhone,
  })
  const client =
    existingClient ||
    (await createPartyClientForCall({
      Client: models?.Client,
      tenantId,
      normalizedPhone,
      extractedFields,
    }))

  const startedAt = normalizeDate(normalized.startedAt) || new Date()
  const callSet = {
    tenantId,
    provider: cleanText(normalized.provider, 80) || 'novofon',
    providerCallId: cleanText(normalized.providerCallId, 160),
    direction: ['incoming', 'outgoing'].includes(normalized.direction)
      ? normalized.direction
      : 'unknown',
    phone: cleanText(normalized.phone, 80),
    normalizedPhone,
    startedAt,
    endedAt: normalizeDate(normalized.endedAt),
    durationSec: normalizeNumber(normalized.durationSec, 0),
    status: normalizeCallStatus({
      normalized,
      hasTranscript: Boolean(transcript),
      hasAi: Boolean(analysis),
    }),
    recordingUrl: cleanText(normalized.recordingUrl, 1000),
    transcript,
    aiSummary: cleanText(analysis?.summary, 3000),
    aiExtractedFields: extractedFields,
    linkedClientId: client?._id || null,
    processingError: cleanText(normalized.processingError, 500),
    raw: rawPayload,
  }

  const callForDraft = {
    _id: null,
    ...callSet,
  }
  const orderDraft =
    client && (transcript || analysis)
      ? buildPartyOrderDraftFromCall({ call: callForDraft, client })
      : null

  const update = {
    $set: {
      ...callSet,
      ...(orderDraft ? { orderDraft } : {}),
    },
    $setOnInsert: {
      eventDecision: orderDraft ? 'pending' : '',
    },
  }

  const filter = callSet.providerCallId
    ? {
        tenantId,
        provider: callSet.provider,
        providerCallId: callSet.providerCallId,
      }
    : {
        tenantId,
        provider: callSet.provider,
        phone: callSet.phone,
        startedAt,
      }

  const call = await models.Call.findOneAndUpdate(filter, update, {
    upsert: true,
    returnDocument: 'after',
    setDefaultsOnInsert: true,
  }).lean()

  if (call?._id && call.orderDraft?.leadMeta) {
    call.orderDraft.leadMeta.sourceCallId = call._id
  }

  return { call, client, orderDraft: call?.orderDraft ?? orderDraft }
}
