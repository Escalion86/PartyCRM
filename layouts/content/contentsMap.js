import EventsContent from './EventsContent'
import ClientsContent from './ClientsContent'
import ClientEventsContent from './ClientEventsContent'
import CallsContent from './CallsContent'
import DevContent from './DevContent'
import TransactionsContent from './TransactionsContent'
import SettingsContent from './SettingsContent'
import IntegrationsContent from './IntegrationsContent'
import DocumentsContent from './DocumentsContent'
import ListsContent from './ListsContent'
import NotificationsContent from './NotificationsContent'
import StatisticsContent from './StatisticsContent'
import ServicesContent from './ServicesContent'
import UsersContent from './UsersContent'
import ProfileContent from './ProfileContent'
import TariffsContent from './TariffsContent'
import TariffSelectContent from './TariffSelectContent'

const UpcomingEventsContent = (props) => (
  <EventsContent filter="upcoming" {...props} />
)
const PastEventsContent = (props) => <EventsContent filter="past" {...props} />

export const CONTENTS = Object.freeze({
  eventsUpcoming: {
    Component: UpcomingEventsContent,
    name: 'Предстоящие мероприятия',
  },
  eventsPast: {
    Component: PastEventsContent,
    name: 'Прошедшие мероприятия',
  },
  clients: {
    Component: ClientsContent,
    name: 'Клиенты',
  },
  clientEvents: {
    Component: ClientEventsContent,
    name: 'События клиентов',
  },
  calls: {
    Component: CallsContent,
    name: 'Звонки',
  },
  transactions: {
    Component: TransactionsContent,
    name: 'Транзакции',
  },
  events: {
    Component: UpcomingEventsContent,
    name: 'Мероприятия',
  },
  dev: {
    Component: DevContent,
    name: 'Разработчик',
  },
  settings: {
    Component: SettingsContent,
    name: 'Настройки',
  },
  integrations: {
    Component: IntegrationsContent,
    name: 'Интеграции',
  },
  documents: {
    Component: DocumentsContent,
    name: 'Документы',
  },
  lists: {
    Component: ListsContent,
    name: 'Списки',
  },
  notifications: {
    Component: NotificationsContent,
    name: 'Уведомления',
  },
  tariffs: {
    Component: TariffsContent,
    name: 'Тарифы',
  },
  'tariff-select': {
    Component: TariffSelectContent,
    name: 'Выбор тарифа',
  },
  services: {
    Component: ServicesContent,
    name: 'Мои услуги',
  },
  statistics: {
    Component: StatisticsContent,
    name: 'Статистика',
  },
  users: {
    Component: UsersContent,
    name: 'Пользователи',
  },
  profile: {
    Component: ProfileContent,
    name: 'Профиль',
  },
  questionnaire: {
    Component: ProfileContent,
    name: 'Профиль',
  },
})
