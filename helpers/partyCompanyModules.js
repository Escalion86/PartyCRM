export const PARTY_COMPANY_MODULES = Object.freeze([
  {
    key: 'offsite',
    title: 'Выездные мероприятия',
    description: 'Оформление заказов по адресу клиента и подбор времени для выездных услуг.',
    disabledDescription: 'Ранее созданные выезды можно просматривать, редактировать и отменять.',
    defaultEnabled: true,
  },
  {
    key: 'inventory',
    title: 'Склад и реквизит',
    description: 'Каталог реквизита, комплекты услуг, резервы, выдача и возврат сотрудниками.',
    disabledDescription: 'История и возврат выданного реквизита доступны. Новые резервы и выдачи останавливаются.',
    historyHref: '/company/inventory',
    historyLabel: 'Открыть склад и историю',
    defaultEnabled: true,
  },
  {
    key: 'ticketing',
    title: 'Билеты и посещения',
    description: 'Программы по сеансам и без фиксированного времени, бронирование, продажи и учёт полученной оплаты.',
    disabledDescription: 'История, регистрация посещений и возвраты по существующим билетам сохраняются. Новые продажи и оплаты блокируются.',
    historyHref: '/company/ticketing',
    historyLabel: 'Открыть билеты и историю',
    defaultEnabled: false,
  },
])

export const isPartyCompanyModuleEnabled = (companyOrSettings, key) => {
  const definition = PARTY_COMPANY_MODULES.find((item) => item.key === key)
  if (!definition) return false
  const settings = companyOrSettings?.settings || companyOrSettings || {}
  const enabled = settings.modules?.[key]?.enabled
  return typeof enabled === 'boolean' ? enabled : definition.defaultEnabled
}

export const normalizePartyCompanyModules = (modules) =>
  Object.fromEntries(PARTY_COMPANY_MODULES.map(({ key, defaultEnabled }) => [
    key,
    { enabled: typeof modules?.[key]?.enabled === 'boolean' ? modules[key].enabled : defaultEnabled },
  ]))

export const mergePartyCompanyModules = (current, patch) =>
  normalizePartyCompanyModules(Object.fromEntries(
    PARTY_COMPANY_MODULES.map(({ key }) => [key, {
      ...normalizePartyCompanyModules(current)[key],
      ...patch?.[key],
    }])
  ))

export const isValidPartyCompanyModulesPatch = (modules) =>
  Boolean(modules && typeof modules === 'object' && !Array.isArray(modules)) &&
  Object.entries(modules).every(([key, value]) =>
    PARTY_COMPANY_MODULES.some((definition) => definition.key === key) &&
    value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((field) => field === 'enabled') &&
    (!Object.hasOwn(value, 'enabled') || typeof value.enabled === 'boolean')
  )

export const canPartySetOffsiteOrder = (company, nextOrder, previousOrder) =>
  nextOrder?.placeType !== 'client_address' ||
  previousOrder?.placeType === 'client_address' ||
  isPartyCompanyModuleEnabled(company, 'offsite')

export const PARTY_OFFSITE_DISABLED_MESSAGE =
  'Выездные мероприятия отключены в настройках компании. Включите блок, чтобы оформить новый выезд.'
