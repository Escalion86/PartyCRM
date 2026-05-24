import { readFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()

const readProjectFile = async (relativePath) =>
  readFile(path.join(rootDir, relativePath), 'utf8')

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const partyApiSource = await readProjectFile('server/partyApi.js')
const partyMeRouteSource = await readProjectFile('app/api/party/me/route.js')
const orderModalSource = await readProjectFile(
  'components/party/modals/OrderModal.js'
)

assert(
  !partyApiSource.includes("import getPartyTenantContext from './getPartyTenantContext'"),
  'server/partyApi.js must not import getPartyTenantContext'
)

assert(
  !partyApiSource.includes('await getPartyTenantContext()'),
  'server/partyApi.js must not fallback to getPartyTenantContext()'
)

assert(
  partyMeRouteSource.includes("import { getPartyRequestContext } from '@server/partyApi'"),
  'app/api/party/me/route.js must use getPartyRequestContext from partyApi'
)

assert(
  !partyMeRouteSource.includes("import getPartyTenantContext from '@server/getPartyTenantContext'"),
  'app/api/party/me/route.js must not import getPartyTenantContext directly'
)

assert(
  orderModalSource.includes("import { apiJson } from '@helpers/apiClient'"),
  'components/party/modals/OrderModal.js must use apiJson helper'
)

assert(
  !orderModalSource.includes("fetch('/api/party/clients'"),
  'components/party/modals/OrderModal.js must not call fetch(/api/party/clients) directly'
)

assert(
  !orderModalSource.includes("fetch('/api/party/services'"),
  'components/party/modals/OrderModal.js must not call fetch(/api/party/services) directly'
)

console.log('partycrm-mc1 checks passed')
