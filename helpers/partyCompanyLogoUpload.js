export const PARTY_COMPANY_LOGO_MAX_BYTES = 5 * 1024 * 1024
export const PARTY_COMPANY_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export const getPartyCompanyLogoFileError = (file) => {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size)
    return 'Выберите файл логотипа.'
  if (!PARTY_COMPANY_LOGO_MIME_TYPES.includes(file.type))
    return 'Выберите изображение PNG, JPEG или WebP.'
  if (file.size > PARTY_COMPANY_LOGO_MAX_BYTES)
    return 'Размер логотипа должен быть не больше 5 МБ.'
  return ''
}
