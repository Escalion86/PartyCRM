import { NextResponse } from 'next/server'
import Calls from '@models/Calls'
import Events from '@models/Events'
import Histories from '@models/Histories'
import dbConnect from '@server/dbConnect'
import { updateEventInCalendar } from '@server/CRUD'
import {
  buildEventDraftFromCall,
  ensureClientForCall,
  processCallRecording,
} from '@server/calls'
import { requireTelephonyTariffAccess } from '@server/telephonyAccess'
import {
  normalizeAdditionalEvents,
  normalizeDepositExpectedAmount,
  normalizeEventType,
  normalizeWaitDeposit,
  parseDateValue,
} from '@server/eventApiNormalization'

const createEventFromCallDraft = async ({ draft, req, tenantId, user, access }) => {
  const eventTypeValue = normalizeEventType(draft?.eventType)
  const event = await Events.create({
    ...draft,
    tenantId,
    status: draft?.status || 'draft',
    requestCreatedAt: draft?.requestCreatedAt
      ? new Date(draft.requestCreatedAt)
      : new Date(),
    additionalEvents: normalizeAdditionalEvents(draft?.additionalEvents),
    eventType: eventTypeValue,
    waitDeposit: normalizeWaitDeposit(draft?.waitDeposit),
    depositDueAt: parseDateValue(draft?.depositDueAt),
    depositExpectedAmount: normalizeDepositExpectedAmount(
      draft?.depositExpectedAmount
    ),
    calendarSyncError: access?.allowCalendarSync ? '' : 'calendar_sync_unavailable',
  })

  await Histories.create({
    schema: Events.collection.collectionName,
    action: 'add',
    data: [event.toJSON()],
    userId: String(user._id),
  })

  if (!event?.importedFromCalendar && access?.allowCalendarSync) {
    try {
      await updateEventInCalendar(event, req, user)
      const refreshed = await Events.findById(event._id).lean()
      return refreshed || event.toJSON()
    } catch (error) {
      await Events.findByIdAndUpdate(event._id, {
        calendarSyncError: 'calendar_sync_failed',
      })
      return Events.findById(event._id).lean()
    }
  }

  return event.toJSON()
}

export const POST = async (req, { params }) => {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const decision = String(body?.decision || '').trim()
  const accessResult = await requireTelephonyTariffAccess()
  if (!accessResult.ok) {
    return NextResponse.json(
      { success: false, error: accessResult.error },
      { status: accessResult.status }
    )
  }

  const { tenantId, user, access } = accessResult
  await dbConnect()

  if (decision === 'no_event') {
    const existing = await Calls.findOne({ _id: id, tenantId })
      .select('linkedClientId')
      .lean()
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Звонок не найден' },
        { status: 404 }
      )
    }
    const call = await Calls.findOneAndUpdate(
      { _id: id, tenantId },
      {
        status: existing.linkedClientId ? 'linked' : 'ignored',
        eventDecision: 'no_event',
        eventDecisionAt: new Date(),
        processingError: '',
      },
      { returnDocument: 'after' }
    ).lean()

    return NextResponse.json(
      {
        success: true,
        data: { call, url: `/cabinet/calls?callId=${call._id}` },
      },
      { status: 200 }
    )
  }

  if (decision !== 'create_event') {
    return NextResponse.json(
      { success: false, error: 'Некорректное решение по звонку' },
      { status: 400 }
    )
  }

  let call = await Calls.findOne({ _id: id, tenantId }).lean()
  if (!call) {
    return NextResponse.json(
      { success: false, error: 'Звонок не найден' },
      { status: 404 }
    )
  }

  if (!call.transcript && call.recordingUrl) {
    try {
      call = await processCallRecording(id, tenantId)
    } catch (error) {
      const failedCall = await Calls.findOneAndUpdate(
        { _id: id, tenantId },
        {
          eventDecision: 'failed',
          eventDecisionAt: new Date(),
        },
        { returnDocument: 'after' }
      ).lean()
      return NextResponse.json(
        {
          success: false,
          error: 'Не удалось распознать запись звонка',
          data: {
            call: failedCall,
            url: `/cabinet/calls?callId=${id}`,
          },
        },
        { status: 422 }
      )
    }
  }

  const client = await ensureClientForCall(call, tenantId)
  call = await Calls.findOne({ _id: id, tenantId }).lean()
  const draft = await buildEventDraftFromCall(call, tenantId)
  const event = await createEventFromCallDraft({
    draft: {
      ...draft,
      clientId: client?._id || draft.clientId || null,
    },
    req,
    tenantId,
    user,
    access,
  })

  const updatedCall = await Calls.findOneAndUpdate(
    { _id: id, tenantId },
    {
      status: 'linked',
      linkedClientId: client?._id || call.linkedClientId || null,
      linkedEventId: event?._id || null,
      eventDecision: 'created',
      eventDecisionAt: new Date(),
      processingError: '',
    },
    { returnDocument: 'after' }
  ).lean()

  return NextResponse.json(
    {
      success: true,
      data: {
        call: updatedCall,
        event,
        url: event?._id
          ? `/cabinet/eventsUpcoming?openEvent=${event._id}`
          : `/cabinet/calls?callId=${id}`,
      },
    },
    { status: 201 }
  )
}
