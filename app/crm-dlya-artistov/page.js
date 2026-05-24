import SeoLandingPage from '@components/SeoLandingPage'
import {
  buildSeoLandingMetadata,
  seoLandingPages,
} from '@helpers/seoLandingPages'

const page = seoLandingPages['crm-dlya-artistov']

export const metadata = buildSeoLandingMetadata(page)

export default function CrmForArtistsPage() {
  return <SeoLandingPage page={page} />
}
