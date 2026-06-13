const isDatabaseUnavailableError = (error) => {
  const name = String(error?.name || '')
  const message = String(error?.message || '')
  return (
    name === 'MongooseServerSelectionError' ||
    name === 'MongoServerSelectionError' ||
    message.includes('MongoDB URI is not configured') ||
    message.includes('must use different MongoDB databases')
  )
}

export const getPartyAuthInfrastructureError = (error) =>
  isDatabaseUnavailableError(error)
    ? {
        status: 503,
        code: 'partycrm_db_unavailable',
        message: 'Сервис авторизации временно недоступен',
      }
    : {
        status: 500,
        code: 'partycrm_auth_failed',
        message: 'Не удалось войти',
      }
