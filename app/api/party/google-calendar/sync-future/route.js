import { NextResponse } from 'next/server'
import {
  getPartyCompanyModel,
  getPartyLocationModel,
  getPartyOrderModel,
  getPartyServiceModel,
  getPartyStaffModel,
  getPartyTransactionModel,
} from '@server/partyModels'
import { getPartyRequestContext, isValidObjectId, parseJsonBody } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { syncFuturePartyOrdersBatch } from '@server/partyGoogleCalendarBatch'
import { createPartyGoogleCalendarClient } from '@server/partyGoogleCalendarClient'
import {
  mergePartyGoogleCalendarCredentials,
  normalizePartyGoogleCalendarSettings,
} from '@server/partyGoogleCalendarSettings'
import { syncPartyOrderToCompanyCalendar } from '@server/partyGoogleCalendarSync'

const errorResponse = (status, code, message) =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error

  const body = await parseJsonBody(req)
  const cursor = String(body.cursor || '').trim()
  if (cursor && !isValidObjectId(cursor)) {
    return errorResponse(400, 'party_calendar_invalid_cursor', 'Некорректный курсор')
  }

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId).lean()
  if (!company) return errorResponse(404, 'party_company_not_found', 'Компания не найдена')

  const { access } = await getPartyCompanyTariffAccessState(company)
  if (!access?.allowCalendarSync) {
    return errorResponse(
      403,
      'party_calendar_tariff_required',
      'Интеграция недоступна на текущем тарифе'
    )
  }

  let settings = normalizePartyGoogleCalendarSettings(company.settings?.googleCalendar)
  const client = createPartyGoogleCalendarClient(settings, {
    onCredentials: async (tokens) => {
      settings = mergePartyGoogleCalendarCredentials({
        settings,
        tokens,
        email: settings.connectedEmail,
        connectedByUserId: settings.connectedByUserId,
        now: new Date(),
      })
      await PartyCompanies.updateOne(
        { _id: context.tenantId },
        { $set: { 'settings.googleCalendar': settings } }
      )
    },
  })
  const companyForSync = {
    ...company,
    settings: { ...company.settings, googleCalendar: settings },
  }
  const [PartyOrders, PartyTransactions, PartyLocations, PartyServices, PartyStaff] =
    await Promise.all([
      getPartyOrderModel(),
      getPartyTransactionModel(),
      getPartyLocationModel(),
      getPartyServiceModel(),
      getPartyStaffModel(),
    ])

  const result = await syncFuturePartyOrdersBatch({
    company: companyForSync,
    access,
    cursor,
    dependencies: {
      findOrders: ({ companyId, eventDateFrom, cursor: after, limit }) =>
        PartyOrders.find({
          tenantId: companyId,
          eventDate: { $gte: eventDateFrom },
          ...(after ? { _id: { $gt: after } } : {}),
        })
          .sort({ _id: 1 })
          .limit(limit)
          .lean(),
      syncOrder: async ({ order }) => {
        const [transactions, location, services, staff] = await Promise.all([
          PartyTransactions.find({ tenantId: context.tenantId, orderId: order._id }).lean(),
          order.locationId
            ? PartyLocations.findOne({ _id: order.locationId, tenantId: context.tenantId }).lean()
            : null,
          PartyServices.find({ tenantId: context.tenantId, _id: { $in: order.servicesIds || [] } }).lean(),
          PartyStaff.find({
            tenantId: context.tenantId,
            _id: { $in: (order.assignedStaff || []).map((item) => item.staffId).filter(Boolean) },
          }).lean(),
        ])

        return syncPartyOrderToCompanyCalendar({
          company: companyForSync,
          order,
          access,
          dependencies: {
            client,
            transactions,
            location,
            services,
            staff,
            domain: process.env.DOMAIN,
            persistOrderPatch: ({ companyId, orderId, patch }) =>
              PartyOrders.updateOne({ _id: orderId, tenantId: companyId }, { $set: patch }),
            persistCompanySyncState: ({ companyId, lastSyncAt, lastSyncError }) =>
              PartyCompanies.updateOne(
                { _id: companyId },
                {
                  $set: {
                    'settings.googleCalendar.lastSyncAt': lastSyncAt,
                    'settings.googleCalendar.lastSyncError': lastSyncError,
                  },
                }
              ),
          },
        })
      },
    },
  })

  return NextResponse.json({ success: true, data: result })
}
