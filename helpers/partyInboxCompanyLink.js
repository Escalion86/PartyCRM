export const resolvePartyInboxCompanyLink = ({
  companies = [],
  requested = null,
  stored = '',
}) => {
  if (requested !== null) {
    const company = companies.find((item) => String(item.id) === requested)
    return company
      ? { companyId: String(company.id), error: '' }
      : {
          companyId: '',
          error: 'Компания из ссылки недоступна. Выберите доступную компанию.',
        }
  }
  return {
    companyId: String(
      companies.find((item) => String(item.id) === stored)?.id ||
        companies[0]?.id ||
        ''
    ),
    error: '',
  }
}
