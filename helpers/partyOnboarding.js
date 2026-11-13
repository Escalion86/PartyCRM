export const getPartyCompanyOnboardingSteps = ({
  locations = [],
  services = [],
  staff = [],
  orders = [],
  hasOrderTypes = false,
  noOwnPremises = false,
} = {}) => [
  {
    id: 'location',
    title: 'Добавить точку',
    description: 'Создайте площадку или офис, где проходят мероприятия.',
    completed: locations.length > 0 || noOwnPremises === true,
    action: 'Новая точка',
    modal: 'location',
    repeatable: true,
  },
  {
    id: 'service',
    title: 'Добавить услугу',
    description: 'Опишите услугу, которую можно выбрать в заказе.',
    completed: services.length > 0,
    action: 'Новая услуга',
    modal: 'service',
    repeatable: true,
  },
  {
    id: 'staff',
    title: 'Добавить сотрудника',
    description: 'Добавьте исполнителя или администратора компании.',
    completed: staff.length > 1,
    action: 'Новый сотрудник',
    modal: 'staff',
    repeatable: true,
  },
  {
    id: 'order-type',
    title: 'Настроить типы заказов',
    description: 'Тип заказа, например день рождения или мастер-класс, задаёт название заказа, доступные услуги и вопросы брифа.',
    completed: hasOrderTypes,
    action: 'Добавить тип заказа',
    modal: 'order-type',
    repeatable: true,
  },
  {
    id: 'order',
    title: 'Создать первый заказ',
    description: 'Проверьте основной сценарий: клиент, услуга, дата и команда.',
    completed: orders.length > 0,
    action: 'Новый заказ',
    modal: 'order',
  },
]

export const getPartyCompanyOnboardingProgress = (steps = []) => {
  const completedCount = steps.filter((step) => step.completed).length
  return {
    completedCount,
    totalCount: steps.length,
    finished: steps.length > 0 && completedCount === steps.length,
  }
}
