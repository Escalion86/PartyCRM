import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const DEFAULT_ADDRESS = {
  town: '',
  street: '',
  house: '',
  entrance: '',
  floor: '',
  flat: '',
  comment: '',
  link2Gis: '',
  linkYandexNavigator: '',
  link2GisShow: true,
  linkYandexShow: true,
}

const normalizeAddress = (rawAddress, legacyLocation) => {
  if (typeof rawAddress === 'string') {
    return { ...DEFAULT_ADDRESS, comment: rawAddress.trim() }
  }

  const normalized = {
    ...DEFAULT_ADDRESS,
    ...(rawAddress && typeof rawAddress === 'object' ? rawAddress : {}),
  }

  const hasMainFields =
    normalized.town ||
    normalized.street ||
    normalized.house ||
    normalized.flat

  if (legacyLocation && !normalized.comment && !hasMainFields) {
    normalized.comment = legacyLocation
  }

  return normalized
}

const normalizeOtherContacts = (contacts) => {
  if (!Array.isArray(contacts)) return []
  return contacts
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const clientId = item.clientId ?? null
      if (!clientId) return null
      return {
        clientId,
        comment: typeof item.comment === 'string' ? item.comment.trim() : '',
      }
    })
    .filter(Boolean)
}

const normalizeContactChannels = (contacts) => {
  if (Array.isArray(contacts))
    return contacts.map((item) => String(item).trim()).filter(Boolean)
  if (typeof contacts === 'string')
    return contacts
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean)
  return []
}

export const POST = async () => {
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  await dbConnect()

  const requestsCollection = mongoose.connection.collection('requests')
  const requests = await requestsCollection
    .find({ tenantId })
    .sort({ createdAt: 1 })
    .toArray()

  if (!requests || requests.length === 0) {
    return NextResponse.json(
      { success: true, data: { converted: 0, skipped: 0, deleted: 0 } },
      { status: 200 }
    )
  }

  const eventsPayload = []
  const requestIdsToDelete = []
  let skipped = 0

  requests.forEach((request) => {
    if (!request) return
    if (request.status === 'converted' || request.eventId) {
      skipped += 1
      return
    }

    const createdAt = request.createdAt ? new Date(request.createdAt) : new Date()
    const eventDate = request.eventDate ? new Date(request.eventDate) : null
    const legacyLocation = [
      request.location,
      request.town,
      request.address,
    ]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(', ')
    const address = normalizeAddress(request.address, legacyLocation)
    const contactChannels = normalizeContactChannels(request.contactChannels)

    eventsPayload.push({
      tenantId,
      clientId: request.clientId ?? null,
      eventDate,
      address,
      servicesIds: Array.isArray(request.servicesIds)
        ? request.servicesIds
        : [],
      otherContacts: normalizeOtherContacts(request.otherContacts),
      contractSum: Number(request.contractSum) || 0,
      description: request.comment ?? request.description ?? '',
      financeComment: request.financeComment ?? '',
      status: 'draft',
      cancelReason: request.cancelReason ?? '',
      calendarSyncError: request.calendarSyncError ?? '',
      requestCreatedAt: createdAt,
      createdAt,
      updatedAt: new Date(),
      clientData:
        request.clientId || (!request.clientName && !request.clientPhone)
          ? request.clientData ?? {}
          : {
              name: request.clientName ?? '',
              phone: request.clientPhone ?? '',
              contactChannels,
            },
    })

    requestIdsToDelete.push(request._id)
  })

  if (eventsPayload.length === 0) {
    return NextResponse.json(
      {
        success: true,
        data: { converted: 0, skipped, deleted: 0 },
      },
      { status: 200 }
    )
  }

  await Events.insertMany(eventsPayload, { ordered: false })
  const deleteResult = await requestsCollection.deleteMany({
    _id: { $in: requestIdsToDelete },
  })

  return NextResponse.json(
    {
      success: true,
      data: {
        converted: eventsPayload.length,
        skipped,
        deleted: deleteResult?.deletedCount ?? 0,
      },
    },
    { status: 200 }
  )
}
