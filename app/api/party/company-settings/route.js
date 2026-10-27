import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { isPartyRestrictedManagementContext } from '@helpers/partyRolePermissions'
import { serializePartyRestrictedCompanySettings } from '@server/partyMembershipResponse'
import { supportsPartyVenueTransactions } from '@server/partyVenueBookings'
import {
  preservePartyGoogleCalendarSettings,
  serializePartyCompanySettingsForResponse,
} from '@server/partyGoogleCalendarSettings'
import {
  filterCompanySettingsPatchByTariffAccess,
  mergeCompanySettingsPatch,
  normalizeCompanyProfile,
  normalizeCompanySettings,
} from '@helpers/companySettings'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
    permissionAware: true,
  })
  if (error) return error

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({
      title: 1,
      legalTitle: 1,
      phone: 1,
      email: 1,
      settings: 1,
      tariffId: 1,
      trialEndsAt: 1,
    })
    .lean()
  const { access, serializedAccess } =
    await getPartyCompanyTariffAccessState(company)

  if (isPartyRestrictedManagementContext(context)) {
    const featureAccess = Object.fromEntries(Object.entries(serializedAccess || {}).filter(([key]) => key !== 'tariff'))
    return NextResponse.json({ success: true, data: { company: normalizeCompanyProfile(company ?? {}), settings: serializePartyRestrictedCompanySettings(company?.settings), access: featureAccess, restricted: true, canEdit: false, restrictionMessage: 'Изменение общих настроек и интеграций доступно владельцу или администратору без ограничений. Должности, бриф и этапы проверяют отдельные полномочия.' } })
  }

  return NextResponse.json({
    success: true,
    data: {
      company: normalizeCompanyProfile(company ?? {}),
      settings: serializePartyCompanySettingsForResponse(
        normalizeCompanySettings(company?.settings ?? {}),
        { allowCalendarSync: access.allowCalendarSync }
      ),
      access: serializedAccess,
    },
  })
}

export async function PATCH(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  if (Object.hasOwn(body, 'modules') && (
    !body.modules || typeof body.modules !== 'object' || Array.isArray(body.modules) ||
    (Object.hasOwn(body.modules, 'ticketing') && (
      !body.modules.ticketing || typeof body.modules.ticketing !== 'object' || Array.isArray(body.modules.ticketing) ||
      (Object.hasOwn(body.modules.ticketing, 'enabled') && typeof body.modules.ticketing.enabled !== 'boolean')
    ))
  )) return partyError(400, 'partycrm_invalid_modules', 'Проверьте настройку билетного модуля', 'validation')
  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({
      title: 1,
      legalTitle: 1,
      phone: 1,
      email: 1,
      settings: 1,
      tariffId: 1,
      trialEndsAt: 1,
    })
    .lean()
  const { access, serializedAccess } = await getPartyCompanyTariffAccessState(
    company
  )
  const { company: companyPatch = null, ...rawSettingsPatch } = body
  if (body.modules?.ticketing?.enabled === true && company?.settings?.modules?.ticketing?.enabled !== true) {
    try {
      if (!await supportsPartyVenueTransactions())
        return partyError(503, 'partycrm_ticketing_storage_unavailable', 'Сервер пока не готов к безопасному бронированию. Обратитесь к администратору.')
    } catch {
      return partyError(503, 'partycrm_ticketing_storage_unavailable', 'Не удалось проверить готовность сервера. Настройка не изменена.')
    }
  }
  const isGenericSetting = (key) => !['inboxSchedule', 'inboxScheduleRevision', '__proto__', 'constructor', 'prototype'].includes(key)
    && !key.includes('.') && !key.startsWith('$')
  const settingsPatch = Object.fromEntries(
    Object.entries(rawSettingsPatch).filter(([key]) => isGenericSetting(key))
  )
  const filteredBody = filterCompanySettingsPatchByTariffAccess(
    settingsPatch,
    access
  )
  const nextSettings = preservePartyGoogleCalendarSettings(
    company?.settings ?? {},
    mergeCompanySettingsPatch(company?.settings ?? {}, filteredBody)
  )
  const nextCompany = normalizeCompanyProfile(companyPatch ?? {})
  // Keep schedule writes in their validated, revision-guarded endpoint. Dotted
  // updates also preserve a schedule changed since this settings read.
  const updateSet = Object.fromEntries(Object.entries(nextSettings)
    .filter(([key]) => isGenericSetting(key) && key !== 'modules')
    .map(([key, value]) => [`settings.${key}`, value]))
  if (Object.hasOwn(filteredBody.modules?.ticketing || {}, 'enabled')) updateSet['settings.modules.ticketing.enabled'] = nextSettings.modules.ticketing.enabled
  const companySet = {}
  for (const key of ['title', 'legalTitle', 'phone', 'email']) {
    if (!Object.hasOwn(nextCompany, key) || !Object.hasOwn(companyPatch ?? {}, key)) {
      continue
    }
    if (key === 'title' && !nextCompany.title) continue
    companySet[key] = nextCompany[key]
    updateSet[key] = nextCompany[key]
  }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    { $set: updateSet }
  )

  return NextResponse.json({
    success: true,
    data: {
      company: normalizeCompanyProfile({
        ...company,
        ...companySet,
      }),
      settings: serializePartyCompanySettingsForResponse(nextSettings, {
        allowCalendarSync: access.allowCalendarSync,
      }),
      access: serializedAccess,
    },
  })
}
