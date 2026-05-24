import SeoLandingPage from '@components/SeoLandingPage'
import {
  buildSeoLandingMetadata,
  seoLandingPages,
} from '@helpers/seoLandingPages'

const page = seoLandingPages['crm-s-google-calendar']

export const metadata = buildSeoLandingMetadata(page)

export default function CrmWithGoogleCalendarPage() {
  return <SeoLandingPage page={page} />
}
