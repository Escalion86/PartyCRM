import CompanySettingsScheduleContent from './CompanySettingsScheduleContent'
import CompanySettingsGeneralContent from './CompanySettingsGeneralContent'
import CompanySettingsIntegrationsContent from './CompanySettingsIntegrationsContent'
import CompanySettingsListsContent from './CompanySettingsListsContent'
import CompanySettingsNotificationsContent from './CompanySettingsNotificationsContent'
import CompanySettingsDocumentsContent from './CompanySettingsDocumentsContent'
import CompanySettingsTariffsContent from './CompanySettingsTariffsContent'
import CompanySettingsReportsContent from './CompanySettingsReportsContent'
import CompanySettingsRolesContent from './CompanySettingsRolesContent'
import CompanySettingsBriefContent from './CompanySettingsBriefContent'
import CompanySettingsWorkflowContent from './CompanySettingsWorkflowContent'

export const COMPANY_SETTINGS_CONTENT = Object.freeze({
  general: CompanySettingsGeneralContent,
  schedule: CompanySettingsScheduleContent,
  integrations: CompanySettingsIntegrationsContent,
  lists: CompanySettingsListsContent,
  notifications: CompanySettingsNotificationsContent,
  documents: CompanySettingsDocumentsContent,
  tariffs: CompanySettingsTariffsContent,
  reports: CompanySettingsReportsContent,
  roles: CompanySettingsRolesContent,
  brief: CompanySettingsBriefContent,
  workflow: CompanySettingsWorkflowContent,
})
