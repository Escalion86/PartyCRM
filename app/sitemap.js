const rawDomain = process.env.DOMAIN || 'https://partycrm.ru'
const normalizedSiteUrl = rawDomain.startsWith('http')
  ? rawDomain.replace(/\/$/, '')
  : `https://${rawDomain.replace(/\/$/, '')}`
const LAST_MODIFIED = '2026-05-25'

export default function sitemap() {
  return [
    {
      url: `${normalizedSiteUrl}/`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${normalizedSiteUrl}/party`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${normalizedSiteUrl}/party/login`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${normalizedSiteUrl}/company`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${normalizedSiteUrl}/performer`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${normalizedSiteUrl}/privacy`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${normalizedSiteUrl}/terms`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${normalizedSiteUrl}/payment`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
  ]
}
