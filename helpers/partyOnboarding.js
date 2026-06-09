export const getPartyCompanyOnboardingSteps = ({
  locations = [],
  services = [],
  staff = [],
  orders = [],
} = {}) => [
  {
    id: 'location',
    title: 'Добавить точку',
    description: 'Создайте площадку или офис, где проходят мероприятия.',
    completed: locations.length > 0,
    action: 'Новая точка',
    modal: 'location',
  },
  {
    id: 'service',
    title: 'Добавить услугу',
    description: 'Опишите услугу, которую можно выбрать в заказе.',
    completed: services.length > 0,
    action: 'Новая услуга',
    modal: 'service',
  },
  {
    id: 'staff',
    title: 'Добавить сотрудника',
    description: 'Добавьте исполнителя или администратора компании.',
    completed: staff.length > 1,
    action: 'Новый сотрудник',
    modal: 'staff',
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
