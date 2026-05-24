import SeoLandingPage from '@components/SeoLandingPage'
import {
  buildSeoLandingMetadata,
  seoLandingPages,
} from '@helpers/seoLandingPages'

const page = seoLandingPages['crm-dlya-vedushchih']

export const metadata = buildSeoLandingMetadata(page)

export default function CrmForHostsPage() {
  return <SeoLandingPage page={page} />
}
