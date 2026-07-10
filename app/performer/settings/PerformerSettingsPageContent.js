'use client'

import PerformerSettingsShell from './PerformerSettingsShell'
import PerformerSettingsProfileContent from './content/PerformerSettingsProfileContent'
import PerformerSettingsIntegrationsContent from './content/PerformerSettingsIntegrationsContent'
import PerformerSettingsNotificationsContent from './content/PerformerSettingsNotificationsContent'

const TAB_META = Object.freeze({
  profile: {
    title: 'Профиль',
    description: 'Основные данные аккаунта исполнителя.',
  },
  integrations: {
    title: 'Интеграции',
    description: 'Подключение внешних сервисов для личного кабинета.',
  },
  notifications: {
    title: 'Уведомления',
    description: 'Push-уведомления о назначениях и запросах привязки.',
  },
})

const CONTENT = Object.freeze({
  profile: PerformerSettingsProfileContent,
  integrations: PerformerSettingsIntegrationsContent,
  notifications: PerformerSettingsNotificationsContent,
})

export default function PerformerSettingsPageContent({ activeTab }) {
  const meta = TAB_META[activeTab] ?? TAB_META.profile
  const Component = CONTENT[activeTab] || PerformerSettingsProfileContent

  return (
    <PerformerSettingsShell title={meta.title} description={meta.description}>
      <Component />
    </PerformerSettingsShell>
  )
}
