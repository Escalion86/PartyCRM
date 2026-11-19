export const PARTY_COMPANY_PALETTES = Object.freeze([
  { id: 'sky', title: 'Голубая', accent: '#0369a1', hover: '#075985', soft: '#f0f9ff', border: '#bae6fd', light: '#bae6fd', ink: '#0c4a6e', canvas: '#eaf6ff' },
  { id: 'blue', title: 'Синяя', accent: '#1d4ed8', hover: '#1e40af', soft: '#eff6ff', border: '#bfdbfe', light: '#bfdbfe', ink: '#1e3a8a', canvas: '#edf3fc' },
  { id: 'violet', title: 'Фиолетовая', accent: '#6d28d9', hover: '#5b21b6', soft: '#f5f3ff', border: '#ddd6fe', light: '#ddd6fe', ink: '#4c1d95', canvas: '#f2effb' },
  { id: 'emerald', title: 'Зелёная', accent: '#047857', hover: '#065f46', soft: '#ecfdf5', border: '#a7f3d0', light: '#a7f3d0', ink: '#064e3b', canvas: '#edf7f2' },
  { id: 'rose', title: 'Розовая', accent: '#be123c', hover: '#9f1239', soft: '#fff1f2', border: '#fecdd3', light: '#fecdd3', ink: '#881337', canvas: '#fbf0f2' },
  { id: 'amber', title: 'Янтарная', accent: '#92400e', hover: '#78350f', soft: '#fffbeb', border: '#fde68a', light: '#fde68a', ink: '#78350f', canvas: '#faf5e9' },
])

export const DEFAULT_PARTY_COMPANY_BRANDING = Object.freeze({
  palette: 'sky',
  logoUrl: '',
})

export const normalizePartyCompanyLogoUrl = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2000 || /[\\\u0000-\u0020]/.test(trimmed)) return ''
  try {
    const local = trimmed.startsWith('/') && !trimmed.startsWith('//')
    const url = new URL(trimmed, local ? 'https://partycrm.invalid' : undefined)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return ''
    if (!/\.(png|jpe?g|webp)$/i.test(url.pathname)) return ''
    if (local) {
      if (url.origin !== 'https://partycrm.invalid') return ''
      return `${url.pathname}${url.search}`
    }
    // Logos are loaded by the browser only. Literal IPs and local network names
    // are excluded so a shared brand cannot target another user's local services.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
      /\.(local|localhost|internal|lan|home|invalid)$/i.test(url.hostname)) return ''
    return url.href
  } catch {
    return ''
  }
}

export const normalizePartyCompanyBranding = (value) => ({
  palette: PARTY_COMPANY_PALETTES.some((item) => item.id === value?.palette)
    ? value.palette : DEFAULT_PARTY_COMPANY_BRANDING.palette,
  logoUrl: normalizePartyCompanyLogoUrl(value?.logoUrl),
})

export const validatePartyCompanyBranding = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some((key) => !['palette', 'logoUrl'].includes(key)))
    return 'Проверьте настройки оформления компании'
  if (Object.hasOwn(value, 'palette') && !PARTY_COMPANY_PALETTES.some((item) => item.id === value.palette))
    return 'Выберите одну из доступных цветовых тем'
  if (Object.hasOwn(value, 'logoUrl') && (typeof value.logoUrl !== 'string' ||
    (value.logoUrl.trim() && !normalizePartyCompanyLogoUrl(value.logoUrl))))
    return 'Укажите PNG, JPEG или WebP по HTTPS либо путь к изображению на сайте'
  return ''
}

export const getPartyCompanyPalette = (branding) =>
  PARTY_COMPANY_PALETTES.find((item) => item.id === branding?.palette) || PARTY_COMPANY_PALETTES[0]

export const getPartyCompanyBrandingStyle = (branding) => {
  const palette = getPartyCompanyPalette(branding)
  return {
    '--party-brand-accent': palette.accent,
    '--party-brand-hover': palette.hover,
    '--party-brand-soft': palette.soft,
    '--party-brand-border': palette.border,
    '--party-brand-light': palette.light,
    '--party-brand-ink': palette.ink,
    '--party-brand-canvas': palette.canvas,
  }
}
