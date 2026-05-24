import SeoLandingPage from '@components/SeoLandingPage'
import {
  buildSeoLandingMetadata,
  seoLandingPages,
} from '@helpers/seoLandingPages'

const page = seoLandingPages['crm-dlya-tilda-zayavok']

export const metadata = buildSeoLandingMetadata(page)

export default function CrmForTildaLeadsPage() {
  return <SeoLandingPage page={page} />
}
