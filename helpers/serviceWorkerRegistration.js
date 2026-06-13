export const PARTY_SERVICE_WORKER_URL = '/party-sw.js'

export const getPartyServiceWorkerRegistrationOptions = () => ({
  scope: '/',
  updateViaCache: 'none',
})
