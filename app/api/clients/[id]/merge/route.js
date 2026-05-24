import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AvitoConversations from '@models/AvitoConversations'
import AvitoMessages from '@models/AvitoMessages'
import Calls from '@models/Calls'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import VkConversations from '@models/VkConversations'
import VkMessages from '@models/VkMessages'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const isObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

const jsonError = (message, status = 400, code = 'client_merge_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'clients', message } },
    { status }
  )

const getDuplicateId = (req, body) => {
  if (body?.duplicateClientId) return String(body.duplicateClientId).trim()
  const { searchParams } = new URL(req.url)
  return String(searchParams.get('duplicateClientId') || '').trim()
}

const getMergePreview = async ({ tenantId, duplicateClientId }) => {
  const [
    events,
    eventsOtherContacts,
    eventsColleague,
    transactions,
    avitoConversations,
    avitoMessages,
    vkConversations,
    vkMessages,
    calls,
  ] = await Promise.all([
    Events.countDocuments({ tenantId, clientId: duplicateClientId }),
    Events.countDocuments({
      tenantId,
      'otherContacts.clientId': duplicateClientId,
    }),
    Events.countDocuments({ tenantId, colleagueId: duplicateClientId }),
    Transactions.countDocuments({ tenantId, clientId: duplicateClientId }),
    AvitoConversations.countDocuments({ tenantId, clientId: duplicateClientId }),
    AvitoMessages.countDocuments({ tenantId, clientId: duplicateClientId }),
    VkConversations.countDocuments({ tenantId, clientId: duplicateClientId }),
    VkMessages.countDocuments({ tenantId, clientId: duplicateClientId }),
    Calls.countDocuments({ tenantId, linkedClientId: duplicateClientId }),
  ])

  return {
    events,
    eventsOtherContacts,
    eventsColleague,
    transactions,
    avitoConversations,
    avitoMessages,
    vkConversations,
    vkMessages,
    calls,
    total:
      events +
      eventsOtherContacts +
      eventsColleague +
      transactions +
      avitoConversations +
      avitoMessages +
      vkConversations +
      vkMessages +
      calls,
  }
}

const hasValue = (value) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

const mergeMissingClientFields = (target, duplicate) => {
  const fields = [
    'firstName',
    'secondName',
    'thirdName',
    'email',
    'images',
    'gender',
    'phone',
    'whatsapp',
    'viber',
    'telegram',
    'instagram',
    'vk',
    'preferredContactChannel',
    'preferredContactChannelOther',
    'town',
    'legalName',
    'inn',
    'kpp',
    'ogrn',
    'bankName',
    'bik',
    'checkingAccount',
    'correspondentAccount',
    'legalAddress',
  ]

  const update = {}
  fields.forEach((field) => {
    if (!hasValue(target?.[field]) && hasValue(duplicate?.[field])) {
      update[field] = duplicate[field]
    }
  })

  const targetComment = String(target?.comment || '').trim()
  const duplicateComment = String(duplicate?.comment || '').trim()
  if (duplicateComment && !targetComment.includes(duplicateComment)) {
    update.comment = [targetComment, duplicateComment].filter(Boolean).join('\n\n')
  }

  return update
}

const loadClients = async ({ tenantId, targetClientId, duplicateClientId }) => {
  const [targetClient, duplicateClient] = await Promise.all([
    Clients.findOne({ _id: targetClientId, tenantId }),
    Clients.findOne({ _id: duplicateClientId, tenantId }),
  ])

  if (!targetClient) return { error: jsonError('Основной клиент не найден', 404) }
  if (!duplicateClient) return { error: jsonError('Клиент-дубль не найден', 404) }
  return { targetClient, duplicateClient }
}

export const GET = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const targetClientId = String(routeParams?.id || '').trim()
  const duplicateClientId = getDuplicateId(req)
  if (!isObjectId(targetClientId) || !isObjectId(duplicateClientId)) {
    return jsonError('Некорректный ID клиента', 400, 'bad_client_id')
  }
  if (targetClientId === duplicateClientId) {
    return jsonError('Нельзя объединить клиента с самим собой', 400, 'same_client')
  }

  await dbConnect()
  const { targetClient, duplicateClient, error } = await loadClients({
    tenantId,
    targetClientId,
    duplicateClientId,
  })
  if (error) return error

  const preview = await getMergePreview({ tenantId, duplicateClientId })

  return NextResponse.json(
    {
      success: true,
      data: {
        targetClient,
        duplicateClient,
        preview,
      },
    },
    { status: 200 }
  )
}

export const POST = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const targetClientId = String(routeParams?.id || '').trim()
  const body = await req.json().catch(() => ({}))
  const duplicateClientId = getDuplicateId(req, body)
  if (!isObjectId(targetClientId) || !isObjectId(duplicateClientId)) {
    return jsonError('Некорректный ID клиента', 400, 'bad_client_id')
  }
  if (targetClientId === duplicateClientId) {
    return jsonError('Нельзя объединить клиента с самим собой', 400, 'same_client')
  }

  await dbConnect()
  const { targetClient, duplicateClient, error } = await loadClients({
    tenantId,
    targetClientId,
    duplicateClientId,
  })
  if (error) return error

  const targetObjectId = new mongoose.Types.ObjectId(targetClientId)
  const duplicateObjectId = new mongoose.Types.ObjectId(duplicateClientId)
  const clientUpdate = mergeMissingClientFields(targetClient, duplicateClient)

  const [
    eventsResult,
    eventsOtherContactsResult,
    eventsColleagueResult,
    transactionsResult,
    avitoConversationsResult,
    avitoMessagesResult,
    vkConversationsResult,
    vkMessagesResult,
    callsResult,
    updatedClient,
  ] = await Promise.all([
    Events.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    Events.updateMany(
      { tenantId, 'otherContacts.clientId': duplicateObjectId },
      { $set: { 'otherContacts.$[contact].clientId': targetObjectId } },
      { arrayFilters: [{ 'contact.clientId': duplicateObjectId }] }
    ),
    Events.updateMany(
      { tenantId, colleagueId: duplicateObjectId },
      { $set: { colleagueId: targetObjectId } }
    ),
    Transactions.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    AvitoConversations.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    AvitoMessages.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    VkConversations.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    VkMessages.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    Calls.updateMany(
      { tenantId, linkedClientId: duplicateObjectId },
      { $set: { linkedClientId: targetObjectId } }
    ),
    Object.keys(clientUpdate).length
      ? Clients.findOneAndUpdate(
          { _id: targetObjectId, tenantId },
          { $set: clientUpdate },
          { returnDocument: 'after' }
        )
      : Clients.findOne({ _id: targetObjectId, tenantId }),
  ])

  const deleted = await Clients.findOneAndDelete({
    _id: duplicateObjectId,
    tenantId,
  }).lean()
  if (!deleted) {
    return jsonError('Клиент-дубль уже удален', 404, 'duplicate_not_found')
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        client: updatedClient,
        deletedClientId: duplicateClientId,
        moved: {
          events: eventsResult.modifiedCount || 0,
          eventsOtherContacts: eventsOtherContactsResult.modifiedCount || 0,
          eventsColleague: eventsColleagueResult.modifiedCount || 0,
          transactions: transactionsResult.modifiedCount || 0,
          avitoConversations: avitoConversationsResult.modifiedCount || 0,
          avitoMessages: avitoMessagesResult.modifiedCount || 0,
          vkConversations: vkConversationsResult.modifiedCount || 0,
          vkMessages: vkMessagesResult.modifiedCount || 0,
          calls: callsResult.modifiedCount || 0,
        },
      },
    },
    { status: 200 }
  )
}
