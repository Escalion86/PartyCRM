import SeoLandingPage from '@components/SeoLandingPage'
import {
  buildSeoLandingMetadata,
  seoLandingPages,
} from '@helpers/seoLandingPages'

const page = seoLandingPages['crm-dlya-muzykantov']

export const metadata = buildSeoLandingMetadata(page)

export default function CrmForMusiciansPage() {
  return <SeoLandingPage page={page} />
}
