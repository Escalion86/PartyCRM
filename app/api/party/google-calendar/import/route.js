import { NextResponse } from 'next/server'
import { getPartyWorkflow } from '@helpers/partyWorkflow'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { getPartyRequestContext, parseJsonBody, partyError } from '@server/partyApi'
import {
  createPartyGoogleCalendarClient,
  isPartyGoogleCalendarReconnectRequiredError,
} from '@server/partyGoogleCalendarClient'
import {
  MAX_PARTY_GOOGLE_IMPORT_EVENTS,
  PartyGoogleCalendarImportError,
  createPartyGoogleCalendarImportOrders,
  getPartyGoogleImportTimeZone,
  parsePartyGoogleImportEventIds,
  parsePartyGoogleImportRange,
  readPartyGoogleCalendarImport,
  serializePartyGoogleCalendarImportCandidate,
} from '@server/partyGoogleCalendarImport'
import {
  mergePartyGoogleCalendarCredentials,
  normalizePartyGoogleCalendarSettings,
} from '@server/partyGoogleCalendarSettings'
import { getPartyCompanyModel, getPartyOrderModel } from '@server/partyModels'

const loadCompanyCalendar = async (companies, tenantId) => {
  const company = await companies.findOne({ _id: tenantId, tenantId }).lean()
  if (!company) throw new PartyGoogleCalendarImportError(404, 'party_company_not_found', 'Компания не найдена')
  const { access } = await getPartyCompanyTariffAccessState(company)
  if (!access?.allowCalendarSync) {
    throw new PartyGoogleCalendarImportError(403, 'party_calendar_tariff_required', 'Интеграция недоступна на текущем тарифе')
  }
  const settings = normalizePartyGoogleCalendarSettings(company.settings?.googleCalendar)
  if (!settings.refreshToken && !settings.accessToken) {
    throw new PartyGoogleCalendarImportError(409, 'party_calendar_not_connected', 'Подключите Google Calendar в настройках компании')
  }
  if (!settings.calendarId) {
    throw new PartyGoogleCalendarImportError(409, 'party_calendar_not_selected', 'Выберите календарь в настройках компании')
  }
  return { company, settings }
}

const checkCalendarSelection = (expectedCalendarId, settings) => {
  if (expectedCalendarId !== settings.calendarId) {
    throw new PartyGoogleCalendarImportError(
      409, 'party_calendar_import_selection_changed', 'Календарь для импорта изменился. Загрузите список событий заново.'
    )
  }
}

const createImportClient = ({ companies, tenantId, settings }) => {
  const credentialsGuard = settings.refreshToken
    ? { 'settings.googleCalendar.refreshToken': settings.refreshToken }
    : { 'settings.googleCalendar.accessToken': settings.accessToken }
  const client = createPartyGoogleCalendarClient(settings, {
    onCredentials: async (tokens) => {
      const refreshed = mergePartyGoogleCalendarCredentials({
        settings, tokens, email: settings.connectedEmail, connectedByUserId: settings.connectedByUserId,
      })
      await companies.updateOne(
        { _id: tenantId, tenantId, 'settings.googleCalendar.calendarId': settings.calendarId, ...credentialsGuard },
        {
          $set: {
            'settings.googleCalendar.accessToken': refreshed.accessToken,
            'settings.googleCalendar.refreshToken': refreshed.refreshToken,
            'settings.googleCalendar.tokenType': refreshed.tokenType,
            'settings.googleCalendar.scope': refreshed.scope,
            'settings.googleCalendar.expiryDate': refreshed.expiryDate,
          },
        }
      )
    },
  })
  if (!client) throw new PartyGoogleCalendarImportError(503, 'party_calendar_unavailable', 'Google Calendar не настроен')
  return client
}

const readCalendar = async (options) => {
  try {
    return await readPartyGoogleCalendarImport(options)
  } catch (error) {
    if (error instanceof PartyGoogleCalendarImportError) throw error
    const providerStatus = Number(error?.response?.status ?? error?.status ?? error?.code)
    if (isPartyGoogleCalendarReconnectRequiredError(error) || providerStatus === 401) {
      throw new PartyGoogleCalendarImportError(409, 'party_calendar_reconnect_required', 'Переподключите Google Calendar в настройках компании')
    }
    if (providerStatus === 404 || providerStatus === 403) {
      throw new PartyGoogleCalendarImportError(409, 'party_calendar_import_access_denied', 'Google Calendar не предоставил доступ к выбранному календарю')
    }
    throw new PartyGoogleCalendarImportError(502, 'party_calendar_import_read_failed', 'Не удалось загрузить события Google Calendar. Повторите попытку.')
  }
}

const runImport = async (req, { commit }) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  const { tenantId } = context

  try {
    const companies = await getPartyCompanyModel()
    const { company, settings } = await loadCompanyCalendar(companies, tenantId)
    const timeZone = getPartyGoogleImportTimeZone(company.settings?.timeZone || company.timeZone)
    const params = new URL(req.url).searchParams
    const body = commit ? await parseJsonBody(req) : { from: params.get('from'), to: params.get('to') }
    const range = parsePartyGoogleImportRange(body, timeZone)
    const eventIds = commit ? parsePartyGoogleImportEventIds(body.eventIds) : undefined
    if (commit) checkCalendarSelection(body.calendarId, settings)
    const orderModel = await getPartyOrderModel()
    const client = createImportClient({ companies, tenantId, settings })
    const candidates = await readCalendar({
      client, calendarId: settings.calendarId, range, timeZone, tenantId, orderModel, eventIds,
    })

    if (commit) {
      const { context: currentContext, error: accessError } = await getPartyRequestContext({ req, managementOnly: true })
      if (accessError) return accessError
      if (String(currentContext.tenantId) !== String(tenantId)) {
        return partyError(409, 'party_calendar_import_selection_changed', 'Компания для импорта изменилась. Загрузите список событий заново.', 'conflict')
      }
      const current = await loadCompanyCalendar(companies, tenantId)
      checkCalendarSelection(body.calendarId, current.settings)
      const data = await createPartyGoogleCalendarImportOrders({
        orderModel, tenantId, calendarId: settings.calendarId, eventIds, candidates,
        workflowStageId: getPartyWorkflow(current.company).initialStageId,
      })
      return NextResponse.json({ success: true, data })
    }

    return NextResponse.json({
      success: true,
      data: {
        calendarId: settings.calendarId,
        calendarTitle: settings.calendarName,
        timeZone,
        maxEvents: MAX_PARTY_GOOGLE_IMPORT_EVENTS,
        events: candidates.map(serializePartyGoogleCalendarImportCandidate),
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof PartyGoogleCalendarImportError) {
      const type = error.status === 403 ? 'permission' : error.status < 500 ? 'validation' : 'server'
      return partyError(error.status, error.code, error.message, type)
    }
    return partyError(500, 'party_calendar_import_failed', 'Не удалось выполнить импорт из Google Calendar. Повторите попытку.')
  }
}

export const GET = (req) => runImport(req, { commit: false })
export const POST = (req) => runImport(req, { commit: true })
