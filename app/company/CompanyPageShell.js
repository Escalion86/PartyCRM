import CompanyWorkspaceClient from './CompanyWorkspaceClient'

export default function CompanyPageShell({ section = 'overview' }) {
  return <CompanyWorkspaceClient section={section} />
}
