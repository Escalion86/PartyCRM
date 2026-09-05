export const REPORT_SECTIONS = {
  general: 'Общее', creative: 'Творческая часть', inventory: 'Реквизит', finance: 'Финансы',
}

const field = (id, label, section, instruction = '', required = false) => ({
  id, label, section, instruction, required, reviewerStaffId: null,
  resourceId: null, serviceId: null, locationId: null, shareCreative: false,
  requiredMedia: false, allowNotApplicable: false, applyWhenBound: false,
  reconciliationKey: '', reconciliationValueType: '', reconciliationRequired: false,
})

// Existing forms keep every field unless applicability was explicitly enabled.
// A resource belongs to the actual selected kit, never to a service's current norm.
export const isPartyReportFieldApplicable = (field, { serviceIds = [], locationId = null, reservationRows = [] } = {}) => {
  if (field.applyWhenBound !== true) return true
  if (!field.serviceId && !field.locationId && !field.resourceId) return false
  if (field.serviceId && !serviceIds.some((id) => String(id) === String(field.serviceId))) return false
  if (field.locationId && String(locationId || '') !== String(field.locationId)) return false
  if (field.resourceId && !reservationRows.some((row) =>
    Number(row.quantity) > 0 &&
    String(row.resourceId) === String(field.resourceId) &&
    (!field.serviceId || String(row.serviceId) === String(field.serviceId))
  )) return false
  return true
}

export const starterPartyReportTemplates = [
  {
    title: 'Подготовка к празднику', stage: 'before', active: true,
    fields: [
      field('event', 'Дата, место, герой и скрин праздника', 'general', '', true),
      { ...field('taken', 'Фото: реквизит взял', 'inventory', 'Укажите полученные предметы и количество, добавьте фотографии.', true), requiredMedia: true },
      field('condition', 'Состояние реквизита, костюма и музыки', 'inventory', 'Что требует внимания: стирка, шитьё, чистка, ремонт, батарея колонки.'),
      field('wishes', 'Памятка и пожелания', 'general'),
    ],
  },
  {
    title: 'Итоги праздника', stage: 'after', active: true,
    fields: [
      field('event', 'Дата, место, герой и скрин праздника', 'general', '', true),
      field('timing', 'Время начала и длительность', 'creative', 'Отклонения от графика, причины задержки или сокращения программы.', true),
      field('guests', 'Состав гостей', 'creative', 'Отклонения от запланированного количества и состава.'),
      field('emotions', 'Эмоции и впечатления', 'creative', 'Ваши, детей, заказчика и игротеки.'),
      field('program', 'Что проводил и ход программы', 'creative', 'Сценарные решения, конфликты, активность детей и родителей.', true),
      field('incidents', 'Нестандартные ситуации и форс-мажоры', 'creative'),
      field('customer', 'Взаимодействие с заказчиком', 'creative', 'Замечания в процессе и ваша реакция.'),
      field('result', 'Финальный результат', 'creative', 'Итог праздника и незавершённые вопросы.'),
      { ...field('returned', 'Фото: реквизит сдал', 'inventory', 'Что и в каком количестве вернули. Если ещё не вернули — укажите причину и срок возврата.', true), requiredMedia: true, allowNotApplicable: true },
      field('condition', 'Реквизит, костюм и музыка: что требует внимания', 'inventory', 'Добавьте фото повреждений; отметьте стирку, ремонт, чистку, проблемы батареи.'),
      field('retained', 'Оставлено у исполнителя', 'inventory', 'Предметы, количество и когда вернёте.'),
      field('salary-rules', 'Документ с правилами зарплаты', 'finance'),
      { ...field('issued', 'Сколько выдали', 'finance', 'Укажите сумму, от кого и кому, назначение денег.'), reconciliationKey: 'received_from_client', reconciliationValueType: 'money' },
      { ...field('salary', 'Сколько взял зарплаты', 'finance'), reconciliationKey: 'payout_taken', reconciliationValueType: 'money', reconciliationRequired: true },
      { ...field('travel', 'Транспортные', 'finance'), reconciliationKey: 'transport_cost', reconciliationValueType: 'money' },
      { ...field('expenses', 'Прочие расходы по этому празднику', 'finance', 'Назначение, сумма, подтверждение.'), reconciliationKey: 'other_expense', reconciliationValueType: 'money' },
      { ...field('transfer', 'Перевод и скрин оплаты', 'finance', 'Сумма, дата, получатель и подтверждение. Не включайте другие праздники.'), reconciliationKey: 'transferred_to_company', reconciliationValueType: 'money', reconciliationRequired: true },
      field('finance-incidents', 'Нестандартная финансовая ситуация', 'finance'),
      field('wishes', 'Памятка и пожелания', 'general'),
    ],
  },
]
