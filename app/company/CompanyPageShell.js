import CompanyWorkspaceClient from './CompanyWorkspaceClient'

export default function CompanyPageShell({ section = 'overview', canSwitchOrderMode = false }) {
  return <CompanyWorkspaceClient section={section} canSwitchOrderMode={canSwitchOrderMode} />
}
